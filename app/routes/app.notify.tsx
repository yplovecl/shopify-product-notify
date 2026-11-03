import { useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { useFetcher, useLoaderData } from "@remix-run/react";
import {
  Banner,
  BlockStack,
  Button,
  Card,
  InlineStack,
  Page,
  Select,
  Text,
  Thumbnail,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { NewProductNotification } from "../emails/NewProductNotification";
import { formatFromAddress } from "../email";
import db from "../db.server";
import { getResend } from "../resend.server";
import { authenticate } from "../shopify.server";

const SEND_INTERVAL_MS = 600;

type ProductNode = {
  id: string;
  title: string;
  handle: string;
  featuredImage: { url: string } | null;
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
  };
  errors?: { message: string }[];
};

type NotifyResult = {
  ok: boolean;
  sent: number;
  failed: number;
  message: string;
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function rejected(message: string): NotifyResult {
  return { ok: false, sent: 0, failed: 0, message };
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

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const [subscriberCount, sender] = await Promise.all([
    db.subscriber.count({ where: { shop: session.shop } }),
    db.shopSender.findUnique({ where: { shop: session.shop } }),
  ]);

  const response = await admin.graphql(
    `#graphql
      query NotifyProductList {
        products(first: 50, sortKey: UPDATED_AT, reverse: true, query: "status:active") {
          nodes {
            id
            title
            handle
            featuredImage {
              url
            }
          }
        }
      }`,
  );
  const payload = (await response.json()) as ProductsQuery;

  return {
    products: payload.data?.products?.nodes ?? [],
    subscriberCount,
    apiKeyConfigured: Boolean(process.env.RESEND_API_KEY),
    fromLabel: sender
      ? formatFromAddress(sender.fromName, sender.fromEmail)
      : "",
    error: payload.errors?.map((item) => item.message).join("; ") ?? null,
  };
};

export const action = async ({
  request,
}: ActionFunctionArgs): Promise<NotifyResult> => {
  const { admin, session } = await authenticate.admin(request);
  const formData = await request.formData();
  const productIdField = formData.get("productId");
  const productId =
    typeof productIdField === "string" ? productIdField : "";

  if (!productId.startsWith("gid://shopify/Product/")) {
    return rejected("请选择要通知的商品");
  }

  const resend = getResend();
  if (!resend) {
    return rejected("服务器尚未配置 RESEND_API_KEY");
  }

  const sender = await db.shopSender.findUnique({
    where: { shop: session.shop },
  });
  if (!sender) {
    return rejected("请先在「发件设置」填写本店发件人");
  }
  const from = formatFromAddress(sender.fromName, sender.fromEmail);

  const response = await admin.graphql(
    `#graphql
      query NotifyProduct($id: ID!) {
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
      }`,
    { variables: { id: productId } },
  );
  const payload = (await response.json()) as ProductQuery;

  if (payload.errors?.length) {
    return rejected(payload.errors.map((item) => item.message).join("; "));
  }

  const product = payload.data?.product;
  if (!product) {
    return rejected("找不到该商品");
  }

  const productUrl = productUrlFor(session.shop, product);
  if (!productUrl) {
    return rejected("无法生成商品链接");
  }

  const subscribers = await db.subscriber.findMany({
    where: { shop: session.shop },
    select: { email: true },
    orderBy: { id: "asc" },
  });

  if (subscribers.length === 0) {
    return rejected("当前店铺还没有订阅者");
  }

  const shopName = payload.data?.shop?.name || session.shop;
  const imageUrl = product.featuredImage?.url;
  const safeImageUrl =
    imageUrl && imageUrl.startsWith("https://") ? imageUrl : undefined;

  let sent = 0;
  let failed = 0;

  // Resend 免费版约 2 req/s，串行发送并在两封之间等待。
  for (let index = 0; index < subscribers.length; index += 1) {
    const subscriber = subscribers[index]!;
    try {
      const { error } = await resend.emails.send({
        from,
        to: subscriber.email,
        subject: `新品上架：${product.title}`,
        react: (
          <NewProductNotification
            productTitle={product.title}
            productImageUrl={safeImageUrl}
            productUrl={productUrl}
            shopName={shopName}
          />
        ),
      });
      if (error) {
        failed += 1;
        console.error("Resend rejected email", error);
      } else {
        sent += 1;
      }
    } catch (error) {
      failed += 1;
      console.error("Resend send failed", error);
    }

    if (index < subscribers.length - 1) {
      await sleep(SEND_INTERVAL_MS);
    }
  }

  return {
    ok: failed === 0,
    sent,
    failed,
    message: `发送完成：成功 ${sent} 封，失败 ${failed} 封`,
  };
};

export default function NotifyPage() {
  const { products, subscriberCount, apiKeyConfigured, fromLabel, error } =
    useLoaderData<typeof loader>();
  const canSend = apiKeyConfigured && Boolean(fromLabel);
  const fetcher = useFetcher<typeof action>();
  const [productId, setProductId] = useState(products[0]?.id ?? "");
  const selected = products.find((product) => product.id === productId);
  const submitting =
    fetcher.state === "submitting" || fetcher.state === "loading";

  return (
    <Page
      title="发送新品通知"
      subtitle={`将发送给当前店铺的 ${subscriberCount} 位订阅者`}
    >
      <TitleBar title="发送新品通知" />
      <BlockStack gap="400">
        {!apiKeyConfigured && (
          <Banner tone="warning">
            <p>服务器尚未配置 RESEND_API_KEY，暂时不能发信。</p>
          </Banner>
        )}
        {apiKeyConfigured && !fromLabel && (
          <Banner tone="warning">
            <p>请先在「发件设置」填写本店的发件名称和邮箱。</p>
          </Banner>
        )}
        {fromLabel && (
          <Banner tone="info">
            <p>本店将以 {fromLabel} 发信，不会使用其他店铺的发件人。</p>
          </Banner>
        )}
        {error && (
          <Banner tone="critical">
            <p>{error}</p>
          </Banner>
        )}
        {fetcher.data?.message && (
          <Banner
            tone={
              fetcher.data.ok
                ? "success"
                : fetcher.data.sent > 0
                  ? "warning"
                  : "critical"
            }
          >
            <p>{fetcher.data.message}</p>
          </Banner>
        )}
        <Card>
          <fetcher.Form method="post">
            <input type="hidden" name="productId" value={productId} />
            <BlockStack gap="400">
              <Select
                label="选择商品"
                options={
                  products.length === 0
                    ? [{ label: "没有在售商品", value: "" }]
                    : products.map((product) => ({
                        label: product.title,
                        value: product.id,
                      }))
                }
                value={productId}
                disabled={products.length === 0}
                onChange={setProductId}
              />
              {selected && (
                <InlineStack gap="300" blockAlign="center">
                  {selected.featuredImage?.url ? (
                    <Thumbnail
                      source={selected.featuredImage.url}
                      alt={selected.title}
                      size="large"
                    />
                  ) : null}
                  <BlockStack gap="100">
                    <Text as="h2" variant="headingMd">
                      {selected.title}
                    </Text>
                    <Text as="p" variant="bodyMd">
                      邮件会包含商品名称、图片和商品链接。
                    </Text>
                  </BlockStack>
                </InlineStack>
              )}
              <Button
                variant="primary"
                submit
                loading={submitting}
                disabled={!productId || subscriberCount === 0 || !canSend}
              >
                发送通知
              </Button>
              <Text as="p" variant="bodySm" tone="subdued">
                列表显示最近更新的 50 个在售商品。发信按顺序进行，订阅者较多时请保持页面打开。
              </Text>
            </BlockStack>
          </fetcher.Form>
        </Card>
      </BlockStack>
    </Page>
  );
}
