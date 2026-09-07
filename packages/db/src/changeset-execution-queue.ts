import type { PoolClient } from "pg";
import type { JobRepository } from "./job-repository.js";
import { ChangeSetPreconditionError } from "./changeset-dry-run.js";

interface Header { id: string; workspace_id: string; media: string | null; account_id: string | null; initiator: string; credential_owner_user_id: string }
export interface ConfirmedExecutionRun { id: string; changeSetId: string; attempt: number; status: string; dryRun: false; startedAt: Date | null; finishedAt: Date | null }
const jobType = "changeset_execute";
function invalid(): never { throw new ChangeSetPreconditionError("INVALID_STATE"); }
/** Bind redelivered jobs to their original attempt before any state change/readback. Parent lock required. */
export async function assertExecutionRunBinding(client: PoolClient, h: Header, expectedId: string): Promise<void> {
  if (typeof expectedId !== "string" || !expectedId) invalid();
  const found = await client.query(`SELECT r.id FROM execution_runs r JOIN changesets c ON c.id=r.changeset_id
    WHERE c.workspace_id=$1 AND c.id=$2 AND r.dry_run=false AND r.request_payload->>'reconcile' IS DISTINCT FROM 'true'
    ORDER BY r.attempt DESC,r.id DESC LIMIT 1`, [h.workspace_id, h.id]);
  if (found.rows.length !== 1 || found.rows[0]?.id !== expectedId) invalid();
}
function metadata(h: Header, hash: string) {
  if (!h.media || !h.account_id || !h.initiator || !h.credential_owner_user_id || !/^[a-f0-9]{64}$/.test(hash)) invalid();
  return { workspace_id: h.workspace_id, confirm_hash: hash, initiator_user_id: h.initiator, credential_owner_user_id: h.credential_owner_user_id, media: h.media, account_id: h.account_id };
}
function payload(h: Header, hash: string, id: string) {
  return { workspaceId: h.workspace_id, changeSetId: h.id, executionRunId: id, confirmHash: hash, initiatorUserId: h.initiator,
    credentialOwnerUserId: h.credential_owner_user_id, media: h.media, accountId: h.account_id };
}
function record(row: Record<string, unknown> | undefined, h: Header, hash: string): ConfirmedExecutionRun {
  const expected = metadata(h, hash);
  if (!row || typeof row.id !== "string" || !row.id || row.changeset_id !== h.id || row.dry_run !== false ||
    !Number.isSafeInteger(row.attempt) || (row.attempt as number) < 1 || !["pending", "running", "success", "partial", "failed", "unknown"].includes(row.status as string) ||
    !row.request_payload || typeof row.request_payload !== "object" || Object.entries(expected).some(([key, value]) => (row.request_payload as Record<string, unknown>)[key] !== value)) invalid();
  for (const value of [row.started_at, row.finished_at]) if (value !== null && (!(value instanceof Date) || !Number.isFinite(value.getTime()))) invalid();
  if (row.status === "pending" && (row.started_at !== null || row.finished_at !== null)) invalid();
  return { id: row.id, changeSetId: h.id, attempt: row.attempt as number, status: row.status as string, dryRun: false, startedAt: row.started_at as Date | null, finishedAt: row.finished_at as Date | null };
}

/** Caller owns the changeset parent row lock and transaction. No external/media I/O. */
export async function enqueueConfirmedExecution(client: PoolClient, jobs: Pick<JobRepository, "enqueue">, h: Header, hash: string, now: Date): Promise<ConfirmedExecutionRun> {
  const meta = metadata(h, hash);
  const attempts = await client.query(`SELECT COALESCE(MAX(r.attempt),0)::int+1 AS attempt FROM execution_runs r JOIN changesets c ON c.id=r.changeset_id
    WHERE c.workspace_id=$1 AND c.id=$2 AND r.dry_run=false AND r.request_payload->>'reconcile' IS DISTINCT FROM 'true'`, [h.workspace_id, h.id]);
  const attempt = attempts.rows[0]?.attempt;
  if (!Number.isSafeInteger(attempt) || attempt < 1) invalid();
  const created = await client.query(`INSERT INTO execution_runs(changeset_id,attempt,status,dry_run,request_payload)
    VALUES($1,$2,'pending',false,$3::jsonb) RETURNING *`, [h.id, attempt, JSON.stringify(meta)]);
  const run = record(created.rows[0], h, hash);
  if (created.rows.length !== 1 || run.status !== "pending" || run.attempt !== attempt) invalid();
  const jobId = await jobs.enqueue({ id: run.id, workspaceId: h.workspace_id, jobType, payload: payload(h, hash, run.id), credentialOwnerUserId: h.credential_owner_user_id, runAfter: now }, client);
  if (jobId !== run.id) invalid();
  return run;
}

export async function findConfirmedExecution(client: PoolClient, h: Header, hash: string): Promise<ConfirmedExecutionRun> {
  const found = await client.query(`SELECT r.* FROM execution_runs r JOIN changesets c ON c.id=r.changeset_id WHERE c.workspace_id=$1 AND c.id=$2
    AND r.dry_run=false AND r.request_payload->>'reconcile' IS DISTINCT FROM 'true' ORDER BY r.attempt DESC,r.id DESC LIMIT 1 FOR UPDATE OF r`, [h.workspace_id, h.id]);
  const run = record(found.rows[0], h, hash);
  if (found.rows.length !== 1 || run.status !== "pending") invalid();
  const job = await client.query("SELECT id FROM jobs WHERE id=$1 AND workspace_id=$2 AND job_type=$3 AND payload=$4::jsonb AND credential_owner_user_id=$5", [run.id, h.workspace_id, jobType, JSON.stringify(payload(h, hash, run.id)), h.credential_owner_user_id]);
  if (job.rows.length !== 1) invalid();
  return run;
}

export async function startConfirmedExecution(client: PoolClient, h: Header, hash: string, now: Date, context: Record<string, unknown>, expectedId?: string): Promise<ConfirmedExecutionRun> {
  const run = await findConfirmedExecution(client, h, hash);
  if (expectedId !== undefined && expectedId !== run.id) invalid();
  const updated = await client.query(`UPDATE execution_runs SET status='running',started_at=$3,request_payload=request_payload || $4::jsonb
    WHERE id=$1 AND changeset_id=$2 AND status='pending' AND dry_run=false RETURNING *`, [run.id, h.id, now, JSON.stringify({ execution_context: context })]);
  if (updated.rows.length !== 1) invalid();
  const started = record(updated.rows[0], h, hash);
  if (started.status !== "running" || started.id !== run.id) invalid();
  return started;
}
