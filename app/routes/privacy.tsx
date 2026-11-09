import type { LoaderFunctionArgs, MetaFunction } from "@remix-run/node";
import { json } from "@remix-run/node";
import { Link, useLoaderData, useLocation } from "@remix-run/react";
import {
  localeCookieHeader,
  localeForLanding,
  resolveLocale,
  translate,
  type CopyKey,
  type Locale,
} from "../i18n";

const storedKeys = [
  "privacyDataShop",
  "privacyDataEmail",
  "privacyDataSender",
  "privacyDataRequest",
] as const satisfies readonly CopyKey[];

export const meta: MetaFunction<typeof loader> = ({ data }) => {
  const locale = data?.locale === "zh" ? "zh" : "en";
  const t = translate(locale);
  return [{ title: `${t("privacyTitle")} · ${t("landingTitle")}` }];
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const locale = await localeForLanding(request);
  const headers = url.searchParams.get("locale")
    ? {
        "Set-Cookie": await localeCookieHeader(
          request,
          resolveLocale(url.searchParams.get("locale")),
        ),
      }
    : undefined;

  return json({ locale }, { headers });
};

function localeSearch(search: string, locale: Locale) {
  const params = new URLSearchParams(search);
  params.set("locale", locale);
  return `?${params.toString()}`;
}

export default function PrivacyPolicy() {
  const { locale } = useLoaderData<typeof loader>();
  const { search } = useLocation();
  const t = translate(locale);
  const lang = locale === "zh" ? "zh-CN" : "en";

  return (
    <>
    <style>{`html, body { background: #ffffff; color: #202223; }`}</style>
    <main
      lang={lang}
      style={{
        background: "#ffffff",
        boxSizing: "border-box",
        color: "#202223",
        fontFamily:
          '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        lineHeight: 1.6,
        margin: "0 auto",
        maxWidth: "40rem",
        minHeight: "100vh",
        padding: "32px 16px",
      }}
    >
      <h1>{t("privacyTitle")}</h1>
      <p>{t("privacyIntro")}</p>
      <h2>{t("privacyDataTitle")}</h2>
      <ul>
        {storedKeys.map((key) => (
          <li key={key}>{t(key)}</li>
        ))}
      </ul>
      <p>{t("privacyNoSale")}</p>
      <h2>{t("privacyKeepTitle")}</h2>
      <p>{t("privacyKeep")}</p>
      <h2>{t("privacyRequestsTitle")}</h2>
      <p>{t("privacyRequests")}</p>
      <nav aria-label={t("landingLanguage")} style={{ marginTop: 32 }}>
        {locale === "zh" ? (
          <span aria-current="true">中文</span>
        ) : (
          <Link to={localeSearch(search, "zh")}>中文</Link>
        )}
        <span aria-hidden="true"> · </span>
        {locale === "en" ? (
          <span aria-current="true">English</span>
        ) : (
          <Link to={localeSearch(search, "en")}>English</Link>
        )}
      </nav>
    </main>
    </>
  );
}
