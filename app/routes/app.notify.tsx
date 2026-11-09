import { render } from "@react-email/render";
import { useEffect, useRef, useState, type DragEvent } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { useFetcher, useLoaderData, useLocation, useNavigate } from "@remix-run/react";
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
import { formatFromAddress, platformFromEmail } from "../email";
import db from "../db.server";
import { localeFromRequest, translate } from "../i18n";
import { getResend } from "../resend.server";
import { authenticate } from "../shopify.server";
import { unsubscribeUrl } from "../unsubscribe.server";

/** Resend `batch.send` accepts at most 100 emails per request. */
const BATCH_SIZE = 100;
/** Enough for one email without making the message unwieldy. */
const MAX_PRODUCTS = 20;
/** One id per click. A small counter repeats after refresh and collides for 24 hours. */
const RUN_ID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

type ProductFields = {
  id: string;
  title: string;
  handle: string;
  onlineStoreUrl: string | null;
  featuredImage: { url: string } | null;
};

type NotifyNode =
  | ({ __typename: "Product" } & ProductFields)
  | {
      __typename: "ProductVariant";
      id: string;
      title: string;
      image: { url: string } | null;
      product: ProductFields;
    }
  | { __typename: string }
  | null;

type NotifyNodesQuery = {
  data?: {
    shop?: { name: string };
    nodes?: NotifyNode[];
  };
  errors?: { message: string }[];
};

type RequestedItem = {
  productId: string;
  variantId: string;
};

type MailProduct = {
  title: string;
  imageUrl?: string;
  url: string;
};

type NotifyResult = {
  ok: boolean;
  sent: number;
  failed: number;
  done: boolean;
  afterId: number;
  nextAfterId: number;
  runId: string;
  message: string;
};

function errorText(error: unknown) {
  if (error instanceof Error && error.message) return error.message;
  if (
    error &&
    typeof error === "object" &&
    "message" in error &&
    typeof error.message === "string"
  ) {
    return error.message;
  }
  return "";
}

function readRunId(value: FormDataEntryValue | null) {
  const runId = typeof value === "string" ? value.trim().toLowerCase() : "";
  return RUN_ID_RE.test(runId) ? runId : "";
}

