// Synthetic local DB/HTTP adapter integration. Not production Session composition.
import { randomUUID } from "node:crypto";
import { createServer, type Server } from "node:http";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { AccountMuteRepository, runMigrations } from "@ka/db";
import type { ApprovedWorkspaceAuthContext } from "@ka/domain";
import { AccountMuteService } from "../src/work-items/account-mute-service.js";
import { createAccountMuteRoutes } from "../src/r010/account-mute-routes.js";

const databaseUrl = process.env.TEST_DATABASE_URL;
if (databaseUrl === undefined) throw new Error("Explicit synthetic TEST_DATABASE_URL required");
const database = new URL(databaseUrl);
if (!["localhost", "127.0.0.1"].includes(database.hostname) || database.port !== "55432" || !/^\/ka_[a-z0-9_]*_test$/.test(database.pathname))
  throw new Error("Synthetic mute HTTP tests require local55432 isolated ka_*_test database");

describe("R010 mute HTTP with real repository/transaction", () => {
  const pool = new Pool({ connectionString: databaseUrl, max: 3, connectionTimeoutMillis: 3000 });
  const workspaces: string[] = [], identities: string[] = [];
  const repo = new AccountMuteRepository(pool);
  const routes = createAccountMuteRoutes(new AccountMuteService(repo, () => new Date("2026-09-08T03:00:00+08:00")));
  let auth: ApprovedWorkspaceAuthContext, server: Server, origin: string, workItemId: string;
  beforeAll(async () => {
    await runMigrations({ databaseUrl });
    server = createServer((request, response) => {
      const url = new URL(request.url ?? "/", "http://synthetic.invalid"), route = routes.find(r => r.matches(url.pathname));
      if (!route) { response.writeHead(404); response.end(); return; }
      void route.handle({ request, response, url, auth: structuredClone(auth), requestId: "pg-http-request", maxResponseBytes: 16 * 1024 * 1024 });
    });
    await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
    const address = server.address(); if (address === null || typeof address === "string") throw new Error("Missing synthetic listener");
    origin = `http://127.0.0.1:${address.port}`;
  });
  beforeEach(async () => {
    const workspaceId = randomUUID(), userId = randomUUID(), identityId = randomUUID();
    await pool.query("INSERT INTO workspaces(id,name,kind) VALUES($1,'synthetic mute HTTP','personal')", [workspaceId]); workspaces.push(workspaceId);
    await pool.query("INSERT INTO users(id,workspace_id,name,role) VALUES($1,$2,'synthetic','optimizer')", [userId, workspaceId]);
    await pool.query("INSERT INTO auth_identities(id,provider,provider_subject,display_name) VALUES($1::uuid,'internal_test',$1::text,'synthetic')", [identityId]); identities.push(identityId);
    await pool.query("INSERT INTO workspace_memberships(workspace_id,user_id,identity_id,role) VALUES($1,$2,$3,'optimizer')", [workspaceId, userId, identityId]);
    await pool.query("INSERT INTO accounts(workspace_id,media,account_id) VALUES($1,'KUAISHOU','synthetic-account'),($1,'TENCENT','synthetic-account')", [workspaceId]);
    await pool.query("INSERT INTO account_access_grants(workspace_id,identity_id,media,account_id) VALUES($1,$2,'KUAISHOU','synthetic-account')", [workspaceId, identityId]);
    auth = { workspaceId, userId, workspaceKind: "personal", role: "optimizer", scope: { kind: "explicit_accounts", accounts: [{ media: "KUAISHOU", accountId: "synthetic-account", accessLevel: "read" }] } };
    workItemId = randomUUID();
    await pool.query("INSERT INTO work_items(id,workspace_id,media,account_id,type,title,status) VALUES($1,$2,'KUAISHOU','synthetic-account','diagnosis','synthetic','open')", [workItemId, workspaceId]);
  });
  afterAll(async () => {
    if (server?.listening) { server.closeAllConnections(); await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
    try {
      for (const table of ["account_mutes", "work_items", "account_access_grants", "workspace_memberships", "accounts", "users"] as const)
        await pool.query(`DELETE FROM ${table} WHERE workspace_id=ANY($1::uuid[])`, [workspaces]);
      await pool.query("DELETE FROM workspaces WHERE id=ANY($1::uuid[])", [workspaces]);
      await pool.query("DELETE FROM auth_identities WHERE id=ANY($1::uuid[])", [identities]);
    } finally { await pool.end(); }
  });
  async function post(path: string, body: unknown) {
    const response = await fetch(`${origin}/api/v1${path}`, { method: "POST", headers: { "content-type": "application/json", "x-ka-account-scope": "*", "x-ka-user-id": "foreign" }, body: JSON.stringify(body) });
    return { status: response.status, body: await response.json() };
  }
  it("writes only approved media tuple and returns the server day-cut deadline", async () => {
    expect(await post("/accounts/KUAISHOU/synthetic-account/mute", { days: 1, reason_chip: "synthetic" })).toEqual({ status: 200, body: {
      ok: true, data: { mutedUntil: "2026-09-09T03:00:00+08:00", scope: "notifications_and_p1p2" }, meta: { requestId: "pg-http-request" },
    } });
    expect((await pool.query("SELECT media,account_id,muted_by FROM account_mutes WHERE workspace_id=$1", [auth.workspaceId])).rows)
      .toEqual([{ media: "KUAISHOU", account_id: "synthetic-account", muted_by: auth.userId }]);
    expect((await post("/accounts/TENCENT/synthetic-account/mute", { days: 1, reason_chip: "synthetic" })).status).toBe(403);
  });
  it("ignore+mute commits both effects, replay is 409 and preserves state", async () => {
    expect((await post(`/work-items/${workItemId}/ignore`, { mute_days: 3 })).status).toBe(200);
    expect((await pool.query("SELECT status FROM work_items WHERE id=$1", [workItemId])).rows).toEqual([{ status: "ignored" }]);
    expect((await pool.query("SELECT to_char(muted_until,'YYYY-MM-DD') AS until FROM account_mutes WHERE workspace_id=$1", [auth.workspaceId])).rows).toEqual([{ until: "2026-09-11" }]);
    const replay = await post(`/work-items/${workItemId}/ignore`, { mute_days: 3 });
    expect(replay.status).toBe(409); expect(replay.body).toMatchObject({ error: { code: "INVALID_STATE", requestId: "pg-http-request" } });
  });
  it("stale approved context after grant revocation cannot mutate through HTTP", async () => {
    await pool.query("DELETE FROM account_access_grants WHERE workspace_id=$1", [auth.workspaceId]);
    expect((await post(`/work-items/${workItemId}/ignore`, { mute_days: 1 })).status).toBe(403);
    expect((await post("/accounts/KUAISHOU/synthetic-account/mute", { days: 1, reason_chip: "synthetic" })).status).toBe(403);
    expect((await pool.query("SELECT status FROM work_items WHERE id=$1", [workItemId])).rows).toEqual([{ status: "open" }]);
    expect((await pool.query("SELECT media FROM account_mutes WHERE workspace_id=$1", [auth.workspaceId])).rows).toEqual([]);
  });
});
