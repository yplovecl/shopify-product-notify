import type { DomainRecords, DomainRegion } from "resend";
import { DOMAIN_REGIONS, type ShopDomainView, type StoredRecord } from "./domain";
import db from "./db.server";
import { emailOnDomain, formatFromAddress, normalizeEmail } from "./email";
import { getResend } from "./resend.server";

export type { ShopDomainView, StoredRecord };

const DOMAIN_RE = /^(?!-)(?:[a-z0-9-]{1,63}\.)+[a-z]{2,63}$/;

type DomainFailure =
  | { ok: false; error: "noKey" | "invalid" | "exists" | "taken" | "missing" }
  | { ok: false; error: "resend"; detail: string };

export function normalizeDomain(value: unknown) {
  const domain = typeof value === "string" ? value.trim().toLowerCase().replace(/\.$/, "") : "";
  if (!domain || domain.length > 253 || !DOMAIN_RE.test(domain)) return null;
  if (domain.split(".").some((label) => label.startsWith("-") || label.endsWith("-"))) {
    return null;
  }
  return domain;
}

export function readRegion(value: unknown): DomainRegion {
  const region = typeof value === "string" ? value : "";
  if ((DOMAIN_REGIONS as readonly string[]).includes(region)) return region as DomainRegion;
  return "ap-northeast-1";
}

export function parseRecords(raw: string): StoredRecord[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      const record = item as Partial<StoredRecord>;
      if (
        typeof record.record !== "string" ||
        typeof record.name !== "string" ||
        typeof record.type !== "string" ||
        typeof record.value !== "string"
      ) {
        return [];
      }
      return [
        {
          record: record.record,
          name: record.name,
          type: record.type,
          value: record.value,
          ttl: typeof record.ttl === "string" ? record.ttl : "",
          status: typeof record.status === "string" ? record.status : "",
          priority: typeof record.priority === "number" ? record.priority : undefined,
        },
      ];
    });
  } catch {
    return [];
  }
}

function toStored(records: DomainRecords[]): StoredRecord[] {
  return records.map((record) => ({
    record: record.record,
    name: record.name,
    type: record.type,
    value: record.value,
    ttl: record.ttl,
    status: record.status,
    priority: "priority" in record ? record.priority : undefined,
  }));
}

function toView(row: {
  name: string;
  status: string;
  region: string;
  records: string;
}): ShopDomainView {
  return {
    name: row.name,
    status: row.status,
    region: row.region,
    records: parseRecords(row.records),
  };
}

function resendDetail(message: string) {
  return message.replace(/[\r\n]/g, " ").slice(0, 300);
}

export async function loadShopDomain(shop: string): Promise<{
  domain: ShopDomainView | null;
  warning: string | null;
}> {
  const row = await db.shopDomain.findUnique({ where: { shop } });
  if (!row) return { domain: null, warning: null };

  const resend = getResend();
  if (!resend) return { domain: toView(row), warning: null };

  const current = await resend.domains.get(row.resendId);
  if (current.error || !current.data) {
    return {
      domain: toView(row),
      warning: current.error ? resendDetail(current.error.message) : null,
    };
  }

  const updated = await db.shopDomain.update({
    where: { shop },
    data: {
      status: current.data.status,
      records: JSON.stringify(toStored(current.data.records)),
    },
  });
  return { domain: toView(updated), warning: null };
}

export async function addShopDomain(
  shop: string,
  rawName: unknown,
  rawRegion: unknown,
): Promise<{ ok: true; domain: ShopDomainView } | DomainFailure> {
  const name = normalizeDomain(rawName);
  if (!name) return { ok: false, error: "invalid" };

  const resend = getResend();
  if (!resend) return { ok: false, error: "noKey" };

  const existing = await db.shopDomain.findUnique({ where: { shop } });
  if (existing) return { ok: false, error: "exists" };

  const taken = await db.shopDomain.findUnique({ where: { name } });
  if (taken) return { ok: false, error: "taken" };

  const created = await resend.domains.create({
    name,
    region: readRegion(rawRegion),
    capabilities: { sending: "enabled", receiving: "disabled" },
  });
  if (created.error || !created.data) {
    return {
      ok: false,
      error: "resend",
      detail: resendDetail(created.error?.message || "Domain was not created"),
    };
  }

  try {
    const row = await db.shopDomain.create({
      data: {
        shop,
        resendId: created.data.id,
        name: created.data.name,
        status: created.data.status,
        region: created.data.region,
        records: JSON.stringify(toStored(created.data.records)),
      },
    });
    return { ok: true, domain: toView(row) };
  } catch (error) {
    await resend.domains.remove(created.data.id);
    console.error("Could not store sending domain", error);
    return { ok: false, error: "taken" };
  }
}

export async function verifyShopDomain(
  shop: string,
): Promise<{ ok: true; domain: ShopDomainView } | DomainFailure> {
  const row = await db.shopDomain.findUnique({ where: { shop } });
  if (!row) return { ok: false, error: "missing" };

  const resend = getResend();
  if (!resend) return { ok: false, error: "noKey" };

  const verified = await resend.domains.verify(row.resendId);
  if (verified.error) {
    return { ok: false, error: "resend", detail: resendDetail(verified.error.message) };
  }

  const loaded = await loadShopDomain(shop);
  if (!loaded.domain) return { ok: false, error: "missing" };
  if (loaded.warning) return { ok: false, error: "resend", detail: loaded.warning };
  return { ok: true, domain: loaded.domain };
}

export async function deleteShopDomain(
  shop: string,
): Promise<{ ok: true } | DomainFailure> {
  const row = await db.shopDomain.findUnique({ where: { shop } });
  if (!row) return { ok: false, error: "missing" };

  const resend = getResend();
  if (!resend) return { ok: false, error: "noKey" };

  const removed = await resend.domains.remove(row.resendId);
  if (removed.error && removed.error.name !== "not_found") {
    return { ok: false, error: "resend", detail: resendDetail(removed.error.message) };
  }

  await db.$transaction([
    db.shopDomain.delete({ where: { shop } }),
    db.shopSender.deleteMany({ where: { shop } }),
  ]);
  return { ok: true };
}

/** From address for this shop, only after its domain is verified and the mailbox matches. */
export async function shopFromAddress(shop: string) {
  const [domain, sender] = await Promise.all([
    db.shopDomain.findUnique({ where: { shop } }),
    db.shopSender.findUnique({ where: { shop } }),
  ]);
  if (!domain || domain.status !== "verified" || !sender) return null;
  const email = normalizeEmail(sender.fromEmail);
  if (!email || !emailOnDomain(email, domain.name)) return null;
  return {
    domain: domain.name,
    email,
    from: formatFromAddress(sender.fromName, email),
  };
}

export async function removeShopDomainRemote(shop: string) {
  const row = await db.shopDomain.findUnique({ where: { shop } });
  if (!row) return;
  const resend = getResend();
  if (!resend) return;
  const removed = await resend.domains.remove(row.resendId);
  if (removed.error && removed.error.name !== "not_found") {
    console.error("Could not remove Resend domain", removed.error.message);
  }
}