function rejected(message: string, runId = ""): NotifyResult {
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

function itemKey(item: { productId: string; variantId: string }) {
  return `${item.productId}\n${item.variantId}`;
}

function moveItem<T>(items: T[], from: number, to: number) {
  if (
    from === to ||
    from < 0 ||
    to < 0 ||
    from >= items.length ||
    to >= items.length
  ) {
    return items;
  }
  const next = items.slice();
  const [moved] = next.splice(from, 1);
  if (moved === undefined) return items;
  next.splice(to, 0, moved);
  return next;
}

function readItems(
  value: FormDataEntryValue | null,
): { items: RequestedItem[] } | { error: "select" | "tooMany" } {
  if (typeof value !== "string" || value.length === 0 || value.length > 20000) {
    return { error: "select" };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return { error: "select" };
  }
  if (!Array.isArray(parsed) || parsed.length === 0) return { error: "select" };
  if (parsed.length > MAX_PRODUCTS) return { error: "tooMany" };

  const items: RequestedItem[] = [];
  const seen = new Set<string>();
  for (const entry of parsed) {
    if (!entry || typeof entry !== "object") return { error: "select" };
    const productId =
      "productId" in entry && typeof entry.productId === "string"
        ? entry.productId
        : "";
    const variantId =
      "variantId" in entry && typeof entry.variantId === "string"
        ? entry.variantId
        : "";
    if (!productId.startsWith("gid://shopify/Product/")) return { error: "select" };
    if (variantId && !variantId.startsWith("gid://shopify/ProductVariant/")) {
      return { error: "select" };
    }
    const key = itemKey({ productId, variantId });
    if (seen.has(key)) return { error: "select" };
    seen.add(key);
    items.push({ productId, variantId });
  }
  return { items };
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
  const platform = platformFromEmail();

  return {
    locale,
    query: search.term,
    title: t("notifyTitle"),
    subtitle: t("notifySubtitle", { count: subscriberCount }),
    products: payload.data?.products?.nodes ?? [],
    subscriberCount,
    apiKeyConfigured: Boolean(process.env.RESEND_API_KEY),
    platformConfigured: Boolean(platform),
    fromLabel:
      sender && platform ? formatFromAddress(sender.fromName, platform) : "",
    replyLabel: sender?.fromEmail ?? "",
    error: payload.errors?.map((item) => item.message).join("; ") ?? null,
    noKey: t("notifyNoKey"),
    noFrom: t("notifyNoFrom"),
    noSender: t("notifyNoSender"),
    searchLabel: t("notifySearch"),
    searchButton: t("notifySearchButton"),
    pickLabel: t("notifyPick"),
    variantLabel: t("notifyVariant"),
    noVariantLabel: t("notifyNoVariant"),
    noneLabel: t("notifyNone"),
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
  const afterRaw = Number(formData.get("afterId") || 0);
  const afterId = Number.isFinite(afterRaw) && afterRaw > 0 ? afterRaw : 0;
  const runId = readRunId(formData.get("runId"));
  if (!runId) return rejected(t("notifySendFailed"));
  const requested = readItems(formData.get("items"));
  if ("error" in requested) {
    return rejected(
      requested.error === "tooMany"
        ? t("notifyTooMany", { count: MAX_PRODUCTS })
        : t("notifySelectProduct"),
      runId,
    );
  }

  const resend = getResend();
  if (!resend) return rejected(t("notifyNoKey"), runId);
  const platform = platformFromEmail();
  if (!platform) return rejected(t("notifyNoFrom"), runId);

  const sender = await db.shopSender.findUnique({
    where: { shop: session.shop },
  });
  if (!sender) return rejected(t("notifyNoSender"), runId);
  const from = formatFromAddress(sender.fromName, platform);

  const ids = [
    ...new Set(
      requested.items.flatMap((item) =>
        item.variantId ? [item.productId, item.variantId] : [item.productId],
      ),
    ),
  ];
  const response = await admin.graphql(
    `#graphql
      query NotifyProducts($ids: [ID!]!) {
        shop {
          name
        }
        nodes(ids: $ids) {
          __typename
          ... on Product {
            id
            title
            handle
            onlineStoreUrl
            featuredImage {
              url
            }
          }
          ... on ProductVariant {
            id
            title
            image {
              url
            }
            product {
              id
              title
              handle
              onlineStoreUrl
              featuredImage {
                url
              }
            }
          }
        }
      }`,
    { variables: { ids } },
  );
  const payload = (await response.json()) as NotifyNodesQuery;

  if (payload.errors?.length) {
    return rejected(payload.errors.map((item) => item.message).join("; "), runId);
  }

  const productsById = new Map<string, ProductFields>();
  const variantsById = new Map<
    string,
    { id: string; title: string; image: { url: string } | null; product: ProductFields }
  >();
  for (const node of payload.data?.nodes ?? []) {
    if (!node || !("__typename" in node)) continue;
    if (node.__typename === "Product" && "handle" in node) {
      productsById.set(node.id, node);
    } else if (node.__typename === "ProductVariant" && "product" in node) {
      variantsById.set(node.id, node);
    }
  }

  const mailProducts: MailProduct[] = [];
  for (const item of requested.items) {
    const product = productsById.get(item.productId);
    if (!product) return rejected(t("notifyMissingProduct"), runId);
    const productUrl = productUrlFor(session.shop, product);
    if (!productUrl) return rejected(t("notifyBadUrl"), runId);

    let title = product.title;
    let url = productUrl;
    let imageUrl = product.featuredImage?.url;
    if (item.variantId) {
      const variant = variantsById.get(item.variantId);
      if (!variant || variant.product.id !== item.productId) {
        return rejected(t("notifyMissingVariant"), runId);
      }
      const variantUrl = variantUrlFor(productUrl, variant.id);
      if (!variantUrl) return rejected(t("notifyBadUrl"), runId);
      title = `${product.title} - ${variant.title}`;
      url = variantUrl;
      imageUrl = variant.image?.url || imageUrl;
    }
    mailProducts.push({
      title,
      url,
      imageUrl: imageUrl && imageUrl.startsWith("https://") ? imageUrl : undefined,
    });
  }

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
  const subject =
    mailProducts.length === 1
      ? emailCopy("emailSubject", { title: mailProducts[0]!.title })
      : emailCopy("emailSubjectMany", { shop: shopName });
  const intro =
    mailProducts.length === 1
      ? emailCopy("emailHello", { shop: shopName })
      : emailCopy("emailHelloMany", { shop: shopName });
  const buttonLabel = emailCopy("emailButton");
  const unsubscribeLabel = emailCopy("emailUnsubscribe");

  let sent = 0;
  let failed = 0;
  let message = "";

  try {
    const emails = await Promise.all(
      subscribers.map(async (subscriber) => ({
        from,
        replyTo: sender.fromEmail,
        to: subscriber.email,
        subject,
        html: await render(
          <NewProductNotification
            products={mailProducts}
            intro={intro}
            buttonLabel={buttonLabel}
            unsubscribeUrl={unsubscribeUrl(session.shop, subscriber.email, "en")}
            unsubscribeLabel={unsubscribeLabel}
          />,
        ),
      })),
    );
    const { data, error } = await resend.batch.send(emails, {
      batchValidation: "permissive",
      idempotencyKey: `${session.shop}:${runId}:${afterId}`,
    });
    if (error || !data) {
      failed = subscribers.length;
      message = errorText(error) || t("notifySendFailed");
      console.error("Resend batch send failed", error);
    } else {
      const queued = Array.isArray(data.data) ? data.data.length : 0;
      const errors = Array.isArray(data.errors) ? data.errors : [];
      sent = queued;
      failed = errors.length;
      if (failed > 0) {
        message =
          errors
            .map((item) => item.message)
            .filter((item) => item.length > 0)
            .join("; ") || t("notifySendFailed");
        console.error("Resend rejected batch emails", errors);
      }
    }
  } catch (error) {
    failed = subscribers.length;
    message = errorText(error) || t("notifySendFailed");
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
    message,
  };
};

type PickedItem = RequestedItem & {
  title: string;
  imageUrl: string | null;
};

function itemPayload(items: PickedItem[]) {
  return JSON.stringify(
    items.map(({ productId, variantId }) => ({ productId, variantId })),
  );
}

function DragGrip() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <circle cx="5" cy="4" r="1.2" fill="currentColor" />
      <circle cx="11" cy="4" r="1.2" fill="currentColor" />
      <circle cx="5" cy="8" r="1.2" fill="currentColor" />
      <circle cx="11" cy="8" r="1.2" fill="currentColor" />
      <circle cx="5" cy="12" r="1.2" fill="currentColor" />
      <circle cx="11" cy="12" r="1.2" fill="currentColor" />
    </svg>
  );
}

