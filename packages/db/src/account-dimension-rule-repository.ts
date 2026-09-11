import { namedEvidenceScopeSchema, accountDimensionRuleSchema, type AccountDimensionRuleValue } from "@ka/domain";
import { AccountDimensionEvidenceError } from "./account-dimension-evidence-repository.js";
import type { SemanticReadConnection } from "./semantic-read-snapshot.js";

const MAX_BYTES = 16 * 1024 * 1024;
const key = (row: { media: string; accountId: string }) => JSON.stringify([row.media, row.accountId]);
export type AccountDimensionRule = AccountDimensionRuleValue;
const fail = (code: AccountDimensionEvidenceError["code"] = "UPSTREAM_INVALID_RESPONSE"): never => { throw new AccountDimensionEvidenceError(code); };

/** Read immutable version identity selected by the stored parse; never "latest".
 * Run on the caller's authorized RR/RO snapshot, alongside metric/evidence reads.
 * The subset projection retains pending and malformed values, not arbitrary rule
 * strings/regexes; this reader does not execute regex or reparse account names.
 */
export class AccountDimensionRuleRepository {
  constructor(private readonly connection: SemanticReadConnection) {}
  async load(value: unknown): Promise<AccountDimensionRule[]> {
    const parsed = namedEvidenceScopeSchema.safeParse(value); if (!parsed.success) return fail("INVALID_REQUEST");
    const scope = parsed.data; if (scope.accounts.length === 0) return [];
    const { rows } = await this.connection.query(`/* account-dimension-rule */
      WITH bounded AS MATERIALIZED (
        SELECT a.workspace_id,a.media,a.account_id,p.rule_version,n.version AS matched_version,
          n.segments IS NOT NULL AND jsonb_typeof(n.segments)<>'array' AS invalid,
          COALESCE(octet_length(n.segments::text),0)>=16777216 AS oversized,
          CASE WHEN jsonb_typeof(n.segments)='array' AND octet_length(n.segments::text)<16777216 THEN n.segments ELSE '[]'::jsonb END AS segments
        FROM jsonb_to_recordset($2::jsonb) wanted(media text,"accountId" text)
        JOIN accounts a ON a.workspace_id=$1 AND a.media=wanted.media AND a.account_id=wanted."accountId"
        LEFT JOIN account_name_parses p ON p.workspace_id=a.workspace_id AND p.media=a.media AND p.account_id=a.account_id
        LEFT JOIN naming_rules n ON n.workspace_id=p.workspace_id AND n.media=p.media AND n.version=p.rule_version
        ORDER BY a.media COLLATE "C",a.account_id COLLATE "C" LIMIT 1001
      ), projected AS (
      SELECT b.workspace_id,b.media,b.account_id,b.rule_version,b.matched_version,b.invalid,b.oversized,
        CASE WHEN b.matched_version IS NULL THEN NULL ELSE COALESCE((
          SELECT jsonb_agg(jsonb_build_object('key',s.value->'key','mapsTo',COALESCE(s.value->'mapsTo','null'::jsonb),
            'pending',COALESCE(s.value->'pending','false'::jsonb)) ORDER BY s.ord)
          FROM (SELECT * FROM jsonb_array_elements(b.segments) WITH ORDINALITY AS x(value,ord) LIMIT 51) s
        ),'[]'::jsonb) END AS mappings
      FROM bounded b
      ), sized AS (
        SELECT *,bool_or(oversized) OVER () OR sum(COALESCE(octet_length(mappings::text),0)) OVER ()>=16777216 AS batch_oversized FROM projected
      ) SELECT workspace_id,media,account_id,rule_version,matched_version,invalid,batch_oversized AS oversized,
        CASE WHEN NOT batch_oversized THEN mappings END AS mappings
      FROM sized ORDER BY media COLLATE "C",account_id COLLATE "C"`, [scope.workspaceId, JSON.stringify(scope.accounts)]);
    if (!Array.isArray(rows)) return fail();
    if (rows.length > 1000 || Buffer.byteLength(JSON.stringify(rows)) >= MAX_BYTES) return fail("SOURCE_TRUNCATED");
    const allowed = new Set(scope.accounts.map(key)), seen = new Set<string>();
    return rows.map(row => {
      if (row?.oversized === true) return fail("SOURCE_TRUNCATED");
      if (row?.oversized !== false || row?.invalid !== false || (row.matched_version !== null && row.matched_version !== row.rule_version)) return fail();
      const result = accountDimensionRuleSchema.safeParse({ workspaceId: row.workspace_id, media: row.media, accountId: row.account_id,
        ruleVersion: row.rule_version, mappings: row.mappings });
      if (!result.success || result.data.workspaceId !== scope.workspaceId || !allowed.has(key(result.data)) || seen.has(key(result.data)) ||
        (row.matched_version === null) !== (result.data.mappings === null)) return fail();
      seen.add(key(result.data)); return result.data;
    });
  }
}
