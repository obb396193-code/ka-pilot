import { approvedWorkspaceAuthContextSchema, calendarDateSchema, settingsChangeLogDataSchema, settingsChangeLogRequestSchema, settingsChangeLogPositionSchema } from "@ka/domain";
import type { Pool } from "pg";
import { withSemanticReadSnapshot } from "./semantic-read-snapshot.js";
import { accountScopeClause, accountScopeParams } from "./r014/workspace-authority.js";

export class SettingsChangeLogError extends Error {
  constructor(readonly code: "INVALID_REQUEST" | "FORBIDDEN" | "SOURCE_UNAVAILABLE" | "UPSTREAM_INVALID_RESPONSE" | "UPSTREAM_TIMEOUT") {
    super(`Change log ${code}`);
  }
}
const fail = (code: SettingsChangeLogError["code"]): never => { throw new SettingsChangeLogError(code); };
function decodeCursor(value: string | undefined) {
  if (value === undefined) return null;
  try {
    if (!/^[A-Za-z0-9_-]+$/.test(value)) return fail("INVALID_REQUEST");
    const decoded = Buffer.from(value, "base64url");
    if (decoded.toString("base64url") !== value) return fail("INVALID_REQUEST");
    return settingsChangeLogPositionSchema.parse(JSON.parse(decoded.toString("utf8")));
  } catch { return fail("INVALID_REQUEST"); }
}
function number(value: unknown): number | null {
  if (value === null) return null;
  if (typeof value !== "string" || !/^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/.test(value)) return fail("UPSTREAM_INVALID_RESPONSE");
  const n = Number(value); return Number.isFinite(n) ? n : fail("UPSTREAM_INVALID_RESPONSE");
}

/** Read-only internal page, not yet a public route. Coefficient change timestamps
 * are absent in the deployed schema: fail explicitly, never substitute effective_date.
 * Revoke presentation awaits arch; it must not be mislabeled as an ordinary set.
 */
