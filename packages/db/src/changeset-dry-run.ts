import { hashChangeSetDraft, type ChangeSetItemSnapshot } from "@ka/domain";
import type { PoolClient } from "pg";

export class ChangeSetPreconditionError extends Error {
  readonly statusCode = 409;
  constructor(readonly code: "DRY_RUN_REQUIRED" | "FROM_VALUE_CHANGED" | "INVALID_STATE") {
    super({ DRY_RUN_REQUIRED: "A matching successful dry-run is required", FROM_VALUE_CHANGED: "Changeset values or expiration changed", INVALID_STATE: "Changeset action is not allowed in this state" }[code]);
    this.name = "ChangeSetPreconditionError";
  }
}

export interface DryRunHeader {
  id: string;
  workspace_id: string;
  ttl_expire_at_text: string | null;
  dry_run_hash: string | null;
  confirm_hash: string | null;
}

export function draftHash(header: DryRunHeader, items: readonly ChangeSetItemSnapshot[]): string {
  // No fallback to node-postgres Date: that would discard PostgreSQL microseconds.
  if (typeof header.ttl_expire_at_text !== "string") throw new Error("Changeset expiration metadata is unavailable");
  return hashChangeSetDraft({ ttlExpireAt: header.ttl_expire_at_text, items: items.map((item) => ({
    target_type: item.targetType, target_id: item.targetId, field: item.field, from_value: item.fromValue, to_value: item.toValue,
  })) });
}

export async function requireSuccessfulDryRun(client: PoolClient, header: DryRunHeader, items: readonly ChangeSetItemSnapshot[], expectedHash?: string, confirmed = false): Promise<string> {
  if (typeof header.dry_run_hash !== "string" || !/^[a-f0-9]{64}$/.test(header.dry_run_hash)) throw new ChangeSetPreconditionError("DRY_RUN_REQUIRED");
  const hash = draftHash(header, items);
  if (header.dry_run_hash !== hash || (expectedHash !== undefined && expectedHash !== hash) || (confirmed && header.confirm_hash !== hash)) throw new ChangeSetPreconditionError("FROM_VALUE_CHANGED");
  const proof = await client.query(`SELECT r.id FROM execution_runs r JOIN changesets c ON c.id=r.changeset_id
    WHERE c.workspace_id=$1 AND c.id=$2 AND r.dry_run=true AND r.status='success'
      AND r.finished_at IS NOT NULL AND r.request_payload->>'dry_run_hash'=$3 LIMIT 1`, [header.workspace_id, header.id, hash]);
  if (proof.rows.length !== 1) throw new ChangeSetPreconditionError("DRY_RUN_REQUIRED");
  return hash;
}

export function requireValidClock(now: Date): void {
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) throw new Error("Changeset action requires a valid clock");
}
