const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmail(value: unknown) {
  const email = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!email || email.length > 254 || !EMAIL_RE.test(email)) return null;
  return email;
}

export function formatFromAddress(fromName: string, fromEmail: string) {
  const email = fromEmail.trim();
  const name = fromName.replace(/[\r\n<>"]/g, "").trim();
  if (!name) return email;
  return `${name} <${email}>`;
}

/** Address on the app operator's verified Resend domain. Every shop sends from this. */
export function platformFromEmail() {
  return normalizeEmail(process.env.RESEND_FROM_EMAIL);
}
