import { useEffect, useRef, useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { useFetcher, useLoaderData, useLocation } from "@remix-run/react";
import {
  Banner,
  BlockStack,
  Button,
  Card,
  InlineStack,
  Page,
  Select,
  Text,
  TextField,
  Thumbnail,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { NewProductNotification } from "../emails/NewProductNotification";
import { formatFromAddress } from "../email";
import db from "../db.server";
import { localeFromRequest, translate } from "../i18n";
import { getResend } from "../resend.server";
import { authenticate } from "../shopify.server";
import { unsubscribeUrl } from "../unsubscribe.server";

/** Resend `batch.send` accepts at most 100 emails per request. */
const BATCH_SIZE = 100;

type VariantNode = {
  id: string;
  title: string;
  image: { url: string } | null;
};

type ProductNode = {
  id: string;
  title: string;
  handle: string;
  featuredImage: { url: string } | null;
  variants: { nodes: VariantNode[] };
};

type ProductsQuery = {
  data?: {
    products?: { nodes: ProductNode[] };
  };
  errors?: { message: string }[];
};

type ProductQuery = {
  data?: {
    shop?: { name: string };
    product?: {
      title: string;
      handle: string;
      onlineStoreUrl: string | null;
      featuredImage: { url: string } | null;
    } | null;
    variant?: {
      id: string;
      title: string;
      image: { url: string } | null;
      product: { id: string } | null;
    } | null;
  };
  errors?: { message: string }[];
};

type NotifyResult = {
  ok: boolean;
  sent: number;
  failed: number;
  done: boolean;
  afterId: number;
  nextAfterId: number;
  runId: number;
  message: string;
};

function rejected(message: string, runId = 0): NotifyResult {
  return {
    ok: false,
    sent: 0,
    failed: 0,
    done: true,
    afterId: 0,
    nextAfterId: 0,
    runId,
    message,
  };
}

function productUrlFor(
  shop: string,
  product: { handle: string; onlineStoreUrl: string | null },
) {
  const candidate =
    product.onlineStoreUrl || `https://${shop}/products/${product.handle}`;
  try {
    const url = new URL(candidate);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return url.toString();
  } catch {
    return null;
  }
}

function variantUrlFor(productUrl: string, variantId: string) {
  const numericId = variantId.split("/").pop() ?? "";
  if (!/^\d+$/.test(numericId)) return null;
  try {
    const url = new URL(productUrl);
    url.searchParams.set("variant", numericId);
    return url.toString();
  } catch {
    return null;
  }
}

function productQuery(raw: string | null) {
  const term = (raw ?? "").trim().slice(0, 80).replace(/["\\]/g, "");
  if (!term) return { query: "status:active", sortKey: "UPDATED_AT", reverse: true, term: "" };
  return {
    query: `status:active title:*${term}*`,
    sortKey: "TITLE",
    reverse: false,
    term,
  };
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const locale = await localeFromRequest(request);
  const t = translate(locale);
  const search = productQuery(new URL(request.url).searchParams.get("q"));
  const [subscriberCount, sender] = await Promise.all([
    db.subscriber.count({ where: { shop: session.shop } }),
    db.shopSender.findUnique({ where: { shop: session.shop } }),
  ]);

  const response = await admin.graphql(
    `#graphql
      query NotifyProductList($query: String!, $sortKey: ProductSortKeys!, $reverse: Boolean!) {
        products(first: 50, sortKey: $sortKey, reverse: $reverse, query: $query) {
          nodes {
            id
            title
            handle
            featuredImage {
              url
            }
            variants(first: 100) {
              nodes {
                id
                title
                image {
                  url
                }
              }
            }
          }
        }
      }`,
    {
      variables: {
        query: search.query,
        sortKey: search.sortKey,
        reverse: search.reverse,
      },
    },
  );
  const payload = (await response.json()) as ProductsQuery;

  return {
    locale,
    query: search.term,
    title: t("notifyTitle"),
    subtitle: t("notifySubtitle", { count: subscriberCount }),
    products: payload.data?.products?.nodes ?? [],
    subscriberCount,
    apiKeyConfigured: Boolean(process.env.RESEND_API_KEY),
    fromLabel: sender
      ? formatFromAddress(sender.fromName, sender.fromEmail)
      : "",
    error: payload.errors?.map((item) => item.message).join("; ") ?? null,
    noKey: t("notifyNoKey"),
    noSender: t("notifyNoSender"),
    searchLabel: t("notifySearch"),
    searchButton: t("notifySearchButton"),
    pickLabel: t("notifyPick"),
    variantLabel: t("notifyVariant"),
    noVariantLabel: t("notifyNoVariant"),
    noneLabel: t("notifyNone"),
    preview: t("notifyPreview"),
    sendLabel: t("notifySend"),
    hint: t("notifyHint"),
  };
};

export const action = async ({
  request,
}: ActionFunctionArgs): Promise<NotifyResult> => {
  const { admin, session } = await authenticate.admin(request);
  const locale = await localeFromRequest(request);
  const t = translate(locale);
  const emailCopy = translate("en");
  const formData = await request.formData();
  const productIdField = formData.get("productId");
  const productId = typeof productIdField === "string" ? productIdField : "";
  const variantIdField = formData.get("variantId");
  const variantId = typeof variantIdField === "string" ? variantIdField : "";
  const withVariant = variantId.startsWith("gid://shopify/ProductVariant/");
  const afterRaw = Number(formData.get("afterId") || 0);
  const afterId = Number.isFinite(afterRaw) && afterRaw > 0 ? afterRaw : 0;
  const runRaw = Number(formData.get("runId") || 0);
  const runId = Number.isFinite(runRaw) && runRaw > 0 ? runRaw : 0;

  if (!productId.startsWith("gid://shopify/Product/")) {
    return rejected(t("notifySelectProduct"), runId);
  }

  const resend = getResend();
  if (!resend) return rejected(t("notifyNoKey"), runId);

  const sender = await db.shopSender.findUnique({
    where: { shop: session.shop },
  });
  if (!sender) return rejected(t("notifyNoSender"), runId);
  const from = formatFromAddress(sender.fromName, sender.fromEmail);

  const response = await admin.graphql(
    `#graphql
      query NotifyProduct($id: ID!, $variantId: ID!, $withVariant: Boolean!) {
        shop {
          name
        }
        product(id: $id) {
          title
          handle
          onlineStoreUrl
          featuredImage {
            url
          }
        }
        variant: node(id: $variantId) @include(if: $withVariant) {
          ... on ProductVariant {
            id
            title
            image {
              url
            }
            product {
              id
            }
          }
        }
      }`,
    {
      variables: {
        id: productId,
        variantId: withVariant ? variantId : productId,
        withVariant,
      },
    },
  );
  const payload = (await response.json()) as ProductQuery;

  if (payload.errors?.length) {
    return rejected(payload.errors.map((item) => item.message).join("; "), runId);
  }

  const product = payload.data?.product;
  if (!product) return rejected(t("notifyMissingProduct"), runId);

  const productUrl = productUrlFor(session.shop, product);
  if (!productUrl) return rejected(t("notifyBadUrl"), runId);

  const variant = withVariant ? payload.data?.variant : null;
  if (withVariant && (!variant || variant.product?.id !== productId)) {
    return rejected(t("notifyMissingVariant"), runId);
  }
  const mailTitle = variant ? `${product.title} - ${variant.title}` : product.title;
  const mailUrl = variant ? variantUrlFor(productUrl, variant.id) : productUrl;
  if (!mailUrl) return rejected(t("notifyBadUrl"), runId);

  const subscribers = await db.subscriber.findMany({
    where: { shop: session.shop, id: { gt: afterId } },
    select: { id: true, email: true },
    orderBy: { id: "asc" },
    take: BATCH_SIZE,
  });

  if (subscribers.length === 0) {
    return afterId === 0
      ? rejected(t("notifyNoSubscribers"), runId)
      : {
          ok: true,
          sent: 0,
          failed: 0,
          done: true,
          afterId,
          nextAfterId: afterId,
          runId,
          message: "",
        };
  }

  const shopName = payload.data?.shop?.name || session.shop;
  const imageUrl = variant?.image?.url || product.featuredImage?.url;
  const safeImageUrl =
    imageUrl && imageUrl.startsWith("https://") ? imageUrl : undefined;

  const subject = emailCopy("emailSubject", { title: mailTitle });
  const intro = emailCopy("emailHello", { shop: shopName });
  const buttonLabel = emailCopy("emailButton");
  const unsubscribeLabel = emailCopy("emailUnsubscribe");

  let sent = 0;
  let failed = 0;

  try {
    const { data, error } = await resend.batch.send(
      subscribers.map((subscriber) => ({
        from,
        to: subscriber.email,
        subject,
        react: (
          <NewProductNotification
            productTitle={mailTitle}
            productImageUrl={safeImageUrl}
            productUrl={mailUrl}
            intro={intro}
            buttonLabel={buttonLabel}
            unsubscribeUrl={unsubscribeUrl(session.shop, subscriber.email, "en")}
            unsubscribeLabel={unsubscribeLabel}
          />
        ),
      })),
      {
        batchValidation: "permissive",
        idempotencyKey: `${session.shop}:${runId}:${afterId}`,
      },
    );
    if (error || !data) {
      failed = subscribers.length;
      console.error("Resend batch send failed", error);
    } else {
      sent = data.data.length;
      failed = data.errors.length;
      if (failed > 0) console.error("Resend rejected batch emails", data.errors);
    }
  } catch (error) {
    failed = subscribers.length;
    console.error("Resend batch send failed", error);
  }

  const nextAfterId = subscribers[subscribers.length - 1]!.id;
  return {
    ok: failed === 0,
    sent,
    failed,
    done: subscribers.length < BATCH_SIZE,
    afterId,
    nextAfterId,
    runId,
    message: "",
  };
};

export default function NotifyPage() {
  const data = useLoaderData<typeof loader>();
  const { search } = useLocation();
  const t = translate(data.locale);
  const canSend = data.apiKeyConfigured && Boolean(data.fromLabel);
  const fetcher = useFetcher<typeof action>();
  const [productId, setProductId] = useState(data.products[0]?.id ?? "");
  const [variantId, setVariantId] = useState("");
  const [query, setQuery] = useState(data.query);
  const [totals, setTotals] = useState({ sent: 0, failed: 0 });
  const [running, setRunning] = useState(false);
  const [runId, setRunId] = useState(0);
  const applied = useRef("");
  const selected = data.products.find((product) => product.id === productId);
  const variants = selected?.variants?.nodes ?? [];
  const selectedVariant = variants.find((variant) => variant.id === variantId);
  const submitting = running || fetcher.state !== "idle";

  useEffect(() => {
    if (!data.products.some((product) => product.id === productId)) {
      setProductId(data.products[0]?.id ?? "");
      setVariantId("");
    }
  }, [data.products, productId]);

  useEffect(() => {
    if (variantId && !variants.some((variant) => variant.id === variantId)) {
      setVariantId("");
    }
  }, [variantId, variants]);

  useEffect(() => {
    if (fetcher.state !== "idle" || !fetcher.data || !running) return;
    const batch = fetcher.data;
    if (batch.runId !== runId) return;
    const key = `${batch.afterId}:${batch.nextAfterId}:${batch.sent}:${batch.failed}:${batch.done}`;
    if (applied.current === key) return;
    applied.current = key;
    setTotals((current) => ({
      sent: current.sent + batch.sent,
      failed: current.failed + batch.failed,
    }));
    if (!batch.done) {
      const body = new FormData();
      body.set("productId", productId);
      body.set("variantId", variantId);
      body.set("afterId", String(batch.nextAfterId));
      body.set("runId", String(runId));
      fetcher.submit(body, { method: "post", action: `/app/notify${search}` });
      return;
    }
    setRunning(false);
  }, [fetcher, productId, variantId, runId, running, search]);

  function searchProducts() {
    const params = new URLSearchParams(search);
    const term = query.trim();
    if (term) params.set("q", term);
    else params.delete("q");
    window.location.assign(`/app/notify?${params.toString()}`);
  }

  function startSend() {
    const nextRun = runId + 1;
    applied.current = "";
    setRunId(nextRun);
    setTotals({ sent: 0, failed: 0 });
    setRunning(true);
    const body = new FormData();
    body.set("productId", productId);
    body.set("variantId", variantId);
    body.set("afterId", "0");
    body.set("runId", String(nextRun));
    fetcher.submit(body, { method: "post", action: `/app/notify${search}` });
  }

  const stopped = !running && fetcher.state === "idle" && fetcher.data;
  const status = running
    ? t("notifyProgress", totals)
    : stopped && fetcher.data?.message
      ? fetcher.data.message
      : stopped
        ? t("notifyDone", totals)
        : "";

  return (
    <Page title={data.title} subtitle={data.subtitle}>
      <TitleBar title={data.title} />
      <BlockStack gap="400">
        {!data.apiKeyConfigured && (
          <Banner tone="warning">
            <p>{data.noKey}</p>
          </Banner>
        )}
        {data.apiKeyConfigured && !data.fromLabel && (
          <Banner tone="warning">
            <p>{data.noSender}</p>
          </Banner>
        )}
        {data.fromLabel && (
          <Banner tone="info">
            <p>{t("notifyFrom", { from: data.fromLabel })}</p>
          </Banner>
        )}
        {data.error && (
          <Banner tone="critical">
            <p>{data.error}</p>
          </Banner>
        )}
        {status && (
          <Banner
            tone={
              running
                ? "info"
                : fetcher.data?.ok === false && totals.sent === 0
                  ? "critical"
                  : totals.failed > 0
                    ? "warning"
                    : "success"
            }
          >
            <p>{status}</p>
          </Banner>
        )}
        <Card>
          <BlockStack gap="400">
            <InlineStack gap="300" blockAlign="end">
              <div style={{ flex: 1 }}>
                <TextField
                  label={data.searchLabel}
                  value={query}
                  onChange={setQuery}
                  autoComplete="off"
                />
              </div>
              <Button onClick={searchProducts}>{data.searchButton}</Button>
            </InlineStack>
            <Select
              label={data.pickLabel}
              options={
                data.products.length === 0
                  ? [{ label: data.noneLabel, value: "" }]
                  : data.products.map((product) => ({
                      label: product.title,
                      value: product.id,
                    }))
              }
              value={productId}
              disabled={data.products.length === 0}
              onChange={(value) => {
                setProductId(value);
                setVariantId("");
              }}
            />
            <Select
              label={data.variantLabel}
              options={[
                { label: data.noVariantLabel, value: "" },
                ...variants.map((variant) => ({
                  label: variant.title,
                  value: variant.id,
                })),
              ]}
              value={variantId}
              disabled={!selected || variants.length === 0}
              onChange={setVariantId}
            />
            {selected && (
              <InlineStack gap="300" blockAlign="center">
                {(selectedVariant?.image?.url || selected.featuredImage?.url) ? (
                  <Thumbnail
                    source={
                      selectedVariant?.image?.url || selected.featuredImage!.url
                    }
                    alt={selectedVariant?.title || selected.title}
                    size="large"
                  />
                ) : null}
                <BlockStack gap="100">
                  <Text as="h2" variant="headingMd">
                    {selectedVariant
                      ? `${selected.title} - ${selectedVariant.title}`
                      : selected.title}
                  </Text>
                  <Text as="p" variant="bodyMd">
                    {data.preview}
                  </Text>
                </BlockStack>
              </InlineStack>
            )}
            <Button
              variant="primary"
              loading={submitting}
              disabled={!productId || data.subscriberCount === 0 || !canSend}
              onClick={startSend}
            >
              {data.sendLabel}
            </Button>
            <Text as="p" variant="bodySm" tone="subdued">
              {data.hint}
            </Text>
          </BlockStack>
        </Card>
      </BlockStack>
    </Page>
  );
}
