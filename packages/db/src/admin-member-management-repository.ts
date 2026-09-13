import { adminMemberPatchRequestSchema, adminMemberReplaceGrantsRequestSchema, adminMemberV195Schema,
  adminMembersV195DataSchema, adminMemberGrantsDataSchema, approvedWorkspaceAuthContextSchema,
  type ApprovedWorkspaceAuthContext } from "@ka/domain";
import type { Pool } from "pg";
import { AdminMemberProvisioningError, requireMemberGovernance } from "./admin-member-provisioning-repository.js";
import { inTransaction } from "./r014/workspace-authority.js";
import { withSemanticReadSnapshot, type SemanticReadConnection } from "./semantic-read-snapshot.js";

const fail = (code: AdminMemberProvisioningError["code"]): never => { throw new AdminMemberProvisioningError(code); };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function approve(raw: unknown): ApprovedWorkspaceAuthContext {
  const parsed = approvedWorkspaceAuthContextSchema.safeParse(raw);
  if (!parsed.success || parsed.data.role === "viewer") return fail("FORBIDDEN");
  return parsed.data;
}
function target(raw: unknown): string {
  if (typeof raw !== "string" || !uuid.test(raw)) return fail("INVALID_REQUEST");
  return raw.toLowerCase();
}
async function boundary<T>(work: () => Promise<T>): Promise<T> {
  try { return await work(); }
  catch (e) {
    if (e instanceof AdminMemberProvisioningError) throw e;
    if (e && typeof e === "object" && "code" in e && ["57014", "55P03", "40P01"].includes(String(e.code))) return fail("UPSTREAM_TIMEOUT");
    return fail("SOURCE_UNAVAILABLE");
  }
}
async function member(c: SemanticReadConnection, auth: ApprovedWorkspaceAuthContext, id: string, lock = false): Promise<string> {
  const { rows } = await c.query(`SELECT workspace_id,identity_id,user_id FROM workspace_memberships
    WHERE workspace_id=$1 AND identity_id=$2 ${lock ? "FOR UPDATE" : ""}`, [auth.workspaceId, id]);
  if (!rows.length) return fail("NOT_FOUND");
  if (rows.length !== 1 || rows[0].workspace_id !== auth.workspaceId || rows[0].identity_id !== id || !uuid.test(rows[0].user_id)) return fail("UPSTREAM_INVALID_RESPONSE");
  return rows[0].user_id;
}
async function readMembers(c: SemanticReadConnection, auth: ApprovedWorkspaceAuthContext, id?: string) {
  // Team metadata must not depend on account grants, even malformed legacy rows.
  const grants = auth.workspaceKind === "team" ? "'0'::text" : `(SELECT count(*)::text FROM account_access_grants g
    WHERE g.workspace_id=m.workspace_id AND g.identity_id=m.identity_id AND g.revoked_at IS NULL)`;
  const { rows } = await c.query(`/* p193-local-members */ SELECT m.workspace_id,m.identity_id,m.user_id,m.role,
    (m.is_active AND i.is_active AND u.is_active AND w.is_active) AS is_active,
    CASE WHEN octet_length(i.display_name)<=1024 THEN i.display_name END AS display_name,i.provider,
    to_char(m.created_at AT TIME ZONE 'Asia/Shanghai','YYYY-MM-DD') AS joined_at,${grants} AS grants_count,
    (SELECT max(s.last_seen_at) FROM auth_sessions s WHERE s.identity_id=m.identity_id AND s.active_workspace_id=m.workspace_id) AS last_seen_at,
    EXISTS(SELECT 1 FROM identity_passwords p WHERE p.identity_id=i.id AND NOT EXISTS(
      SELECT 1 FROM workspace_memberships own WHERE own.identity_id=i.id AND own.user_id=p.updated_by AND own.is_active=true)) AS must_change_password
    FROM workspace_memberships m JOIN auth_identities i ON i.id=m.identity_id
    JOIN users u ON u.id=m.user_id AND u.workspace_id=m.workspace_id JOIN workspaces w ON w.id=m.workspace_id
    WHERE m.workspace_id=$1 AND ($2::uuid IS NULL OR m.identity_id=$2)
    ORDER BY m.created_at DESC,m.identity_id LIMIT 1001`, [auth.workspaceId, id ?? null]);
  if (rows.length > 1000) return fail("SOURCE_TRUNCATED");
  const items = rows.map(row => {
    if (row.workspace_id !== auth.workspaceId || (id !== undefined && row.identity_id !== id) ||
        typeof row.grants_count !== "string" || !/^(0|[1-9][0-9]*)$/.test(row.grants_count) ||
        (row.last_seen_at !== null && (!(row.last_seen_at instanceof Date) || !Number.isFinite(row.last_seen_at.valueOf())))) return fail("UPSTREAM_INVALID_RESPONSE");
    return { identityId: row.identity_id, userId: row.user_id, role: row.role, isActive: row.is_active,
      displayName: row.display_name, provider: row.provider, joinedAt: row.joined_at, grantsCount: Number(row.grants_count),
      lastSeenAt: row.last_seen_at?.toISOString() ?? null, mustChangePassword: row.must_change_password };
  });
  const result = adminMembersV195DataSchema.safeParse({ items });
  if (!result.success) return fail("UPSTREAM_INVALID_RESPONSE");
  return result.data;
}
async function readGrants(c: SemanticReadConnection, auth: ApprovedWorkspaceAuthContext, id: string) {
  const rows = auth.workspaceKind === "team" ? [] : (await c.query(`/* p193-local-grants */ SELECT workspace_id,identity_id,
    CASE WHEN octet_length(media)<=32 THEN media END AS media,
    CASE WHEN octet_length(account_id)<=128 THEN account_id END AS account_id,access_level,
    to_char(created_at AT TIME ZONE 'Asia/Shanghai','YYYY-MM-DD') AS granted_at
    FROM account_access_grants WHERE workspace_id=$1 AND identity_id=$2 AND revoked_at IS NULL
    ORDER BY media COLLATE "C",account_id COLLATE "C" LIMIT 1001`, [auth.workspaceId, id])).rows;
  if (rows.length > 1000) return fail("SOURCE_TRUNCATED");
  const items = rows.map(row => {
    if (row.workspace_id !== auth.workspaceId || row.identity_id !== id) return fail("UPSTREAM_INVALID_RESPONSE");
    return { media: row.media, accountId: row.account_id, accessLevel: row.access_level, grantedAt: row.granted_at };
  });
  const parsed = adminMemberGrantsDataSchema.safeParse({ identityId: id, items });
  if (!parsed.success) return fail("UPSTREAM_INVALID_RESPONSE");
  return parsed.data;
}
async function audit(c: SemanticReadConnection, auth: ApprovedWorkspaceAuthContext, id: string, action: string, detail: unknown) {
  await c.query("INSERT INTO audit_log(workspace_id,user_id,action,object_type,object_id,detail) VALUES($1,$2,$3,'workspace_member',$4,$5::jsonb)",
    [auth.workspaceId, auth.userId, action, id, JSON.stringify(detail)]);
}

