import { randomBytes } from "node:crypto";
import {
  adminMemberCreateRequestSchema, adminMemberCreatedDataSchema, adminMemberResetPasswordDataSchema,
  adminMembersV195DataSchema, approvedWorkspaceAuthContextSchema, type ApprovedWorkspaceAuthContext,
} from "@ka/domain";
import type { Pool } from "pg";
import { IdentityPasswordRepository } from "./identity-password-repository.js";
import { inTransaction } from "./r014/workspace-authority.js";
import { withSemanticReadSnapshot, type SemanticReadConnection } from "./semantic-read-snapshot.js";

type ErrorCode = "FORBIDDEN" | "INVALID_REQUEST" | "NOT_FOUND" | "CONFLICT" | "SOURCE_TRUNCATED"
  | "SOURCE_UNAVAILABLE" | "UPSTREAM_TIMEOUT" | "UPSTREAM_INVALID_RESPONSE";
export class AdminMemberProvisioningError extends Error {
  constructor(readonly code: ErrorCode) { super(`Member provisioning: ${code}`); }
}
const fail = (code: ErrorCode): never => { throw new AdminMemberProvisioningError(code); };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const password = () => randomBytes(12).toString("base64url");
function approve(rawAuth: unknown): ApprovedWorkspaceAuthContext {
  const parsed = approvedWorkspaceAuthContextSchema.safeParse(rawAuth);
  if (!parsed.success || parsed.data.role === "viewer") return fail("FORBIDDEN");
  return parsed.data;
}
async function boundary<T>(work: () => Promise<T>): Promise<T> {
  try { return await work(); }
  catch (error) {
    if (error instanceof AdminMemberProvisioningError) throw error;
    if (typeof error === "object" && error !== null && "code" in error) {
      if (error.code === "23505") return fail("CONFLICT");
      if (error.code === "57014" || error.code === "55P03") return fail("UPSTREAM_TIMEOUT");
    }
    return fail("SOURCE_UNAVAILABLE"); // Do not expose SQL, plaintext credentials or upstream bodies.
  }
}

/** Session-derived context is only a selector: live identity + any active team admin grant authorizes governance. */
async function governance(connection: SemanticReadConnection, auth: ApprovedWorkspaceAuthContext, lock: boolean): Promise<void> {
  const actor = await connection.query(`SELECT i.id FROM workspace_memberships m
    JOIN workspaces w ON w.id=m.workspace_id AND w.is_active=true AND w.kind=$4 AND w.is_demo=false
    JOIN users u ON u.id=m.user_id AND u.workspace_id=m.workspace_id AND u.is_active=true
    JOIN auth_identities i ON i.id=m.identity_id AND i.is_active=true AND i.provider IN ('internal_test','buc')
    WHERE m.workspace_id=$1 AND m.user_id=$2 AND m.role=$3 AND m.is_active=true
    ORDER BY i.id LIMIT 2 ${lock ? "FOR SHARE OF m,w,u,i" : ""}`,
  [auth.workspaceId, auth.userId, auth.role, auth.workspaceKind]);
  if (actor.rows.length !== 1 || typeof actor.rows[0]?.id !== "string" || !uuid.test(actor.rows[0].id)) return fail("FORBIDDEN");
  const admin = await connection.query(`SELECT m.workspace_id FROM workspace_memberships m
    JOIN workspaces w ON w.id=m.workspace_id AND w.kind='team' AND w.is_active=true AND w.is_demo=false
    JOIN users u ON u.id=m.user_id AND u.workspace_id=m.workspace_id AND u.is_active=true
    WHERE m.identity_id=$1 AND m.is_active=true AND m.role='admin'
    ORDER BY m.workspace_id LIMIT 1 ${lock ? "FOR SHARE OF m,w,u" : ""}`, [actor.rows[0].id]);
  if (admin.rows.length !== 1) return fail("FORBIDDEN");
}

/** v1.9.21 global member management. No media permissions, credentials or team memberships are assigned here. */
export class AdminMemberProvisioningRepository {
  private readonly passwords: IdentityPasswordRepository;
  constructor(private readonly pool: Pool) { this.passwords = new IdentityPasswordRepository(pool); }

