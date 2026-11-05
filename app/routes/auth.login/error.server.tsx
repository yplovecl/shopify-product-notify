import type { LoginError } from "@shopify/shopify-app-remix/server";
import { LoginErrorType } from "@shopify/shopify-app-remix/server";
import type { CopyKey } from "../../i18n";

interface LoginErrorMessage {
  shop?: string;
}

export function loginErrorMessage(
  loginErrors: LoginError,
  t: (key: CopyKey) => string,
): LoginErrorMessage {
  if (loginErrors?.shop === LoginErrorType.MissingShop) {
    return { shop: t("loginMissingShop") };
  }
  if (loginErrors?.shop === LoginErrorType.InvalidShop) {
    return { shop: t("loginInvalidShop") };
  }

  return {};
}
