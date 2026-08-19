import type { QihangRow } from "../qihang/client.js";
import type {
  MetricResource,
  MetricSource,
  RawMetricRecord,
} from "./types.js";

function normalizeDate(value: unknown, fallback: string): string {
  if (typeof value !== "string") {
    return fallback;
  }
  if (/^\d{8}$/.test(value)) {
    return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
  }
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : fallback;
}

export function rowsToRawRecords(input: {
  rows: readonly QihangRow[];
  workspaceId: string;
  resource: MetricResource;
  requestParams: Record<string, unknown>;
  fallbackDs: string;
  fetchedByUserId: string | null;
}): RawMetricRecord[] {
  const source: MetricSource =
    input.resource === "account_offline"
      ? "offline"
      : input.resource === "account"
        ? "metadata"
        : "realtime";

  return input.rows.map((row, index) => {
    const accountId = row.account_id;
    if (typeof accountId !== "string" && typeof accountId !== "number") {
      throw new Error(`${input.resource} row ${index} is missing account_id`);
    }
    return {
      workspaceId: input.workspaceId,
      accountId: String(accountId),
      ds: normalizeDate(row.ds, input.fallbackDs),
      source,
      resource: input.resource,
      requestParams: input.requestParams,
      payload: row,
      fetchedByUserId: input.fetchedByUserId,
    };
  });
}
