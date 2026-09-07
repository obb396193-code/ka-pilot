import {
  aggregateExecutionResult,
  assertChangeSetConfirmable,
  executionDirective,
  transitionChangeSet,
  verifyCurrentValues,
  parseDryRunItems,
  type ChangeValue,
  type ChangeSetItemSnapshot,
  type ChangeSetAction,
  type ChangeSetStatus,
  type ChangeTargetType,
  type CurrentValueSnapshot,
  type ItemExecutionResult,
  type ValueConflict,
} from "@ka/domain";
import type { Pool, PoolClient } from "pg";
import { decodeChangeSetValues, encodeChangeSetItems } from "./changeset-item-values.js";
import { ChangeSetPreconditionError, draftHash, requireSuccessfulDryRun, requireValidClock } from "./changeset-dry-run.js";
import { claimReconciliation, finishReconciliationClaim, type ReconciliationClaim } from "./changeset-reconciliation.js";
import { assertExecutionRunBinding, enqueueConfirmedExecution, findConfirmedExecution, startConfirmedExecution, type ConfirmedExecutionRun } from "./changeset-execution-queue.js";
import { JobRepository } from "./job-repository.js";
export { ChangeSetPreconditionError } from "./changeset-dry-run.js";

export interface NewChangeSetItem {
  targetType: ChangeTargetType;
  targetId: string;
  field: string;
  fromValue: ChangeValue;
  toValue: ChangeValue;
}

export interface NewChangeSet {
  workspaceId: string;
  media: string;
  accountId: string;
  workItemId?: string | null | undefined;
  title: string;
  initiator: string;
  credentialOwnerUserId: string;
  ttlExpireAt: Date;
  reasonCode: string;
  simulation?: Record<string, unknown> | null | undefined;
  items: NewChangeSetItem[];
}

export interface ChangeSetRecord {
  id: string;
  workspaceId: string;
  media: string | null;
  accountId: string | null;
  workItemId: string | null;
  title: string | null;
  status: ChangeSetStatus;
  initiator: string;
  credentialOwnerUserId: string;
  executorIdentity: string | null;
  multicaIssueId: string | null;
  ttlExpireAt: Date | null;
  reasonCode: string | null;
  simulation: Record<string, unknown> | null;
  createdAt: Date;
  executedAt: Date | null;
  items: ChangeSetItemSnapshot[];
}

export type ConfirmResult =
  | { outcome: "confirmed"; idempotent: boolean; changeset: ChangeSetRecord; executionRun: ConfirmedExecutionRun }
  | { outcome: "conflict"; conflicts: ValueConflict[] }
  | { outcome: "expired" };

export interface ConfirmChangeSetInput {
  workspaceId: string;
  changeSetId: string;
  now: Date;
  currentValues: CurrentValueSnapshot[];
  expectedHash?: string;
}

interface HeaderRow {
  id: string;
  workspace_id: string;
  media: string | null;
  account_id: string | null;
  work_item_id: string | null;
  title: string | null;
  status: ChangeSetStatus;
  initiator: string;
  credential_owner_user_id: string;
  executor_identity: string | null;
  multica_issue_id: string | null;
  ttl_expire_at: Date | null;
  ttl_expire_at_text: string | null;
  dry_run_hash: string | null;
  confirm_hash: string | null;
  reason_code: string | null;
  simulation: Record<string, unknown> | null;
  created_at: Date;
  executed_at: Date | null;
}

interface ItemRow {
  id: string | number;
  workspace_id: string;
  media: string;
  account_id: string;
  target_type: ChangeTargetType;
  target_id: string;
  field: string;
  from_value: unknown;
  to_value: unknown;
  item_status: "pending" | "success" | "failed";
  fail_reason: string | null;
}

const headerColumns = `
  id, workspace_id, work_item_id, media, account_id, title, status, initiator,
  credential_owner_user_id, executor_identity, multica_issue_id,
  ttl_expire_at, reason_code, simulation, created_at, executed_at,
  to_char(ttl_expire_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS ttl_expire_at_text,
  dry_run_hash, confirm_hash
`;