export default function NotifyPage() {
  const data = useLoaderData<typeof loader>();
  const { search } = useLocation();
  const navigate = useNavigate();
  const t = translate(data.locale);
  const canSend =
    data.apiKeyConfigured && data.platformConfigured && Boolean(data.replyLabel);
  const fetcher = useFetcher<typeof action>();
  const [productId, setProductId] = useState(data.products[0]?.id ?? "");
  const [variantId, setVariantId] = useState("");
  const [items, setItems] = useState<PickedItem[]>([]);
  const [query, setQuery] = useState(data.query);
  const [totals, setTotals] = useState({ sent: 0, failed: 0 });
  const [failure, setFailure] = useState("");
  const [running, setRunning] = useState(false);
  const [runId, setRunId] = useState("");
  const [dragKey, setDragKey] = useState<string | null>(null);
  const applied = useRef("");
  const pendingItems = useRef("[]");
  const dragKeyRef = useRef<string | null>(null);
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const selected = data.products.find((product) => product.id === productId);
  const variants = selected?.variants?.nodes ?? [];
  const selectedVariant = variants.find((variant) => variant.id === variantId);
  const submitting = running || fetcher.state !== "idle";
  const alreadyAdded = items.some(
    (item) => item.productId === productId && item.variantId === variantId,
  );
  const atLimit = items.length >= MAX_PRODUCTS;

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
    if (batch.message && (batch.sent > 0 || batch.failed > 0)) {
      setFailure(batch.message);
    }
    if (!batch.done) {
      const body = new FormData();
      body.set("items", pendingItems.current);
      body.set("afterId", String(batch.nextAfterId));
      body.set("runId", runId);
      fetcher.submit(body, { method: "post", action: `/app/notify${search}` });
      return;
    }
    setRunning(false);
  }, [fetcher, runId, running, search]);

  function searchProducts() {
    const params = new URLSearchParams(search);
    const term = query.trim();
    if (term) params.set("q", term);
    else params.delete("q");
    navigate(`/app/notify?${params.toString()}`);
  }

  function addProduct() {
    if (!selected || atLimit || alreadyAdded || submitting) return;
    const imageUrl = selectedVariant?.image?.url || selected.featuredImage?.url || null;
    const title = selectedVariant
      ? `${selected.title} - ${selectedVariant.title}`
      : selected.title;
    setItems((current) => [
      ...current,
      { productId: selected.id, variantId, title, imageUrl },
    ]);
  }

  function removeItem(key: string) {
    setItems((current) => current.filter((item) => itemKey(item) !== key));
  }

  function onDragStart(event: DragEvent<HTMLDivElement>, key: string) {
    dragKeyRef.current = key;
    setDragKey(key);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", key);
  }

  function onDragOver(event: DragEvent<HTMLDivElement>, overKey: string) {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    const key = dragKeyRef.current;
    if (!key || key === overKey) return;
    const current = itemsRef.current;
    const from = current.findIndex((item) => itemKey(item) === key);
    const overIndex = current.findIndex((item) => itemKey(item) === overKey);
    if (from < 0 || overIndex < 0) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const pastMidpoint = event.clientY > rect.top + rect.height / 2;
    if (overIndex === from + 1 && !pastMidpoint) return;
    if (overIndex === from - 1 && pastMidpoint) return;
    setItems(moveItem(current, from, overIndex));
  }

  function onDragEnd() {
    dragKeyRef.current = null;
    setDragKey(null);
  }

  function startSend() {
    if (items.length === 0) return;
    const nextRun = crypto.randomUUID();
    const payload = itemPayload(items);
    pendingItems.current = payload;
    applied.current = "";
    setRunId(nextRun);
    setTotals({ sent: 0, failed: 0 });
    setFailure("");
    setRunning(true);
    const body = new FormData();
    body.set("items", payload);
    body.set("afterId", "0");
    body.set("runId", nextRun);
    fetcher.submit(body, { method: "post", action: `/app/notify${search}` });
  }

  const stopped = !running && fetcher.state === "idle" && fetcher.data;
  const status = running
    ? t("notifyProgress", totals)
    : stopped && failure
      ? `${t("notifyDone", totals)} ${failure}`
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
        {data.apiKeyConfigured && !data.platformConfigured && (
          <Banner tone="warning">
            <p>{data.noFrom}</p>
          </Banner>
        )}
        {data.apiKeyConfigured && data.platformConfigured && !data.replyLabel && (
          <Banner tone="warning">
            <p>{data.noSender}</p>
          </Banner>
        )}
        {data.fromLabel && (
          <Banner tone="info">
            <p>{t("notifyFrom", { from: data.fromLabel, reply: data.replyLabel })}</p>
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
              <Button onClick={searchProducts} disabled={submitting}>
                {data.searchButton}
              </Button>
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
              disabled={data.products.length === 0 || submitting}
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
              disabled={!selected || variants.length === 0 || submitting}
              onChange={setVariantId}
            />
            <InlineStack gap="300" blockAlign="center">
              <Button
                onClick={addProduct}
                disabled={!selected || submitting || atLimit || alreadyAdded}
              >
                {t("notifyAdd")}
              </Button>
              {atLimit ? (
                <Text as="p" variant="bodySm" tone="subdued">
                  {t("notifyTooMany", { count: MAX_PRODUCTS })}
                </Text>
              ) : alreadyAdded ? (
                <Text as="p" variant="bodySm" tone="subdued">
                  {t("notifyAlreadyAdded")}
                </Text>
              ) : null}
            </InlineStack>
            <BlockStack gap="200">
              <Text as="h2" variant="headingMd">
                {t("notifyAdded")}
              </Text>
              <Text as="p" variant="bodySm" tone="subdued">
                {items.length === 0
                  ? t("notifyAddedEmpty", { count: MAX_PRODUCTS })
                  : t("notifyPreview")}
              </Text>
              <div role="list" aria-label={t("notifyAdded")}>
                <BlockStack gap="200">
                  {items.map((item, index) => {
                    const key = itemKey(item);
                    return (
                      <div
                        role="listitem"
                        key={key}
                        draggable={!submitting}
                        aria-label={t("notifyDrag")}
                        onDragStart={(event) => {
                          const target = event.target instanceof Element ? event.target : null;
                          if (target?.closest("button")) {
                            event.preventDefault();
                            return;
                          }
                          onDragStart(event, key);
                        }}
                        onDragOver={(event) => onDragOver(event, key)}
                        onDrop={(event) => event.preventDefault()}
                        onDragEnd={onDragEnd}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 12,
                          padding: "8px 12px",
                          border: "1px solid #e3e3e3",
                          borderRadius: 8,
                          background: dragKey === key ? "#f6f6f7" : "#ffffff",
                          cursor: submitting ? "default" : "grab",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            color: "#616161",
                          }}
                        >
                          <DragGrip />
                        </div>
                        <Text as="span" variant="bodySm" tone="subdued">
                          {index + 1}
                        </Text>
                        {item.imageUrl ? (
                          <Thumbnail source={item.imageUrl} alt="" size="small" />
                        ) : null}
                        <div style={{ flex: 1 }}>
                          <Text as="span" variant="bodyMd">
                            {item.title}
                          </Text>
                        </div>
                        <Button
                          variant="plain"
                          tone="critical"
                          disabled={submitting}
                          onClick={() => removeItem(key)}
                        >
                          {t("notifyRemove")}
                        </Button>
                      </div>
                    );
                  })}
                </BlockStack>
              </div>
            </BlockStack>
            <Button
              variant="primary"
              loading={submitting}
              disabled={items.length === 0 || data.subscriberCount === 0 || !canSend}
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
