import { adminMembersDataSchema, adminMemberGrantsDataSchema, approvedWorkspaceAuthContextSchema } from "@ka/domain";
import type { Pool } from "pg";
import { withSemanticReadSnapshot } from "./semantic-read-snapshot.js";
export class AdminMembersError extends Error {
  constructor(readonly code: "FORBIDDEN" | "INVALID_REQUEST" | "NOT_FOUND" | "SOURCE_TRUNCATED" | "UPSTREAM_INVALID_RESPONSE" | "SOURCE_UNAVAILABLE" | "UPSTREAM_TIMEOUT") { super(`Member request: ${code}`); }
}
const invalid = (): never => { throw new AdminMembersError("UPSTREAM_INVALID_RESPONSE"); };
function count(v: unknown): number { if (typeof v !== "string" || !/^(0|[1-9][0-9]*)$/.test(v) || !Number.isSafeInteger(Number(v))) return invalid(); return Number(v); }
function stamp(v: unknown): string | null { if (v === null) return null; if (!(v instanceof Date) || !Number.isFinite(v.valueOf())) return invalid(); return v.toISOString(); }
export class AdminMembersRepository {
  constructor(private readonly pool: Pool) {}
  async read(rawAuth: unknown, identityId?: string) {
    const parsed = approvedWorkspaceAuthContextSchema.safeParse(rawAuth);
    if (!parsed.success || parsed.data.role !== "admin") throw new AdminMembersError("FORBIDDEN");
    const auth = parsed.data;
    if (identityId !== undefined && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(identityId)) throw new AdminMembersError("INVALID_REQUEST");
    identityId = identityId?.toLowerCase();
    try {
      return await withSemanticReadSnapshot(this.pool, async c => {
        if (identityId !== undefined) {
          const member = await c.query("SELECT workspace_id,identity_id FROM workspace_memberships WHERE workspace_id=$1 AND identity_id=$2", [auth.workspaceId, identityId]);
          if (!member.rows.length) throw new AdminMembersError("NOT_FOUND");
          if (member.rows.length !== 1 || member.rows[0].workspace_id !== auth.workspaceId || member.rows[0].identity_id !== identityId) return invalid();
          const rows = auth.workspaceKind === "team" ? [] : (await c.query(`/* admin-member-grants */ SELECT workspace_id,identity_id,
            CASE WHEN octet_length(media)<=32 THEN media END AS media,
            CASE WHEN octet_length(account_id)<=128 THEN account_id END AS account_id,
            CASE WHEN octet_length(access_level)<=16 THEN access_level END AS access_level,
            to_char(created_at AT TIME ZONE 'Asia/Shanghai','YYYY-MM-DD') AS granted_at
            FROM account_access_grants WHERE workspace_id=$1 AND identity_id=$2 ORDER BY media COLLATE "C",account_id COLLATE "C" LIMIT 1001`, [auth.workspaceId, identityId])).rows;
          if (rows.length > 1000) throw new AdminMembersError("SOURCE_TRUNCATED");
          const items = rows.map(r => { if (r.workspace_id !== auth.workspaceId || r.identity_id !== identityId) return invalid();
            return { media: r.media, accountId: r.account_id, accessLevel: r.access_level, grantedAt: r.granted_at }; });
          const data = adminMemberGrantsDataSchema.safeParse({ identityId, items }); if (!data.success) return invalid();
          return { workspaceId: auth.workspaceId, data: data.data };
        }
        // Team scope must not depend on legacy grants, including their validity or count.
        const grants = auth.workspaceKind === "team" ? "'0'::text" : `(SELECT count(*)::text FROM account_access_grants g WHERE g.workspace_id=m.workspace_id AND g.identity_id=m.identity_id)`;
        const { rows } = await c.query(`/* admin-members */ SELECT m.workspace_id,m.identity_id,m.user_id,m.role,m.is_active,
          CASE WHEN octet_length(i.display_name)<=1024 THEN i.display_name END AS display_name,
          CASE WHEN octet_length(i.provider)<=32 THEN i.provider END AS provider,
          to_char(m.created_at AT TIME ZONE 'Asia/Shanghai','YYYY-MM-DD') AS joined_at,
          ${grants} AS grants_count,
          (SELECT max(s.last_seen_at) FROM auth_sessions s WHERE s.active_workspace_id=m.workspace_id AND s.identity_id=m.identity_id) AS last_seen_at
          FROM workspace_memberships m JOIN auth_identities i ON i.id=m.identity_id
          JOIN users u ON u.workspace_id=m.workspace_id AND u.id=m.user_id
          WHERE m.workspace_id=$1 ORDER BY m.created_at DESC,m.identity_id LIMIT 1001`, [auth.workspaceId]);
        if (rows.length > 1000) throw new AdminMembersError("SOURCE_TRUNCATED");
        const items = rows.map(r => { if (r.workspace_id !== auth.workspaceId) return invalid(); return { identityId: r.identity_id, userId: r.user_id,
          role: r.role, isActive: r.is_active, displayName: r.display_name, provider: r.provider, joinedAt: r.joined_at,
          grantsCount: count(r.grants_count), lastSeenAt: stamp(r.last_seen_at) }; });
        const data = adminMembersDataSchema.safeParse({ items }); if (!data.success) return invalid();
        return { workspaceId: auth.workspaceId, data: data.data };
      });
    } catch (e) {
      if (e instanceof AdminMembersError) throw e;
      if (e && typeof e === "object" && "code" in e && e.code === "57014") throw new AdminMembersError("UPSTREAM_TIMEOUT");
      throw new AdminMembersError("SOURCE_UNAVAILABLE");
    }
  }
}
