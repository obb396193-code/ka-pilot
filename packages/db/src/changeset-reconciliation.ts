import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import { ChangeSetPreconditionError, requireValidClock } from "./changeset-dry-run.js";

export interface ReconciliationHeader { id: string; workspace_id: string; media: string | null; account_id: string | null; initiator: string; status: string }
export type ReconciliationClaim = { directive: "reconcile"; executionRunId: string } | { directive: "waiting" } | { directive: "manual_required"; workItemId: string };
function invalid(): never { throw new ChangeSetPreconditionError("INVALID_STATE"); }

async function actualRun(client: PoolClient, header: ReconciliationHeader) {
  const result = await client.query(`SELECT r.id,r.status,r.started_at FROM execution_runs r JOIN changesets c ON c.id=r.changeset_id
    WHERE c.workspace_id=$1 AND c.id=$2 AND r.dry_run=false AND r.request_payload->>'reconcile' IS DISTINCT FROM 'true'
    ORDER BY r.attempt DESC,r.started_at DESC,r.id DESC LIMIT 1`, [header.workspace_id, header.id]);
  const run = result.rows[0];
  if (result.rows.length !== 1 || !["running", "unknown"].includes(run.status) || !(run.started_at instanceof Date) || !Number.isFinite(run.started_at.getTime())) invalid();
  return run as { id: string; status: string; started_at: Date };
}

async function manualItem(client: PoolClient, header: ReconciliationHeader, sourceRunId: string): Promise<string> {
  const hash = createHash("sha256").update(JSON.stringify(["ka/reconcile-manual/v1", header.workspace_id, header.id, sourceRunId])).digest("hex");
  const id = `${hash.slice(0,8)}-${hash.slice(8,12)}-8${hash.slice(13,16)}-a${hash.slice(17,20)}-${hash.slice(20,32)}`;
  const params = [id, header.workspace_id, header.media, header.account_id, header.initiator,
    JSON.stringify({ changesetId: header.id, sourceRunId, reason: "reconciliation_unknown" })];
  await client.query(`INSERT INTO work_items(id,workspace_id,media,account_id,assignee,creator,type,title,status,evidence_snapshot)
    VALUES($1,$2,$3,$4,$5,$5,'agent_question','投放执行结果仍未知，请人工核对','open',$6::jsonb) ON CONFLICT(id) DO NOTHING`, params);
  const existing = await client.query(`SELECT id FROM work_items WHERE id=$1 AND workspace_id=$2 AND media=$3 AND account_id=$4
    AND assignee=$5 AND creator=$5 AND type='agent_question' AND evidence_snapshot @> $6::jsonb`, params);
  if (existing.rows.length !== 1) invalid();
  return id;
}

export async function claimReconciliation(client: PoolClient, header: ReconciliationHeader, now: Date, leaseMs: number): Promise<ReconciliationClaim> {
  requireValidClock(now);
  if (!Number.isSafeInteger(leaseMs) || leaseMs < 1000 || leaseMs > 3_600_000) invalid();
  const actual = await actualRun(client, header);
  if (actual.status === "running" && now.getTime() < actual.started_at.getTime() + leaseMs) return { directive: "waiting" };
  if (actual.status === "running") {
    const marked = await client.query("UPDATE execution_runs SET status=$3,finished_at=COALESCE(finished_at,$4) WHERE id=$1 AND changeset_id=$2 AND status='running' AND dry_run=false", [actual.id, header.id, "unknown", now]);
    if (marked.rowCount !== 1) invalid();
  }
  const found = await client.query(`SELECT r.id,r.status,r.started_at,r.request_payload FROM execution_runs r JOIN changesets c ON c.id=r.changeset_id
    WHERE c.id=$1 AND c.workspace_id=$3 AND r.request_payload->>'reconcile'='true' AND r.request_payload->>'source_run_id'=$2
    ORDER BY r.started_at,r.id LIMIT 1 FOR UPDATE OF r`, [header.id, actual.id, header.workspace_id]);
  const claim = found.rows[0];
  if (claim) {
    const deadline = Date.parse(claim.request_payload?.lease_until);
    if (claim.status === "running" && Number.isFinite(deadline) && now.getTime() < deadline) return { directive: "waiting" };
    if (claim.status === "running") await client.query("UPDATE execution_runs SET status=$3,finished_at=$4 WHERE id=$1 AND changeset_id=$2 AND status='running'", [claim.id, header.id, "unknown", now]);
    await client.query("UPDATE changesets SET status='unknown' WHERE workspace_id=$1 AND id=$2", [header.workspace_id, header.id]);
    return { directive: "manual_required", workItemId: await manualItem(client, header, actual.id) };
  }
  const deadline = new Date(now.getTime() + leaseMs);
  requireValidClock(deadline);
  const inserted = await client.query(`INSERT INTO execution_runs(changeset_id,attempt,status,dry_run,request_payload,started_at)
    VALUES($1,(SELECT COALESCE(MAX(r.attempt),0)+1 FROM execution_runs r JOIN changesets c ON c.id=r.changeset_id
      WHERE c.id=$1 AND c.workspace_id=$4 AND r.dry_run=true),'running',true,$2::jsonb,$3) RETURNING id`,
    [header.id, JSON.stringify({ reconcile: true, source_run_id: actual.id, lease_until: deadline.toISOString() }), now, header.workspace_id]);
  if (inserted.rows.length !== 1) invalid();
  return { directive: "reconcile", executionRunId: inserted.rows[0].id };
}

export async function finishReconciliationClaim(client: PoolClient, header: ReconciliationHeader, runId: string, now: Date,
  status: "success" | "partial" | "failed" | "unknown", payload: Record<string, unknown>): Promise<void> {
  const actual = await actualRun(client, header);
  const result = await client.query(`SELECT r.id,r.status,r.request_payload FROM execution_runs r JOIN changesets c ON c.id=r.changeset_id
    WHERE r.id=$1 AND c.id=$2 AND c.workspace_id=$3 AND r.dry_run=true AND r.request_payload->>'reconcile'='true' FOR UPDATE OF r`, [runId, header.id, header.workspace_id]);
  const claim = result.rows[0], deadline = Date.parse(claim?.request_payload?.lease_until);
  if (result.rows.length !== 1 || claim.status !== "running" || claim.request_payload.source_run_id !== actual.id || !Number.isFinite(deadline) || now.getTime() >= deadline) invalid();
  const update = await client.query("UPDATE execution_runs SET status=$3,result_payload=$4::jsonb,finished_at=$5 WHERE id=$1 AND changeset_id=$2 AND status='running' AND dry_run=true", [runId, header.id, status, JSON.stringify(payload), now]);
  if (update.rowCount !== 1) invalid();
  const resolved = await client.query("UPDATE execution_runs SET status=$3,finished_at=COALESCE(finished_at,$4) WHERE id=$1 AND changeset_id=$2 AND status IN ('running','unknown') AND dry_run=false", [actual.id, header.id, status, now]);
  if (resolved.rowCount !== 1) invalid();
  if (status === "unknown") await manualItem(client, header, actual.id);
}