/** v1.9.44: governance identity can manage only the selected workspace. */
export class AdminMemberManagementRepository {
  constructor(private readonly pool: Pool) {}
  async read(rawAuth: unknown) {
    const auth = approve(rawAuth);
    return boundary(() => withSemanticReadSnapshot(this.pool, async c => {
      await requireMemberGovernance(c, auth, false);
      return { workspaceId: auth.workspaceId, data: await readMembers(c, auth) };
    }));
  }
  async grants(rawAuth: unknown, rawId: unknown) {
    const auth = approve(rawAuth), id = target(rawId);
    return boundary(() => withSemanticReadSnapshot(this.pool, async c => {
      await requireMemberGovernance(c, auth, false); await member(c, auth, id);
      return { workspaceId: auth.workspaceId, data: await readGrants(c, auth, id) };
    }));
  }
  async patch(rawAuth: unknown, rawId: unknown, rawInput: unknown) {
    const auth = approve(rawAuth), id = target(rawId), input = adminMemberPatchRequestSchema.safeParse(rawInput);
    if (!input.success) return fail("INVALID_REQUEST");
    return boundary(() => inTransaction(this.pool, async c => {
      // Take this before governance's shared row locks: concurrent self-updates
      // must not both acquire SHARE and then deadlock upgrading to UPDATE.
      await c.query("SELECT pg_advisory_xact_lock(hashtextextended('member-management:' || $1::text,0))", [auth.workspaceId]);
      await requireMemberGovernance(c, auth, true);
      const user = await member(c, auth, id, true), before = (await readMembers(c, auth, id)).items[0];
      if (!before) return fail("UPSTREAM_INVALID_RESPONSE");
      await c.query(`UPDATE workspace_memberships SET role=COALESCE($3,role),is_active=COALESCE($4,is_active)
        WHERE workspace_id=$1 AND identity_id=$2`, [auth.workspaceId, id, input.data.role ?? null, input.data.is_active ?? null]);
      if (input.data.role !== undefined) await c.query("UPDATE users SET role=$3 WHERE workspace_id=$1 AND id=$2", [auth.workspaceId, user, input.data.role]);
      if (input.data.is_active === false) await c.query("UPDATE auth_sessions SET revoked_at=COALESCE(revoked_at,now()) WHERE active_workspace_id=$1 AND identity_id=$2 AND revoked_at IS NULL", [auth.workspaceId, id]);
      const result = adminMemberV195Schema.safeParse((await readMembers(c, auth, id)).items[0]);
      if (!result.success) return fail("UPSTREAM_INVALID_RESPONSE");
      await audit(c, auth, id, "member.patch", { before: { role: before.role, isActive: before.isActive }, patch: input.data });
      return { workspaceId: auth.workspaceId, data: result.data };
    }));
  }
  async replaceGrants(rawAuth: unknown, rawId: unknown, rawInput: unknown) {
    const auth = approve(rawAuth), id = target(rawId), parsed = adminMemberReplaceGrantsRequestSchema.safeParse(rawInput);
    if (!parsed.success) return fail("INVALID_REQUEST");
    if (auth.workspaceKind === "team") return fail("FORBIDDEN");
    const items = parsed.data.items.map(row => ({ media: row.media, account_id: row.accountId, access_level: row.accessLevel }));
    return boundary(() => inTransaction(this.pool, async c => {
      await c.query("SELECT pg_advisory_xact_lock(hashtextextended('member-management:' || $1::text,0))", [auth.workspaceId]);
      await requireMemberGovernance(c, auth, true); await member(c, auth, id, true);
      const accounts = await c.query(`SELECT a.media,a.account_id FROM accounts a JOIN jsonb_to_recordset($2::jsonb) AS wanted(media text,account_id text)
        ON a.media=wanted.media AND a.account_id=wanted.account_id WHERE a.workspace_id=$1 FOR KEY SHARE OF a`, [auth.workspaceId, JSON.stringify(items)]);
      if (accounts.rows.length !== items.length || accounts.rows.some(row => !items.some(item => item.media === row.media && item.account_id === row.account_id))) return fail("INVALID_REQUEST");
      const before = await readGrants(c, auth, id);
      await c.query("UPDATE account_access_grants SET revoked_at=now() WHERE workspace_id=$1 AND identity_id=$2 AND revoked_at IS NULL", [auth.workspaceId, id]);
      await c.query(`INSERT INTO account_access_grants(workspace_id,identity_id,media,account_id,access_level)
        SELECT $1,$2,media,account_id,access_level FROM jsonb_to_recordset($3::jsonb) AS wanted(media text,account_id text,access_level text)
        ON CONFLICT(workspace_id,identity_id,media,account_id) DO UPDATE SET access_level=excluded.access_level,revoked_at=NULL,created_at=now()`, [auth.workspaceId, id, JSON.stringify(items)]);
      const data = await readGrants(c, auth, id);
      await audit(c, auth, id, "member.grants.replace", { before: before.items, after: data.items });
      return { workspaceId: auth.workspaceId, data };
    }));
  }
}
