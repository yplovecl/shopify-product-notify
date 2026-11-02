import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import db from "../db.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic, payload } = await authenticate.webhook(request);
  console.log(`Received ${topic} webhook for ${shop}`);

  const email = payload.customer?.email?.trim().toLowerCase();
  if (email) {
    const subscriber = await db.subscriber.findUnique({
      where: { shop_email: { shop, email } },
      select: { email: true, createdAt: true },
    });
    console.log(
      subscriber
        ? `Data request matched a subscriber created at ${subscriber.createdAt.toISOString()}`
        : "Data request matched no subscriber",
    );
  }

  return new Response();
};
