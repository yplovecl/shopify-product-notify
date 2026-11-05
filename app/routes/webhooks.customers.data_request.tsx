import type { ActionFunctionArgs } from "@remix-run/node";
import { formatFromAddress } from "../email";
import db from "../db.server";
import { getResend } from "../resend.server";
import { authenticate } from "../shopify.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic, payload } = await authenticate.webhook(request);
  console.log(`Received ${topic} webhook for ${shop}`);

  const customer = payload.customer as { email?: string | null } | undefined;
  const email = customer?.email?.trim().toLowerCase();
  if (!email) return new Response();

  const requestId = (
    payload.data_request as { id?: number | string } | undefined
  )?.id;

  const subscriber = await db.subscriber.findUnique({
    where: { shop_email: { shop, email } },
    select: { createdAt: true },
  });

  await db.customerDataRequest.create({
    data: {
      shop,
      email,
      shopifyRequestId:
        requestId === undefined || requestId === null
          ? null
          : String(requestId).slice(0, 64),
      found: Boolean(subscriber),
      subscribedAt: subscriber?.createdAt ?? null,
    },
  });

  const sender = await db.shopSender.findUnique({ where: { shop } });
  const resend = getResend();
  if (sender && resend) {
    const subscribed = subscriber
      ? `Subscribed at ${subscriber.createdAt.toISOString()}.`
      : "No subscription is stored for this email.";
    try {
      await resend.emails.send({
        from: formatFromAddress(sender.fromName, sender.fromEmail),
        to: sender.fromEmail,
        subject: `Customer data request for ${shop}`,
        text: [
          `Shopify customer data request ${requestId ?? ""} for ${shop}.`,
          `Email: ${email}`,
          subscribed,
          "The same record is listed in the app under Subscribers.",
          "",
          `店铺 ${shop} 收到顾客数据请求。`,
          `邮箱：${email}`,
          subscriber
            ? `订阅时间：${subscriber.createdAt.toISOString()}`
            : "没有这个邮箱的订阅记录。",
          "应用的「订阅者」页面里有同一条记录。",
        ].join("\n"),
      });
    } catch (error) {
      console.error("Could not email customer data request", error);
    }
  }

  return new Response();
};
