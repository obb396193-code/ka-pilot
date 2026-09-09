import { approvedWorkspaceAuthContextSchema, taskListCalendarDateSchema } from "@ka/domain";
import type { Pool } from "pg";
import { withSemanticReadSnapshot } from "./semantic-read-snapshot.js";

export class CoefficientReadError extends Error {
  constructor(readonly code: "FORBIDDEN" | "INVALID_REQUEST" | "AMBIGUOUS_VERSION" | "SOURCE_TRUNCATED" |
    "UPSTREAM_INVALID_RESPONSE" | "SOURCE_UNAVAILABLE" | "UPSTREAM_TIMEOUT") { super(`Coefficient read: ${code}`); }
}
export interface CoefficientReadVersion {
  id: string; media: string; op: "multiply" | "divide"; coefficient: number; effectiveDate: string;
  current: boolean; historyCount: number;
  actor: { status: "unrecorded" | "unavailable" } | { status: "known"; userId: string; name: string };
  evidence: { status: "not_stored" };
}
export interface CoefficientReadSnapshot { workspaceId: string; businessDate: string; versions: CoefficientReadVersion[] }
const mediaPattern = /^[A-Z0-9_]{1,32}$/;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function invalid(): never { throw new CoefficientReadError("UPSTREAM_INVALID_RESPONSE"); }

/** Internal read model, NOT the frozen HTTP DTO. Unknown historical author and
 * absent evidence storage remain explicit until the public mapping is approved.
 * No account grant filtering: this is workspace admin configuration, not metrics.
 */
export class CoefficientReadRepository {
  constructor(private readonly pool: Pool) {}
  async read(rawAuth: unknown, businessDate: unknown, media?: unknown): Promise<CoefficientReadSnapshot> {
    const parsed = approvedWorkspaceAuthContextSchema.safeParse(rawAuth);
    if (!parsed.success || parsed.data.role !== "admin" || parsed.data.workspaceKind !== "personal") throw new CoefficientReadError("FORBIDDEN");
    const day = taskListCalendarDateSchema.safeParse(businessDate);
    if (!day.success || (media !== undefined && (typeof media !== "string" || !mediaPattern.test(media)))) throw new CoefficientReadError("INVALID_REQUEST");
    const auth = parsed.data;
    try {
      return await withSemanticReadSnapshot(this.pool, async client => {
        const access = await client.query(`/* coefficient-read-auth */
          SELECT true AS allowed FROM workspaces w
          JOIN users u ON u.workspace_id=w.id AND u.id=$2 AND u.is_active=true
          JOIN workspace_memberships m ON m.workspace_id=w.id AND m.user_id=u.id AND m.is_active=true AND m.role='admin'
          JOIN auth_identities i ON i.id=m.identity_id AND i.is_active=true
          WHERE w.id=$1 AND w.kind='personal' AND w.is_active=true LIMIT 2`, [auth.workspaceId, auth.userId]);
        if (access.rows.length !== 1 || access.rows[0]?.allowed !== true) throw new CoefficientReadError("FORBIDDEN");
        const { rows } = await client.query(`/* coefficient-read-versions */
          SELECT c.workspace_id,c.id::text,
            CASE WHEN octet_length(c.media)<=32 THEN c.media END AS media,c.op,
            CASE WHEN octet_length(c.coefficient::text)<=128 THEN c.coefficient::text END AS coefficient,
            to_char(c.effective_date,'YYYY-MM-DD') AS effective_date,c.changed_by,
            u.id AS actor_id,CASE WHEN octet_length(u.name)<=4096 THEN u.name END AS actor_name
          FROM channel_coefficients c
          LEFT JOIN users u ON u.workspace_id=c.workspace_id AND u.id=c.changed_by
          WHERE c.workspace_id=$1 AND ($2::text IS NULL OR c.media=$2)
          ORDER BY c.media COLLATE "C",c.effective_date DESC,c.id DESC LIMIT 10001`, [auth.workspaceId, media ?? null]);
        if (rows.length > 10000) throw new CoefficientReadError("SOURCE_TRUNCATED");
        const versions: CoefficientReadVersion[] = [], ids = new Set<string>(), counts = new Map<string, number>(), currentDates = new Map<string, string>();
        for (const row of rows) {
          const value = parseVersion(row, auth.workspaceId, media);
          if (ids.has(value.id)) invalid(); ids.add(value.id);
          counts.set(value.media, (counts.get(value.media) ?? 0) + 1);
          if (value.effectiveDate <= day.data && (!currentDates.has(value.media) || value.effectiveDate > currentDates.get(value.media)!)) currentDates.set(value.media, value.effectiveDate);
          versions.push(value);
        }
        const selected = new Set<string>();
        let bytes = Buffer.byteLength(JSON.stringify({ workspaceId: auth.workspaceId, businessDate: day.data, versions: [] }));
        for (const value of versions) {
          value.historyCount = counts.get(value.media)!;
          value.current = value.effectiveDate === currentDates.get(value.media);
          if (value.current && selected.has(value.media)) throw new CoefficientReadError("AMBIGUOUS_VERSION");
          if (value.current) selected.add(value.media);
          // Exact UTF-8 size including array commas; no full unbounded response serialization.
          bytes += Buffer.byteLength(JSON.stringify(value)) + (value === versions[0] ? 0 : 1);
          if (bytes >= 16 * 1024 * 1024) throw new CoefficientReadError("SOURCE_TRUNCATED");
        }
        versions.sort((a, b) => a.media !== b.media ? (a.media < b.media ? -1 : 1) : a.effectiveDate !== b.effectiveDate
          ? (a.effectiveDate > b.effectiveDate ? -1 : 1) : (BigInt(a.id) > BigInt(b.id) ? -1 : 1));
        return { workspaceId: auth.workspaceId, businessDate: day.data, versions };
      });
    } catch (error) {
      if (error instanceof CoefficientReadError) throw error;
      if (error && typeof error === "object" && "code" in error && error.code === "57014") throw new CoefficientReadError("UPSTREAM_TIMEOUT");
      throw new CoefficientReadError("SOURCE_UNAVAILABLE");
    }
  }
}

