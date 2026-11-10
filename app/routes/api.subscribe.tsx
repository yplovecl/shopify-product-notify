import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { Prisma } from "@prisma/client";
import db from "../db.server";
import { normalizeEmail } from "../email";
import { localeFromRequest, resolveLocale, translate } from "../i18n";
import { authenticate } from "../shopify.server";

const SHOP_RE = /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/;

function json(body: { success: boolean; message: string }, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function readShop(...values: Array<string | null | undefined>) {
  for (const value of values) {
    const shop = value?.trim().toLowerCase() ?? "";
    if (SHOP_RE.test(shop)) return shop;
  }
  return null;
}

function responseStatus(error: unknown) {
  if (error instanceof Response) return error.status;
  if (
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    typeof error.status === "number"
  ) {
    return error.status;
  }
  return null;
}

// App proxy HMAC is checked before the offline session is loaded. A later
// token-refresh failure must not reject the request: saving an email does not
// need an Admin API token, and a thrown 500 is replaced by Shopify's storefront
// error page.
async function shopFromProxy(request: Request) {
  const url = new URL(request.url);
  try {
    const { session } = await authenticate.public.appProxy(request);
    return {
      ok: true,
      shop: readShop(session?.shop, url.searchParams.get("shop")),
    };
  } catch (error) {
    const status = responseStatus(error);
    if (status === 400 || status === 401) return { ok: false, shop: null };
    console.error(
      "app proxy session unavailable",
      error instanceof Error ? error.name : "unknown",
    );
    return { ok: true, shop: readShop(url.searchParams.get("shop")) };
  }
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const t = translate(await localeFromRequest(request));
  const url = new URL(request.url);
  if (url.searchParams.has("signature")) {
    const proxy = await shopFromProxy(request);
    if (!proxy.ok) {
      return json({ success: false, message: t("subBadSignature") }, 401);
    }
  } else if (process.env.NODE_ENV === "production") {
    return json({ success: false, message: t("subUnauthorized") }, 401);
  }

  return json({
    success: true,
    message: t("subUsePost"),
  });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const t = translate(await localeFromRequest(request));
  if (request.method !== "POST") {
    return json({ success: false, message: t("subPostOnly") }, 405);
  }

  const url = new URL(request.url);
  const hasSignature = url.searchParams.has("signature");
  let trustedShop: string | null = null;

  if (hasSignature) {
    const proxy = await shopFromProxy(request);
    if (!proxy.ok) {
      return json({ success: false, message: t("subBadSignature") }, 401);
    }
    trustedShop = proxy.shop;
  } else if (process.env.NODE_ENV === "production") {
    return json({ success: false, message: t("subUnauthorized") }, 401);
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return json({ success: false, message: t("subBadForm") }, 400);
  }

  const localeField = formData.get("locale");
  const tForm = translate(
    typeof localeField === "string" && localeField
      ? resolveLocale(localeField)
      : await localeFromRequest(request),
  );
  const shopField = formData.get("shop");
  const email = normalizeEmail(formData.get("email"));
  const shop =
    trustedShop ??
    readShop(
      request.headers.get("X-Shopify-Shop-Domain"),
      url.searchParams.get("shop"),
      typeof shopField === "string" ? shopField : null,
    );

  if (!shop) {
    return json({ success: false, message: tForm("subBadShop") }, 400);
  }

  if (!email) {
    return json({ success: false, message: tForm("subBadEmail") }, 400);
  }

  try {
    await db.subscriber.create({
      data: { shop, email },
    });
    return json({ success: true, message: tForm("subSuccess") });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return json({ success: true, message: tForm("subAlready") });
    }
    console.error(
      "subscribe failed",
      error instanceof Prisma.PrismaClientKnownRequestError
        ? error.code
        : error instanceof Error
          ? error.name
          : "unknown",
    );
    return json({ success: false, message: tForm("subFailed") });
  }
};
