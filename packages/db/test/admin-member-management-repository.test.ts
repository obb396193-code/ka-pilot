import { createHash, randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { ApprovedWorkspaceAuthContext } from "@ka/domain";
import { runMigrations } from "../src/migrate.js";
import { AuthSessionRepository } from "../src/auth-repository.js";
import { AdminMemberManagementRepository } from "../src/admin-member-management-repository.js";

const databaseUrl = process.env.TEST_DATABASE_URL ?? "";
const parsed = new URL(databaseUrl);
if (!["localhost", "127.0.0.1"].includes(parsed.hostname) || parsed.port !== "55432" || !/^\/ka_[a-z0-9_]+_test$/.test(parsed.pathname)) throw new Error("Isolated test DB required");
describe("P193 membership management real PG", { timeout: 30000 }, () => {
  const pool = new Pool({ connectionString: databaseUrl, max: 5 }), repo = new AdminMemberManagementRepository(pool);
  const personal = randomUUID(), other = randomUUID(), team = randomUUID(), identity = randomUUID(), otherIdentity = randomUUID();
  const actor = randomUUID(), teamActor = randomUUID(), otherActor = randomUUID(), otherTeamActor = randomUUID();
  const spaces = [personal, other, team], identities = [identity, otherIdentity], prefix = `p193-${randomUUID()}`;
  const auth: ApprovedWorkspaceAuthContext = { workspaceId: personal, userId: actor, role: "optimizer", workspaceKind: "personal", scope: { kind: "explicit_accounts", accounts: [] } };
  const teamAuth: ApprovedWorkspaceAuthContext = { workspaceId: team, userId: teamActor, role: "admin", workspaceKind: "team", scope: { kind: "team_workspace_readonly" } };
  const one = { media: "KUAISHOU", accountId: "same", accessLevel: "read" };
  const two = { ...one, media: "TENCENT", accessLevel: "preview" };
  const hash = () => createHash("sha256").update(randomUUID()).digest("hex");
  beforeAll(async () => {
    await runMigrations({ databaseUrl });
    for (const [space, kind] of [[personal, "personal"], [other, "personal"], [team, "team"]]) await pool.query("INSERT INTO workspaces(id,name,kind) VALUES($1,$2,$3)", [space, prefix, kind]);
    for (const id of identities) await pool.query("INSERT INTO auth_identities(id,provider,provider_subject,display_name) VALUES($1,'internal_test',$2,$2)", [id, `${prefix}-${id}`]);
    for (const [user, space, id, role] of [[actor, personal, identity, "optimizer"], [teamActor, team, identity, "admin"], [otherActor, other, otherIdentity, "optimizer"], [otherTeamActor, team, otherIdentity, "optimizer"]]) {
      await pool.query("INSERT INTO users(id,workspace_id,name,role) VALUES($1,$2,$3,$4)", [user, space, prefix, role]);
      await pool.query("INSERT INTO workspace_memberships(workspace_id,identity_id,user_id,role) VALUES($1,$2,$3,$4)", [space, id, user, role]);
    }
    for (const space of spaces) for (const media of ["KUAISHOU", "TENCENT"]) await pool.query("INSERT INTO accounts(workspace_id,media,account_id) VALUES($1,$2,'same')", [space, media]);
    await pool.query("INSERT INTO accounts(workspace_id,media,account_id) VALUES($1,'KUAISHOU','only-foreign')", [other]);
  });
  afterAll(async () => {
    vi.restoreAllMocks();
    try {
      const allIdentities = (await pool.query("SELECT id FROM auth_identities WHERE provider_subject LIKE $1", [`${prefix}%`])).rows.map(row => row.id);
      await pool.query("DELETE FROM audit_log WHERE workspace_id=ANY($1::uuid[])", [spaces]);
      await pool.query("DELETE FROM auth_sessions WHERE identity_id=ANY($1::uuid[])", [identities]);
      await pool.query("DELETE FROM account_access_grants WHERE workspace_id=ANY($1::uuid[])", [spaces]);
      await pool.query("DELETE FROM accounts WHERE workspace_id=ANY($1::uuid[])", [spaces]);
      await pool.query("DELETE FROM workspace_memberships WHERE workspace_id=ANY($1::uuid[])", [spaces]);
      await pool.query("DELETE FROM users WHERE workspace_id=ANY($1::uuid[])", [spaces]);
      await pool.query("DELETE FROM workspaces WHERE id=ANY($1::uuid[])", [spaces]);
      await pool.query("DELETE FROM auth_identities WHERE id=ANY($1::uuid[])", [allIdentities]);
    } finally { await pool.end(); }
  });
  it("lists global personal members and resolves the target personal workspace from either caller space", async () => {
    const result = await repo.read(auth);
    expect(result.workspaceId).toBe(personal); expect(result.data.items.map(x => x.identityId).sort()).toEqual([...identities].sort());
    expect((await repo.read(teamAuth)).data.items.map(x => x.identityId).sort()).toEqual([...identities].sort());
    expect(await repo.grants(auth, otherIdentity)).toMatchObject({ workspaceId: other, data: { identityId: otherIdentity, items: [] } });
    expect(await repo.grants(teamAuth, otherIdentity)).toMatchObject({ workspaceId: other, data: { identityId: otherIdentity, items: [] } });
  });
  it("replaces tuple grants atomically; empty set immediately narrows an existing session", async () => {
    const token = hash();
    await pool.query("INSERT INTO auth_sessions(identity_id,active_workspace_id,token_hash,expires_at) VALUES($1,$2,$3,now()+interval '1 hour')", [identity, personal, token]);
    const result = await repo.replaceGrants(auth, identity, { items: [one, two] });
    expect(result.data.items).toEqual([expect.objectContaining(one), expect.objectContaining(two)]);
    expect(result.data.items.every(x => /^\d{4}-\d{2}-\d{2}$/.test(x.grantedAt))).toBe(true);
    const sessions = new AuthSessionRepository(pool);
    expect(await sessions.resolveApprovedAuthContext(token, new Date())).toMatchObject({ status: "approved", context: { scope: { accounts: [one, two] } } });
    await repo.replaceGrants(auth, identity, { items: [] });
    expect(await sessions.resolveApprovedAuthContext(token, new Date())).toMatchObject({ status: "approved", context: { scope: { accounts: [] } } });
    expect((await pool.query("SELECT count(*) FROM account_access_grants WHERE workspace_id=$1 AND revoked_at IS NOT NULL", [personal])).rows[0].count).toBe("2");
  });
  it("rejects foreign/missing account before changes and never mutates another workspace", async () => {
    await repo.replaceGrants(auth, identity, { items: [one] });
    await expect(repo.replaceGrants(auth, identity, { items: [two, { ...one, accountId: "only-foreign" }] })).rejects.toMatchObject({ code: "INVALID_REQUEST" });
    expect((await repo.grants(auth, identity)).data.items).toEqual([expect.objectContaining(one)]);
    await repo.replaceGrants(auth, otherIdentity, { items: [one] });
    expect((await repo.grants(teamAuth, otherIdentity)).data.items).toEqual([expect.objectContaining(one)]);
    expect((await pool.query("SELECT media,account_id FROM account_access_grants WHERE workspace_id=$1 AND revoked_at IS NULL", [other])).rows).toEqual([{ media: one.media, account_id: one.accountId }]);
  });
  it("concurrent whole replacements never leave a union of the two requests", async () => {
    await Promise.all([repo.replaceGrants(auth, identity, { items: [one] }), repo.replaceGrants(auth, identity, { items: [two] })]);
    const rows = (await repo.grants(auth, identity)).data.items;
    expect(rows).toHaveLength(1); expect(["KUAISHOU", "TENCENT"]).toContain(rows[0]?.media);
  });
  it("patches target personal role, disables identity globally and never revives old tokens", async () => {
    const personalToken = hash(), teamToken = hash();
    for (const [space, token] of [[other, personalToken], [team, teamToken]]) await pool.query("INSERT INTO auth_sessions(identity_id,active_workspace_id,token_hash,expires_at) VALUES($1,$2,$3,now()+interval '1 hour')", [otherIdentity, space, token]);
    expect(await repo.patch(teamAuth, otherIdentity, { role: "lead" })).toMatchObject({ workspaceId: other, data: { identityId: otherIdentity, userId: otherActor, role: "lead" } });
    expect((await pool.query("SELECT role FROM users WHERE id=$1", [otherActor])).rows[0].role).toBe("lead");
    expect((await pool.query("SELECT role FROM users WHERE id=$1", [otherTeamActor])).rows[0].role).toBe("optimizer");
    expect(await repo.patch(teamAuth, otherIdentity, { is_active: false })).toMatchObject({ data: { isActive: false } });
    const sessions = new AuthSessionRepository(pool);
    expect(await sessions.resolveApprovedAuthContext(teamToken, new Date())).toMatchObject({ status: "rejected" });
    expect(await sessions.resolveApprovedAuthContext(personalToken, new Date())).toMatchObject({ status: "rejected" });
    expect((await pool.query("SELECT is_active FROM auth_identities WHERE id=$1", [otherIdentity])).rows[0].is_active).toBe(false);
    expect((await pool.query("SELECT role,is_active FROM workspace_memberships WHERE workspace_id=$1 AND identity_id=$2", [other, otherIdentity])).rows[0]).toEqual({ role: "lead", is_active: true });
    await repo.patch(teamAuth, otherIdentity, { role: "optimizer", is_active: true });
    expect(await sessions.resolveApprovedAuthContext(personalToken, new Date())).toMatchObject({ status: "rejected" });
    expect(await sessions.resolveApprovedAuthContext(teamToken, new Date())).toMatchObject({ status: "rejected" });
  });
  it("governance can write target personal grants from team but a personal admin alone is not governance", async () => {
    expect(await repo.replaceGrants(teamAuth, otherIdentity, { items: [two] })).toMatchObject({ workspaceId: other, data: { items: [expect.objectContaining(two)] } });
    expect((await pool.query("SELECT count(*) FROM account_access_grants WHERE workspace_id=$1", [team])).rows[0].count).toBe("0");
    await pool.query("UPDATE workspace_memberships SET is_active=false WHERE workspace_id=$1 AND identity_id=$2", [team, identity]);
    try { await expect(repo.replaceGrants(auth, identity, { items: [] })).rejects.toMatchObject({ code: "FORBIDDEN" }); }
    finally { await pool.query("UPDATE workspace_memberships SET is_active=true WHERE workspace_id=$1 AND identity_id=$2", [team, identity]); }
    await expect(repo.read({ ...auth, role: "admin" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it("audit write failure rolls back grant mutations and returns no SQL", async () => {
    await repo.replaceGrants(auth, identity, { items: [one] });
    const connect = pool.connect.bind(pool), spy = vi.spyOn(pool, "connect").mockImplementationOnce(async () => {
      const c = await connect(), query = c.query.bind(c);
      vi.spyOn(c, "query").mockImplementation((async (sql: string, values?: unknown[]) => {
        if (sql.includes("INSERT INTO audit_log")) throw new Error("synthetic private SQL");
        return query(sql, values);
      }) as typeof c.query); return c;
    });
    try { await expect(repo.replaceGrants(auth, identity, { items: [two] })).rejects.toThrow("Member provisioning: SOURCE_UNAVAILABLE"); }
    finally { spy.mockRestore(); vi.restoreAllMocks(); }
    expect((await repo.grants(auth, identity)).data.items).toEqual([expect.objectContaining(one)]);
  });
  it("malformed requests are rejected before any connection", async () => {
    const spy = vi.spyOn(pool, "connect");
    try {
      await expect(repo.patch(auth, identity, {})).rejects.toMatchObject({ code: "INVALID_REQUEST" });
      await expect(repo.patch(auth, "invalid", { role: "lead" })).rejects.toMatchObject({ code: "INVALID_REQUEST" });
      await expect(repo.replaceGrants(auth, identity, { items: [one, one] })).rejects.toMatchObject({ code: "INVALID_REQUEST" });
      await expect(repo.read({ ...auth, scope: { kind: "team_workspace_readonly" } })).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(repo.read({ ...auth, role: "viewer" })).rejects.toMatchObject({ code: "FORBIDDEN" });
      expect(spy).not.toHaveBeenCalled();
    } finally { spy.mockRestore(); }
  });
  it("oversized stored metadata fails closed and the audit contains no password/token fields", async () => {
    await pool.query("UPDATE auth_identities SET display_name=$2 WHERE id=$1", [identity, "x".repeat(5000)]);
    try { await expect(repo.read(auth)).rejects.toMatchObject({ code: "UPSTREAM_INVALID_RESPONSE" }); }
    finally { await pool.query("UPDATE auth_identities SET display_name=$2 WHERE id=$1", [identity, prefix]); }
    const rows = (await pool.query("SELECT detail FROM audit_log WHERE workspace_id=ANY($1::uuid[])", [spaces])).rows;
    expect(rows.length).toBeGreaterThan(0);
    expect(JSON.stringify(rows)).not.toMatch(/password|token|provider_subject|qihang|secret/);
  });
  it("target tuple scope is not taken from the administrator's accounts", async () => {
    await pool.query("INSERT INTO accounts(workspace_id,media,account_id) VALUES($1,'KUAISHOU','admin-only')", [personal]);
    await repo.replaceGrants(teamAuth, otherIdentity, { items: [one, two] });
    await expect(repo.replaceGrants(auth, otherIdentity, { items: [{ ...one, accountId: "admin-only" }] })).rejects.toMatchObject({ code: "INVALID_REQUEST" });
    expect((await repo.grants(auth, otherIdentity)).data.items).toEqual([expect.objectContaining(one), expect.objectContaining(two)]);
    const audits = (await pool.query("SELECT workspace_id,user_id,detail FROM audit_log WHERE object_id=$1 AND action='member.grants.replace' ORDER BY id DESC LIMIT 1", [otherIdentity])).rows;
    expect(audits[0]).toMatchObject({ workspace_id: team, user_id: teamActor, detail: {
      actorIdentityId: identity, targetIdentityId: otherIdentity, targetWorkspaceId: other,
    } });
  });
  it("revoking another identity's grant narrows that identity's existing session", async () => {
    const token = hash(), sessions = new AuthSessionRepository(pool);
    await pool.query("INSERT INTO auth_sessions(identity_id,active_workspace_id,token_hash,expires_at) VALUES($1,$2,$3,now()+interval '1 hour')", [otherIdentity, other, token]);
    await repo.replaceGrants(teamAuth, otherIdentity, { items: [one, two] });
    expect(await sessions.resolveApprovedAuthContext(token, new Date())).toMatchObject({ status: "approved", context: { workspaceId: other, scope: { accounts: [one, two] } } });
    await repo.replaceGrants(auth, otherIdentity, { items: [two] });
    expect(await sessions.resolveApprovedAuthContext(token, new Date())).toMatchObject({ status: "approved", context: { workspaceId: other, scope: { accounts: [two] } } });
  });
  it("whole replacements serialize across distinct caller workspaces", async () => {
    await Promise.all([repo.replaceGrants(auth, otherIdentity, { items: [one] }), repo.replaceGrants(teamAuth, otherIdentity, { items: [two] })]);
    const result = (await repo.grants(auth, otherIdentity)).data.items;
    expect(result).toHaveLength(1);
    expect(["KUAISHOU", "TENCENT"]).toContain(result[0]?.media);
  });
  it("missing/inactive target personal workspace never falls back to caller", async () => {
    await expect(repo.patch(auth, randomUUID(), { is_active: false })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await pool.query("UPDATE workspaces SET is_active=false WHERE id=$1", [other]);
    try {
      await expect(repo.grants(auth, otherIdentity)).rejects.toMatchObject({ code: "NOT_FOUND" });
      await expect(repo.patch(auth, otherIdentity, { is_active: false })).rejects.toMatchObject({ code: "NOT_FOUND" });
      expect((await pool.query("SELECT is_active FROM auth_identities WHERE id=$1", [otherIdentity])).rows[0].is_active).toBe(true);
    } finally { await pool.query("UPDATE workspaces SET is_active=true WHERE id=$1", [other]); }
  });
  it("ambiguous active personal workspaces reject both reads and writes", async () => {
    const extraSpace = randomUUID(), extraUser = randomUUID();
    spaces.push(extraSpace);
    await pool.query("INSERT INTO workspaces(id,name,kind) VALUES($1,$2,'personal')", [extraSpace, prefix]);
    await pool.query("INSERT INTO users(id,workspace_id,name,role) VALUES($1,$2,$3,'optimizer')", [extraUser, extraSpace, prefix]);
    await pool.query("INSERT INTO workspace_memberships(workspace_id,identity_id,user_id,role) VALUES($1,$2,$3,'optimizer')", [extraSpace, otherIdentity, extraUser]);
    try {
      await expect(repo.grants(teamAuth, otherIdentity)).rejects.toMatchObject({ code: "CONFLICT" });
      await expect(repo.replaceGrants(auth, otherIdentity, { items: [] })).rejects.toMatchObject({ code: "CONFLICT" });
    } finally { await pool.query("DELETE FROM workspace_memberships WHERE workspace_id=$1", [extraSpace]); }
  });
  it("a shared personal workspace is not an administratively authorized target", async () => {
    const extraUser = randomUUID();
    await pool.query("INSERT INTO users(id,workspace_id,name,role) VALUES($1,$2,$3,'optimizer')", [extraUser, other, prefix]);
    await pool.query("INSERT INTO workspace_memberships(workspace_id,identity_id,user_id,role) VALUES($1,$2,$3,'optimizer')", [other, identity, extraUser]);
    try { await expect(repo.replaceGrants(teamAuth, otherIdentity, { items: [] })).rejects.toMatchObject({ code: "CONFLICT" }); }
    finally { await pool.query("DELETE FROM workspace_memberships WHERE workspace_id=$1 AND identity_id=$2", [other, identity]); }
  });
  it("audit failure rolls back identity disable and all session revocations", async () => {
    const token = hash();
    await pool.query("INSERT INTO auth_sessions(identity_id,active_workspace_id,token_hash,expires_at) VALUES($1,$2,$3,now()+interval '1 hour')", [otherIdentity, team, token]);
    const connect = pool.connect.bind(pool), spy = vi.spyOn(pool, "connect").mockImplementationOnce(async () => {
      const c = await connect(), query = c.query.bind(c);
      vi.spyOn(c, "query").mockImplementation((async (sql: string, values?: unknown[]) => {
        if (sql.includes("INSERT INTO audit_log")) throw new Error("private audit failure");
        return query(sql, values);
      }) as typeof c.query); return c;
    });
    try { await expect(repo.patch(teamAuth, otherIdentity, { is_active: false })).rejects.toMatchObject({ code: "SOURCE_UNAVAILABLE" }); }
    finally { spy.mockRestore(); vi.restoreAllMocks(); }
    expect((await pool.query("SELECT is_active FROM auth_identities WHERE id=$1", [otherIdentity])).rows[0].is_active).toBe(true);
    expect((await pool.query("SELECT revoked_at FROM auth_sessions WHERE token_hash=$1", [token])).rows[0].revoked_at).toBeNull();
  });
  it("1001st global personal member is an actual PG overflow sentinel from either caller space", async () => {
    await pool.query(`WITH fresh AS MATERIALIZED (SELECT gen_random_uuid() iid,gen_random_uuid() uid,n FROM generate_series(1,1001) n),
      ids AS (INSERT INTO auth_identities(id,provider,provider_subject,display_name) SELECT iid,'internal_test',$2||'-bulk-'||n,$2 FROM fresh RETURNING id),
      actors AS (INSERT INTO users(id,workspace_id,name,role) SELECT uid,$1,$2,'optimizer' FROM fresh RETURNING id)
      INSERT INTO workspace_memberships(workspace_id,identity_id,user_id,role)
      SELECT $1,f.iid,f.uid,'optimizer' FROM fresh f JOIN ids i ON i.id=f.iid JOIN actors a ON a.id=f.uid`, [other, prefix]);
    await expect(repo.read(teamAuth)).rejects.toMatchObject({ code: "SOURCE_TRUNCATED" });
    await expect(repo.read(auth)).rejects.toMatchObject({ code: "SOURCE_TRUNCATED" });
  });
});
