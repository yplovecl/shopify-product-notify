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
            <path
              fill="#ffffff"
              d="M15 25.2c0-1.5 1.2-2.7 2.7-2.7h28.6c1.5 0 2.7 1.2 2.7 2.7v16.1c0 1.5-1.2 2.7-2.7 2.7H17.7c-1.5 0-2.7-1.2-2.7-2.7V25.2Z"
            />
            <path
              fill="none"
              stroke="#111111"
              strokeWidth="2.2"
              strokeLinejoin="round"
              d="M16.4 24.8 32 35.6 47.6 24.8"
            />
            <circle cx="47" cy="19" r="8.5" fill="#ff5a4f" />
            <path
              fill="#ffffff"
              d="M47 13.1 48.2 16.6 51.7 17.8 48.2 19 47 22.5 45.8 19 42.3 17.8 45.8 16.6Z"
            />
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
