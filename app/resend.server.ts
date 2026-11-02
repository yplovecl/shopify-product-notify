import { Resend } from "resend";

export { NewProductNotification } from "./emails/NewProductNotification";

let client: Resend | null = null;

export function getResend() {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return null;
  if (!client) client = new Resend(apiKey);
  return client;
}

export function getResendFromAddress() {
  return process.env.RESEND_FROM_EMAIL?.trim() ?? "";
}
