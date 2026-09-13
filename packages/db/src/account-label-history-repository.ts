import { calendarDateSchema, namedEvidenceScopeSchema, namingRuleMappingsSchema, type AccountDimensionRuleValue } from "@ka/domain";
import {
  AccountDimensionEvidenceError, readParseEvidence, type AccountDimensionEvidence,
} from "./account-dimension-evidence-repository.js";
import type { SemanticReadConnection } from "./semantic-read-snapshot.js";

/**
 * v1.9.49 ①（Q-044 ③）：一段窗口里每个账户**可能用到**的归属行。
 *
 * 这里只取候选，不替调用方决定哪天用哪行——选行规则只在 domain 的 `pickAccountLabelBasis`。
 * 候选 = 窗口起点那天生效的一行（没有就取最早一行）+ 窗口内新生效的行。多取无害，少取就会选错。
 *
 * `nameMatches` 分两种：
 * - 该账户**最新**的那一行：与 `accounts.account_name` 比，和维度证据仓储同一口径
 *   （昵称改过、还没重解析 → 不信段值）；
 * - 已被后来的行接替的旧行：恒为真。它在自己那段日子里就是当时的解析结果；
 *   拿今天的昵称去比，改名前的归属会被统统判成过期，历史就白留了。
 */
export interface AccountLabelHistoryRow {
  workspaceId: string;
  media: string;
  accountId: string;
  effectiveFrom: string;
  parse: NonNullable<AccountDimensionEvidence["parse"]>;
  /** 这一行挂的那版规则的段映射；那版规则不在库里时为 null。 */
  mappings: AccountDimensionRuleValue["mappings"];
}

