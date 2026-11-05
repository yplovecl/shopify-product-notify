import type { LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { BlockStack, Box, Card, IndexTable, Page, Text } from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import db from "../db.server";
import { localeFromRequest, translate, type Locale } from "../i18n";
import { authenticate } from "../shopify.server";

function formatTime(iso: string | null, locale: Locale) {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString(locale === "zh" ? "zh-CN" : "en", {
    hour12: false,
  });
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const locale = await localeFromRequest(request);
  const t = translate(locale);
  const [subscribers, requests] = await Promise.all([
    db.subscriber.findMany({
      where: { shop: session.shop },
      orderBy: { createdAt: "desc" },
    }),
    db.customerDataRequest.findMany({
      where: { shop: session.shop },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
  ]);

  return {
    locale,
    title: t("subscribersTitle"),
    subtitle: t("subscribersSubtitle", { count: subscribers.length }),
    empty: t("subscribersEmpty"),
    colEmail: t("colEmail"),
    colSubscribed: t("colSubscribed"),
    dataRequestsTitle: t("dataRequestsTitle"),
    dataRequestsHelp: t("dataRequestsHelp"),
    dataRequestsEmpty: t("dataRequestsEmpty"),
    colRequested: t("colRequested"),
    subscribers: subscribers.map((subscriber) => ({
      id: subscriber.id,
      email: subscriber.email,
      createdAt: subscriber.createdAt.toISOString(),
    })),
    requests: requests.map((item) => ({
      id: item.id,
      email: item.email,
      requestedAt: item.createdAt.toISOString(),
      detail: item.found
        ? t("dataRequestFound", {
            at: formatTime(item.subscribedAt?.toISOString() ?? null, locale),
          })
        : t("dataRequestMissing"),
    })),
  };
};

export default function SubscribersPage() {
  const data = useLoaderData<typeof loader>();

  return (
    <Page title={data.title} subtitle={data.subtitle}>
      <TitleBar title={data.title} />
      <BlockStack gap="400">
        <Card padding="0">
          <IndexTable
            resourceName={{ singular: "subscriber", plural: "subscribers" }}
            itemCount={data.subscribers.length}
            selectable={false}
            headings={[
              { title: data.colEmail },
              { title: data.colSubscribed },
            ]}
            emptyState={
              <Box padding="400">
                <Text as="p" variant="bodyMd">
                  {data.empty}
                </Text>
              </Box>
            }
          >
            {data.subscribers.map((subscriber, index) => (
              <IndexTable.Row
                id={String(subscriber.id)}
                key={subscriber.id}
                position={index}
              >
                <IndexTable.Cell>{subscriber.email}</IndexTable.Cell>
                <IndexTable.Cell>
                  {formatTime(subscriber.createdAt, data.locale)}
                </IndexTable.Cell>
              </IndexTable.Row>
            ))}
          </IndexTable>
        </Card>
        <Card>
          <BlockStack gap="300">
            <Text as="h2" variant="headingMd">
              {data.dataRequestsTitle}
            </Text>
            <Text as="p" variant="bodyMd">
              {data.dataRequestsHelp}
            </Text>
            {data.requests.length === 0 ? (
              <Text as="p" variant="bodyMd">
                {data.dataRequestsEmpty}
              </Text>
            ) : (
              data.requests.map((item) => (
                <Text as="p" variant="bodyMd" key={item.id}>
                  {item.email} — {item.detail} — {data.colRequested}{" "}
                  {formatTime(item.requestedAt, data.locale)}
                </Text>
              ))
            )}
          </BlockStack>
        </Card>
      </BlockStack>
    </Page>
  );
}
