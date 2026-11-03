import { useEffect, useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { useFetcher, useLoaderData } from "@remix-run/react";
import { Banner, BlockStack, Button, Card, Page, TextField } from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { formatFromAddress, normalizeEmail } from "../email";
import db from "../db.server";
import { authenticate } from "../shopify.server";

type SettingsResult = {
  ok: boolean;
  message: string;
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const sender = await db.shopSender.findUnique({
    where: { shop: session.shop },
  });

  return {
    shop: session.shop,
    fromName: sender?.fromName ?? "",
    fromEmail: sender?.fromEmail ?? "",
  };
};

export const action = async ({
  request,
}: ActionFunctionArgs): Promise<SettingsResult> => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const fromNameField = formData.get("fromName");
  const fromName =
    typeof fromNameField === "string" ? fromNameField.trim() : "";
  const fromEmail = normalizeEmail(formData.get("fromEmail"));

  if (fromName.length > 80) {
    return { ok: false, message: "发件人名称不能超过 80 个字符" };
  }

  if (!fromEmail) {
    return { ok: false, message: "请填写有效的发件邮箱" };
  }

  await db.shopSender.upsert({
    where: { shop: session.shop },
    create: { shop: session.shop, fromName, fromEmail },
    update: { fromName, fromEmail },
  });

  return {
    ok: true,
    message: `已保存本店发件人：${formatFromAddress(fromName, fromEmail)}`,
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
    <Page
      title="发件设置"
      subtitle={`只对 ${data.shop} 生效，其他店铺需要各自填写`}
    >
      <TitleBar title="发件设置" />
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
                label="发件人名称"
                name="fromName"
                value={fromName}
                onChange={setFromName}
                autoComplete="off"
                helpText="收件人看到的名称，例如店铺名。可以留空。"
              />
              <TextField
                label="发件邮箱"
                name="fromEmail"
                type="email"
                value={fromEmail}
                onChange={setFromEmail}
                autoComplete="off"
                helpText="必须是当前 Resend 账号里已验证域名下的邮箱。换一家店要重新保存，不会沿用其他店的地址。"
              />
              <Button variant="primary" submit loading={submitting}>
                保存
              </Button>
            </BlockStack>
          </fetcher.Form>
        </Card>
      </BlockStack>
    </Page>
  );
}
