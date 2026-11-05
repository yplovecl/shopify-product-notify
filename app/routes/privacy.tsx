export default function PrivacyPolicy() {
  return (
    <main
      style={{
        fontFamily:
          '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        lineHeight: 1.6,
        margin: "32px auto",
        maxWidth: "40rem",
        padding: "0 16px",
      }}
    >
      <h1>Privacy policy</h1>
      <p>
        New Product Alerts stores only what a shop needs to send new-product emails
        that a person asked for.
      </p>
      <h2>Data we store</h2>
      <ul>
        <li>The shop domain, such as example.myshopify.com.</li>
        <li>The email address a visitor submits in the storefront form, and the time they subscribed.</li>
        <li>The sender name and sender email a merchant saves for that shop.</li>
        <li>
          A customer data request from Shopify: the email, whether a subscription
          exists, and when the request arrived.
        </li>
      </ul>
      <p>
        We do not sell this data. Mail is sent through Resend, using one Resend
        account operated with the app. A merchant can only send from a domain
        verified on that account.
      </p>
      <h2>How long we keep it</h2>
      <p>
        A subscription is deleted when the person uses the unsubscribe link in an
        email, when Shopify sends a customer redact webhook for that email, or
        when the shop uninstalls the app or Shopify sends a shop redact webhook.
        Sender settings and stored data requests for that shop are deleted with
        the shop data.
      </p>
      <h2>Requests</h2>
      <p>
        Shoppers unsubscribe from the link in the email, or ask the store to
        remove them. Merchants see customer data requests inside the app under
        Subscribers. If a sender email is saved, the same summary is emailed there.
      </p>
      <h2>隐私说明</h2>
      <p>
        本应用只保存店铺域名、顾客在店面表单提交的邮箱和订阅时间、商家为本店填写的发件名称和发件邮箱，以及
        Shopify 发来的顾客数据请求。邮件通过应用运营方的 Resend 账号发送，商家不能接入单独的
        Resend 账号。退订、顾客删除请求、卸载应用或店铺数据删除后，相关记录会被删除。
      </p>
    </main>
  );
}
