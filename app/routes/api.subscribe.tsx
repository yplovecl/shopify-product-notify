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

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const t = translate(localeFromRequest(request));
  const url = new URL(request.url);
  if (url.searchParams.has("signature")) {
    await authenticate.public.appProxy(request);
  } else if (process.env.NODE_ENV === "production") {
    return json({ success: false, message: t("subUnauthorized") }, 401);
  }

  return json({
    success: true,
    message: t("subUsePost"),
  });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const t = translate(localeFromRequest(request));
  if (request.method !== "POST") {
    return json({ success: false, message: t("subPostOnly") }, 405);
  }

  const url = new URL(request.url);
  const hasSignature = url.searchParams.has("signature");
  let trustedShop: string | null = null;

  if (hasSignature) {
    try {
      const { session } = await authenticate.public.appProxy(request.clone());
      trustedShop = readShop(session?.shop, url.searchParams.get("shop"));
    } catch (error) {
      if (error instanceof Response) {
        return json({ success: false, message: t("subBadSignature") }, 401);
      }
      throw error;
    }
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
      : localeFromRequest(request),
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
    throw error;
  }
};