const MAX_ROWS = 10000;
const MAX_BYTES = 16 * 1024 * 1024;
const INPUT_KEYS = ["workspaceId", "accounts", "from", "to"];
const key = (row: { media: string; accountId: string }) => JSON.stringify([row.media, row.accountId]);
const fail = (code: AccountDimensionEvidenceError["code"] = "UPSTREAM_INVALID_RESPONSE"): never => {
  throw new AccountDimensionEvidenceError(code);
};
function object(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Internal evidence on the caller's RR/RO snapshot; tuples must come from the approved auth context. */
export class AccountLabelHistoryRepository {
  constructor(private readonly connection: SemanticReadConnection) {}

  async load(value: unknown): Promise<AccountLabelHistoryRow[]> {
    if (!object(value) || Object.keys(value).some((name) => !INPUT_KEYS.includes(name))) return fail("INVALID_REQUEST");
    const scope = namedEvidenceScopeSchema.safeParse({ workspaceId: value.workspaceId, accounts: value.accounts });
    const from = calendarDateSchema.safeParse(value.from), to = calendarDateSchema.safeParse(value.to);
    if (!scope.success || !from.success || !to.success || from.data > to.data) return fail("INVALID_REQUEST");
    const { workspaceId, accounts } = scope.data;
    if (accounts.length === 0) return [];

    const { rows } = await this.connection.query(`/* account-label-history */
      WITH wanted AS MATERIALIZED (
        SELECT a.workspace_id,a.media,a.account_id,a.account_name
        FROM jsonb_to_recordset($2::jsonb) AS w(media text,"accountId" text)
        JOIN accounts a ON a.workspace_id=$1 AND a.media=w.media AND a.account_id=w."accountId"
      ), spans AS MATERIALIZED (
        SELECT w.workspace_id,w.media,w.account_id,w.account_name,
          max(p.effective_from) FILTER (WHERE p.effective_from <= $3::date) AS base_from,
          min(p.effective_from) AS first_from, max(p.effective_from) AS last_from
        FROM wanted w
        JOIN account_name_parses p ON p.workspace_id=w.workspace_id AND p.media=w.media AND p.account_id=w.account_id
        GROUP BY w.workspace_id,w.media,w.account_id,w.account_name
      ), bounded AS MATERIALIZED (
        SELECT s.workspace_id,s.media,s.account_id,p.account_id AS parse_account_id,p.effective_from,
          p.rule_version,p.status,p.segments,p.override,p.conflicts,p.parsed_at,
          CASE WHEN p.effective_from = s.last_from THEN p.account_name IS NOT DISTINCT FROM s.account_name ELSE true END AS name_matches,
          n.version AS matched_version,
          n.segments IS NOT NULL AND jsonb_typeof(n.segments)<>'array' AS invalid,
          COALESCE(octet_length(n.segments::text),0)>=16777216 AS rule_oversized,
          CASE WHEN jsonb_typeof(n.segments)='array' AND octet_length(n.segments::text)<16777216 THEN n.segments ELSE '[]'::jsonb END AS rule_segments
        FROM spans s
        JOIN account_name_parses p ON p.workspace_id=s.workspace_id AND p.media=s.media AND p.account_id=s.account_id
        LEFT JOIN naming_rules n ON n.workspace_id=p.workspace_id AND n.media=p.media AND n.version=p.rule_version
        WHERE p.effective_from = COALESCE(s.base_from, s.first_from)
           OR (p.effective_from > $3::date AND p.effective_from <= $4::date)
        ORDER BY s.media COLLATE "C",s.account_id COLLATE "C",p.effective_from LIMIT ${MAX_ROWS + 1}
      ), projected AS (
        SELECT b.*, CASE WHEN b.matched_version IS NULL THEN NULL ELSE COALESCE((
          SELECT jsonb_agg(jsonb_build_object('key',r.value->'key','mapsTo',COALESCE(r.value->'mapsTo','null'::jsonb),
            'pending',COALESCE(r.value->'pending','false'::jsonb)) ORDER BY r.ord)
          FROM (SELECT * FROM jsonb_array_elements(b.rule_segments) WITH ORDINALITY AS x(value,ord) LIMIT 51) r
        ),'[]'::jsonb) END AS mappings
        FROM bounded b
      ), sized AS (
        SELECT *, bool_or(rule_oversized) OVER () OR sum(COALESCE(octet_length(segments::text),0)+COALESCE(octet_length(override::text),0)+
          COALESCE(octet_length(conflicts::text),0)+COALESCE(octet_length(status),0)+COALESCE(octet_length(mappings::text),0)) OVER ()>=16777216 AS batch_oversized
        FROM projected
      )
      SELECT workspace_id,media,account_id,parse_account_id,effective_from::text AS effective_from,rule_version,parsed_at,
        name_matches,matched_version,invalid,batch_oversized AS oversized,
        CASE WHEN NOT batch_oversized THEN status END AS status,
        CASE WHEN NOT batch_oversized THEN segments END AS segments,
        CASE WHEN NOT batch_oversized THEN override END AS override,
        CASE WHEN NOT batch_oversized THEN conflicts END AS conflicts,
        CASE WHEN NOT batch_oversized THEN mappings END AS mappings
      FROM sized ORDER BY media COLLATE "C",account_id COLLATE "C",effective_from`,
    [workspaceId, JSON.stringify(accounts), from.data, to.data]);

    if (!Array.isArray(rows)) return fail();
    if (rows.length > MAX_ROWS || Buffer.byteLength(JSON.stringify(rows)) >= MAX_BYTES) return fail("SOURCE_TRUNCATED");
    const allowed = new Set(accounts.map(key)), finished = new Set<string>();
    let previous: { key: string; effectiveFrom: string } | undefined;
    return rows.map((raw: unknown): AccountLabelHistoryRow => {
      if (!object(raw)) return fail();
      if (raw.oversized === true) return fail("SOURCE_TRUNCATED");
      if (raw.oversized !== false || raw.invalid !== false || raw.workspace_id !== workspaceId ||
        typeof raw.media !== "string" || typeof raw.account_id !== "string" ||
        typeof raw.effective_from !== "string" || !calendarDateSchema.safeParse(raw.effective_from).success ||
        (raw.matched_version !== null && raw.matched_version !== raw.rule_version)) return fail();
      const tuple = { media: raw.media, accountId: raw.account_id }, tupleKey = key(tuple);
      if (!allowed.has(tupleKey)) return fail();
      // 选行规则靠「同一账户的行挨在一起、按生效日严格递增」——顺序不对就整条判废，不替它排。
      if (previous?.key === tupleKey) {
        if (raw.effective_from <= previous.effectiveFrom) return fail();
      } else {
        if (previous !== undefined) finished.add(previous.key);
        if (finished.has(tupleKey)) return fail();
      }
      previous = { key: tupleKey, effectiveFrom: raw.effective_from };
      const parse = readParseEvidence(raw);
      if (parse === null) return fail();
      let mappings: AccountLabelHistoryRow["mappings"] = null;
      if (raw.matched_version === null) {
        if (raw.mappings !== null) return fail();
      } else {
        const parsed = namingRuleMappingsSchema.safeParse(raw.mappings);
        if (!parsed.success) return fail();
        mappings = parsed.data;
      }
      return { workspaceId, ...tuple, effectiveFrom: raw.effective_from, parse, mappings };
    });
  }
}