export class SettingsChangeLogRepository {
  constructor(private readonly pool: Pool) {}
  async page(rawAuth: unknown, rawInput: unknown, businessDate: string) {
    const approved = approvedWorkspaceAuthContextSchema.safeParse(rawAuth), parsed = settingsChangeLogRequestSchema.safeParse(rawInput);
    if (!approved.success) return fail("FORBIDDEN");
    if (!parsed.success || !calendarDateSchema.safeParse(businessDate).success) return fail("INVALID_REQUEST");
    const auth = approved.data, input = parsed.data, cursor = decodeCursor(input.cursor);
    const kinds = input.kinds ?? ["assessment_price", "daily_budget_cap", "channel_coefficient"];
    if (kinds.includes("channel_coefficient")) return fail("SOURCE_UNAVAILABLE");
    const scope = accountScopeParams(auth);
    // Build only requested, fixed SQL branches. PostgreSQL resolves even unused
    // UNION tables; the not-yet-migrated budget source must not break price-only reads.
    const historySql = [
      ...(kinds.includes("assessment_price") ? [`SELECT h.workspace_id,h.id,h.created_at AS at,'assessment_price'::text AS kind,h.task_id,
        lag(h.price) OVER (PARTITION BY h.workspace_id,h.task_id ORDER BY h.created_at,h.id) AS old_value,
        h.price AS new_value,h.effective_date,h.changed_by,h.evidence_url,h.op
        FROM assessment_price_history h JOIN allowed_tasks t ON t.task_id=h.task_id WHERE h.workspace_id=$1`] : []),
      ...(kinds.includes("daily_budget_cap") ? [`SELECT h.workspace_id,h.id,h.created_at AS at,'daily_budget_cap'::text AS kind,h.task_id,
        lag(h.daily_budget_cap) OVER (PARTITION BY h.workspace_id,h.task_id ORDER BY h.created_at,h.id) AS old_value,
        h.daily_budget_cap AS new_value,h.effective_date,h.changed_by,h.evidence_url,'set'::text AS op
        FROM task_budget_history h JOIN allowed_tasks t ON t.task_id=h.task_id WHERE h.workspace_id=$1`] : []),
    ].join(" UNION ALL ");
    try {
      return await withSemanticReadSnapshot(this.pool, async client => {
        const live = await client.query(`/* change-log-live-authority */ SELECT true AS allowed
          FROM workspace_memberships m JOIN workspaces w ON w.id=m.workspace_id AND w.kind=$4 AND w.is_active=true
          JOIN users u ON u.workspace_id=m.workspace_id AND u.id=m.user_id AND u.is_active=true
          JOIN auth_identities i ON i.id=m.identity_id AND i.is_active=true
          WHERE m.workspace_id=$1 AND m.user_id=$2 AND m.role=$3 AND m.is_active=true LIMIT 2`,
        [auth.workspaceId, auth.userId, auth.role, auth.workspaceKind]);
        if (live.rows.length !== 1 || live.rows[0]?.allowed !== true) return fail("FORBIDDEN");
        if (kinds.includes("daily_budget_cap")) {
          const source = await client.query("SELECT to_regclass('public.task_budget_history') IS NOT NULL AS available");
          if (source.rows.length !== 1 || source.rows[0]?.available !== true) return fail("SOURCE_UNAVAILABLE");
        }
        const { rows } = await client.query(`/* change-log-page */
          WITH allowed_tasks AS (
            SELECT t.task_id FROM tasks t WHERE t.workspace_id=$1 AND ($5::text IS NULL OR t.task_id=$5)
              AND (($2::text='team_workspace_readonly' AND $6::text IS NULL) OR EXISTS (
                SELECT 1 FROM task_accounts linked WHERE linked.workspace_id=t.workspace_id AND linked.task_id=t.task_id
                  AND linked.valid_from<=$4::date AND (linked.valid_to IS NULL OR linked.valid_to>=$4::date)
                  AND ($6::text IS NULL OR linked.media=$6)
                  AND ($2::text='team_workspace_readonly' OR (${accountScopeClause("'explicit_accounts'", "$3", "linked.media", "linked.account_id")}
                    AND EXISTS (SELECT 1 FROM account_access_grants g JOIN workspace_memberships m
                      ON m.workspace_id=g.workspace_id AND m.identity_id=g.identity_id AND m.user_id=$11
                      WHERE g.workspace_id=linked.workspace_id AND g.media=linked.media AND g.account_id=linked.account_id
                        AND g.revoked_at IS NULL AND g.access_level IN ('read','preview','execute'))))))
          ), history AS (${historySql})
          SELECT h.workspace_id,h.id::text,to_char(h.at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS at,
            h.kind,h.task_id,h.old_value::text,h.new_value::text,to_char(h.effective_date,'YYYY-MM-DD') AS effective_date,
            h.changed_by,u.name AS actor_name,h.evidence_url,h.op
          FROM history h LEFT JOIN users u ON u.workspace_id=h.workspace_id AND u.id=h.changed_by
          WHERE h.kind=ANY($7::text[]) AND ($8::timestamptz IS NULL OR (h.at,h.kind COLLATE "C",h.id)<($8::timestamptz,$9::text COLLATE "C",$10::bigint))
          ORDER BY h.at DESC NULLS FIRST,h.kind COLLATE "C" DESC,h.id DESC LIMIT 51`,
        [auth.workspaceId, scope.kind, scope.allowed, businessDate, input.task_id ?? null, input.media ?? null,
          kinds, cursor?.at ?? null, cursor?.kind ?? null, cursor?.id ?? null, auth.userId]);
        if (rows.length > 51) return fail("UPSTREAM_INVALID_RESPONSE");
        const positions = rows.map(row => {
          if (row.workspace_id !== auth.workspaceId || !kinds.includes(row.kind)) return fail("UPSTREAM_INVALID_RESPONSE");
          if (row.at === null || row.changed_by === null || row.actor_name === null || row.op === "revoke") return fail("SOURCE_UNAVAILABLE");
          if (row.op !== "set") return fail("UPSTREAM_INVALID_RESPONSE");
          const position = settingsChangeLogPositionSchema.safeParse({ v: 1, at: row.at, kind: row.kind, id: row.id });
          if (!position.success) return fail("UPSTREAM_INVALID_RESPONSE");
          return position.data;
        });
        const data = settingsChangeLogDataSchema.safeParse({
          items: rows.slice(0, 50).map(row => ({ at: row.at, kind: row.kind, scope: { taskId: row.task_id },
            oldValue: number(row.old_value), newValue: number(row.new_value), effectiveDate: row.effective_date,
            changedBy: { userId: row.changed_by, name: row.actor_name }, evidenceUrl: row.evidence_url })),
          nextCursor: rows.length > 50 ? Buffer.from(JSON.stringify(positions[49])).toString("base64url") : null,
        });
        if (!data.success) return fail("UPSTREAM_INVALID_RESPONSE");
        return { workspaceId: auth.workspaceId, data: data.data };
      });
    } catch (error) {
      if (error instanceof SettingsChangeLogError) throw error;
      if (typeof error === "object" && error !== null && "code" in error && ["57014", "55P03"].includes(String(error.code))) return fail("UPSTREAM_TIMEOUT");
      return fail("SOURCE_UNAVAILABLE");
    }
  }
}
