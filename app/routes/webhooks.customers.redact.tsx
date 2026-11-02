import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import db from "../db.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic, payload } = await authenticate.webhook(request);
  console.log(`Received ${topic} webhook for ${shop}`);

  const email = payload.customer?.email?.trim().toLowerCase();
  if (email) {
    await db.subscriber.deleteMany({ where: { shop, email } });
  }

  return new Response();
};
