import type { LoaderFunctionArgs, MetaFunction } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { Form, Link, useLoaderData } from "@remix-run/react";
import {
  localeCookieHeader,
  localeForLanding,
  resolveLocale,
  translate,
} from "../../i18n";
import styles from "./styles.module.css";

export const meta: MetaFunction<typeof loader> = ({ data }) => {
  const locale = data?.locale === "zh" ? "zh" : "en";
  return [{ title: translate(locale)("landingTitle") }];
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);

  if (url.searchParams.get("shop")) {
    throw redirect(`/app?${url.searchParams.toString()}`);
  }

  const locale = await localeForLanding(request);
  const headers = url.searchParams.get("locale")
    ? { "Set-Cookie": await localeCookieHeader(request, resolveLocale(url.searchParams.get("locale"))) }
    : undefined;

  return json({ locale }, { headers });
};

export default function Index() {
  const { locale } = useLoaderData<typeof loader>();
  const t = translate(locale);
  const lang = locale === "zh" ? "zh-CN" : "en";

  return (
    <div className={styles.page} lang={lang}>
      <main className={styles.card}>
        <div className={styles.mark} aria-hidden="true">
          <svg viewBox="0 0 64 64" width="64" height="64">
            <rect width="64" height="64" rx="16" fill="#111111" />
            <g transform="translate(32 32) scale(1.2) translate(-33.4 -33)">
              <g fill="#ffffff">
                <polygon points="40,31 13,12 33,36" />
                <polygon points="34,33 8,21 29,38" />
                <polygon points="33,38 15,54 31,42" />
                <ellipse
                  cx="40"
                  cy="35.2"
                  rx="11"
                  ry="6.3"
                  transform="rotate(-12 40 35.2)"
                />
                <circle cx="47.6" cy="30.6" r="5.4" />
                <polygon points="51.2,28.8 58.8,31.6 51.6,34.2" />
              </g>
              <circle cx="49.3" cy="29.7" r="1.15" fill="#111111" />
              <path
                fill="#ff5a4f"
                d="M51.6 33c-2.3 2.1-5.6 2.1-7.8.4 1.8-.2 3.7.4 5.1 1.6 1-.6 1.9-1.2 2.7-2z"
              />
            </g>
          </svg>
        </div>
        <h1 className={styles.heading}>{t("landingTitle")}</h1>
        <p className={styles.text}>{t("landingText")}</p>
        <Form className={styles.form} method="post" action={`/auth/login?locale=${locale}`}>
          <label className={styles.label} htmlFor="shop">
            {t("landingLabel")}
          </label>
          <input
            id="shop"
            className={styles.input}
            type="text"
            name="shop"
            placeholder={t("landingExample")}
            autoComplete="off"
            spellCheck={false}
            required
          />
          <button className={styles.button} type="submit">
            {t("landingSubmit")}
          </button>
        </Form>
        <nav className={styles.locales} aria-label={t("landingLanguage")}>
          {locale === "zh" ? (
            <span className={styles.localeCurrent} aria-current="true">
              中文
            </span>
          ) : (
            <Link className={styles.locale} to="?locale=zh">
              中文
            </Link>
          )}
          {locale === "en" ? (
            <span className={styles.localeCurrent} aria-current="true">
              English
            </span>
          ) : (
            <Link className={styles.locale} to="?locale=en">
              English
            </Link>
          )}
        </nav>
      </main>
    </div>
  );
}
