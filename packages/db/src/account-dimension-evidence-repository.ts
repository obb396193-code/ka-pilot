import { parseConflictSchema, parseOverrideSchema, parseStatusSchema, type ParsedSegment } from "@ka/domain";
import type { SemanticReadConnection } from "./semantic-read-snapshot.js";

export class AccountDimensionEvidenceError extends Error {
  constructor(readonly code: "INVALID_REQUEST" | "UPSTREAM_INVALID_RESPONSE" | "SOURCE_TRUNCATED") {
    super(`Account dimension evidence: ${code}`);
  }
}
interface AccountTuple { media: string; accountId: string }
interface EvidenceScope { workspaceId: string; accounts: AccountTuple[] }
export interface AccountDimensionEvidence extends AccountTuple {
  workspaceId: string;
  parse: {
    ruleVersion: number; status: ReturnType<typeof parseStatusSchema.parse>;
    segments: Record<string, ParsedSegment>; override: Record<string, string> | null;
    conflicts: ReturnType<typeof parseConflictSchema.parse>[] | null;
    parsedAt: string | null; nameMatches: boolean;
  } | null;
}
const MAX_BYTES = 16 * 1024 * 1024;
const mediaPattern = /^[A-Z0-9_]{1,32}$/;
const idPattern = /^[A-Za-z0-9_-]{1,128}$/;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const key = (tuple: AccountTuple): string => `${tuple.media}:${tuple.accountId}`;
function object(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function fail(code: AccountDimensionEvidenceError["code"] = "UPSTREAM_INVALID_RESPONSE"): never {
  throw new AccountDimensionEvidenceError(code);
}
function validateScope(value: unknown): EvidenceScope {
  if (!object(value) || Object.keys(value).some(k => !["workspaceId", "accounts"].includes(k)) ||
    typeof value.workspaceId !== "string" || !uuidPattern.test(value.workspaceId) ||
    !Array.isArray(value.accounts) || value.accounts.length > 1000) return fail("INVALID_REQUEST");
  const accounts = value.accounts.map((item: unknown) => {
    if (!object(item) || Object.keys(item).some(k => !["media", "accountId"].includes(k)) ||
      typeof item.media !== "string" || !mediaPattern.test(item.media) ||
      typeof item.accountId !== "string" || !idPattern.test(item.accountId)) return fail("INVALID_REQUEST");
    return { media: item.media, accountId: item.accountId };
  });
  if (new Set(accounts.map(key)).size !== accounts.length) return fail("INVALID_REQUEST");
  return { workspaceId: value.workspaceId, accounts };
}
function segments(value: unknown): Record<string, ParsedSegment> {
  if (!object(value)) return fail();
  return Object.fromEntries(Object.entries(value).map(([name, segment]) => {
    if (!object(segment) || Object.keys(segment).some(k => !["key", "value", "mapsTo", "taskIds"].includes(k)) ||
      name === "" || segment.key !== name || typeof segment.value !== "string" ||
      (segment.mapsTo !== null && (typeof segment.mapsTo !== "string" || segment.mapsTo === "")) ||
      !Array.isArray(segment.taskIds) || segment.taskIds.some(id => typeof id !== "string" || id === "")) return fail();
    return [name, { key: name, value: segment.value, mapsTo: segment.mapsTo, taskIds: [...segment.taskIds] } as ParsedSegment];
  }));
}
function parseEvidence(row: Record<string, unknown>): AccountDimensionEvidence["parse"] {
  if (row.parse_account_id === null) {
    if (["rule_version", "status", "segments", "override", "conflicts", "parsed_at", "name_matches"].some(k => row[k] !== null)) return fail();
    return null;
  }
  const status = parseStatusSchema.safeParse(row.status);
  const override = row.override === null ? null : parseOverrideSchema.safeParse(row.override);
  const conflicts = row.conflicts === null ? null : parseConflictSchema.array().safeParse(row.conflicts);
  if (row.parse_account_id !== row.account_id || typeof row.rule_version !== "number" || !Number.isSafeInteger(row.rule_version) ||
    row.rule_version < 1 || !status.success || (override !== null && !override.success) ||
    (conflicts !== null && !conflicts.success) || typeof row.name_matches !== "boolean" ||
    (row.parsed_at !== null && (!(row.parsed_at instanceof Date) || !Number.isFinite(row.parsed_at.getTime())))) return fail();
  return { ruleVersion: row.rule_version, status: status.data, segments: segments(row.segments),
    override: override?.data ?? null, conflicts: conflicts?.data ?? null,
    parsedAt: row.parsed_at === null ? null : row.parsed_at.toISOString(), nameMatches: row.name_matches };
}

/** Internal evidence, not an HTTP DTO or a grant resolver. Pass the existing
 * RR/RO connection and tuples derived from ApprovedWorkspaceAuthContext. Never
 * call with browser-owned scope. Does not resolve conflicts, blend group sources,
 * reparse names using a newer rule, or replace a missing parse with guessed data.
 */
export class AccountDimensionEvidenceRepository {
  constructor(private readonly connection: SemanticReadConnection) {}
  async load(value: unknown): Promise<AccountDimensionEvidence[]> {
    const scope = validateScope(value);
    if (scope.accounts.length === 0) return [];
    const result = await this.connection.query(`/* account-dimension-evidence */
      WITH bounded AS MATERIALIZED (
        SELECT a.workspace_id,a.media,a.account_id,p.account_id AS parse_account_id,
          p.rule_version,p.status,p.segments,p.override,p.conflicts,p.parsed_at,
          CASE WHEN p.account_id IS NULL THEN NULL ELSE p.account_name IS NOT DISTINCT FROM a.account_name END AS name_matches
        FROM jsonb_to_recordset($2::jsonb) AS wanted(media text,"accountId" text)
        JOIN accounts a ON a.workspace_id=$1 AND a.media=wanted.media AND a.account_id=wanted."accountId"
        LEFT JOIN account_name_parses p ON p.workspace_id=a.workspace_id AND p.media=a.media AND p.account_id=a.account_id
        ORDER BY a.media COLLATE "C",a.account_id COLLATE "C" LIMIT 1001
      ), sized AS (
        SELECT *,sum(COALESCE(octet_length(segments::text),0)+COALESCE(octet_length(override::text),0)+
          COALESCE(octet_length(conflicts::text),0)+COALESCE(octet_length(status),0)) OVER ()>=16777216 AS oversized
        FROM bounded
      )
      SELECT workspace_id,media,account_id,parse_account_id,rule_version,parsed_at,name_matches,oversized,
        CASE WHEN NOT oversized THEN status END AS status,
        CASE WHEN NOT oversized THEN segments END AS segments,
        CASE WHEN NOT oversized THEN override END AS override,
        CASE WHEN NOT oversized THEN conflicts END AS conflicts
      FROM sized ORDER BY media COLLATE "C",account_id COLLATE "C"`, [scope.workspaceId, JSON.stringify(scope.accounts)]);
    if (!Array.isArray(result.rows)) return fail();
    if (result.rows.length > 1000 || Buffer.byteLength(JSON.stringify(result.rows)) >= MAX_BYTES) return fail("SOURCE_TRUNCATED");
    if (result.rows.length > scope.accounts.length) return fail();
    const allowed = new Set(scope.accounts.map(key)), seen = new Set<string>();
    return result.rows.map((raw: unknown) => {
      if (!object(raw)) return fail();
      if (raw.oversized === true) return fail("SOURCE_TRUNCATED");
      if (raw.oversized !== false || raw.workspace_id !== scope.workspaceId || typeof raw.media !== "string" ||
        typeof raw.account_id !== "string") return fail();
      const tuple = { media: raw.media, accountId: raw.account_id }, tupleKey = key(tuple);
      if (!allowed.has(tupleKey) || seen.has(tupleKey)) return fail();
      seen.add(tupleKey);
      return { workspaceId: scope.workspaceId, ...tuple, parse: parseEvidence(raw) };
    });
  }
}
