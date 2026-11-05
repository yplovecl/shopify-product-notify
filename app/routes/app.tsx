import type { HeadersFunction, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import {
  Link,
  Outlet,
  useLoaderData,
  useLocation,
  useRouteError,
} from "@remix-run/react";
import { boundary } from "@shopify/shopify-app-remix/server";
import { AppProvider } from "@shopify/shopify-app-remix/react";
import { NavMenu } from "@shopify/app-bridge-react";
import polarisStyles from "@shopify/polaris/build/esm/styles.css?url";

import { localeCookieHeader, localeFromRequest, translate } from "../i18n";
import { authenticate } from "../shopify.server";

export const links = () => [{ rel: "stylesheet", href: polarisStyles }];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  const locale = await localeFromRequest(request);
  const headers = new Headers();
  if (new URL(request.url).searchParams.has("locale")) {
    headers.set("Set-Cookie", await localeCookieHeader(request, locale));
  }

  return json(
    {
      apiKey: process.env.SHOPIFY_API_KEY || "",
      locale,
    },
    { headers },
  );
};

export default function App() {
  const { apiKey, locale } = useLoaderData<typeof loader>();
  const { search } = useLocation();
  const t = translate(locale);

  return (
    <AppProvider isEmbeddedApp apiKey={apiKey}>
      <NavMenu>
        <Link to={`/app${search}`} rel="home">
          {t("navHome")}
        </Link>
        <Link to={`/app/subscribers${search}`}>{t("navSubscribers")}</Link>
        <Link to={`/app/settings${search}`}>{t("navSettings")}</Link>
        <Link to={`/app/notify${search}`}>{t("navNotify")}</Link>
      </NavMenu>
      <Outlet />
    </AppProvider>
  );
}

// Shopify needs Remix to catch some thrown responses, so that their headers are included in the response.
export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