function parseVersion(row: Record<string, unknown>, workspaceId: string, media: unknown): CoefficientReadVersion {
  if (row.workspace_id !== workspaceId || typeof row.id !== "string" || !/^[1-9][0-9]{0,18}$/.test(row.id) || BigInt(row.id) > 9223372036854775807n ||
    typeof row.media !== "string" || !mediaPattern.test(row.media) || (media !== undefined && row.media !== media) ||
    (row.op !== "multiply" && row.op !== "divide") || typeof row.coefficient !== "string" || row.coefficient.length > 128 ||
    !/^\d+(?:\.\d+)?$/.test(row.coefficient) || !Number.isFinite(Number(row.coefficient)) || Number(row.coefficient) <= 0) invalid();
  const day = taskListCalendarDateSchema.safeParse(row.effective_date); if (!day.success) invalid();
  let actor: CoefficientReadVersion["actor"];
  if (row.changed_by === null) {
    if (row.actor_id !== null || row.actor_name !== null) invalid();
    actor = { status: "unrecorded" };
  } else {
    if (typeof row.changed_by !== "string" || !uuidPattern.test(row.changed_by)) invalid();
    if (row.actor_id === null) {
      if (row.actor_name !== null) invalid();
      actor = { status: "unavailable" }; // Never return a foreign/orphan user identifier.
    } else {
      if (row.actor_id !== row.changed_by || typeof row.actor_name !== "string" || Buffer.byteLength(row.actor_name) > 4096) invalid();
      actor = { status: "known", userId: row.changed_by, name: row.actor_name };
    }
  }
  return { id: row.id, media: row.media, op: row.op, coefficient: Number(row.coefficient), effectiveDate: day.data,
    current: false, historyCount: 0, actor, evidence: { status: "not_stored" } };
}
