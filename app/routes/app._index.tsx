import type { LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData, useLocation } from "@remix-run/react";
import {
  BlockStack,
  Button,
  Card,
  InlineStack,
  List,
  Page,
  Text,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { formatFromAddress } from "../email";
import db from "../db.server";
import { authenticate } from "../shopify.server";

const pages = [
  { path: "/app/settings", label: "发件设置", primary: true },
  { path: "/app/subscribers", label: "查看订阅者", primary: false },
  { path: "/app/notify", label: "发送通知", primary: false },
] as const;

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const [count, sender] = await Promise.all([
    db.subscriber.count({ where: { shop: session.shop } }),
    db.shopSender.findUnique({ where: { shop: session.shop } }),
  ]);

  return {
    shop: session.shop,
    count,
    fromLabel: sender
      ? formatFromAddress(sender.fromName, sender.fromEmail)
      : "",
  };
};

function openEmbeddedPage(path: string, search: string) {
  return (event?: { preventDefault: () => void }) => {
    event?.preventDefault();
    window.location.assign(`${path}${search}`);
  };
}

export default function Index() {
  const { shop, count, fromLabel } = useLoaderData<typeof loader>();
  const { search } = useLocation();

  return (
    <Page title="新品订阅通知">
      <TitleBar title="新品订阅通知" />
      <Card>
        <BlockStack gap="400">
          <Text as="h2" variant="headingMd">
            {shop}
          </Text>
          <Text as="p" variant="bodyMd">
            当前已有 {count} 位顾客订阅新品通知。
            {fromLabel
              ? `本店发件人是 ${fromLabel}。`
              : "本店还没有发件人，请先到「发件设置」填写。"}
          </Text>
          <List>
            <List.Item>
              在线商店 → 自定义 → 应用区块，把「新品订阅」拖到页面上。
            </List.Item>
            <List.Item>
              在「发件设置」保存本店的发件名称和邮箱。每家店单独保存。
            </List.Item>
            <List.Item>
              在「发送通知」选择商品，邮件会用本店发件人寄出。
            </List.Item>
          </List>
          <InlineStack gap="300">
            {pages.map((page) => (
              <Button
                key={page.path}
                variant={page.primary ? "primary" : undefined}
                url={`${page.path}${search}`}
                onClick={openEmbeddedPage(page.path, search)}
              >
                {page.label}
              </Button>
            ))}
          </InlineStack>
        </BlockStack>
      </Card>
    </Page>
  );
}
