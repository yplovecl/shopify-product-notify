import { useEffect, useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { useFetcher, useLoaderData } from "@remix-run/react";
import { Banner, BlockStack, Button, Card, Page, TextField } from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { formatFromAddress, normalizeEmail } from "../email";
import db from "../db.server";
import { localeFromRequest, translate } from "../i18n";
import { authenticate } from "../shopify.server";

type SettingsResult = {
  ok: boolean;
  message: string;
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const locale = localeFromRequest(request);
  const t = translate(locale);
  const sender = await db.shopSender.findUnique({
    where: { shop: session.shop },
  });

  return {
    locale,
    title: t("settingsTitle"),
    subtitle: t("settingsSubtitle", { shop: session.shop }),
    nameLabel: t("settingsName"),
    nameHelp: t("settingsNameHelp"),
    emailLabel: t("settingsEmail"),
    emailHelp: t("settingsEmailHelp"),
    saveLabel: t("settingsSave"),
    fromName: sender?.fromName ?? "",
    fromEmail: sender?.fromEmail ?? "",
  };
};

export const action = async ({
  request,
}: ActionFunctionArgs): Promise<SettingsResult> => {
  const { session } = await authenticate.admin(request);
  const t = translate(localeFromRequest(request));
  const formData = await request.formData();
  const fromNameField = formData.get("fromName");
  const fromName =
    typeof fromNameField === "string" ? fromNameField.trim() : "";
  const fromEmail = normalizeEmail(formData.get("fromEmail"));

  if (fromName.length > 80) {
    return { ok: false, message: t("settingsNameTooLong") };
  }

  if (!fromEmail) {
    return { ok: false, message: t("settingsEmailInvalid") };
  }

  await db.shopSender.upsert({
    where: { shop: session.shop },
    create: { shop: session.shop, fromName, fromEmail },
    update: { fromName, fromEmail },
  });

  return {
    ok: true,
    message: t("settingsSaved", {
      from: formatFromAddress(fromName, fromEmail),
    }),
  };
};

export default function SettingsPage() {
  const data = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const [fromName, setFromName] = useState(data.fromName);
  const [fromEmail, setFromEmail] = useState(data.fromEmail);
  const submitting =
    fetcher.state === "submitting" || fetcher.state === "loading";

  useEffect(() => {
    setFromName(data.fromName);
    setFromEmail(data.fromEmail);
  }, [data.fromName, data.fromEmail]);

  return (
    <Page title={data.title} subtitle={data.subtitle}>
      <TitleBar title={data.title} />
      <BlockStack gap="400">
        {fetcher.data?.message && (
          <Banner tone={fetcher.data.ok ? "success" : "critical"}>
            <p>{fetcher.data.message}</p>
          </Banner>
        )}
        <Card>
          <fetcher.Form method="post">
            <BlockStack gap="400">
              <TextField
                label={data.nameLabel}
                name="fromName"
                value={fromName}
                onChange={setFromName}
                autoComplete="off"
                helpText={data.nameHelp}
              />
              <TextField
                label={data.emailLabel}
                name="fromEmail"
                type="email"
                value={fromEmail}
                onChange={setFromEmail}
                autoComplete="off"
                helpText={data.emailHelp}
              />
              <Button variant="primary" submit loading={submitting}>
                {data.saveLabel}
              </Button>
            </BlockStack>
          </fetcher.Form>
        </Card>
      </BlockStack>
    </Page>
  );
}