  async create(rawAuth: unknown, rawInput: unknown) {
    const auth = approve(rawAuth), parsed = adminMemberCreateRequestSchema.safeParse(rawInput);
    if (!parsed.success) return fail("INVALID_REQUEST");
    const input = parsed.data;
    return boundary(() => inTransaction(this.pool, async client => {
      await governance(client, auth, true);
      // v1.9.21 says duplicate provider_subject, not merely the DB's (provider, subject).
      // Serialize this path across providers; the lock holds until commit/rollback, no new table.
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended('admin-member-subject:' || $1::text,0))", [input.provider_subject]);
      const duplicate = await client.query("SELECT id FROM auth_identities WHERE provider_subject=$1 LIMIT 1", [input.provider_subject]);
      if (duplicate.rows.length) return fail("CONFLICT");
      const identity = (await client.query(`INSERT INTO auth_identities(provider,provider_subject,display_name)
        VALUES($1,$2,$3) RETURNING id`, [input.provider, input.provider_subject, input.display_name])).rows[0];
      if (typeof identity?.id !== "string" || !uuid.test(identity.id)) return fail("UPSTREAM_INVALID_RESPONSE");
      const workspace = (await client.query("INSERT INTO workspaces(name,kind) VALUES($1,'personal') RETURNING id", [input.display_name])).rows[0];
      if (typeof workspace?.id !== "string" || !uuid.test(workspace.id)) return fail("UPSTREAM_INVALID_RESPONSE");
      const user = (await client.query("INSERT INTO users(workspace_id,name,role) VALUES($1,$2,$3) RETURNING id", [workspace?.id, input.display_name, input.role])).rows[0];
      if (typeof user?.id !== "string" || !uuid.test(user.id)) return fail("UPSTREAM_INVALID_RESPONSE");
      const member = (await client.query(`INSERT INTO workspace_memberships(workspace_id,identity_id,user_id,role)
        VALUES($1,$2,$3,$4) RETURNING to_char(created_at AT TIME ZONE 'Asia/Shanghai','YYYY-MM-DD') AS joined_at`,
      [workspace?.id, identity.id, user?.id, input.role])).rows[0];
      const initialPassword = input.provider === "internal_test" ? input.initial_password ?? password() : undefined;
      if (initialPassword !== undefined) await this.passwords.setPassword(identity.id, initialPassword, auth.userId, client);
      const result = adminMemberCreatedDataSchema.safeParse({ identityId: identity.id, userId: user?.id,
        displayName: input.display_name, provider: input.provider, role: input.role, isActive: true,
        joinedAt: member?.joined_at, grantsCount: 0, lastSeenAt: null, mustChangePassword: initialPassword !== undefined,
        loginName: input.provider_subject, ...(initialPassword === undefined ? {} : { initialPassword }) });
      if (!result.success) return fail("UPSTREAM_INVALID_RESPONSE");
      return result.data;
    }));
  }

  async resetPassword(rawAuth: unknown, rawIdentityId: unknown) {
    const auth = approve(rawAuth);
    if (typeof rawIdentityId !== "string" || !uuid.test(rawIdentityId)) return fail("INVALID_REQUEST");
    const identityId = rawIdentityId.toLowerCase();
    return boundary(() => inTransaction(this.pool, async client => {
      await governance(client, auth, true);
      const target = (await client.query("SELECT provider,is_active FROM auth_identities WHERE id=$1 FOR UPDATE", [identityId])).rows[0];
      if (!target) return fail("NOT_FOUND");
      if (target.provider !== "internal_test" || target.is_active !== true) return fail("CONFLICT");
      const initialPassword = password();
      await this.passwords.setPassword(identityId, initialPassword, auth.userId, client);
      const revoked = await client.query("UPDATE auth_sessions SET revoked_at=now() WHERE identity_id=$1 AND revoked_at IS NULL", [identityId]);
      const result = adminMemberResetPasswordDataSchema.safeParse({ identityId, initialPassword, sessionsRevoked: revoked.rowCount });
      if (!result.success) return fail("UPSTREAM_INVALID_RESPONSE");
      return result.data;
    }));
  }

  async read(rawAuth: unknown) {
    const auth = approve(rawAuth);
    return boundary(() => withSemanticReadSnapshot(this.pool, async client => {
      await governance(client, auth, false);
      const { rows } = await client.query(`SELECT m.identity_id,m.user_id,m.role,
        (m.is_active AND i.is_active AND u.is_active AND w.is_active) AS is_active,
        CASE WHEN octet_length(i.display_name)<=1024 THEN i.display_name END AS display_name,
        i.provider,to_char(m.created_at AT TIME ZONE 'Asia/Shanghai','YYYY-MM-DD') AS joined_at,
        (SELECT count(*)::text FROM account_access_grants g WHERE g.workspace_id=m.workspace_id
          AND g.identity_id=m.identity_id AND g.revoked_at IS NULL) AS grants_count,
        (SELECT max(s.last_seen_at) FROM auth_sessions s WHERE s.identity_id=i.id) AS last_seen_at,
        EXISTS(SELECT 1 FROM identity_passwords p WHERE p.identity_id=i.id AND NOT EXISTS(
          SELECT 1 FROM workspace_memberships own WHERE own.identity_id=i.id AND own.user_id=p.updated_by AND own.is_active=true)) AS must_change_password
        FROM auth_identities i JOIN workspace_memberships m ON m.identity_id=i.id
        JOIN workspaces w ON w.id=m.workspace_id AND w.kind='personal' AND w.is_demo=false
        JOIN users u ON u.id=m.user_id AND u.workspace_id=m.workspace_id
        WHERE i.provider IN ('internal_test','buc')
        ORDER BY m.created_at DESC,m.identity_id,m.workspace_id LIMIT 1001`);
      if (rows.length > 1000) return fail("SOURCE_TRUNCATED");
      const items = rows.map(row => {
        if (typeof row.grants_count !== "string" || !/^(0|[1-9][0-9]*)$/.test(row.grants_count)) return fail("UPSTREAM_INVALID_RESPONSE");
        if (row.last_seen_at !== null && (!(row.last_seen_at instanceof Date) || !Number.isFinite(row.last_seen_at.valueOf()))) return fail("UPSTREAM_INVALID_RESPONSE");
        return { identityId: row.identity_id, userId: row.user_id, role: row.role, isActive: row.is_active,
          displayName: row.display_name, provider: row.provider, joinedAt: row.joined_at,
          grantsCount: Number(row.grants_count), lastSeenAt: row.last_seen_at === null ? null : row.last_seen_at.toISOString(), mustChangePassword: row.must_change_password };
      });
      const result = adminMembersV195DataSchema.safeParse({ items });
      if (!result.success) return fail("UPSTREAM_INVALID_RESPONSE");
      return result.data;
    }));
  }
}
