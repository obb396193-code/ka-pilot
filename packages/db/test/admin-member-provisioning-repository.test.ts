import { createHash, randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { ApprovedWorkspaceAuthContext } from "@ka/domain";
import { runMigrations } from "../src/migrate.js";
import { IdentityPasswordRepository } from "../src/identity-password-repository.js";
import { AdminMemberProvisioningRepository } from "../src/admin-member-provisioning-repository.js";

const databaseUrl = process.env.TEST_DATABASE_URL ?? "";
const dbUrl = new URL(databaseUrl);
if (!["localhost", "127.0.0.1"].includes(dbUrl.hostname) || dbUrl.port !== "55432" || !/^\/ka_[a-z0-9_]+_test$/.test(dbUrl.pathname)) throw new Error("Explicit isolated test DB required");

describe("global admin provisioning / real PG", { timeout: 30000 }, () => {
  const pool = new Pool({ connectionString: databaseUrl, max: 4 });
  const repo = new AdminMemberProvisioningRepository(pool), passwords = new IdentityPasswordRepository(pool);
  const prefix = `p210-${randomUUID()}`, personal = randomUUID(), team = randomUUID(), actor = randomUUID(), teamActor = randomUUID(), identity = randomUUID();
  const auth: ApprovedWorkspaceAuthContext = { workspaceId: personal, userId: actor, role: "optimizer", workspaceKind: "personal", scope: { kind: "explicit_accounts", accounts: [] } };
  const request = (suffix = randomUUID()) => ({ display_name: `${prefix}-${suffix}`, provider: "internal_test", provider_subject: `${prefix}-${suffix}`, role: "optimizer" });
  const hash = (s: string) => createHash("sha256").update(s).digest("hex");
  const passwordOf = (value: Awaited<ReturnType<typeof repo.create>>): string => {
    if (value.provider !== "internal_test") throw new Error("Expected synthetic internal-test member");
    return value.initialPassword;
  };
  beforeAll(async () => {
    await runMigrations({ databaseUrl });
    await pool.query("INSERT INTO workspaces(id,name,kind) VALUES($1,$3,'personal'),($2,$3,'team')", [personal, team, prefix]);
    await pool.query("INSERT INTO users(id,workspace_id,name,role) VALUES($1,$2,$5,'optimizer'),($3,$4,$5,'admin')", [actor, personal, teamActor, team, prefix]);
    await pool.query("INSERT INTO auth_identities(id,provider,provider_subject,display_name) VALUES($1,'internal_test',$2,$2)", [identity, prefix]);
    await pool.query("INSERT INTO workspace_memberships(workspace_id,identity_id,user_id,role) VALUES($1,$3,$4,'optimizer'),($2,$3,$5,'admin')", [personal, team, identity, actor, teamActor]);
  });
  afterAll(async () => {
    vi.restoreAllMocks();
    try {
      const ids = (await pool.query("SELECT id FROM auth_identities WHERE provider_subject LIKE $1", [`${prefix}%`])).rows.map(r => r.id);
      const spaces = (await pool.query("SELECT workspace_id FROM workspace_memberships WHERE identity_id=ANY($1::uuid[])", [ids])).rows.map(r => r.workspace_id);
      await pool.query("DELETE FROM auth_sessions WHERE identity_id=ANY($1::uuid[])", [ids]);
      await pool.query("DELETE FROM identity_passwords WHERE identity_id=ANY($1::uuid[])", [ids]);
      await pool.query("DELETE FROM account_access_grants WHERE identity_id=ANY($1::uuid[])", [ids]);
      await pool.query("DELETE FROM accounts WHERE workspace_id=ANY($1::uuid[])", [spaces]);
      await pool.query("DELETE FROM workspace_memberships WHERE identity_id=ANY($1::uuid[])", [ids]);
      await pool.query("DELETE FROM users WHERE workspace_id=ANY($1::uuid[])", [spaces]);
      await pool.query("DELETE FROM workspaces WHERE id=ANY($1::uuid[])", [spaces]);
      await pool.query("DELETE FROM auth_identities WHERE id=ANY($1::uuid[])", [ids]);
    } finally { await pool.end(); }
  });
  it("uses any active team admin membership, not current personal role, and provisions an independent personal workspace", async () => {
    const input = request(), result = await repo.create(auth, input);
    expect(result).toMatchObject({ loginName: input.provider_subject, role: "optimizer", mustChangePassword: true, grantsCount: 0, lastSeenAt: null, isActive: true });
    expect(passwordOf(result)).toHaveLength(16);
    expect(await passwords.verify(result.identityId, passwordOf(result))).toBe(true);
    const rows = (await pool.query(`SELECT m.workspace_id,m.user_id,w.kind,u.qihang_user_id,u.multica_pat_ref
      FROM workspace_memberships m JOIN workspaces w ON w.id=m.workspace_id JOIN users u ON u.id=m.user_id WHERE m.identity_id=$1`, [result.identityId])).rows;
    expect(rows).toHaveLength(1); expect(rows[0]).toMatchObject({ kind: "personal", user_id: result.userId, qihang_user_id: null, multica_pat_ref: null });
    expect([personal, team]).not.toContain(rows[0].workspace_id);
    const stored = await passwords.find(result.identityId);
    expect(stored?.passwordScrypt).not.toBe(passwordOf(result)); expect(await passwords.mustChangePassword(result.identityId)).toBe(true);
  });
  it("honors supplied password; BUC creates no password row or password response", async () => {
    const given = "synthetic-p210-initial-password";
    const result = await repo.create(auth, { ...request(), initial_password: given });
    expect(passwordOf(result)).toBe(given); expect(await passwords.verify(result.identityId, given)).toBe(true);
    const buc = await repo.create(auth, { ...request(), provider: "buc" });
    expect(buc).not.toHaveProperty("initialPassword"); expect(await passwords.find(buc.identityId)).toBeNull();
    await expect(repo.resetPassword(auth, buc.identityId)).rejects.toMatchObject({ code: "CONFLICT" });
  });
  it("concurrent duplicate requests create exactly one identity/workspace, returning conflict to the loser", async () => {
    const input = request(), results = await Promise.allSettled([repo.create(auth, input), repo.create(auth, input)]);
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
    expect(results.find(r => r.status === "rejected")).toMatchObject({ reason: { code: "CONFLICT" } });
    const count = (await pool.query("SELECT count(*) FROM auth_identities WHERE provider_subject=$1", [input.provider_subject])).rows[0].count;
    expect(count).toBe("1");
    await expect(repo.create(auth, input)).rejects.toMatchObject({ code: "CONFLICT" });
  });
  it("duplicate provider_subject is a conflict even across the two supported providers", async () => {
    const input = request();
    const results = await Promise.allSettled([repo.create(auth, input), repo.create(auth, { ...input, provider: "buc" })]);
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
    expect(results.find(r => r.status === "rejected")).toMatchObject({ reason: { code: "CONFLICT" } });
  });
  it.each([
    ["workspace_memberships", "workspace_id", team], ["workspaces", "id", team], ["users", "id", teamActor],
    ["auth_identities", "id", identity], ["users", "id", actor], ["workspace_memberships", "workspace_id", personal],
  ])("revoked %s %s denies creation without writing", async (table, key, id) => {
    await pool.query(`UPDATE ${table} SET is_active=false WHERE ${key}=$1`, [id]);
    try { await expect(repo.create(auth, request())).rejects.toMatchObject({ code: "FORBIDDEN" }); }
    finally { await pool.query(`UPDATE ${table} SET is_active=true WHERE ${key}=$1`, [id]); }
  });
  it("personal admin alone or forged current role/workspace never grants global power", async () => {
    await pool.query("UPDATE workspace_memberships SET role='optimizer' WHERE workspace_id=$1", [team]);
    try {
      await expect(repo.create(auth, request())).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(repo.create({ ...auth, role: "admin" }, request())).rejects.toMatchObject({ code: "FORBIDDEN" });
      await pool.query("UPDATE workspace_memberships SET role='admin' WHERE workspace_id=$1", [personal]);
      await pool.query("UPDATE users SET role='admin' WHERE id=$1", [actor]);
      await expect(repo.create({ ...auth, role: "admin" }, request())).rejects.toMatchObject({ code: "FORBIDDEN" });
    } finally {
      await pool.query("UPDATE workspace_memberships SET role='admin' WHERE workspace_id=$1", [team]);
      await pool.query("UPDATE workspace_memberships SET role='optimizer' WHERE workspace_id=$1", [personal]);
      await pool.query("UPDATE users SET role='optimizer' WHERE id=$1", [actor]);
    }
    await expect(repo.create({ ...auth, workspaceId: randomUUID() }, request())).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it("invalid input is rejected before IO", async () => {
    const spy = vi.spyOn(pool, "connect");
    try {
      await expect(repo.create(auth, { ...request(), initial_password: "short" })).rejects.toMatchObject({ code: "INVALID_REQUEST" });
      await expect(repo.resetPassword(auth, "invalid")).rejects.toMatchObject({ code: "INVALID_REQUEST" });
      await expect(repo.create({ ...auth, arbitrary: "scope" }, request())).rejects.toMatchObject({ code: "FORBIDDEN" });
      expect(spy).not.toHaveBeenCalled();
    } finally { spy.mockRestore(); }
  });
  it("password failure rolls back identity, actor and workspace rather than leaving an unusable member", async () => {
    const input = request(), before = (await pool.query("SELECT count(*) FROM workspaces")).rows[0].count;
    const spy = vi.spyOn(IdentityPasswordRepository.prototype, "setPassword").mockRejectedValueOnce(new Error("synthetic secret SQL"));
    try { await expect(repo.create(auth, input)).rejects.toThrow("Member provisioning: SOURCE_UNAVAILABLE"); }
    finally { spy.mockRestore(); }
    expect((await pool.query("SELECT count(*) FROM auth_identities WHERE provider_subject=$1", [input.provider_subject])).rows[0].count).toBe("0");
    expect((await pool.query("SELECT count(*) FROM workspaces")).rows[0].count).toBe(before);
  });
  it("reset changes the password and revokes all sessions in the same transaction", async () => {
    const created = await repo.create(auth, request());
    const ws = (await pool.query("SELECT workspace_id FROM workspace_memberships WHERE identity_id=$1", [created.identityId])).rows[0].workspace_id;
    for (let i = 0; i < 2; i++) await pool.query("INSERT INTO auth_sessions(identity_id,active_workspace_id,token_hash,expires_at) VALUES($1,$2,$3,now()+interval '1 hour')", [created.identityId, ws, hash(randomUUID())]);
    const result = await repo.resetPassword(auth, created.identityId);
    expect(result).toMatchObject({ identityId: created.identityId, sessionsRevoked: 2 }); expect(result.initialPassword).toHaveLength(16);
    expect(await passwords.verify(created.identityId, passwordOf(created))).toBe(false);
    expect(await passwords.verify(created.identityId, result.initialPassword)).toBe(true);
    expect((await pool.query("SELECT count(*) FROM auth_sessions WHERE identity_id=$1 AND revoked_at IS NULL", [created.identityId])).rows[0].count).toBe("0");
    await expect(repo.resetPassword(auth, randomUUID())).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
  it("a failure after the password write rolls back both reset and session revocation", async () => {
    const created = await repo.create(auth, request());
    const ws = (await pool.query("SELECT workspace_id FROM workspace_memberships WHERE identity_id=$1", [created.identityId])).rows[0].workspace_id;
    await pool.query("INSERT INTO auth_sessions(identity_id,active_workspace_id,token_hash,expires_at) VALUES($1,$2,$3,now()+interval '1 hour')", [created.identityId, ws, hash(randomUUID())]);
    const connect = pool.connect.bind(pool);
    const spy = vi.spyOn(pool, "connect").mockImplementationOnce(async () => {
      const client = await connect(), query = client.query.bind(client);
      vi.spyOn(client, "query").mockImplementation((async (sql: string, params?: unknown[]) => {
        if (sql.startsWith("UPDATE auth_sessions SET revoked_at")) throw new Error("synthetic failure after password write");
        return query(sql, params);
      }) as typeof client.query);
      return client;
    });
    try { await expect(repo.resetPassword(auth, created.identityId)).rejects.toThrow("Member provisioning: SOURCE_UNAVAILABLE"); }
    finally { spy.mockRestore(); vi.restoreAllMocks(); }
    expect(await passwords.verify(created.identityId, passwordOf(created))).toBe(true);
    expect((await pool.query("SELECT count(*) FROM auth_sessions WHERE identity_id=$1 AND revoked_at IS NULL", [created.identityId])).rows[0].count).toBe("1");
  });
  it("global read includes independent personal members, excludes team grants, and never selects password values", async () => {
    const member = await repo.create(auth, request());
    const ws = (await pool.query("SELECT workspace_id FROM workspace_memberships WHERE identity_id=$1", [member.identityId])).rows[0].workspace_id;
    await pool.query("INSERT INTO accounts(workspace_id,media,account_id) VALUES($1,'KUAISHOU','same'),($1,'TENCENT','same'),($2,'KUAISHOU','same')", [ws, team]);
    await pool.query("INSERT INTO account_access_grants(workspace_id,identity_id,media,account_id) VALUES($1,$2,'KUAISHOU','same'),($1,$2,'TENCENT','same'),($3,$4,'KUAISHOU','same')", [ws, member.identityId, team, identity]);
    const result = await repo.read(auth), row = result.items.find(x => x.identityId === member.identityId);
    expect(row).toMatchObject({ userId: member.userId, grantsCount: 2, mustChangePassword: true });
    expect(result.items.find(x => x.identityId === identity)?.grantsCount).toBe(0);
    expect(JSON.stringify(result)).not.toMatch(/initialPassword|passwordSalt|password_scrypt|token_hash|provider_subject/);
    await passwords.setPassword(member.identityId, "synthetic-self-changed-password", member.userId);
    expect((await repo.read(auth)).items.find(x => x.identityId === member.identityId)?.mustChangePassword).toBe(false);
    await pool.query("UPDATE auth_identities SET is_active=false WHERE id=$1", [member.identityId]);
    expect((await repo.read(auth)).items.find(x => x.identityId === member.identityId)?.isActive).toBe(false);
  });
  it("reset and list require the same live global governance entitlement", async () => {
    const member = await repo.create(auth, request());
    await pool.query("UPDATE workspace_memberships SET is_active=false WHERE workspace_id=$1", [team]);
    try {
      await expect(repo.resetPassword(auth, member.identityId)).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(repo.read(auth)).rejects.toMatchObject({ code: "FORBIDDEN" });
      expect(await passwords.verify(member.identityId, passwordOf(member))).toBe(true);
    } finally { await pool.query("UPDATE workspace_memberships SET is_active=true WHERE workspace_id=$1", [team]); }
  });
  it("provisioned password works with existing self-change; only the current session remains valid", async () => {
    const created = await repo.create(auth, request()), original = passwordOf(created);
    const ws = (await pool.query("SELECT workspace_id FROM workspace_memberships WHERE identity_id=$1", [created.identityId])).rows[0].workspace_id;
    const self: ApprovedWorkspaceAuthContext = { ...auth, workspaceId: ws, userId: created.userId };
    const currentHash = hash(randomUUID()), otherHash = hash(randomUUID());
    for (const token of [currentHash, otherHash]) await pool.query("INSERT INTO auth_sessions(identity_id,active_workspace_id,token_hash,expires_at) VALUES($1,$2,$3,now()+interval '1 hour')", [created.identityId, ws, token]);
    const next = "synthetic-p210-user-changed-password";
    for (const newPassword of ["short", original]) await expect(passwords.change(self, created.identityId, currentHash, { currentPassword: original, newPassword }, null)).rejects.toMatchObject({ code: "INVALID_INPUT" });
    await expect(passwords.change(self, created.identityId, currentHash, { currentPassword: "wrong-password", newPassword: next }, null)).rejects.toMatchObject({ code: "INVALID_CREDENTIALS" });
    expect(await passwords.change(self, created.identityId, currentHash, { currentPassword: original, newPassword: next }, null)).toMatchObject({ otherSessionsRevoked: 1 });
    expect(await passwords.verify(created.identityId, original)).toBe(false); expect(await passwords.verify(created.identityId, next)).toBe(true);
    expect(await passwords.mustChangePassword(created.identityId)).toBe(false);
    expect((await pool.query("SELECT token_hash FROM auth_sessions WHERE identity_id=$1 AND revoked_at IS NULL", [created.identityId])).rows.map(r => r.token_hash)).toEqual([currentHash]);
  });
  it("uses the 1001st row as overflow sentinel, not an unbounded global list", async () => {
    await pool.query(`WITH fresh AS MATERIALIZED (SELECT gen_random_uuid() iid,gen_random_uuid() uid,gen_random_uuid() wid,n FROM generate_series(1,1001) n),
      identities AS (INSERT INTO auth_identities(id,provider,provider_subject,display_name) SELECT iid,'internal_test',$1||'-bulk-'||n,$1 FROM fresh RETURNING id),
      spaces AS (INSERT INTO workspaces(id,name,kind) SELECT wid,$1,'personal' FROM fresh RETURNING id),
      actors AS (INSERT INTO users(id,workspace_id,name) SELECT f.uid,s.id,$1 FROM fresh f JOIN spaces s ON s.id=f.wid RETURNING id)
      INSERT INTO workspace_memberships(workspace_id,identity_id,user_id,role)
      SELECT f.wid,i.id,a.id,'optimizer' FROM fresh f JOIN identities i ON i.id=f.iid JOIN actors a ON a.id=f.uid`, [prefix]);
    await expect(repo.read(auth)).rejects.toMatchObject({ code: "SOURCE_TRUNCATED" });
  });
});
