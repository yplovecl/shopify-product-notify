import { createHmac, timingSafeEqual } from "node:crypto";
import type { Locale } from "./i18n";

function secret() {
  return process.env.SHOPIFY_API_SECRET || "";
}

export function unsubscribeToken(shop: string, email: string) {
  return createHmac("sha256", secret())
    .update(`${shop}\n${email}`)
    .digest("base64url");
}

export function unsubscribeTokenValid(shop: string, email: string, token: string) {
  const expected = unsubscribeToken(shop, email);
  const actualBuffer = Buffer.from(token);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length) return false;
  return timingSafeEqual(actualBuffer, expectedBuffer);
}

export function unsubscribeUrl(shop: string, email: string, locale: Locale) {
  const base = (process.env.SHOPIFY_APP_URL || "").replace(/\/$/, "");
  const params = new URLSearchParams({
    shop,
    email,
    token: unsubscribeToken(shop, email),
    locale,
  });
  return `${base}/unsubscribe?${params.toString()}`;
}