function itemRecord(row: ItemRow): ChangeSetItemSnapshot {
  return {
    id: Number(row.id),
    targetType: row.target_type,
    targetId: row.target_id,
    field: row.field,
    ...decodeChangeSetValues(row.from_value, row.to_value),
    itemStatus: row.item_status,
    failReason: row.fail_reason,
  };
}

function requireHeader(row: HeaderRow | undefined, id: string): HeaderRow {
  if (row === undefined) throw new Error(`Changeset ${id} not found in workspace`);
  return row;
}

export class ChangeSetAuthorizationError extends Error {
  readonly code = "FORBIDDEN";
  readonly statusCode = 403;
  constructor() {
    super("Changeset scope or active actors are not authorized");
    this.name = "ChangeSetAuthorizationError";
  }
}

async function assertActiveActors(client: PoolClient, workspaceId: string, initiator: string, owner: string): Promise<void> {
  const workspace = await client.query("SELECT id FROM workspaces WHERE id=$1 AND kind='personal' FOR SHARE", [workspaceId]);
  if (workspace.rowCount !== 1) throw new ChangeSetAuthorizationError();
  const actorIds = [...new Set([initiator, owner])].sort();
  const actors = await client.query(`SELECT id FROM users
    WHERE workspace_id=$1 AND id=ANY($2::uuid[]) AND is_active=true ORDER BY id FOR SHARE`, [workspaceId,actorIds]);
  if (actors.rowCount !== actorIds.length) throw new ChangeSetAuthorizationError();
}

async function loadItems(client: Pool | PoolClient, header: HeaderRow): Promise<ChangeSetItemSnapshot[]> {
  const result = await client.query<ItemRow>(
    `SELECT id, workspace_id, media, account_id, target_type, target_id, field, from_value, to_value, item_status, fail_reason
     FROM changeset_items WHERE changeset_id=$1 ORDER BY id`,
    [header.id],
  );
  if (header.media === null || header.account_id === null || result.rows.some((row) =>
    row.workspace_id !== header.workspace_id || row.media !== header.media || row.account_id !== header.account_id
  )) throw new ChangeSetAuthorizationError();
  return result.rows.map(itemRecord);
}

async function assemble(client: Pool | PoolClient, header: HeaderRow): Promise<ChangeSetRecord> {
  return {
    id: header.id,
    workspaceId: header.workspace_id,
    media: header.media,
    accountId: header.account_id,
    workItemId: header.work_item_id,
    title: header.title,
    status: header.status,
    initiator: header.initiator,
    credentialOwnerUserId: header.credential_owner_user_id,
    executorIdentity: header.executor_identity,
    multicaIssueId: header.multica_issue_id,
    ttlExpireAt: header.ttl_expire_at,
    reasonCode: header.reason_code,
    simulation: header.simulation,
    createdAt: header.created_at,
    executedAt: header.executed_at,
    items: await loadItems(client, header),
  };
}

async function rollback(client: PoolClient): Promise<void> {
  try { await client.query("ROLLBACK"); } catch { /* preserve original error */ }
}

function assertCompleteItemCoverage(
  storedItems: readonly ChangeSetItemSnapshot[],
  results: readonly ItemExecutionResult[],
): void {
  const expected = new Set(storedItems.map((item) => item.id));
  const received = new Set(results.map((item) => item.itemId));
  if (
    results.length !== storedItems.length ||
    expected.size !== received.size ||
    [...expected].some((id) => !received.has(id))
  ) {
    throw new Error("execution result must cover every changeset item exactly once");
  }
}

async function persistItemResults(
  client: PoolClient,
  changeSetId: string,
  results: readonly ItemExecutionResult[],
): Promise<void> {
  for (const item of results) {
    if (item.status === "unknown") continue;
    await client.query(
      `UPDATE changeset_items SET item_status=$3, fail_reason=$4
       WHERE changeset_id=$1 AND id=$2`,
      [changeSetId, item.itemId, item.status, item.failReason ?? null],
    );
  }
}

