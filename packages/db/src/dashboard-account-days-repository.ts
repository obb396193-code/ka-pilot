import { dashboardDayRequestSchema, dashboardAccountDaySchema, type DashboardAccountDay } from "@ka/domain";
import { AccountDimensionEvidenceError } from "./account-dimension-evidence-repository.js";
import type { SemanticReadConnection } from "./semantic-read-snapshot.js";

const fail = (code: AccountDimensionEvidenceError["code"] = "UPSTREAM_INVALID_RESPONSE"): never => { throw new AccountDimensionEvidenceError(code); };
/** Metadata membership grid, not a metric snapshot or an authorization grant.
 * Missing canonical rows must not erase eligible days before coverage is checked.
 */
export class DashboardAccountDaysRepository {
  constructor(private readonly connection: SemanticReadConnection) {}
  async load(raw: unknown): Promise<DashboardAccountDay[]> {
    const parsed = dashboardDayRequestSchema.safeParse(raw); if (!parsed.success) return fail("INVALID_REQUEST");
    const input = parsed.data, span = (Date.parse(input.dateTo) - Date.parse(input.dateFrom)) / 86400000 + 1;
    if (input.accounts.length === 0) return [];
    if (input.accounts.length * span > 10000) return fail("SOURCE_TRUNCATED");
    const { rows } = await this.connection.query(`/* dashboard-account-days */
      WITH bounded AS MATERIALIZED (
        SELECT account.workspace_id,account.media,account.account_id,($3::date+d.i)::text AS ds,
          relation.task_id,task.task_name,task.biz_name
        FROM jsonb_to_recordset($2::jsonb) wanted(media text,"accountId" text)
        JOIN accounts AS account ON account.workspace_id=$1 AND account.media=wanted.media AND account.account_id=wanted."accountId"
        CROSS JOIN generate_series(0,$4::date-$3::date) AS d(i)
        LEFT JOIN task_accounts AS relation ON relation.workspace_id=account.workspace_id AND relation.media=account.media
          AND relation.account_id=account.account_id AND relation.valid_from<=$3::date+d.i
          AND (relation.valid_to IS NULL OR relation.valid_to>=$3::date+d.i)
        LEFT JOIN tasks AS task ON task.workspace_id=relation.workspace_id AND task.task_id=relation.task_id
        ORDER BY account.media COLLATE "C",account.account_id COLLATE "C",d.i LIMIT 10001
      ), sized AS (
        SELECT *,sum(COALESCE(octet_length(task_id),0)+COALESCE(octet_length(task_name),0)+COALESCE(octet_length(biz_name),0)) OVER ()>=16777216 AS oversized
        FROM bounded
      ) SELECT workspace_id,media,account_id,ds,oversized,
        CASE WHEN NOT oversized THEN task_id END AS task_id,
        CASE WHEN NOT oversized THEN task_name END AS task_name,
        CASE WHEN NOT oversized THEN biz_name END AS biz_name
      FROM sized ORDER BY media COLLATE "C",account_id COLLATE "C",ds`, [input.workspaceId, JSON.stringify(input.accounts), input.dateFrom, input.dateTo]);
    if (!Array.isArray(rows)) return fail();
    if (rows.length > 10000 || Buffer.byteLength(JSON.stringify(rows)) >= 16 * 1024 * 1024) return fail("SOURCE_TRUNCATED");
    const allowed = new Set(input.accounts.map(row => JSON.stringify([row.media, row.accountId]))), seen = new Set<string>();
    return rows.map(row => {
      if (row?.oversized === true) return fail("SOURCE_TRUNCATED");
      const value = dashboardAccountDaySchema.safeParse({ workspaceId: row?.workspace_id, media: row?.media, accountId: row?.account_id,
        ds: row?.ds, taskId: row?.task_id, taskName: row?.task_name, bizName: row?.biz_name });
      if (!value.success || row.oversized !== false || value.data.workspaceId !== input.workspaceId ||
        !allowed.has(JSON.stringify([value.data.media, value.data.accountId])) || value.data.ds < input.dateFrom || value.data.ds > input.dateTo) return fail();
      const key = JSON.stringify([value.data.media, value.data.accountId, value.data.ds]);
      if (seen.has(key)) return fail(); seen.add(key); return value.data;
    });
  }
}
