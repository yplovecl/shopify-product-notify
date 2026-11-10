import type { ActionFunctionArgs } from "@remix-run/node";
import db, { deleteShopRecords } from "../db.server";
import { removeShopDomainRemote } from "../domain.server";
import { authenticate } from "../shopify.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, session, topic } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`);

  // Webhook requests can trigger multiple times and after an app has already been uninstalled.
  // If this webhook already ran, the session may have been deleted previously.
  if (session) {
    await db.session.deleteMany({ where: { shop } });
  }

  await removeShopDomainRemote(shop);
  await deleteShopRecords(shop);

  return new Response();
};
