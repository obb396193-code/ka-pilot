import { randomUUID, randomBytes } from "node:crypto";
import type { Server } from "node:http";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AdminMembersRepository, AdminMemberProvisioningRepository, AuthSessionRepository, IdentityPasswordRepository, deriveScrypt, runMigrations } from "@ka/db";
import { AdminMembersService } from "../src/admin/members-service.js";
import { createDataApiServer, type DataApiServerOptions } from "../src/data/http-server.js";
import { SessionAuthService } from "../src/auth/session-auth-service.js";
import { SessionHttpService } from "../src/auth/session-http.js";
import { InternalTestLoginProvider } from "../src/auth/internal-test-login-provider.js";
import { createPasswordRoutes } from "../src/r014/password-routes.js";
import { registerR014Routes } from "../src/r014/routes.js";
const databaseUrl = process.env.TEST_DATABASE_URL ?? "", db = new URL(databaseUrl);
if (!["localhost", "127.0.0.1"].includes(db.hostname) || db.port !== "55432" || !/^\/ka_[a-z0-9_]+_test$/.test(db.pathname)) throw new Error("Dedicated synthetic local DB required");
describe("F-OS-004 real HTTP login/member lifecycle", { timeout: 30000 }, () => {
  const pool = new Pool({ connectionString: databaseUrl, max: 4 });
  const prefix = `p211-${randomUUID()}`, identity = randomUUID(), workspace = randomUUID(), team = randomUUID(), user = randomUUID(), teamUser = randomUUID();
  const internalToken = "synthetic-p211-internal-service-token", bootstrapPassword = "synthetic-p211-bootstrap-password";
  let origin: string, server: Server, adminCookie: string;
  async function call(path: string, method = "GET", body?: unknown, cookie?: string) {
    const response = await fetch(`${origin}/api/v1/${path}`, { method, headers: { authorization: `Bearer ${internalToken}`,
      "content-type": "application/json", "x-request-id": "p211-pg", "x-ka-role": "admin", ...(cookie ? { cookie } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    return { status: response.status, body: await response.json(), cookie: response.headers.get("set-cookie")?.split(";")[0], headers: response.headers };
  }
  const login = (username: string, password: string) => call("auth/login", "POST", { provider: "internal_test", username, password });
  beforeAll(async () => {
    await runMigrations({ databaseUrl });
    await pool.query("INSERT INTO workspaces(id,name,kind) VALUES($1,$3,'personal'),($2,$3,'team')", [workspace, team, prefix]);
    await pool.query("INSERT INTO users(id,workspace_id,name,role) VALUES($1,$2,$5,'optimizer'),($3,$4,$5,'admin')", [user, workspace, teamUser, team, prefix]);
    await pool.query("INSERT INTO auth_identities(id,provider,provider_subject,display_name) VALUES($1,'internal_test',$2,$2)", [identity, prefix]);
    await pool.query("INSERT INTO workspace_memberships(workspace_id,identity_id,user_id,role) VALUES($1,$3,$4,'optimizer'),($2,$3,$5,'admin')", [workspace, team, identity, user, teamUser]);
    const salt = randomBytes(16), derived = await deriveScrypt(bootstrapPassword, salt);
    const provider = new InternalTestLoginProvider(true, JSON.stringify([{ username: prefix, identityId: identity, passwordSalt: salt.toString("base64url"), passwordScrypt: derived.toString("hex") }]));
    provider.useStoredPasswords(new IdentityPasswordRepository(pool));
    const sessionAuth = new SessionAuthService(new AuthSessionRepository(pool));
    registerR014Routes(createPasswordRoutes(pool, provider));
    const unused = new Proxy({}, { get() { throw new Error("Unexpected unrelated service"); } });
    server = createDataApiServer({ service: unused, detailService: unused, taskListService: unused, accountListService: unused, workItemListService: unused,
      internalToken, sessionAuthService: sessionAuth, sessionHttpService: new SessionHttpService(sessionAuth, provider),
      adminMembersService: new AdminMembersService(new AdminMembersRepository(pool), undefined, new AdminMemberProvisioningRepository(pool)),
    } as unknown as DataApiServerOptions);
    await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
    const address = server.address(); if (!address || typeof address === "string") throw new Error("No listener"); origin = `http://127.0.0.1:${address.port}`;
    const result = await login(prefix, bootstrapPassword); expect(result.status).toBe(200); adminCookie = result.cookie!;
  });
  afterAll(async () => {
    if (server?.listening) { server.closeAllConnections(); await new Promise<void>((resolve, reject) => server.close(e => e ? reject(e) : resolve())); }
    registerR014Routes([]);
    try {
      const ids = (await pool.query("SELECT id FROM auth_identities WHERE provider_subject LIKE $1", [`${prefix}%`])).rows.map(r => r.id);
      const spaces = (await pool.query("SELECT workspace_id FROM workspace_memberships WHERE identity_id=ANY($1::uuid[])", [ids])).rows.map(r => r.workspace_id);
      await pool.query("DELETE FROM auth_sessions WHERE identity_id=ANY($1::uuid[])", [ids]);
      await pool.query("DELETE FROM identity_passwords WHERE identity_id=ANY($1::uuid[])", [ids]);
      await pool.query("DELETE FROM workspace_memberships WHERE identity_id=ANY($1::uuid[])", [ids]);
      await pool.query("DELETE FROM users WHERE workspace_id=ANY($1::uuid[])", [spaces]);
      await pool.query("DELETE FROM workspaces WHERE id=ANY($1::uuid[])", [spaces]);
      await pool.query("DELETE FROM auth_identities WHERE id=ANY($1::uuid[])", [ids]);
    } finally { await pool.end(); }
  });
  it("create → DB-only username login → self-change → reset → old session401, without changing ENV", async () => {
    const username = `${prefix}-member`, createInput = { display_name: "synthetic new member", provider: "internal_test", provider_subject: username, role: "optimizer" };
    const created = await call("admin/members", "POST", createInput, adminCookie);
    expect(created.status, JSON.stringify(created.body.error)).toBe(201);
    expect(created.headers.get("cache-control")).toBe("no-store"); expect(created.body.meta.requestId).toBe("p211-pg");
    expect((await call("admin/members", "POST", createInput, adminCookie)).status).toBe(409);
    const first = await login(username, created.body.data.initialPassword); expect(first.status).toBe(200); expect(first.cookie).toBeTruthy();
    const second = await login(username, created.body.data.initialPassword); expect(second.status).toBe(200);
    const changedPassword = "synthetic-p211-user-changed-password";
    const change = await call("auth/password", "POST", { currentPassword: created.body.data.initialPassword, newPassword: changedPassword }, first.cookie);
    expect(change.status, JSON.stringify(change.body.error)).toBe(200);
    expect((await login(username, created.body.data.initialPassword)).status).toBe(401);
    expect((await call("auth/session", "GET", undefined, second.cookie)).status).toBe(401);
    const changed = await login(username, changedPassword); expect(changed.status).toBe(200);
    const list = await call("admin/members", "GET", undefined, adminCookie);
    expect(list.body.data.items.find((row: { identityId: string }) => row.identityId === created.body.data.identityId).mustChangePassword).toBe(false);
    expect(JSON.stringify(list.body)).not.toMatch(/initialPassword|password_scrypt|password_salt/);
    expect((await call("admin/members", "GET", undefined, first.cookie)).status).toBe(403);
    expect((await call(`admin/members/${identity}/reset-password`, "POST", {}, first.cookie)).status).toBe(403);
    const reset = await call(`admin/members/${created.body.data.identityId}/reset-password`, "POST", {}, adminCookie);
    expect(reset.status).toBe(200); expect(reset.body.data.sessionsRevoked).toBe(2);
    for (const cookie of [first.cookie, changed.cookie]) expect((await call("auth/session", "GET", undefined, cookie)).status).toBe(401);
    expect((await login(username, changedPassword)).status).toBe(401);
    expect((await login(username, reset.body.data.initialPassword)).status).toBe(200);
  });
  it("global authority revocation wins over an existing cookie and forged admin header", async () => {
    await pool.query("UPDATE workspace_memberships SET is_active=false WHERE workspace_id=$1", [team]);
    try { expect((await call("admin/members", "GET", undefined, adminCookie)).status).toBe(403); }
    finally { await pool.query("UPDATE workspace_memberships SET is_active=true WHERE workspace_id=$1", [team]); }
  });
  it("max accepted display/password can actually login; larger values fail before member creation", async () => {
    const username = `${prefix}-boundary`, password = "x".repeat(512);
    const input = { display_name: "x".repeat(200), provider: "internal_test", provider_subject: username, role: "optimizer", initial_password: password };
    expect((await call("admin/members", "POST", { ...input, initial_password: "x".repeat(513) }, adminCookie)).status).toBe(400);
    expect((await call("admin/members", "POST", { ...input, display_name: "x".repeat(201) }, adminCookie)).status).toBe(400);
    const created = await call("admin/members", "POST", input, adminCookie); expect(created.status).toBe(201);
    const legacyProvider = new InternalTestLoginProvider(true, JSON.stringify([{ username: prefix, identityId: identity,
      passwordSalt: randomBytes(16).toString("base64url"), passwordScrypt: "0".repeat(64) }]));
    const stored = new IdentityPasswordRepository(pool); legacyProvider.useStoredPasswords({ find: id => stored.find(id) });
    // Negative control: the old identity-only lookup cannot authenticate this DB-only username.
    expect(await legacyProvider.authenticate(username, password)).toBeNull();
    expect((await login(username, password)).status).toBe(200);
  });
});
