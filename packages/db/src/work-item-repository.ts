import {
  assertWorkItemTransition,
  decideDuplicate,
  workItemDedupeKey,
  type WorkItemAction,
  type WorkItemSeverity,
  type WorkItemStatus,
} from "@ka/domain";
import type { Pool, PoolClient } from "pg";

export type WorkItemType =
  | "diagnosis"
  | "dispatch"
  | "self"
  | "agent_question"
  | "external_handled";

export interface WorkItemRecord {
  id: string;
  workspaceId: string;
  type: WorkItemType;
  media: string | null;
  accountId: string | null;
  taskId: string | null;
  ruleId: string | null;
  severity: WorkItemSeverity | null;
  title: string;
  evidenceSnapshot: Record<string, unknown> | null;
  diagnosis: Record<string, unknown> | null;
  status: WorkItemStatus;
  ignoreReason: string | null;
  mutedUntil: string | null;
  assignee: string | null;
  creator: string | null;
  acceptanceCriteria: string | null;
  slaDue: Date | null;
  rejectReason: string | null;
  t1Result: Record<string, unknown> | null;
  createdAt: Date;
  resolvedAt: Date | null;
}

export interface NewAlertWorkItem {
  workspaceId: string;
  type: WorkItemType;
  media: string;
  accountId: string;
  taskId?: string | null;
  ruleId: string | number;
  severity: WorkItemSeverity;
  title: string;
  evidenceSnapshot: Record<string, unknown>;
  diagnosis?: Record<string, unknown> | null;
  assignee?: string | null;
  creator?: string | null;
  acceptanceCriteria?: string | null;
  slaDue?: Date | null;
}

export interface WorkItemTransitionInput {
  workspaceId: string;
  workItemId: string;
  action: WorkItemAction;
  ignoreReason?: string | null;
  mutedUntil?: string | null;
  rejectReason?: string | null;
}

export interface CreateOrMergeResult {
  disposition: "created" | "upgraded" | "merged";
  workItem: WorkItemRecord;
}

interface WorkItemRow {
  id: string;
  workspace_id: string;
  type: WorkItemType;
  media: string | null;
  account_id: string | null;
  task_id: string | null;
  rule_id: string | null;
  severity: WorkItemSeverity | null;
  title: string;
  evidence_snapshot: Record<string, unknown> | null;
  diagnosis: Record<string, unknown> | null;
  status: WorkItemStatus;
  ignore_reason: string | null;
  muted_until: string | null;
  assignee: string | null;
  creator: string | null;
  acceptance_criteria: string | null;
  sla_due: Date | null;
  reject_reason: string | null;
  t1_result: Record<string, unknown> | null;
  created_at: Date;
  resolved_at: Date | null;
}

const columns = `
  id, workspace_id, type, media, account_id, task_id, rule_id, severity, title,
  evidence_snapshot, diagnosis, status, ignore_reason, muted_until::text AS muted_until,
  assignee, creator, acceptance_criteria, sla_due, reject_reason,
  t1_result, created_at, resolved_at
`;

function toRecord(row: WorkItemRow): WorkItemRecord {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    type: row.type,
    media: row.media,
    accountId: row.account_id,
    taskId: row.task_id,
    ruleId: row.rule_id,
    severity: row.severity,
    title: row.title,
    evidenceSnapshot: row.evidence_snapshot,
    diagnosis: row.diagnosis,
    status: row.status,
    ignoreReason: row.ignore_reason,
    mutedUntil: row.muted_until,
    assignee: row.assignee,
    creator: row.creator,
    acceptanceCriteria: row.acceptance_criteria,
    slaDue: row.sla_due,
    rejectReason: row.reject_reason,
    t1Result: row.t1_result,
    createdAt: row.created_at,
    resolvedAt: row.resolved_at,
  };
}

function requiredRow(row: WorkItemRow | undefined, message: string): WorkItemRecord {
  if (row === undefined) {
    throw new Error(message);
  }
  return toRecord(row);
}

async function rollback(client: PoolClient): Promise<void> {
  try {
    await client.query("ROLLBACK");
  } catch {
    // Preserve the original transaction error.
  }
}

function validateNewAlert(input: NewAlertWorkItem): void {
  if (
    input.workspaceId.length === 0 ||
    input.media.length === 0 ||
    input.accountId.length === 0 ||
    input.title.length === 0
  ) {
    throw new Error("workspaceId, media, accountId and title are required");
  }
}

function optionalValue<T>(value: T | null | undefined): T | null {
  return value === undefined ? null : value;
}

function optionalJson(value: Record<string, unknown> | null | undefined): string | null {
  return value === null || value === undefined ? null : JSON.stringify(value);
}

async function findActiveAlert(
  client: PoolClient,
  input: NewAlertWorkItem,
): Promise<WorkItemRow | undefined> {
  const active = await client.query<WorkItemRow>(
    `SELECT ${columns}
     FROM work_items
     WHERE workspace_id = $1
       AND rule_id = $2::bigint
       AND media = $3
       AND account_id = $4
       AND status IN ('open', 'processing', 'escalated')
     ORDER BY created_at DESC, id DESC
     LIMIT 1
     FOR UPDATE`,
    [input.workspaceId, String(input.ruleId), input.media, input.accountId],
  );
  return active.rows[0];
}

