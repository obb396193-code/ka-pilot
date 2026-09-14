import { randomUUID } from "node:crypto";
import type { Server } from "node:http";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { AdminMemberManagementRepository, AdminMemberProvisioningRepository, AuthSessionRepository, runMigrations } from "@ka/db";
import { AdminMembersService } from "../src/admin/members-service.js";
import { createDataApiServer, type DataApiServerOptions } from "../src/data/http-server.js";
import { SessionAuthService } from "../src/auth/session-auth-service.js";
const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl) throw new Error("Explicit dedicated TEST_DATABASE_URL required");
const db = new URL(databaseUrl);
if (!["localhost", "127.0.0.1", "[::1]"].includes(db.hostname) || db.port !== "55432" || !/^\/ka_[a-z0-9_]*_test$/.test(db.pathname)) throw new Error("Dedicated local ka_*_test required");

/**
 * v1.9.46 ①：成员治理按 identity 定位。授权读写作用于**目标身份自己的 active personal 空间**（服务端解析），
 * 与调用方当前在哪个空间无关；治理权 = 任一有效 team 空间的 admin（实时校验），本地会话角色不算数；
 * 停用是身份级，撤该身份全部会话。真实 Session + HTTP + PG。
 */
describe("admin member governance real HTTP Session PG (v1.9.46)", { timeout: 30_000 }, () => {
  const pool = new Pool({ connectionString: databaseUrl, max: 3 });
  const personal = randomUUID(), team = randomUUID(), foreign = randomUUID(), user = randomUUID(), teamUser = randomUUID(), foreignUser = randomUUID(), identity = randomUUID(), outsider = randomUUID();
  const internalToken = "synthetic-member-service-token-long-enough";
  const sessions = new SessionAuthService(new AuthSessionRepository(pool));
  const management = new AdminMemberManagementRepository(pool), grantsRead = vi.spyOn(management, "grants");
  const scope = [personal, team, foreign];
  let server: Server, origin: string;
  beforeAll(async () => {
    await runMigrations({ databaseUrl });
    await pool.query("INSERT INTO workspaces(id,name,kind) VALUES($1,'synthetic members','personal'),($2,'synthetic members','team'),($3,'synthetic foreign','personal')", [personal, team, foreign]);
    await pool.query("INSERT INTO users(id,workspace_id,name,role) VALUES($1,$2,'synthetic','admin'),($3,$4,'synthetic','admin'),($5,$6,'synthetic','admin')", [user, personal, teamUser, team, foreignUser, foreign]);
    for (const id of [identity, outsider]) await pool.query("INSERT INTO auth_identities(id,provider,provider_subject,display_name) VALUES($1::uuid,'internal_test',$1::text,'synthetic')", [id]);
    await pool.query("INSERT INTO workspace_memberships(workspace_id,user_id,identity_id,role) VALUES($1,$2,$7,'admin'),($3,$4,$7,'admin'),($5,$6,$8,'admin')", [personal, user, team, teamUser, foreign, foreignUser, identity, outsider]);
    await pool.query("INSERT INTO accounts(workspace_id,media,account_id) VALUES($1,'KUAISHOU','same'),($1,'TENCENT','same'),($2,'KUAISHOU','same'),($3,'KUAISHOU','same'),($3,'KUAISHOU','only-foreign')", [personal, team, foreign]);
    await pool.query("INSERT INTO account_access_grants(workspace_id,identity_id,media,account_id,access_level) VALUES($1,$4,'KUAISHOU','same','execute'),($1,$4,'TENCENT','same','read'),($2,$4,'KUAISHOU','same','execute'),($3,$5,'KUAISHOU','same','preview')", [personal, team, foreign, identity, outsider]);
    const unused = new Proxy({}, { get() { throw new Error("Unexpected unrelated service"); } });
    server = createDataApiServer({ service: unused, detailService: unused, taskListService: unused, accountListService: unused, workItemListService: unused,
      internalToken, sessionAuthService: sessions, adminMembersService: new AdminMembersService(undefined, new AdminMemberProvisioningRepository(pool), management),
    } as unknown as DataApiServerOptions);
    await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
    const address = server.address(); if (!address || typeof address === "string") throw new Error("No listener"); origin = `http://127.0.0.1:${address.port}`;
  }, 30000);
  afterAll(async () => {
    if (server?.listening) { server.closeAllConnections(); await new Promise<void>((resolve, reject) => server.close(e => e ? reject(e) : resolve())); }
    try {
      await pool.query("DELETE FROM audit_log WHERE workspace_id=ANY($1::uuid[])", [scope]);
      await pool.query("DELETE FROM auth_sessions WHERE identity_id=ANY($1::uuid[]) OR active_workspace_id=ANY($2::uuid[])", [[identity, outsider], scope]);
      await pool.query("DELETE FROM account_access_grants WHERE workspace_id=ANY($1::uuid[])", [scope]);
      await pool.query("DELETE FROM accounts WHERE workspace_id=ANY($1::uuid[])", [scope]);
      const ids = (await pool.query("DELETE FROM workspace_memberships WHERE workspace_id=ANY($1::uuid[]) RETURNING identity_id", [scope])).rows.map(r => r.identity_id);
      await pool.query("DELETE FROM users WHERE workspace_id=ANY($1::uuid[])", [scope]);
      await pool.query("DELETE FROM workspaces WHERE id=ANY($1::uuid[])", [scope]);
      await pool.query("DELETE FROM auth_identities WHERE id=ANY($1::uuid[])", [ids]);
    } finally { await pool.end(); }
  });
  async function issue(identityId = identity) {
    const token = randomUUID() + randomUUID();
    expect((await sessions.issueForIdentity({ identityId, token, expiresAt: new Date(Date.now() + 300000) })).status).toBe("approved");
    return token;
  }
  async function call(token: string | undefined, path = "", method = "GET", body?: unknown) {
    const response = await fetch(`${origin}/api/v1/admin/members${path}`, { method, headers: { authorization: `Bearer ${internalToken}`,
      ...(token ? { cookie: `ka_session=${token}` } : {}), "x-request-id": "pg-members", "x-ka-workspace-id": foreign, "x-ka-role": "admin",
      ...(body === undefined ? {} : { "content-type": "application/json" }) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    return { status: response.status, body: await response.json() };
  }
  const tuples = (items: { media: string; accountId: string; accessLevel: string }[]) => items.map(r => [r.media, r.accountId, r.accessLevel]);

  it("lists members globally and reads grants of the target identity's own personal workspace; no secret columns", async () => {
    const token = await issue(), members = await call(token); expect(members.status).toBe(200);
    expect(members.body.data.items.find((row: { identityId: string }) => row.identityId === identity)).toMatchObject({ identityId: identity, userId: user, grantsCount: 2 });
    expect(members.body.data.items.some((row: { identityId: string }) => row.identityId === outsider)).toBe(true);
    expect(JSON.stringify(members.body)).not.toMatch(/provider_subject|token_hash|qihang|secret_ref/); expect(members.body.meta.dataAsOf).toBeNull();
    const grants = await call(token, `/${identity}/grants`); expect(grants.status).toBe(200);
    expect(tuples(grants.body.data.items)).toEqual([["KUAISHOU", "same", "execute"], ["TENCENT", "same", "read"]]);
    // 原来（v1.9.44）这里是 404：outsider 不在调用方空间。v1.9.46 起按 identity 解析到它自己的个人空间。
    const other = await call(token, `/${outsider}/grants`); expect(other.status).toBe(200);
    expect(tuples(other.body.data.items)).toEqual([["KUAISHOU", "same", "preview"]]);
  });

  it("the caller's current space never changes the target; old and revoked tokens stop before the repository", async () => {
    const token = await issue(), nextToken = randomUUID() + randomUUID();
    expect((await sessions.switchWorkspace({ token, nextToken, targetWorkspaceId: team, expiresAt: new Date(Date.now() + 300000) })).status).toBe("approved");
    // 从团队空间看同一个人：仍是他个人空间的两条，团队空间里的遗留授权不会冒出来。
    expect(tuples((await call(nextToken, `/${identity}/grants`)).body.data.items)).toEqual([["KUAISHOU", "same", "execute"], ["TENCENT", "same", "read"]]);
    grantsRead.mockClear(); expect((await call(token, `/${identity}/grants`)).status).toBe(401); expect((await call(undefined)).status).toBe(401); expect(grantsRead).not.toHaveBeenCalled();
    await sessions.logout(nextToken); expect((await call(nextToken, `/${identity}/grants`)).status).toBe(401); expect(grantsRead).not.toHaveBeenCalled();
  });

  it.each(["optimizer", "operator", "lead"])("a team admin keeps governance from a personal %s session", async role => {
    await pool.query("UPDATE workspace_memberships SET role=$2 WHERE workspace_id=$1", [personal, role]);
    await pool.query("UPDATE users SET role=$2 WHERE workspace_id=$1", [personal, role]);
    try {
      const token = await issue();
      expect((await call(token)).status).toBe(200); expect((await call(token, `/${identity}/grants`)).status).toBe(200);
    } finally {
      await pool.query("UPDATE workspace_memberships SET role='admin' WHERE workspace_id=$1", [personal]);
      await pool.query("UPDATE users SET role='admin' WHERE workspace_id=$1", [personal]);
    }
  });

  it("without an active team admin role there is no governance at all", async () => {
    await pool.query("UPDATE workspace_memberships SET role='optimizer' WHERE workspace_id=$1", [team]);
    try {
      const token = await issue();
      for (const [path, method, body] of [["", "GET"], [`/${identity}/grants`, "GET"], [`/${outsider}`, "PATCH", { role: "lead" }],
        [`/${outsider}/grants`, "PUT", { items: [] }]] as const) expect((await call(token, path, method, body)).status, `${method} ${path}`).toBe(403);
    } finally { await pool.query("UPDATE workspace_memberships SET role='admin' WHERE workspace_id=$1", [team]); }
    // 被拒的两条命令一行都没写。
    expect((await pool.query("SELECT role FROM workspace_memberships WHERE identity_id=$1", [outsider])).rows).toEqual([{ role: "admin" }]);
    expect((await pool.query("SELECT count(*)::int AS n FROM account_access_grants WHERE identity_id=$1 AND revoked_at IS NULL", [outsider])).rows[0].n).toBe(1);
  });

  it("PATCH changes the target's role, and deactivation revokes every one of its sessions with an audit trail", async () => {
    const token = await issue(); await issue(outsider); await issue(outsider);
    const role = await call(token, `/${outsider}`, "PATCH", { role: "lead" });
    expect(role).toMatchObject({ status: 200, body: { ok: true, data: { identityId: outsider, role: "lead", isActive: true } } });
    const off = await call(token, `/${outsider}`, "PATCH", { is_active: false });
    expect(off).toMatchObject({ status: 200, body: { data: { identityId: outsider, isActive: false } } });
    expect((await pool.query("SELECT count(*)::int AS n FROM auth_sessions WHERE identity_id=$1 AND revoked_at IS NULL", [outsider])).rows[0].n).toBe(0);
    // 停用的是身份，不是某一份空间成员：操作者自己的会话不受影响。
    expect((await call(token)).status).toBe(200);
    const audit = (await pool.query(`SELECT action, detail->>'actorIdentityId' AS actor, detail->>'targetIdentityId' AS target, detail->>'targetWorkspaceId' AS space
      FROM audit_log WHERE object_type='identity' AND object_id=$1`, [outsider])).rows;
    expect(audit).toEqual(expect.arrayContaining([{ action: "member.patch", actor: identity, target: outsider, space: foreign }]));
    expect(audit).toHaveLength(2);
    const back = await call(token, `/${outsider}`, "PATCH", { is_active: true, role: "admin" });
    expect(back).toMatchObject({ status: 200, body: { data: { role: "admin", isActive: true } } });
  });

  it("PUT replaces the target's personal grants atomically and refuses an account outside that workspace", async () => {
    const token = await issue();
    const one = await call(token, `/${identity}/grants`, "PUT", { items: [{ media: "KUAISHOU", accountId: "same", accessLevel: "execute" }] });
    expect(one.status).toBe(200); expect(tuples(one.body.data.items)).toEqual([["KUAISHOU", "same", "execute"]]);
    // only-foreign 只在别的空间有：整条拒绝，原来那一条不动（不是先撤再部分写入）。
    const refused = await call(token, `/${identity}/grants`, "PUT", { items: [{ media: "TENCENT", accountId: "same", accessLevel: "read" },
      { media: "KUAISHOU", accountId: "only-foreign", accessLevel: "read" }] });
    expect(refused.status).toBe(400);
    expect(tuples((await call(token, `/${identity}/grants`)).body.data.items)).toEqual([["KUAISHOU", "same", "execute"]]);
    const restored = await call(token, `/${identity}/grants`, "PUT", { items: [{ media: "KUAISHOU", accountId: "same", accessLevel: "execute" },
      { media: "TENCENT", accountId: "same", accessLevel: "read" }] });
    expect(restored.status).toBe(200);
    // 团队空间的遗留授权与别的空间都不受影响。
    expect((await pool.query("SELECT workspace_id, count(*)::int AS n FROM account_access_grants WHERE identity_id=$1 AND revoked_at IS NULL GROUP BY workspace_id ORDER BY workspace_id=$2 DESC",
      [identity, personal])).rows).toEqual([{ workspace_id: personal, n: 2 }, { workspace_id: team, n: 1 }]);
    expect((await pool.query("SELECT count(*)::int AS n FROM audit_log WHERE action='member.grants.replace' AND object_id=$1", [identity])).rows[0].n).toBe(2);
  });

  it("actual oversized name is rejected rather than exposed/truncated", async () => {
    const token = await issue(); await pool.query("UPDATE auth_identities SET display_name=$2 WHERE id=$1", [identity, "x".repeat(5000)]);
    try { expect(await call(token)).toMatchObject({ status: 502, body: { error: { code: "UPSTREAM_INVALID_RESPONSE" } } }); }
    finally { await pool.query("UPDATE auth_identities SET display_name='synthetic' WHERE id=$1", [identity]); }
  });

  it("real1001 legacy team grants do not affect member or grant reads", async () => {
    await pool.query("INSERT INTO accounts(workspace_id,media,account_id) SELECT $1,'KUAISHOU','bulk-'||n FROM generate_series(1,1000) n", [team]);
    await pool.query("INSERT INTO account_access_grants(workspace_id,identity_id,media,account_id) SELECT $1,$2,'KUAISHOU','bulk-'||n FROM generate_series(1,1000) n", [team, identity]);
    const token = await issue(), nextToken = randomUUID() + randomUUID();
    expect((await sessions.switchWorkspace({ token, nextToken, targetWorkspaceId: team, expiresAt: new Date(Date.now() + 300000) })).status).toBe("approved");
    expect((await call(nextToken)).body.data.items.find((row: { identityId: string }) => row.identityId === identity).grantsCount).toBe(2);
    expect((await call(nextToken, `/${identity}/grants`)).body.data.items).toHaveLength(2);
  });

  it("revoked membership blocks the grants reader before the repository", async () => {
    const token = await issue(); await pool.query("UPDATE workspace_memberships SET is_active=false WHERE workspace_id=$1", [personal]);
    try { grantsRead.mockClear(); expect((await call(token)).status).toBe(403); expect((await call(token, `/${identity}/grants`)).status).toBe(403); expect(grantsRead).not.toHaveBeenCalled(); }
    finally { await pool.query("UPDATE workspace_memberships SET is_active=true WHERE workspace_id=$1", [personal]); }
  });

  it("team-only legacy rows do not masquerade as personal global member rows", async () => {
    const bulk = async (count: number) => pool.query(`WITH fresh AS MATERIALIZED (SELECT gen_random_uuid() iid,gen_random_uuid() uid FROM generate_series(1,$2::integer)),
      identities AS (INSERT INTO auth_identities(id,provider,provider_subject,display_name) SELECT iid,'internal_test',iid::text,'synthetic bulk' FROM fresh RETURNING id),
      actors AS (INSERT INTO users(id,workspace_id,name,role) SELECT uid,$1,'synthetic bulk','optimizer' FROM fresh RETURNING id)
      INSERT INTO workspace_memberships(workspace_id,identity_id,user_id,role) SELECT $1,f.iid,f.uid,'optimizer' FROM fresh f JOIN identities i ON i.id=f.iid JOIN actors a ON a.id=f.uid`, [team, count]);
    const token = await issue(), nextToken = randomUUID() + randomUUID();
    expect((await sessions.switchWorkspace({ token, nextToken, targetWorkspaceId: team, expiresAt: new Date(Date.now() + 300000) })).status).toBe("approved");
    const before = await call(nextToken); expect(before.status).toBe(200);
    await bulk(1001); const after = await call(nextToken); expect(after.status).toBe(200);
    expect(after.body.data.items.map((row: { identityId: string }) => row.identityId)).toEqual(before.body.data.items.map((row: { identityId: string }) => row.identityId));
  });
});
