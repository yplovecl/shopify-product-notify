import type { LoaderFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";
import { Form } from "@remix-run/react";
import styles from "./styles.module.css";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);

  if (url.searchParams.get("shop")) {
    throw redirect(`/app?${url.searchParams.toString()}`);
  }

  return null;
};

export default function Index() {
  return (
    <div className={styles.index}>
      <div className={styles.content}>
        <h1 className={styles.heading}>新品订阅通知</h1>
        <p className={styles.text}>输入店铺域名以打开应用。</p>
        <Form className={styles.form} method="post" action="/auth/login">
          <label className={styles.label}>
            <span>店铺域名</span>
            <input className={styles.input} type="text" name="shop" />
            <span>例如 axmax-2.myshopify.com</span>
          </label>
          <button className={styles.button} type="submit">
            登录
          </button>
        </Form>
      </div>
    </div>
  );
}
