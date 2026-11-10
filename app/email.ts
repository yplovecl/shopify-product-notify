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

/** True when the address is on the verified domain or one of its subdomains. */
export function emailOnDomain(email: string, domain: string) {
  const host = email.split("@")[1] ?? "";
  return host === domain || host.endsWith(`.${domain}`);
}
