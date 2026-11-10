export const DOMAIN_REGIONS = [
  "us-east-1",
  "eu-west-1",
  "sa-east-1",
  "ap-northeast-1",
] as const;

export type DomainRegionId = (typeof DOMAIN_REGIONS)[number];

export type StoredRecord = {
  record: string;
  name: string;
  type: string;
  value: string;
  ttl: string;
  status: string;
  priority?: number;
};

export type ShopDomainView = {
  name: string;
  status: string;
  region: string;
  records: StoredRecord[];
};
