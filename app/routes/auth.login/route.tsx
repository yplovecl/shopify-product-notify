import { useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { Form, Link, useActionData, useLoaderData } from "@remix-run/react";
import {
  AppProvider as PolarisAppProvider,
  Button,
  Card,
  FormLayout,
  Page,
  Text,
  TextField,
} from "@shopify/polaris";
import polarisEnglish from "@shopify/polaris/locales/en.json";
import polarisChinese from "@shopify/polaris/locales/zh-CN.json";
import polarisStyles from "@shopify/polaris/build/esm/styles.css?url";

import {
  localeCookieHeader,
  localeForLanding,
  translate,
  type Locale,
} from "../../i18n";
import { login } from "../../shopify.server";

import { loginErrorMessage } from "./error.server";

export const links = () => [{ rel: "stylesheet", href: polarisStyles }];

const polarisTranslations = {
  en: polarisEnglish,
  zh: polarisChinese,
} satisfies Record<Locale, typeof polarisEnglish>;

async function loginResponse(request: Request) {
  const locale = await localeForLanding(request);
  const errors = loginErrorMessage(await login(request), translate(locale));
  const headers = new URL(request.url).searchParams.get("locale")
    ? { "Set-Cookie": await localeCookieHeader(request, locale) }
    : undefined;

  return json({ errors, locale }, { headers });
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  return loginResponse(request);
};

export const action = async ({ request }: ActionFunctionArgs) => {
  return loginResponse(request);
};

export default function Auth() {
  const loaderData = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const [shop, setShop] = useState("");
  const locale = actionData?.locale || loaderData.locale;
  const t = translate(locale);
  const { errors } = actionData || loaderData;
  const otherLocale = locale === "zh" ? "en" : "zh";

  return (
    <PolarisAppProvider i18n={polarisTranslations[locale]}>
      <Page>
        <Card>
          <Form method="post">
            <FormLayout>
              <Text variant="headingMd" as="h2">
                {t("landingSubmit")}
              </Text>
              <TextField
                type="text"
                name="shop"
                label={t("landingLabel")}
                helpText={t("landingExample")}
                value={shop}
                onChange={setShop}
                autoComplete="on"
                error={errors.shop}
              />
              <Button submit>{t("landingSubmit")}</Button>
              <Link to={`?locale=${otherLocale}`}>
                {otherLocale === "zh" ? "中文" : "English"}
              </Link>
            </FormLayout>
          </Form>
        </Card>
      </Page>
    </PolarisAppProvider>
  );
}
