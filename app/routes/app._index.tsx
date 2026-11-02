import type { LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import {
  BlockStack,
  Button,
  Card,
  InlineStack,
  Layout,
  List,
  Page,
  Text,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import db from "../db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const count = await db.subscriber.count({
    where: { shop: session.shop },
  });

  return { shop: session.shop, count };
};

export default function Index() {
  const { shop, count } = useLoaderData<typeof loader>();

  return (
    <Page title="新品订阅通知">
      <TitleBar title="新品订阅通知" />
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text as="h2" variant="headingMd">
                {shop}
              </Text>
              <Text as="p" variant="bodyMd">
                当前已有 {count} 位顾客订阅新品通知。在主题编辑器加入「新品订阅」区块收集邮箱，再选择商品一键发信。
              </Text>
              <List>
                <List.Item>
                  在线商店 → 自定义 → 应用区块，把「新品订阅」拖到页面上。
                </List.Item>
                <List.Item>
                  顾客提交邮箱后，到「订阅者」页面查看名单。
                </List.Item>
                <List.Item>
                  在「发送通知」选择商品，邮件会带上名称、图片和链接。
                </List.Item>
              </List>
              <InlineStack gap="300">
                <Button url="/app/subscribers" variant="primary">
                  查看订阅者
                </Button>
                <Button url="/app/notify">发送通知</Button>
              </InlineStack>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
