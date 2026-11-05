import type { LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import db from "../db.server";
import { normalizeEmail } from "../email";
import { localeFromRequest, translate } from "../i18n";
import { unsubscribeTokenValid } from "../unsubscribe.server";

const SHOP_RE = /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/;

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const locale = await localeFromRequest(request);
  const t = translate(locale);
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop")?.trim().toLowerCase() ?? "";
  const email = normalizeEmail(url.searchParams.get("email"));
  const token = url.searchParams.get("token") ?? "";
  const valid =
    SHOP_RE.test(shop) &&
    Boolean(email) &&
    unsubscribeTokenValid(shop, email!, token);

  if (valid && email) {
    await db.subscriber.deleteMany({ where: { shop, email } });
  }

  return {
    ok: valid,
    title: valid ? t("unsubTitle") : t("unsubInvalidTitle"),
    body: valid ? t("unsubBody") : t("unsubInvalidBody"),
  };
};

export default function UnsubscribePage() {
  const { title, body } = useLoaderData<typeof loader>();

  return (
    <main
      style={{
        fontFamily:
          '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        margin: "48px auto",
        maxWidth: "32rem",
        padding: "0 16px",
      }}
    >
      <h1 style={{ fontSize: "1.5rem" }}>{title}</h1>
      <p>{body}</p>
    </main>
  );
}
