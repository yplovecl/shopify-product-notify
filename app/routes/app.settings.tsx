import { useEffect, useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { useFetcher, useLoaderData } from "@remix-run/react";
import {
  Badge,
  Banner,
  BlockStack,
  Box,
  Button,
  Card,
  InlineStack,
  Page,
  Select,
  Text,
  TextField,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { DOMAIN_REGIONS, type ShopDomainView, type StoredRecord } from "../domain";
import {
  addShopDomain,
  deleteShopDomain,
  loadShopDomain,
  verifyShopDomain,
} from "../domain.server";
import db from "../db.server";
import { emailOnDomain, formatFromAddress, normalizeEmail } from "../email";
import { localeFromRequest, translate, type CopyKey, type Locale } from "../i18n";
import { authenticate } from "../shopify.server";

type SettingsResult = {
  ok: boolean;
  message: string;
};

type BadgeTone = "success" | "warning" | "critical" | "attention" | "info";

function statusKey(status: string): CopyKey {
  if (status === "verified") return "domainStatusVerified";
  if (status === "pending") return "domainStatusPending";
  if (status === "failed" || status === "partially_failed" || status === "temporary_failure") {
    return "domainStatusFailed";
  }
  if (status === "partially_verified") return "domainStatusPartial";
  return "domainStatusNotStarted";
}

function statusTone(status: string): BadgeTone {
  if (status === "verified") return "success";
  if (status === "failed" || status === "partially_failed" || status === "temporary_failure") {
    return "critical";
  }
  if (status === "pending" || status === "partially_verified") return "attention";
  return "warning";
}

function failureMessage(
  t: ReturnType<typeof translate>,
  result: { error: "noKey" | "invalid" | "exists" | "taken" | "missing" | "resend"; detail?: string },
  fallback: CopyKey,
) {
  if (result.error === "noKey") return t("settingsNoResend");
  if (result.error === "resend") return result.detail || t(fallback);
  return t(fallback);
}

function verificationFailed(status: string) {
  return status === "failed" || status === "partially_failed" || status === "temporary_failure";
}

function verifyMessage(t: ReturnType<typeof translate>, domain: ShopDomainView) {
  if (domain.status === "verified") return t("settingsDomainVerified", { domain: domain.name });
  if (verificationFailed(domain.status)) {
    return t("settingsDomainFailed", { domain: domain.name });
  }
  return t("settingsDomainPending", { domain: domain.name });
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const locale = await localeFromRequest(request);
  const t = translate(locale);
  const [loaded, sender] = await Promise.all([
    loadShopDomain(session.shop),
    db.shopSender.findUnique({ where: { shop: session.shop } }),
  ]);

  return {
    locale,
    title: t("settingsTitle"),
    subtitle: t("settingsSubtitle", { shop: session.shop }),
    resendConfigured: Boolean(process.env.RESEND_API_KEY),
    domain: loaded.domain,
    warning: loaded.warning,
    fromName: sender?.fromName ?? "",
    fromEmail: sender?.fromEmail ?? "",
  };
};

export const action = async ({ request }: ActionFunctionArgs): Promise<SettingsResult> => {
  const { session } = await authenticate.admin(request);
  const t = translate(await localeFromRequest(request));
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "add") {
    const result = await addShopDomain(session.shop, formData.get("domain"), formData.get("region"));
    if (!result.ok) {
      const fallback =
        result.error === "invalid"
          ? "settingsDomainInvalid"
          : result.error === "exists"
            ? "settingsDomainExists"
            : "settingsDomainTaken";
      return { ok: false, message: failureMessage(t, result, fallback) };
    }
    return { ok: true, message: t("settingsDomainAdded") };
  }

  if (intent === "verify") {
    const result = await verifyShopDomain(session.shop);
    if (!result.ok) {
      return { ok: false, message: failureMessage(t, result, "settingsDomainMissing") };
    }
    return {
      ok: !verificationFailed(result.domain.status),
      message: verifyMessage(t, result.domain),
    };
  }

  if (intent === "delete") {
    const result = await deleteShopDomain(session.shop);
    if (!result.ok) {
      return { ok: false, message: failureMessage(t, result, "settingsDomainMissing") };
    }
    return { ok: true, message: t("settingsDomainDeleted") };
  }

  const domain = await db.shopDomain.findUnique({ where: { shop: session.shop } });
  if (!domain || domain.status !== "verified") {
    return { ok: false, message: t("settingsSenderLocked") };
  }

  const fromNameField = formData.get("fromName");
  const fromName = typeof fromNameField === "string" ? fromNameField.trim() : "";
  const fromEmail = normalizeEmail(formData.get("fromEmail"));
  if (fromName.length > 80) return { ok: false, message: t("settingsNameTooLong") };
  if (!fromEmail) return { ok: false, message: t("settingsEmailInvalid") };
  if (!emailOnDomain(fromEmail, domain.name)) {
    return { ok: false, message: t("settingsEmailDomain", { domain: domain.name }) };
  }

  await db.shopSender.upsert({
    where: { shop: session.shop },
    create: { shop: session.shop, fromName, fromEmail },
    update: { fromName, fromEmail },
  });
  return {
    ok: true,
    message: t("settingsSaved", { from: formatFromAddress(fromName, fromEmail) }),
  };
};

function DnsRecord({
  record,
  t,
  copied,
  onCopy,
}: {
  record: StoredRecord;
  t: ReturnType<typeof translate>;
  copied: boolean;
  onCopy: (value: string) => void;
}) {
  return (
    <Box padding="300" background="bg-surface-secondary" borderRadius="200">
      <BlockStack gap="100">
        <InlineStack align="space-between" blockAlign="center">
          <Text as="span" variant="bodyMd" fontWeight="semibold">
            {record.type} · {record.record}
          </Text>
          <Badge tone={statusTone(record.status)}>{t(statusKey(record.status))}</Badge>
        </InlineStack>
        <Text as="p" variant="bodySm">
          {t("settingsDnsName")}: {record.name}
        </Text>
        <Text as="p" variant="bodySm" breakWord>
          {t("settingsDnsValue")}: {record.value}
        </Text>
        {typeof record.priority === "number" && (
          <Text as="p" variant="bodySm">
            {t("settingsDnsPriority")}: {record.priority}
          </Text>
        )}
        {record.ttl && (
          <Text as="p" variant="bodySm">
            {t("settingsDnsTtl")}: {record.ttl}
          </Text>
        )}
        <InlineStack>
          <Button onClick={() => onCopy(record.value)}>
            {copied ? t("settingsCopied") : t("settingsCopy")}
          </Button>
        </InlineStack>
      </BlockStack>
    </Box>
  );
}

export default function SettingsPage() {
  const data = useLoaderData<typeof loader>();
  const t = translate(data.locale as Locale);
  const fetcher = useFetcher<typeof action>();
  const [domainName, setDomainName] = useState("");
  const [region, setRegion] = useState<(typeof DOMAIN_REGIONS)[number]>("ap-northeast-1");
  const [fromName, setFromName] = useState(data.fromName);
  const [fromEmail, setFromEmail] = useState(data.fromEmail);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [copied, setCopied] = useState("");
  const submitting = fetcher.state !== "idle";
  const domain = data.domain;
  const verified = domain?.status === "verified";

  useEffect(() => {
    setFromName(data.fromName);
    setFromEmail(data.fromEmail);
    setConfirmDelete(false);
  }, [data.fromName, data.fromEmail, domain?.name, domain?.status]);

  async function copyValue(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(value);
    } catch {
      setCopied("");
    }
  }

  return (
    <Page title={data.title} subtitle={data.subtitle}>
      <TitleBar title={data.title} />
      <BlockStack gap="400">
        {fetcher.data?.message && (
          <Banner tone={fetcher.data.ok ? "success" : "critical"}>
            <p>{fetcher.data.message}</p>
          </Banner>
        )}
        {!data.resendConfigured && (
          <Banner tone="warning">
            <p>{t("settingsNoResend")}</p>
          </Banner>
        )}
        {data.warning && (
          <Banner tone="warning">
            <p>{data.warning}</p>
          </Banner>
        )}
        <Card>
          <BlockStack gap="400">
            <Text as="h2" variant="headingMd">
              {t("settingsDomainLabel")}
            </Text>
            <Text as="p" variant="bodyMd">
              {t("settingsDomainHelp")}
            </Text>
            {domain ? (
              <BlockStack gap="300">
                <InlineStack gap="200" blockAlign="center">
                  <Text as="span" variant="bodyMd" fontWeight="semibold">
                    {domain.name}
                  </Text>
                  <Badge tone={statusTone(domain.status)}>{t(statusKey(domain.status))}</Badge>
                </InlineStack>
                <Text as="p" variant="bodySm" tone="subdued">
                  {t("settingsDomainLocked")} {domain.region}
                </Text>
                {!verified && (
                  <>
                    <Text as="h3" variant="headingSm">
                      {t("settingsDnsTitle")}
                    </Text>
                    {domain.records.map((record, index) => (
                      <DnsRecord
                        key={`${record.type}-${record.name}-${index}`}
                        record={record}
                        t={t}
                        copied={copied === record.value}
                        onCopy={copyValue}
                      />
                    ))}
                  </>
                )}
                <InlineStack gap="200">
                  {!verified && (
                    <fetcher.Form method="post">
                      <input type="hidden" name="intent" value="verify" />
                      <Button variant="primary" submit loading={submitting}>
                        {t("settingsDomainVerify")}
                      </Button>
                    </fetcher.Form>
                  )}
                  {!confirmDelete ? (
                    <Button tone="critical" disabled={submitting} onClick={() => setConfirmDelete(true)}>
                      {t("settingsDomainDelete")}
                    </Button>
                  ) : (
                    <BlockStack gap="200">
                      <Banner tone="critical">
                        <p>{t("settingsDomainConfirm", { domain: domain.name })}</p>
                      </Banner>
                      <InlineStack gap="200">
                        <fetcher.Form method="post">
                          <input type="hidden" name="intent" value="delete" />
                          <Button variant="primary" tone="critical" submit loading={submitting}>
                            {t("settingsDomainConfirmButton")}
                          </Button>
                        </fetcher.Form>
                        <Button disabled={submitting} onClick={() => setConfirmDelete(false)}>
                          {t("settingsDomainCancel")}
                        </Button>
                      </InlineStack>
                    </BlockStack>
                  )}
                </InlineStack>
              </BlockStack>
            ) : (
              <fetcher.Form method="post">
                <input type="hidden" name="intent" value="add" />
                <BlockStack gap="400">
                  <TextField
                    label={t("settingsDomainLabel")}
                    name="domain"
                    value={domainName}
                    onChange={setDomainName}
                    autoComplete="off"
                    placeholder={t("settingsDomainPlaceholder")}
                    disabled={!data.resendConfigured || submitting}
                  />
                  <Select
                    label={t("settingsRegion")}
                    name="region"
                    options={DOMAIN_REGIONS.map((item) => ({ label: item, value: item }))}
                    value={region}
                    onChange={(value) => setRegion(value as (typeof DOMAIN_REGIONS)[number])}
                    helpText={t("settingsRegionHelp")}
                    disabled={!data.resendConfigured || submitting}
                  />
                  <InlineStack>
                    <Button
                      variant="primary"
                      submit
                      loading={submitting}
                      disabled={!data.resendConfigured}
                    >
                      {t("settingsDomainAdd")}
                    </Button>
                  </InlineStack>
                </BlockStack>
              </fetcher.Form>
            )}
          </BlockStack>
        </Card>
        <Card>
          <BlockStack gap="400">
            <Text as="h2" variant="headingMd">
              {t("settingsSenderTitle")}
            </Text>
            {verified && domain ? (
              <fetcher.Form method="post">
                <input type="hidden" name="intent" value="save" />
                <BlockStack gap="400">
                  <TextField
                    label={t("settingsName")}
                    name="fromName"
                    value={fromName}
                    onChange={setFromName}
                    autoComplete="off"
                    helpText={t("settingsNameHelp")}
                    disabled={submitting}
                  />
                  <TextField
                    label={t("settingsEmail")}
                    name="fromEmail"
                    type="email"
                    value={fromEmail}
                    onChange={setFromEmail}
                    autoComplete="off"
                    helpText={t("settingsEmailHelp", { domain: domain.name })}
                    disabled={submitting}
                  />
                  <InlineStack>
                    <Button variant="primary" submit loading={submitting}>
                      {t("settingsSave")}
                    </Button>
                  </InlineStack>
                </BlockStack>
              </fetcher.Form>
            ) : (
              <Text as="p" variant="bodyMd">
                {t("settingsSenderLocked")}
              </Text>
            )}
          </BlockStack>
        </Card>
      </BlockStack>
    </Page>
  );
}
