import type { QueryResult, QueryResultRow } from "pg";
import { taskListCalendarDateSchema } from "@ka/domain";
import { etlBatchReadableSql } from "./etl-batch-readability.js";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface WorkspaceSyncReadinessScope {
  media: string;
  accountId: string;
}

export interface WorkspaceSyncReadinessQueryPort {
  query<Row extends QueryResultRow = QueryResultRow>(
    sql: string,
    values?: unknown[],
  ): Promise<QueryResult<Row>>;
}

interface ReadinessRow extends QueryResultRow {
  initial_full_complete: boolean;
}

export interface WorkspaceSyncReadinessWindow { dateFrom: string; dateTo: string }
export interface WorkspaceSyncReadinessInput extends WorkspaceSyncReadinessWindow {
  workspaceId: string;
  requestingUserId: string;
  allowedAccounts: readonly WorkspaceSyncReadinessScope[];
}

// Legacy result name retained for callers. Readiness is DATA state, not job state.
// Both queries use the same code-owned alias; external values are always parameters.
const READABLE_WINDOW_SQL = `r.requesting_user_id IS NOT NULL
  AND jsonb_array_length(r.accounts) > 0 AND NOT EXISTS (
    SELECT 1 FROM jsonb_to_recordset(r.accounts) allowed(media text, account_id text)
    CROSS JOIN generate_series(r.date_from::timestamp, r.date_to::timestamp, interval '1 day') expected(ds)
    WHERE NOT EXISTS (
      SELECT 1 FROM account_metrics_daily metric
      WHERE metric.workspace_id=r.workspace_id AND metric.media=allowed.media
        AND metric.account_id=allowed.account_id AND metric.ds=expected.ds::date
        AND metric.computed_at IS NOT NULL AND ${etlBatchReadableSql("metric")}
    )
  )`;

export const WORKSPACE_SYNC_READINESS_SQL = `
  /* workspace-sync-initial-full-readiness */
  SELECT ${READABLE_WINDOW_SQL} AS initial_full_complete FROM (
    SELECT $1::uuid workspace_id, $2::uuid requesting_user_id, $3::jsonb accounts,
      $4::date date_from, $5::date date_to
  ) r`;

const BATCH_SQL = `/* workspace-sync-window-readiness-batch */
  SELECT r.ordinal, ${READABLE_WINDOW_SQL} AS initial_full_complete
  FROM jsonb_to_recordset($1::jsonb) r(ordinal integer, workspace_id uuid,
    requesting_user_id uuid, accounts jsonb, date_from date, date_to date)`;

function normalizeScope(
  allowedAccounts: readonly WorkspaceSyncReadinessScope[],
): WorkspaceSyncReadinessScope[] {
  if (allowedAccounts.length > 1000) throw new Error("workspace sync readiness scope overflow");
  const seen = new Set<string>();
  return allowedAccounts.map((account) => {
    const media = account.media.trim();
    const accountId = account.accountId.trim();
    if (media === "" || accountId === "") {
      throw new Error("workspace sync readiness scope requires media and accountId");
    }
    const key = JSON.stringify([media, accountId]);
    if (seen.has(key)) {
      throw new Error("workspace sync readiness scope contains a duplicate tuple");
    }
    seen.add(key);
    return { media, accountId };
  });
}

function normalize(input: WorkspaceSyncReadinessInput) {
  if (!UUID_PATTERN.test(input.workspaceId)) {
    throw new Error("workspaceId must be a UUID");
  }
  if (!UUID_PATTERN.test(input.requestingUserId)) {
    throw new Error("requestingUserId must be a UUID");
  }
  const allowedAccounts = normalizeScope(input.allowedAccounts);
  validateWorkspaceSyncReadinessWindow(input);
  return allowedAccounts.map(account => ({ media: account.media, account_id: account.accountId }));
}

export function validateWorkspaceSyncReadinessWindow(input: WorkspaceSyncReadinessWindow): void {
  if (!taskListCalendarDateSchema.safeParse(input.dateFrom).success ||
    !taskListCalendarDateSchema.safeParse(input.dateTo).success) throw new Error("Invalid readiness dates");
  const days = (Date.parse(input.dateTo) - Date.parse(input.dateFrom)) / 86_400_000 + 1;
  if (days < 1 || days > 31) throw new Error("Readiness window must contain 1 to 31 days");
}

export async function loadWorkspaceSyncReadiness(
  client: WorkspaceSyncReadinessQueryPort, input: WorkspaceSyncReadinessInput,
): Promise<boolean> {
  const accounts = normalize(input);
  const encoded = JSON.stringify(accounts);
  if (Buffer.byteLength(encoded) >= 16 * 1024 * 1024) throw new Error("Readiness scope overflow");
  const result = await client.query<ReadinessRow>(WORKSPACE_SYNC_READINESS_SQL, [
    input.workspaceId,
    input.requestingUserId,
    encoded, input.dateFrom, input.dateTo,
  ]);
  const readiness = result.rows[0];
  if (result.rows.length !== 1 || !readiness || typeof readiness.initial_full_complete !== "boolean") {
    throw new Error("workspace sync readiness query returned no row");
  }
  return readiness.initial_full_complete;
}

/** One statement/snapshot for all frozen jobs; no per-job database round trips. */
export async function loadWorkspaceSyncReadinessBatch(
  client: WorkspaceSyncReadinessQueryPort, inputs: readonly WorkspaceSyncReadinessInput[],
): Promise<boolean[]> {
  if (inputs.length > 1000) throw new Error("Readiness batch overflow");
  const entries = inputs.map((input, ordinal) => ({ ordinal, workspace_id: input.workspaceId,
    requesting_user_id: input.requestingUserId, accounts: normalize(input),
    date_from: input.dateFrom, date_to: input.dateTo }));
  if (entries.length === 0) return [];
  const encoded = JSON.stringify(entries);
  if (Buffer.byteLength(encoded) >= 16 * 1024 * 1024) throw new Error("Readiness batch overflow");
  const result = await client.query<ReadinessRow & { ordinal: number }>(BATCH_SQL, [encoded]);
  if (result.rows.length !== entries.length) throw new Error("Readiness batch result mismatch");
  const values: boolean[] = [];
  const seen = new Set<number>();
  for (const row of result.rows) {
    if (!Number.isInteger(row.ordinal) || row.ordinal < 0 || row.ordinal >= entries.length ||
      seen.has(row.ordinal) || typeof row.initial_full_complete !== "boolean") throw new Error("Invalid readiness batch result");
    seen.add(row.ordinal); values[row.ordinal] = row.initial_full_complete;
  }
  return values;
}
