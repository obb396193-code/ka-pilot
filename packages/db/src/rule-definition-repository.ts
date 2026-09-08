import {
  approvedWorkspaceAuthContextSchema, conditionReadRequests,
  ruleDefinitionRecordSchema, ruleDefinitionTargetSchema,
  type RuleDefinitionRecord, type RuleDefinitionTarget,
} from "@ka/domain";
import type { Pool } from "pg";

const MAX_BYTES = 16 * 1024 * 1024;
export class RuleDefinitionReadError extends Error {
  constructor(readonly code: "FORBIDDEN" | "INVALID_INPUT" | "INVALID_DEFINITION" | "ACCOUNT_NOT_FOUND" | "SOURCE_UNAVAILABLE") {
    super(`Rule definition read failed: ${code}`);
    this.name = "RuleDefinitionReadError";
  }
}
export interface RuleDefinitionObservation {
  target: RuleDefinitionTarget;
  definition: RuleDefinitionRecord;
  applicable: boolean;
}

// Entire projection is measured in PG before sending JSON to the application.
// No owner/credential/error-body columns; BIGSERIAL stays decimal text.
const DEFINITION_SQL = `/* rule-definition-row */
WITH selected AS MATERIALIZED (
  SELECT id::text, workspace_id, enabled, scope, condition_tree,
         availability_policy, data_freshness_max_hours, fallback_copy
  FROM alert_rules WHERE workspace_id=$1::uuid AND id=$2::bigint LIMIT 2
), measured AS MATERIALIZED (
  SELECT to_jsonb(selected) AS payload FROM selected
)
SELECT octet_length(payload::text) AS payload_bytes,
       CASE WHEN octet_length(payload::text) < $3::int THEN payload ELSE NULL END AS payload
FROM measured`;

const APPLICABILITY_SQL = `/* rule-definition-applicability */
SELECT EXISTS (
  SELECT 1 FROM accounts WHERE workspace_id=$1::uuid AND media=$2 AND account_id=$3
) AS account_exists,
($5::boolean OR EXISTS (
  SELECT 1 FROM task_accounts AS binding
  LEFT JOIN tasks AS task ON task.workspace_id=binding.workspace_id AND task.task_id=binding.task_id
  WHERE binding.workspace_id=$1::uuid AND binding.media=$2 AND binding.account_id=$3
    AND binding.valid_from <= $4::date AND (binding.valid_to IS NULL OR binding.valid_to >= $4::date)
    AND (binding.task_id=ANY($6::text[]) OR task.biz_name=ANY($7::text[]))
)) AS applicable`;

/** Internal definition and binding observation only. Never serialize the whole
 * definition to a browser, infer metric freshness, or treat enabled as triggered.
 * Later rule+metric composition must share its RR snapshot, not join two reads. */
export class RuleDefinitionRepository {
  constructor(private readonly pool: Pool) {}

  async read(authInput: unknown, targetInput: unknown): Promise<RuleDefinitionObservation | null> {
    const authResult = approvedWorkspaceAuthContextSchema.safeParse(authInput);
    if (!authResult.success) throw new RuleDefinitionReadError("FORBIDDEN");
    const targetResult = ruleDefinitionTargetSchema.safeParse(targetInput);
    if (!targetResult.success) throw new RuleDefinitionReadError("INVALID_INPUT");
    const auth = authResult.data, target = targetResult.data;
    if (auth.workspaceKind === "personal" && !auth.scope.accounts.some(account =>
      account.media === target.media && account.accountId === target.accountId)) {
      throw new RuleDefinitionReadError("FORBIDDEN");
    }
    const client = await this.pool.connect().catch(() => { throw new RuleDefinitionReadError("SOURCE_UNAVAILABLE"); });
    try {
      await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
      await client.query("SET LOCAL statement_timeout = '10s'");
      const result = await client.query(DEFINITION_SQL, [auth.workspaceId, target.ruleId, MAX_BYTES]);
      if (result.rows.length === 0) { await client.query("COMMIT"); return null; }
      if (result.rows.length !== 1) throw new RuleDefinitionReadError("INVALID_DEFINITION");
      const row = result.rows[0]!;
      if (!Number.isSafeInteger(row.payload_bytes) || row.payload_bytes < 1 || row.payload_bytes >= MAX_BYTES) {
        throw new RuleDefinitionReadError("INVALID_DEFINITION");
      }
      const parsed = ruleDefinitionRecordSchema.safeParse(row.payload);
      if (!parsed.success || parsed.data.workspace_id !== auth.workspaceId || parsed.data.id !== target.ruleId) {
        throw new RuleDefinitionReadError("INVALID_DEFINITION");
      }
      // condition_tree is an opaque JSON field in the record schema. Keep a
      // private copy before the next await; the driver/adapter cannot retarget it.
      const definition = structuredClone(parsed.data);
      if (definition.condition_tree !== null) {
        try { conditionReadRequests(definition.condition_tree); }
        catch { throw new RuleDefinitionReadError("INVALID_DEFINITION"); }
      }
      const scope = definition.scope;
      const global = scope.taskIds.length === 0 && scope.accountScopes.length === 0 && scope.bizNames.length === 0;
      const direct = scope.accountScopes.some(account => account.media === target.media && account.accountId === target.accountId);
      const match = await client.query(APPLICABILITY_SQL, [auth.workspaceId, target.media, target.accountId,
        target.ds, global || direct, scope.taskIds, scope.bizNames]);
      if (match.rows.length !== 1 || typeof match.rows[0]!.account_exists !== "boolean" || typeof match.rows[0]!.applicable !== "boolean") {
        throw new RuleDefinitionReadError("INVALID_DEFINITION");
      }
      if (!match.rows[0]!.account_exists) throw new RuleDefinitionReadError("ACCOUNT_NOT_FOUND");
      await client.query("COMMIT");
      return { target, definition, applicable: match.rows[0]!.applicable };
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch { /* Keep the safe primary reason. */ }
      throw error instanceof RuleDefinitionReadError ? error : new RuleDefinitionReadError("SOURCE_UNAVAILABLE");
    } finally { client.release(); }
  }
}
