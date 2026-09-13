import { adminMemberPatchRequestSchema, adminMemberReplaceGrantsRequestSchema, adminMemberV195Schema,
  adminMembersV195DataSchema, adminMemberGrantsDataSchema, approvedWorkspaceAuthContextSchema,
  type ApprovedWorkspaceAuthContext } from "@ka/domain";
import type { Pool } from "pg";
import { AdminMemberProvisioningError, AdminMemberProvisioningRepository, requireMemberGovernance } from "./admin-member-provisioning-repository.js";
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
interface PersonalTarget { workspaceId: string; workspaceKind: "personal"; identityId: string; userId: string }
/** A distinct server-resolved target, never a fabricated caller auth/session. */
async function personalTarget(c: SemanticReadConnection, id: string, lock: boolean): Promise<PersonalTarget> {
  const identity = await c.query(`SELECT id FROM auth_identities WHERE id=$1 AND provider IN ('internal_test','buc') ${lock ? "FOR UPDATE" : ""}`, [id]);
  if (!identity.rows.length) return fail("NOT_FOUND");
  if (identity.rows.length !== 1 || identity.rows[0].id !== id) return fail("UPSTREAM_INVALID_RESPONSE");
  const { rows } = await c.query(`SELECT m.workspace_id,m.identity_id,m.user_id FROM workspace_memberships m
    JOIN workspaces w ON w.id=m.workspace_id AND w.kind='personal' AND w.is_active=true AND w.is_demo=false
    JOIN users u ON u.id=m.user_id AND u.workspace_id=m.workspace_id AND u.is_active=true
    WHERE m.identity_id=$1 AND m.is_active=true ORDER BY m.workspace_id LIMIT 2 ${lock ? "FOR UPDATE OF m,w,u" : ""}`, [id]);
  if (!rows.length) return fail("NOT_FOUND");
  if (rows.length > 1) return fail("CONFLICT");
  const row = rows[0];
  if (typeof row.workspace_id !== "string" || !uuid.test(row.workspace_id) || row.identity_id !== id ||
      typeof row.user_id !== "string" || !uuid.test(row.user_id)) return fail("UPSTREAM_INVALID_RESPONSE");
  const members = await c.query(`SELECT identity_id FROM workspace_memberships WHERE workspace_id=$1 AND is_active=true
    ORDER BY identity_id LIMIT 2 ${lock ? "FOR UPDATE" : ""}`, [row.workspace_id]);
  if (members.rows.length !== 1 || members.rows[0].identity_id !== id) return fail("CONFLICT");
  return { workspaceId: row.workspace_id, workspaceKind: "personal", identityId: id, userId: row.user_id };
}
async function readMembers(c: SemanticReadConnection, auth: PersonalTarget, id: string) {
  // The target is personal; caller workspace and role never select these rows.
  const grants = `(SELECT count(*)::text FROM account_access_grants g
    WHERE g.workspace_id=m.workspace_id AND g.identity_id=m.identity_id AND g.revoked_at IS NULL)`;
  const { rows } = await c.query(`/* p193-target-member */ SELECT m.workspace_id,m.identity_id,m.user_id,m.role,
    (m.is_active AND i.is_active AND u.is_active AND w.is_active) AS is_active,
    CASE WHEN octet_length(i.display_name)<=1024 THEN i.display_name END AS display_name,i.provider,
    to_char(m.created_at AT TIME ZONE 'Asia/Shanghai','YYYY-MM-DD') AS joined_at,${grants} AS grants_count,
    (SELECT max(s.last_seen_at) FROM auth_sessions s WHERE s.identity_id=m.identity_id) AS last_seen_at,
    EXISTS(SELECT 1 FROM identity_passwords p WHERE p.identity_id=i.id AND NOT EXISTS(
      SELECT 1 FROM workspace_memberships own WHERE own.identity_id=i.id AND own.user_id=p.updated_by AND own.is_active=true)) AS must_change_password
    FROM workspace_memberships m JOIN auth_identities i ON i.id=m.identity_id
    JOIN users u ON u.id=m.user_id AND u.workspace_id=m.workspace_id JOIN workspaces w ON w.id=m.workspace_id
    WHERE m.workspace_id=$1 AND m.identity_id=$2
    LIMIT 2`, [auth.workspaceId, id]);
  if (rows.length !== 1) return fail("UPSTREAM_INVALID_RESPONSE");
  const items = rows.map(row => {
    if (row.workspace_id !== auth.workspaceId || row.identity_id !== id || row.user_id !== auth.userId ||
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
async function readGrants(c: SemanticReadConnection, auth: PersonalTarget, id: string) {
  const rows = (await c.query(`/* p193-personal-grants */ SELECT workspace_id,identity_id,
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
async function audit(c: SemanticReadConnection, auth: ApprovedWorkspaceAuthContext, actorIdentityId: string, owner: PersonalTarget, action: string, detail: Record<string, unknown>) {
  await c.query("INSERT INTO audit_log(workspace_id,user_id,action,object_type,object_id,detail) VALUES($1,$2,$3,'identity',$4,$5::jsonb)",
    [auth.workspaceId, auth.userId, action, owner.identityId, JSON.stringify({ ...detail, actorIdentityId,
      targetIdentityId: owner.identityId, targetWorkspaceId: owner.workspaceId })]);
}

/** v1.9.46: identity governance targets a server-resolved personal workspace. */
export class AdminMemberManagementRepository {
  constructor(private readonly pool: Pool) {}
  async read(rawAuth: unknown) {
    const auth = approve(rawAuth);
    return { workspaceId: auth.workspaceId, data: await new AdminMemberProvisioningRepository(this.pool).read(auth) };
  }
  async grants(rawAuth: unknown, rawId: unknown) {
    const auth = approve(rawAuth), id = target(rawId);
    return boundary(() => withSemanticReadSnapshot(this.pool, async c => {
      await requireMemberGovernance(c, auth, false);
      const owner = await personalTarget(c, id, false);
      return { workspaceId: owner.workspaceId, data: await readGrants(c, owner, id) };
    }));
  }
  async patch(rawAuth: unknown, rawId: unknown, rawInput: unknown) {
    const auth = approve(rawAuth), id = target(rawId), input = adminMemberPatchRequestSchema.safeParse(rawInput);
    if (!input.success) return fail("INVALID_REQUEST");
    return boundary(() => inTransaction(this.pool, async c => {
      // Take this before governance's shared row locks: concurrent self-updates
      // must not both acquire SHARE and then deadlock upgrading to UPDATE.
      // Global, low-volume governance lock also serializes callers in different
      // active workspaces before taking any actor SHARE / target UPDATE locks.
      await c.query("SELECT pg_advisory_xact_lock(hashtextextended('ka-member-management-v1946',0))");
      const actorIdentityId = await requireMemberGovernance(c, auth, true);
      const owner = await personalTarget(c, id, true), before = (await readMembers(c, owner, id)).items[0];
      if (!before) return fail("UPSTREAM_INVALID_RESPONSE");
      if (input.data.role !== undefined) {
        await c.query("UPDATE workspace_memberships SET role=$3 WHERE workspace_id=$1 AND identity_id=$2", [owner.workspaceId, id, input.data.role]);
        await c.query("UPDATE users SET role=$3 WHERE workspace_id=$1 AND id=$2", [owner.workspaceId, owner.userId, input.data.role]);
      }
      if (input.data.is_active !== undefined) await c.query("UPDATE auth_identities SET is_active=$2 WHERE id=$1", [id, input.data.is_active]);
      if (input.data.is_active === false) await c.query("UPDATE auth_sessions SET revoked_at=now() WHERE identity_id=$1 AND revoked_at IS NULL", [id]);
      const result = adminMemberV195Schema.safeParse((await readMembers(c, owner, id)).items[0]);
      if (!result.success) return fail("UPSTREAM_INVALID_RESPONSE");
      await audit(c, auth, actorIdentityId, owner, "member.patch", { before: { role: before.role, isActive: before.isActive }, patch: input.data });
      return { workspaceId: owner.workspaceId, data: result.data };
    }));
  }
  async replaceGrants(rawAuth: unknown, rawId: unknown, rawInput: unknown) {
    const auth = approve(rawAuth), id = target(rawId), parsed = adminMemberReplaceGrantsRequestSchema.safeParse(rawInput);
    if (!parsed.success) return fail("INVALID_REQUEST");
    const items = parsed.data.items.map(row => ({ media: row.media, account_id: row.accountId, access_level: row.accessLevel }));
    return boundary(() => inTransaction(this.pool, async c => {
      await c.query("SELECT pg_advisory_xact_lock(hashtextextended('ka-member-management-v1946',0))");
      const actorIdentityId = await requireMemberGovernance(c, auth, true), owner = await personalTarget(c, id, true);
      const accounts = await c.query(`SELECT a.media,a.account_id FROM accounts a JOIN jsonb_to_recordset($2::jsonb) AS wanted(media text,account_id text)
        ON a.media=wanted.media AND a.account_id=wanted.account_id WHERE a.workspace_id=$1 FOR KEY SHARE OF a`, [owner.workspaceId, JSON.stringify(items)]);
      if (accounts.rows.length !== items.length || accounts.rows.some(row => !items.some(item => item.media === row.media && item.account_id === row.account_id))) return fail("INVALID_REQUEST");
      const before = await readGrants(c, owner, id);
      await c.query("UPDATE account_access_grants SET revoked_at=now() WHERE workspace_id=$1 AND identity_id=$2 AND revoked_at IS NULL", [owner.workspaceId, id]);
      await c.query(`INSERT INTO account_access_grants(workspace_id,identity_id,media,account_id,access_level)
        SELECT $1,$2,media,account_id,access_level FROM jsonb_to_recordset($3::jsonb) AS wanted(media text,account_id text,access_level text)
        ON CONFLICT(workspace_id,identity_id,media,account_id) DO UPDATE SET access_level=excluded.access_level,revoked_at=NULL,created_at=now()`, [owner.workspaceId, id, JSON.stringify(items)]);
      const data = await readGrants(c, owner, id);
      await audit(c, auth, actorIdentityId, owner, "member.grants.replace", { before: before.items, after: data.items });
      return { workspaceId: owner.workspaceId, data };
    }));
  }
}