async function updateActiveAlert(
  client: PoolClient,
  input: NewAlertWorkItem,
  existing: WorkItemRow,
): Promise<CreateOrMergeResult> {
  if (existing.severity === null) {
    throw new Error(`Active alert work item ${existing.id} has no severity`);
  }
  const decision = decideDuplicate(existing.severity, input.severity);
  const upgraded = decision === "upgrade";
  const updated = await client.query<WorkItemRow>(
    `UPDATE work_items
     SET severity = CASE WHEN $2::boolean THEN $3 ELSE severity END,
         status = CASE WHEN $2::boolean THEN 'open' ELSE status END,
         title = $4,
         task_id = COALESCE($5, task_id),
         evidence_snapshot = $6::jsonb,
         diagnosis = COALESCE($7::jsonb, diagnosis),
         assignee = COALESCE($8::uuid, assignee),
         acceptance_criteria = COALESCE($9, acceptance_criteria),
         sla_due = COALESCE($10::timestamptz, sla_due),
         resolved_at = NULL
     WHERE workspace_id = $1 AND id = $11
     RETURNING ${columns}`,
    [
      input.workspaceId,
      upgraded,
      input.severity,
      input.title,
      optionalValue(input.taskId),
      JSON.stringify(input.evidenceSnapshot),
      optionalJson(input.diagnosis),
      optionalValue(input.assignee),
      optionalValue(input.acceptanceCriteria),
      optionalValue(input.slaDue),
      existing.id,
    ],
  );
  return {
    disposition: upgraded ? "upgraded" : "merged",
    workItem: requiredRow(updated.rows[0], "Failed to update active work item"),
  };
}

async function insertAlert(
  client: PoolClient,
  input: NewAlertWorkItem,
): Promise<CreateOrMergeResult> {
  const inserted = await client.query<WorkItemRow>(
    `INSERT INTO work_items (
       workspace_id, type, media, account_id, task_id, rule_id, severity, title,
       evidence_snapshot, diagnosis, status, assignee, creator,
       acceptance_criteria, sla_due
     ) VALUES (
       $1, $2, $3, $4, $5, $6::bigint, $7, $8,
       $9::jsonb, $10::jsonb, 'open', $11::uuid, $12::uuid, $13, $14::timestamptz
     )
     RETURNING ${columns}`,
    [
      input.workspaceId,
      input.type,
      input.media,
      input.accountId,
      optionalValue(input.taskId),
      String(input.ruleId),
      input.severity,
      input.title,
      JSON.stringify(input.evidenceSnapshot),
      optionalJson(input.diagnosis),
      optionalValue(input.assignee),
      optionalValue(input.creator),
      optionalValue(input.acceptanceCriteria),
      optionalValue(input.slaDue),
    ],
  );
  return {
    disposition: "created",
    workItem: requiredRow(inserted.rows[0], "Failed to create work item"),
  };
}

export class WorkItemRepository {
  constructor(private readonly pool: Pool) {}

  async createOrMergeAlert(input: NewAlertWorkItem): Promise<CreateOrMergeResult> {
    validateNewAlert(input);
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const dedupeKey = workItemDedupeKey(input);
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [dedupeKey]);
      const existing = await findActiveAlert(client, input);
      const result =
        existing === undefined
          ? await insertAlert(client, input)
          : await updateActiveAlert(client, input, existing);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await rollback(client);
      throw error;
    } finally {
      client.release();
    }
  }

  async find(workspaceId: string, workItemId: string): Promise<WorkItemRecord | null> {
    const result = await this.pool.query<WorkItemRow>(
      `SELECT ${columns} FROM work_items WHERE workspace_id = $1 AND id = $2`,
      [workspaceId, workItemId],
    );
    return result.rows[0] === undefined ? null : toRecord(result.rows[0]);
  }

  async transition(input: WorkItemTransitionInput): Promise<WorkItemRecord> {
    if (input.action === "reject" &&
      (typeof input.rejectReason !== "string" || input.rejectReason.trim().length === 0)) {
      throw new Error("A non-empty rejection reason is required");
    }
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const currentResult = await client.query<WorkItemRow>(
        `SELECT ${columns}
         FROM work_items
         WHERE workspace_id = $1 AND id = $2
         FOR UPDATE`,
        [input.workspaceId, input.workItemId],
      );
      const current = currentResult.rows[0];
      if (current === undefined) {
        throw new Error(`Work item ${input.workItemId} not found in workspace`);
      }
      const next = assertWorkItemTransition(current.status, input.action);
      const terminal = ["done", "ignored", "expired", "external_handled", "rejected"].includes(
        next,
      );
      const updated = await client.query<WorkItemRow>(
        `UPDATE work_items
         SET status = $3,
             ignore_reason = CASE WHEN $3 = 'ignored' THEN $4 ELSE ignore_reason END,
             muted_until = CASE WHEN $3 = 'ignored' THEN $5::date ELSE muted_until END,
             reject_reason = CASE WHEN $3 = 'rejected' THEN $6 ELSE reject_reason END,
             resolved_at = CASE WHEN $7::boolean THEN now() ELSE NULL END
         WHERE workspace_id = $1 AND id = $2 AND status = $8
         RETURNING ${columns}`,
        [
          input.workspaceId,
          input.workItemId,
          next,
          input.ignoreReason ?? null,
          input.mutedUntil ?? null,
          input.rejectReason ?? null,
          terminal,
          current.status,
        ],
      );
      const record = requiredRow(updated.rows[0], "Work item changed concurrently");
      await client.query("COMMIT");
      return record;
    } catch (error) {
      await rollback(client);
      throw error;
    } finally {
      client.release();
    }
  }
}
