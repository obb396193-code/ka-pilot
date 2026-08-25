import type { QueryResult, QueryResultRow } from "pg";

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

export const WORKSPACE_SYNC_READINESS_SQL = `
  /* workspace-sync-initial-full-readiness */
  SELECT
    jsonb_array_length($3::jsonb) > 0
    AND NOT EXISTS (
      SELECT 1
      FROM (
        SELECT DISTINCT allowed.media
        FROM jsonb_to_recordset($3::jsonb)
          AS allowed(media text, account_id text)
      ) AS scoped_media
      WHERE NOT EXISTS (
        SELECT 1
        FROM jobs AS completed_job
        JOIN etl_runs AS completed_run
          ON completed_run.job_id = completed_job.id
         AND completed_run.workspace_id = completed_job.workspace_id
        WHERE completed_job.workspace_id = $1::uuid
          AND completed_job.credential_owner_user_id = $2::uuid
          AND completed_job.job_type = 'etl_full'
          AND completed_job.payload->>'media' = scoped_media.media
          AND completed_run.run_kind = 'full'
          AND completed_run.status = 'done'
      )
    ) AS initial_full_complete`;

function normalizeScope(
  allowedAccounts: readonly WorkspaceSyncReadinessScope[],
): WorkspaceSyncReadinessScope[] {
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

export async function loadWorkspaceSyncReadiness(
  client: WorkspaceSyncReadinessQueryPort,
  input: {
    workspaceId: string;
    requestingUserId: string;
    allowedAccounts: readonly WorkspaceSyncReadinessScope[];
  },
): Promise<boolean> {
  if (!UUID_PATTERN.test(input.workspaceId)) {
    throw new Error("workspaceId must be a UUID");
  }
  if (!UUID_PATTERN.test(input.requestingUserId)) {
    throw new Error("requestingUserId must be a UUID");
  }
  const allowedAccounts = normalizeScope(input.allowedAccounts);
  const result = await client.query<ReadinessRow>(WORKSPACE_SYNC_READINESS_SQL, [
    input.workspaceId,
    input.requestingUserId,
    JSON.stringify(allowedAccounts.map((account) => ({
      media: account.media,
      account_id: account.accountId,
    }))),
  ]);
  const readiness = result.rows[0];
  if (!readiness || typeof readiness.initial_full_complete !== "boolean") {
    throw new Error("workspace sync readiness query returned no row");
  }
  return readiness.initial_full_complete;
}
