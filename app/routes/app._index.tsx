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
import { localeFromRequest, translate } from "../i18n";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const locale = localeFromRequest(request);
  const t = translate(locale);
  const [count, sender] = await Promise.all([
    db.subscriber.count({ where: { shop: session.shop } }),
    db.shopSender.findUnique({ where: { shop: session.shop } }),
  ]);

  return {
    locale,
    title: t("homeTitle"),
    shop: session.shop,
    summary: t("homeCount", { count }),
    senderLine: sender
      ? t("homeSender", {
          from: formatFromAddress(sender.fromName, sender.fromEmail),
        })
      : t("homeNoSender"),
    steps: [t("homeStepBlock"), t("homeStepSender"), t("homeStepNotify")],
    settingsLabel: t("homeSettings"),
    subscribersLabel: t("homeSubscribers"),
    notifyLabel: t("homeNotify"),
    privacyLabel: t("homePrivacy"),
  };
};

function openEmbeddedPage(path: string, search: string) {
  return (event?: { preventDefault: () => void }) => {
    event?.preventDefault();
    window.location.assign(`${path}${search}`);
  };
}

export default function Index() {
  const data = useLoaderData<typeof loader>();
  const { search } = useLocation();
  const pages = [
    { path: "/app/settings", label: data.settingsLabel, primary: true },
    { path: "/app/subscribers", label: data.subscribersLabel, primary: false },
    { path: "/app/notify", label: data.notifyLabel, primary: false },
    { path: "/privacy", label: data.privacyLabel, primary: false },
  ];

  return (
    <Page title={data.title}>
      <TitleBar title={data.title} />
      <Card>
        <BlockStack gap="400">
          <Text as="h2" variant="headingMd">
            {data.shop}
          </Text>
          <Text as="p" variant="bodyMd">
            {data.summary} {data.senderLine}
          </Text>
          <List>
            {data.steps.map((step) => (
              <List.Item key={step}>{step}</List.Item>
            ))}
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
