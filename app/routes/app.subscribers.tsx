import type { LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { Box, Card, IndexTable, Page, Text } from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import db from "../db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const subscribers = await db.subscriber.findMany({
    where: { shop: session.shop },
    orderBy: { createdAt: "desc" },
  });

  return {
    count: subscribers.length,
    subscribers: subscribers.map((subscriber) => ({
      id: subscriber.id,
      email: subscriber.email,
      createdAt: subscriber.createdAt.toISOString(),
    })),
  };
};

function formatTime(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString("zh-CN", { hour12: false });
}

export default function SubscribersPage() {
  const { count, subscribers } = useLoaderData<typeof loader>();

  return (
    <Page
      title="订阅者"
      subtitle={`当前店铺共 ${count} 位订阅者`}
    >
      <TitleBar title="订阅者" />
      <Card padding="0">
        <IndexTable
          resourceName={{ singular: "订阅者", plural: "订阅者" }}
          itemCount={subscribers.length}
          selectable={false}
          headings={[{ title: "邮箱" }, { title: "订阅时间" }]}
          emptyState={
            <Box padding="400">
              <Text as="p" variant="bodyMd">
                还没有订阅者。在主题编辑器中添加「新品订阅」区块后，顾客提交的邮箱会显示在这里。
              </Text>
            </Box>
          }
        >
          {subscribers.map((subscriber, index) => (
            <IndexTable.Row
              id={String(subscriber.id)}
              key={subscriber.id}
              position={index}
            >
              <IndexTable.Cell>{subscriber.email}</IndexTable.Cell>
              <IndexTable.Cell>
                {formatTime(subscriber.createdAt)}
              </IndexTable.Cell>
            </IndexTable.Row>
          ))}
        </IndexTable>
      </Card>
    </Page>
  );
}
