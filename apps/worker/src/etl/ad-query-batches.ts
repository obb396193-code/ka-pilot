import type { QihangQuery, QihangRow } from "../qihang/client.js";

export const DEFAULT_AD_ACCOUNT_BATCH_SIZE = 5;
export const DEFAULT_AD_ID_BATCH_SIZE = 80;
export const DEFAULT_MAX_AD_QUERY_BATCHES = 200;

type AdRealtimeQuery = Extract<QihangQuery, { resource: "ad_realtime" }>;

export function planAdRealtimeBatches(
  query: AdRealtimeQuery,
): readonly AdRealtimeQuery[] {
  const accountIds = uniqueIdentifiers(query.accountIds, "accountIds");
  const adIds = uniqueIdentifiers(query.adIds, "adIds");
  if (accountIds.length === 0 && adIds.length === 0) {
    throw new Error("ad_realtime batching requires an accountIds or adIds filter");
  }

  const accountBatches = accountIds.length === 0
    ? [undefined]
    : chunks(accountIds, DEFAULT_AD_ACCOUNT_BATCH_SIZE);
  const adBatches = adIds.length === 0
    ? [undefined]
    : chunks(adIds, DEFAULT_AD_ID_BATCH_SIZE);
  const batchCount = accountBatches.length * adBatches.length;
  if (batchCount > DEFAULT_MAX_AD_QUERY_BATCHES) {
    throw new Error(
      `ad_realtime batch count ${batchCount} exceeds limit ${DEFAULT_MAX_AD_QUERY_BATCHES}`,
    );
  }
  const base: Omit<AdRealtimeQuery, "accountIds" | "adIds"> = {
    resource: "ad_realtime",
    userId: query.userId,
    ds: query.ds,
    ...(query.media === undefined ? {} : { media: query.media }),
    ...(query.hh === undefined ? {} : { hh: query.hh }),
  };

  return accountBatches.flatMap((accountBatch) =>
    adBatches.map((adBatch): AdRealtimeQuery => ({
      ...base,
      ...(accountBatch === undefined ? {} : { accountIds: accountBatch }),
      ...(adBatch === undefined ? {} : { adIds: adBatch }),
    })));
}

export function mergeAdRealtimeRows(
  batches: readonly (readonly QihangRow[])[],
): QihangRow[] {
  const merged = new Map<string, { row: QihangRow; canonical: string }>();
  for (const rows of batches) {
    for (const row of rows) {
      const key = adRowIdentity(row);
      const canonical = JSON.stringify(canonicalize(row));
      const existing = merged.get(key);
      if (existing !== undefined && existing.canonical !== canonical) {
        throw new Error("ad_realtime batches contain a conflicting duplicate identity");
      }
      if (existing === undefined) merged.set(key, { row, canonical });
    }
  }
  return [...merged.values()].map(({ row }) => row);
}

function uniqueIdentifiers(
  values: readonly string[] | undefined,
  name: string,
): string[] {
  if (values === undefined) return [];
  if (values.some((value) => value.trim() === "")) {
    throw new Error(`${name} must contain non-empty identifiers`);
  }
  return [...new Set(values)];
}

function chunks<T>(values: readonly T[], size: number): T[][] {
  const batches: T[][] = [];
  for (let offset = 0; offset < values.length; offset += size) {
    batches.push(values.slice(offset, offset + size));
  }
  return batches;
}

function adRowIdentity(row: QihangRow): string {
  return JSON.stringify([
    requiredIdentity(row.account_id, "account_id"),
    requiredIdentity(row.ad_id, "ad_id"),
    requiredIdentity(row.ds, "ds"),
  ]);
}

function requiredIdentity(value: unknown, name: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`ad_realtime row identity requires ${name}`);
  }
  return value;
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, canonicalize(child)]),
    );
  }
  return value;
}
