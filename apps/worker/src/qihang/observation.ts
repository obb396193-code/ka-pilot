import { createHash } from "node:crypto";

import type { QihangQuery, QihangRow } from "./client.js";

export type QihangAvailability = "not_observed" | "observed" | "observed_unverified";

export interface QihangObservation {
  resource: QihangQuery["resource"];
  rowCount: number;
  fingerprint: string;
  observedAt: string;
  lastSyncTime: string | null;
  availability: QihangAvailability;
}

export function createQihangObservation(
  resource: QihangQuery["resource"],
  rows: readonly QihangRow[],
  observedAt: Date,
): QihangObservation {
  const canonicalRows = rows.map((row) => JSON.stringify(canonicalize(row))).sort();
  return Object.freeze({
    resource,
    rowCount: rows.length,
    fingerprint: createHash("sha256").update(JSON.stringify(canonicalRows)).digest("hex"),
    observedAt: observedAt.toISOString(),
    lastSyncTime: greatestLastSyncTime(rows),
    availability: availability(resource, rows.length),
  });
}

function availability(
  resource: QihangQuery["resource"],
  rowCount: number,
): QihangAvailability {
  if (rowCount === 0) return "not_observed";
  return resource === "account_offline" ? "observed_unverified" : "observed";
}

function greatestLastSyncTime(rows: readonly QihangRow[]): string | null {
  let greatest: string | null = null;
  for (const row of rows) {
    const value = row.last_sync_time;
    if (typeof value === "string" && value.trim() !== "" && (greatest === null || value > greatest)) {
      greatest = value;
    }
  }
  return greatest;
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
