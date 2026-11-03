import type { ActionFunctionArgs } from "@remix-run/node";
import { deleteShopRecords } from "../db.server";
import { authenticate } from "../shopify.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic } = await authenticate.webhook(request);
  console.log(`Received ${topic} webhook for ${shop}`);
  await deleteShopRecords(shop);
  return new Response();
};