function completionAction(
  aggregate: "success" | "partial" | "failed" | "unknown",
): ChangeSetAction {
  const actions: Record<typeof aggregate, ChangeSetAction> = {
    success: "complete_success",
    partial: "complete_partial",
    failed: "complete_failed",
    unknown: "mark_unknown",
  };
  return actions[aggregate];
}

function reconciliationAction(
  aggregate: "success" | "partial" | "failed",
): ChangeSetAction {
  const actions: Record<typeof aggregate, ChangeSetAction> = {
    success: "reconcile_success",
    partial: "reconcile_partial",
    failed: "reconcile_failed",
  };
  return actions[aggregate];
}

export class ChangeSetRepository {
  constructor(private readonly pool: Pool) {}

  /** Preparation and result persistence never hold a DB lock during media preflight. */
  async prepareDryRun(input: { workspaceId: string; changeSetId: string; now: Date }): Promise<{ changeset: ChangeSetRecord; hash: string }> {
    requireValidClock(input.now);
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const row = await client.query<HeaderRow>(`SELECT ${headerColumns} FROM changesets WHERE workspace_id=$1 AND id=$2 FOR UPDATE`, [input.workspaceId, input.changeSetId]);
      const header = requireHeader(row.rows[0], input.changeSetId);
      await assertActiveActors(client, input.workspaceId, header.initiator, header.credential_owner_user_id);
      if (header.status !== "draft") throw new ChangeSetPreconditionError("INVALID_STATE");
      if (header.ttl_expire_at === null) throw new Error("changeset has no TTL");
      assertChangeSetConfirmable({ status: header.status, ttlExpireAt: header.ttl_expire_at, now: input.now });
      const changeset = await assemble(client, header);
      const hash = draftHash(header, changeset.items);
      await client.query("COMMIT");
      return { changeset, hash };
    } catch (error) { await rollback(client); throw error; } finally { client.release(); }
  }

  /** Only trusted server-side preflight code may call this, never raw HTTP item results. */
  async recordDryRun(input: { workspaceId: string; changeSetId: string; expectedHash: string; now: Date; items: ItemExecutionResult[];
    expectedScope?: { media: string; accountId: string; initiatorUserId: string; credentialOwnerUserId: string };
  }): Promise<{ executionRunId: string; hash: string; status: "success" | "partial" | "failed" | "unknown" }> {
    requireValidClock(input.now);
    const expectedHash = input.expectedHash;
    if (typeof expectedHash !== "string" || !/^[a-f0-9]{64}$/.test(expectedHash)) throw new Error("Invalid dry-run hash");
    const items = parseDryRunItems(input.items);
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const row = await client.query<HeaderRow>(`SELECT ${headerColumns} FROM changesets WHERE workspace_id=$1 AND id=$2 FOR UPDATE`, [input.workspaceId, input.changeSetId]);
      const header = requireHeader(row.rows[0], input.changeSetId);
      // Bind the service's authorized snapshot under the same lock as persistence.
      // The value/TTL hash alone intentionally does not include account or actors.
      if (input.expectedScope !== undefined && (header.media !== input.expectedScope.media ||
        header.account_id !== input.expectedScope.accountId || header.initiator !== input.expectedScope.initiatorUserId ||
        header.credential_owner_user_id !== input.expectedScope.credentialOwnerUserId)) throw new ChangeSetAuthorizationError();
      await assertActiveActors(client, input.workspaceId, header.initiator, header.credential_owner_user_id);
      if (header.status !== "draft") throw new ChangeSetPreconditionError("INVALID_STATE");
      if (header.ttl_expire_at === null) throw new Error("changeset has no TTL");
      assertChangeSetConfirmable({ status: header.status, ttlExpireAt: header.ttl_expire_at, now: input.now });
      const storedItems = await loadItems(client, header);
      const hash = draftHash(header, storedItems);
      if (hash !== expectedHash) throw new ChangeSetPreconditionError("FROM_VALUE_CHANGED");
      assertCompleteItemCoverage(storedItems, items);
      const status = aggregateExecutionResult(items);
      const attempt = await client.query<{ attempt: number }>("SELECT COALESCE(MAX(attempt),0)::int + 1 AS attempt FROM execution_runs WHERE changeset_id=$1 AND dry_run=true", [header.id]);
      const run = await client.query<{ id: string }>(`INSERT INTO execution_runs(changeset_id,attempt,status,dry_run,request_payload,result_payload,started_at,finished_at)
        VALUES($1,$2,$3,true,$4::jsonb,$5::jsonb,$6,$6) RETURNING id`, [header.id, attempt.rows[0]!.attempt, status, JSON.stringify({ dry_run_hash: hash }), JSON.stringify({ items }), input.now]);
      if (run.rows.length !== 1) throw new Error("Dry-run result was not persisted");
      const updated = await client.query("UPDATE changesets SET dry_run_hash=$3,confirm_hash=NULL WHERE workspace_id=$1 AND id=$2 AND status='draft'", [input.workspaceId, header.id, status === "success" ? hash : null]);
      if (updated.rowCount !== 1) throw new Error("Dry-run draft changed while persisting");
      await client.query("COMMIT");
      return { executionRunId: run.rows[0]!.id, hash, status };
    } catch (error) { await rollback(client); throw error; } finally { client.release(); }
  }

  async create(input: NewChangeSet): Promise<ChangeSetRecord> {
    const items = encodeChangeSetItems(input.items);
    if (input.media.trim() === "" || input.accountId.trim() === "") {
      throw new Error("changeset requires media and accountId scope");
    }
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await assertActiveActors(client, input.workspaceId, input.initiator, input.credentialOwnerUserId);
      if (input.workItemId !== null && input.workItemId !== undefined) {
        const linked = await client.query(
          `SELECT 1 FROM work_items
           WHERE workspace_id = $1 AND id = $2 AND media = $3 AND account_id = $4`,
          [input.workspaceId, input.workItemId, input.media, input.accountId],
        );
        if (linked.rowCount !== 1) {
          throw new Error("changeset work item does not match its account scope");
        }
      }
      const inserted = await client.query<HeaderRow>(
        `INSERT INTO changesets (
           workspace_id, work_item_id, media, account_id, title, status, initiator,
           credential_owner_user_id, ttl_expire_at, reason_code, simulation
         ) VALUES ($1,$2,$3,$4,$5,'draft',$6,$7,$8,$9,$10::jsonb)
         RETURNING ${headerColumns}`,
        [input.workspaceId, input.workItemId ?? null, input.media, input.accountId,
          input.title, input.initiator, input.credentialOwnerUserId, input.ttlExpireAt, input.reasonCode,
          input.simulation == null ? null : JSON.stringify(input.simulation)],
      );
      const header = requireHeader(inserted.rows[0], "new");
      for (const item of items) {
        await client.query(
          `INSERT INTO changeset_items
             (changeset_id,workspace_id,media,account_id,
              target_type,target_id,field,from_value,to_value,item_status)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb,'pending')`,
          [header.id, input.workspaceId, input.media, input.accountId,
            item.targetType, item.targetId, item.field, item.fromJson, item.toJson],
        );
      }
      const record = await assemble(client, header);
      await client.query("COMMIT");
      return record;
    } catch (error) {
      await rollback(client);
      throw error;
    } finally { client.release(); }
  }

  async get(workspaceId: string, changeSetId: string): Promise<ChangeSetRecord> {
    const record = await this.find(workspaceId, changeSetId);
    if (record === null) throw new Error(`Changeset ${changeSetId} not found in workspace`);
    return record;
  }

  async find(workspaceId: string, changeSetId: string): Promise<ChangeSetRecord | null> {
    const result = await this.pool.query<HeaderRow>(
      `SELECT ${headerColumns} FROM changesets WHERE workspace_id=$1 AND id=$2`,
      [workspaceId, changeSetId],
    );
    return result.rows[0] === undefined ? null : assemble(this.pool, result.rows[0]);
  }

  async load(workspaceId: string, changeSetId: string): Promise<ChangeSetRecord> {
    return this.get(workspaceId, changeSetId);
  }

  async assertExecutionAuthorized(workspaceId: string, changeSetId: string, executionRunId?: string): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const row = await client.query<HeaderRow>(`SELECT ${headerColumns} FROM changesets
        WHERE workspace_id=$1 AND id=$2 FOR UPDATE`, [workspaceId,changeSetId]);
      const header = requireHeader(row.rows[0], changeSetId);
      await assertActiveActors(client, workspaceId, header.initiator, header.credential_owner_user_id);
      await loadItems(client, header);
      if (executionRunId !== undefined) await assertExecutionRunBinding(client, header, executionRunId);
      await client.query("COMMIT");
    } catch (error) {
      await rollback(client);
      throw error;
    } finally { client.release(); }
  }

  async confirm(input: ConfirmChangeSetInput): Promise<ConfirmResult> {
    return this.approve(input, "confirm");
  }

  async retry(input: ConfirmChangeSetInput): Promise<ConfirmResult> {
    return this.approve(input, "retry");
  }

  private async approve(input: ConfirmChangeSetInput, action: "confirm" | "retry"): Promise<ConfirmResult> {
    requireValidClock(input.now);
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const locked = await client.query<HeaderRow>(
        `SELECT ${headerColumns} FROM changesets
         WHERE workspace_id=$1 AND id=$2 FOR UPDATE`,
        [input.workspaceId, input.changeSetId],
      );
      const header = requireHeader(locked.rows[0], input.changeSetId);
      await assertActiveActors(client, input.workspaceId, header.initiator, header.credential_owner_user_id);
      const storedItems = await loadItems(client, header);
      const sourceStatus = action === "retry" ? "failed" : "draft";
      if (header.status !== sourceStatus && header.status !== "confirmed") throw new ChangeSetPreconditionError("INVALID_STATE");
      if (action === "retry") {
        const failedRun = await client.query(`SELECT r.id FROM execution_runs r JOIN changesets c ON c.id=r.changeset_id
          WHERE c.workspace_id=$1 AND c.id=$2 AND r.dry_run=false AND r.status='failed' AND r.finished_at IS NOT NULL LIMIT 1`, [input.workspaceId, header.id]);
        if (failedRun.rows.length !== 1) throw new ChangeSetPreconditionError("INVALID_STATE");
      }
      if (header.status === "confirmed") {
        const hash = await requireSuccessfulDryRun(client, header, storedItems, input.expectedHash, true);
        const executionRun = await findConfirmedExecution(client, header, hash);
        const changeset = await assemble(client, header);
        await client.query("COMMIT");
        return { outcome: "confirmed", idempotent: true, changeset, executionRun };
      }
      if (header.ttl_expire_at === null) throw new Error("changeset has no TTL");
      requireValidClock(header.ttl_expire_at);
      if (input.now >= header.ttl_expire_at) {
        if (action === "confirm") await client.query("UPDATE changesets SET status='expired' WHERE id=$1", [header.id]);
        await client.query("COMMIT");
        return { outcome: "expired" };
      }
      const hash = await requireSuccessfulDryRun(client, header, storedItems, input.expectedHash, action === "retry");
      const verification = verifyCurrentValues(storedItems, input.currentValues);
      if (!verification.ok) {
        await client.query("COMMIT");
        return { outcome: "conflict", conflicts: verification.conflicts };
      }
      if (action === "retry") {
        const reset = await client.query(`UPDATE changeset_items SET item_status='pending',fail_reason=NULL
          WHERE changeset_id=$1 AND workspace_id=$2 AND media=$3 AND account_id=$4`, [header.id, input.workspaceId, header.media, header.account_id]);
        if (reset.rowCount !== storedItems.length) throw new Error("Changeset retry item coverage changed");
      }
      transitionChangeSet(header.status, action);
      const updated = await client.query<HeaderRow>(
        `UPDATE changesets SET status='confirmed',confirm_hash=$3,executed_at=NULL
         WHERE workspace_id=$1 AND id=$2 AND status=$4 RETURNING ${headerColumns}`,
        [input.workspaceId, input.changeSetId, hash, sourceStatus],
      );
      const changeset = await assemble(client, requireHeader(updated.rows[0], input.changeSetId));
      const executionRun = await enqueueConfirmedExecution(client, new JobRepository(this.pool), header, hash, input.now);
      await client.query("COMMIT");
      return { outcome: "confirmed", idempotent: false, changeset, executionRun };
    } catch (error) {
      await rollback(client);
      throw error;
    } finally { client.release(); }
  }

  async beginExecution(input: {
    workspaceId: string;
    changeSetId: string;
    requestPayload: Record<string, unknown>;
    startedAt: Date;
    executionRunId?: string;
  }): Promise<
    | { directive: "execute"; executionRunId: string; changeset: ChangeSetRecord }
    | { directive: "reconcile_required" | "skip_terminal" | "not_ready" }
  > {
    requireValidClock(input.startedAt);
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const locked = await client.query<HeaderRow>(
        `SELECT ${headerColumns} FROM changesets WHERE workspace_id=$1 AND id=$2 FOR UPDATE`,
        [input.workspaceId, input.changeSetId],
      );
      const header = requireHeader(locked.rows[0], input.changeSetId);
      await assertActiveActors(client, input.workspaceId, header.initiator, header.credential_owner_user_id);
      const storedItems = await loadItems(client, header);
      const directive = executionDirective(header.status);
      if (input.executionRunId !== undefined) await assertExecutionRunBinding(client, header, input.executionRunId);
      if (directive !== "execute") {
        await client.query("COMMIT");
        return { directive };
      }
      if (header.ttl_expire_at === null) throw new Error("changeset has no TTL");
      if (input.startedAt >= header.ttl_expire_at) {
        await client.query("UPDATE execution_runs SET status='failed',finished_at=$3,result_payload=$4::jsonb WHERE changeset_id=$1 AND dry_run=false AND status='pending' AND ($2::uuid IS NULL OR id=$2)", [header.id, input.executionRunId ?? null, input.startedAt, JSON.stringify({ reason: "CHANGESET_EXPIRED" })]);
        await client.query(
          "UPDATE changesets SET status=$3 WHERE workspace_id=$1 AND id=$2",
          [input.workspaceId, header.id, transitionChangeSet(header.status, "expire")],
        );
        await client.query("COMMIT");
        return { directive: "skip_terminal" };
      }
      const hash = await requireSuccessfulDryRun(client, header, storedItems, undefined, true);
      const run = await startConfirmedExecution(client, header, hash, input.startedAt, input.requestPayload, input.executionRunId);
      let next = header.status;
      if (next === "confirmed") next = transitionChangeSet(next, "send");
      next = transitionChangeSet(next, "start_execution");
      const updated = await client.query<HeaderRow>(
        `UPDATE changesets SET status=$3 WHERE workspace_id=$1 AND id=$2 RETURNING ${headerColumns}`,
        [input.workspaceId, input.changeSetId, next],
      );
      const changeset = await assemble(client, requireHeader(updated.rows[0], input.changeSetId));
      await client.query("COMMIT");
      return { directive: "execute", executionRunId: run.id, changeset };
    } catch (error) {
      await rollback(client);
      throw error;
    } finally { client.release(); }
  }

  async completeExecution(input: {
    workspaceId: string;
    changeSetId: string;
    executionRunId: string;
    finishedAt: Date;
    resultPayload: Record<string, unknown>;
    items: ItemExecutionResult[];
  }): Promise<ChangeSetRecord> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const locked = await client.query<HeaderRow>(
        `SELECT ${headerColumns} FROM changesets WHERE workspace_id=$1 AND id=$2 FOR UPDATE`,
        [input.workspaceId, input.changeSetId],
      );
      const header = requireHeader(locked.rows[0], input.changeSetId);
      if (header.status !== "executing") throw new Error(`changeset is not executing: ${header.status}`);
      const storedItems = await loadItems(client, header);
      assertCompleteItemCoverage(storedItems, input.items);
      const aggregate = aggregateExecutionResult(input.items);
      await persistItemResults(client, header.id, input.items);
      const execution = await client.query(
        `UPDATE execution_runs SET status=$3,result_payload=$4::jsonb,finished_at=$5
         WHERE id=$1 AND changeset_id=$2 AND dry_run=false AND status='running'`,
        [input.executionRunId, header.id, aggregate, JSON.stringify(input.resultPayload), input.finishedAt],
      );
      if (execution.rowCount !== 1) {
        throw new Error("execution run does not belong to this changeset");
      }
      const updated = await client.query<HeaderRow>(
        `UPDATE changesets SET status=$3,executed_at=$4
         WHERE workspace_id=$1 AND id=$2 RETURNING ${headerColumns}`,
        [
          input.workspaceId,
          header.id,
          transitionChangeSet(header.status, completionAction(aggregate)),
          input.finishedAt,
        ],
      );
      const record = await assemble(client, requireHeader(updated.rows[0], header.id));
      await client.query("COMMIT");
      return record;
    } catch (error) {
      await rollback(client);
      throw error;
    } finally { client.release(); }
  }

  async beginReconciliation(input: { workspaceId: string; changeSetId: string; now: Date; leaseMs: number; sourceExecutionRunId?: string }): Promise<ReconciliationClaim | { directive: "not_needed" }> {
    requireValidClock(input.now);
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const locked = await client.query<HeaderRow>(`SELECT ${headerColumns} FROM changesets WHERE workspace_id=$1 AND id=$2 FOR UPDATE`, [input.workspaceId,input.changeSetId]);
      const header = requireHeader(locked.rows[0], input.changeSetId);
      await assertActiveActors(client, input.workspaceId, header.initiator, header.credential_owner_user_id);
      await loadItems(client, header);
      if (input.sourceExecutionRunId !== undefined) await assertExecutionRunBinding(client, header, input.sourceExecutionRunId);
      const result = header.status === "unknown" || header.status === "executing"
        ? await claimReconciliation(client, header, input.now, input.leaseMs) : { directive: "not_needed" as const };
      await client.query("COMMIT");
      return result;
    } catch (error) { await rollback(client); throw error; } finally { client.release(); }
  }

  async completeReconciliation(input: {
    workspaceId: string;
    changeSetId: string;
    executionRunId: string;
    finishedAt: Date;
    resultPayload: Record<string, unknown>;
    items: ItemExecutionResult[];
  }): Promise<ChangeSetRecord> {
    requireValidClock(input.finishedAt);
    const items = parseDryRunItems(input.items);
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const locked = await client.query<HeaderRow>(
        `SELECT ${headerColumns} FROM changesets WHERE workspace_id=$1 AND id=$2 FOR UPDATE`,
        [input.workspaceId, input.changeSetId],
      );
      const header = requireHeader(locked.rows[0], input.changeSetId);
      if (header.status !== "unknown" && header.status !== "executing") {
        throw new Error(`changeset does not require reconciliation: ${header.status}`);
      }
      const storedItems = await loadItems(client, header);
      assertCompleteItemCoverage(storedItems, items);
      const aggregate = aggregateExecutionResult(items);
      await finishReconciliationClaim(client, header, input.executionRunId, input.finishedAt, aggregate, input.resultPayload);
      await persistItemResults(client, header.id, items);
      const status = aggregate === "unknown"
        ? "unknown"
        : transitionChangeSet(
            header.status,
            header.status === "unknown"
              ? reconciliationAction(aggregate)
              : completionAction(aggregate),
          );
      const updated = await client.query<HeaderRow>(
        `UPDATE changesets SET status=$3,executed_at=$4
         WHERE workspace_id=$1 AND id=$2 RETURNING ${headerColumns}`,
        [input.workspaceId, header.id, status, input.finishedAt],
      );
      const record = await assemble(client, requireHeader(updated.rows[0], header.id));
      await client.query("COMMIT");
      return record;
    } catch (error) {
      await rollback(client);
      throw error;
    } finally { client.release(); }
  }
}
