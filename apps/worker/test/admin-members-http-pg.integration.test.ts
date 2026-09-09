import { randomUUID } from "node:crypto";
import type { Server } from "node:http";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { AdminMembersRepository, AuthSessionRepository, runMigrations } from "@ka/db";
import { AdminMembersService } from "../src/admin/members-service.js";
import { createDataApiServer, type DataApiServerOptions } from "../src/data/http-server.js";
import { SessionAuthService } from "../src/auth/session-auth-service.js";
const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl) throw new Error("Explicit dedicated TEST_DATABASE_URL required");
const db = new URL(databaseUrl);
if (!["localhost", "127.0.0.1", "[::1]"].includes(db.hostname) || db.port !== "55432" || !/^\/ka_[a-z0-9_]*_test$/.test(db.pathname)) throw new Error("Dedicated local ka_*_test required");
// Real PG + HTTP fixtures may contend with builds; keep production deadlines unchanged.
describe("admin member/grant real HTTP Session PG", { timeout: 30_000 }, () => {
  const pool = new Pool({ connectionString: databaseUrl, max: 3 });
  const personal = randomUUID(), team = randomUUID(), foreign = randomUUID(), user = randomUUID(), teamUser = randomUUID(), foreignUser = randomUUID(), identity = randomUUID(), outsider = randomUUID();
  const internalToken = "synthetic-member-service-token-long-enough";
  const sessions = new SessionAuthService(new AuthSessionRepository(pool));
  const repo = new AdminMembersRepository(pool), read = vi.spyOn(repo, "read");
  let server: Server, origin: string;
  beforeAll(async () => {
    await runMigrations({ databaseUrl });
    await pool.query("INSERT INTO workspaces(id,name,kind) VALUES($1,'synthetic members','personal'),($2,'synthetic members','team'),($3,'synthetic foreign','personal')", [personal, team, foreign]);
    await pool.query("INSERT INTO users(id,workspace_id,name,role) VALUES($1,$2,'synthetic','admin'),($3,$4,'synthetic','admin'),($5,$6,'synthetic','admin')", [user, personal, teamUser, team, foreignUser, foreign]);
    for (const id of [identity, outsider]) await pool.query("INSERT INTO auth_identities(id,provider,provider_subject,display_name) VALUES($1::uuid,'internal_test',$1::text,'synthetic')", [id]);
    await pool.query("INSERT INTO workspace_memberships(workspace_id,user_id,identity_id,role) VALUES($1,$2,$7,'admin'),($3,$4,$7,'admin'),($5,$6,$8,'admin')", [personal, user, team, teamUser, foreign, foreignUser, identity, outsider]);
    await pool.query("INSERT INTO accounts(workspace_id,media,account_id) VALUES($1,'KUAISHOU','same'),($1,'TENCENT','same'),($2,'KUAISHOU','same'),($3,'KUAISHOU','same')", [personal, team, foreign]);
    await pool.query("INSERT INTO account_access_grants(workspace_id,identity_id,media,account_id,access_level) VALUES($1,$4,'KUAISHOU','same','execute'),($1,$4,'TENCENT','same','read'),($2,$4,'KUAISHOU','same','execute'),($3,$5,'KUAISHOU','same','preview')", [personal, team, foreign, identity, outsider]);
    const unused = new Proxy({}, { get() { throw new Error("Unexpected unrelated service"); } });
    server = createDataApiServer({ service: unused, detailService: unused, taskListService: unused, accountListService: unused, workItemListService: unused,
      internalToken, sessionAuthService: sessions, adminMembersService: new AdminMembersService(repo),
    } as unknown as DataApiServerOptions);
    await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
    const address = server.address(); if (!address || typeof address === "string") throw new Error("No listener"); origin = `http://127.0.0.1:${address.port}`;
  }, 30000);
  afterAll(async () => {
    if (server?.listening) { server.closeAllConnections(); await new Promise<void>((resolve, reject) => server.close(e => e ? reject(e) : resolve())); }
    try {
      const scope = [personal, team, foreign];
      await pool.query("DELETE FROM auth_sessions WHERE active_workspace_id=ANY($1::uuid[])", [scope]);
      await pool.query("DELETE FROM account_access_grants WHERE workspace_id=ANY($1::uuid[])", [scope]);
      await pool.query("DELETE FROM accounts WHERE workspace_id=ANY($1::uuid[])", [scope]);
      const ids = (await pool.query("DELETE FROM workspace_memberships WHERE workspace_id=ANY($1::uuid[]) RETURNING identity_id", [scope])).rows.map(r => r.identity_id);
      await pool.query("DELETE FROM users WHERE workspace_id=ANY($1::uuid[])", [scope]);
      await pool.query("DELETE FROM workspaces WHERE id=ANY($1::uuid[])", [scope]);
      await pool.query("DELETE FROM auth_identities WHERE id=ANY($1::uuid[])", [ids]);
    } finally { await pool.end(); }
  });
  async function issue() { const token = randomUUID() + randomUUID(); expect((await sessions.issueForIdentity({ identityId: identity, token, expiresAt: new Date(Date.now() + 300000) })).status).toBe("approved"); return token; }
  async function call(token?: string, target?: string) {
    const response = await fetch(`${origin}/api/v1/admin/members${target ? `/${target}/grants` : ""}`, { headers: { authorization: `Bearer ${internalToken}`,
      ...(token ? { cookie: `ka_session=${token}` } : {}), "x-request-id": "pg-members", "x-ka-workspace-id": foreign, "x-ka-role": "admin" } });
    return { status: response.status, body: await response.json() };
  }
  it("limits member profile/session evidence and tuple grants to active workspace; no secret columns", async () => {
    const token = await issue(), members = await call(token); expect(members.status).toBe(200);
    expect(members.body.data.items).toHaveLength(1); expect(members.body.data.items[0]).toMatchObject({ identityId: identity, userId: user, grantsCount: 2 });
    expect(JSON.stringify(members.body)).not.toMatch(/provider_subject|token_hash|qihang|secret_ref/); expect(members.body.meta.dataAsOf).toBeNull();
    const grants = await call(token, identity); expect(grants.status).toBe(200); expect(grants.body.data.items.map((r: { media: string; accountId: string; accessLevel: string }) => [r.media, r.accountId, r.accessLevel])).toEqual([["KUAISHOU", "same", "execute"], ["TENCENT", "same", "read"]]);
    expect((await call(token, outsider)).status).toBe(404);
  });
  it("team suppresses persisted grants, scope rotates, old and revoked tokens stop before repo", async () => {
    const token = await issue(), nextToken = randomUUID() + randomUUID();
    expect((await sessions.switchWorkspace({ token, nextToken, targetWorkspaceId: team, expiresAt: new Date(Date.now() + 300000) })).status).toBe("approved");
    const members = await call(nextToken); expect(members.body.data.items[0]).toMatchObject({ userId: teamUser, grantsCount: 0 });
    expect((await call(nextToken, identity)).body.data.items).toEqual([]);
    read.mockClear(); expect((await call(token)).status).toBe(401); expect((await call()).status).toBe(401); expect(read).not.toHaveBeenCalled();
    await sessions.logout(nextToken); expect((await call(nextToken, identity)).status).toBe(401); expect(read).not.toHaveBeenCalled();
  });
  it.each(["optimizer", "operator", "lead"])("rejects %s despite forged header before repo", async role => {
    await pool.query("UPDATE workspace_memberships SET role=$2 WHERE workspace_id=$1", [personal, role]);
    try { const token = await issue(); read.mockClear(); expect((await call(token)).status).toBe(403); expect((await call(token, identity)).status).toBe(403); expect(read).not.toHaveBeenCalled(); }
    finally { await pool.query("UPDATE workspace_memberships SET role='admin' WHERE workspace_id=$1", [personal]); }
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
    expect((await call(nextToken)).body.data.items[0].grantsCount).toBe(0); expect((await call(nextToken, identity)).body.data.items).toEqual([]);
  });
  it("revoked membership blocks both readers before repository", async () => {
    const token = await issue(); await pool.query("UPDATE workspace_memberships SET is_active=false WHERE workspace_id=$1", [personal]);
    try { read.mockClear(); expect((await call(token)).status).toBe(403); expect((await call(token, identity)).status).toBe(403); expect(read).not.toHaveBeenCalled(); }
    finally { await pool.query("UPDATE workspace_memberships SET is_active=true WHERE workspace_id=$1", [personal]); }
  });
  it("real SQL permits1000 members and uses1001 as overflow sentinel", async () => {
    const bulk = async (count: number) => pool.query(`WITH fresh AS MATERIALIZED (SELECT gen_random_uuid() iid,gen_random_uuid() uid FROM generate_series(1,$2::integer)),
      identities AS (INSERT INTO auth_identities(id,provider,provider_subject,display_name) SELECT iid,'internal_test',iid::text,'synthetic bulk' FROM fresh RETURNING id),
      actors AS (INSERT INTO users(id,workspace_id,name,role) SELECT uid,$1,'synthetic bulk','optimizer' FROM fresh RETURNING id)
      INSERT INTO workspace_memberships(workspace_id,identity_id,user_id,role) SELECT $1,f.iid,f.uid,'optimizer' FROM fresh f JOIN identities i ON i.id=f.iid JOIN actors a ON a.id=f.uid`, [team, count]);
    const token = await issue(), nextToken = randomUUID() + randomUUID();
    expect((await sessions.switchWorkspace({ token, nextToken, targetWorkspaceId: team, expiresAt: new Date(Date.now() + 300000) })).status).toBe("approved");
    await bulk(999); const exact = await call(nextToken); expect(exact.status, JSON.stringify(exact.body.error)).toBe(200); expect(exact.body.data.items).toHaveLength(1000);
    await bulk(1); const overflow = await call(nextToken); expect(overflow).toMatchObject({ status: 502, body: { error: { code: "SOURCE_TRUNCATED" } } }); expect(overflow.body).not.toHaveProperty("data");
  });
});
