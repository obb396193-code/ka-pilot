import type { AccountMetadataUpsert } from "@ka/db";
import { z } from "zod";

import type { RawMetricRecord } from "./types.js";

const trustedTupleSchema = z.object({
  workspaceId: z.string().uuid(),
  media: z.string().min(1).max(32).regex(/^[A-Z0-9_]+$/),
  accountId: z.string().min(1).max(128).regex(/^[A-Za-z0-9_-]+$/),
}).strict();

function upstreamAccountId(value: unknown): string {
  if (typeof value === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(value)) return value;
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) return String(value);
  throw new Error("Qihang account metadata is missing a valid account_id");
}

function optionalText(
  payload: Record<string, unknown>,
  field: "account_name" | "status",
  maxLength: number,
): string | null {
  if (!(field in payload) || payload[field] === null) return null;
  const value = payload[field];
  if (typeof value !== "string") {
    throw new Error(`Qihang account metadata ${field} must be a string when present`);
  }
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > maxLength) {
    throw new Error(`Qihang account metadata ${field} is invalid`);
  }
  return trimmed;
}

function mergeOptional(
  current: string | null,
  incoming: string | null,
  field: string,
): string | null {
  if (current === null) return incoming;
  if (incoming === null || incoming === current) return current;
  throw new Error(`Qihang account metadata contains conflicting ${field}`);
}

function metadataFromRaw(record: RawMetricRecord): AccountMetadataUpsert {
  if (record.resource !== "account" || record.source !== "metadata") {
    throw new Error("Only Qihang account metadata rows can synchronize accounts");
  }
  const tuple = trustedTupleSchema.parse({
    workspaceId: record.workspaceId,
    media: record.media,
    accountId: record.accountId,
  });
  const payloadAccountId = upstreamAccountId(record.payload.account_id);
  if (payloadAccountId !== tuple.accountId) {
    throw new Error("Qihang account metadata account_id escaped the trusted record tuple");
  }
  return {
    ...tuple,
    accountName: optionalText(record.payload, "account_name", 256),
    status: optionalText(record.payload, "status", 64),
  };
}

function tupleKey(value: Pick<AccountMetadataUpsert, "workspaceId" | "media" | "accountId">): string {
  return JSON.stringify([value.workspaceId, value.media, value.accountId]);
}

export function accountMetadataFromRawRecords(
  records: readonly RawMetricRecord[],
): AccountMetadataUpsert[] {
  const metadata = new Map<string, AccountMetadataUpsert>();
  for (const record of records) {
    const incoming = metadataFromRaw(record);
    const key = tupleKey(incoming);
    const current = metadata.get(key);
    metadata.set(key, current === undefined
      ? incoming
      : {
          ...current,
          accountName: mergeOptional(current.accountName, incoming.accountName, "account_name"),
          status: mergeOptional(current.status, incoming.status, "status"),
        });
  }
  return [...metadata.values()].sort((left, right) =>
    left.workspaceId.localeCompare(right.workspaceId) || left.media.localeCompare(right.media) ||
    left.accountId.localeCompare(right.accountId));
}
