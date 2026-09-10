// Synthetic local PG/HTTP only; no scheduler, upstream or media operations.
import { randomUUID } from "node:crypto";
import type { Server } from "node:http";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { AuthSessionRepository, TaskListRepository, runMigrations } from "@ka/db";
import { SessionAuthService } from "../src/auth/session-auth-service.js";
import { TaskListService } from "../src/tasks/task-list-service.js";
import { createDataApiServer, type DataApiServerOptions } from "../src/data/http-server.js";

const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl) throw new Error("Explicit synthetic TEST_DATABASE_URL required");
const url = new URL(databaseUrl);
if (!["localhost", "127.0.0.1"].includes(url.hostname) || url.port !== "55432" || !/^\/ka_[a-z0-9_]+_test$/.test(url.pathname))
  throw new Error("Dedicated local55432 ka_*_test required");

describe("P178 task readiness scoped facts with actual Session and HTTP", () => {
  const pool = new Pool({ connectionString: databaseUrl, max: 3, connectionTimeoutMillis: 3000 });
  const repo = new TaskListRepository(pool), sessions = new SessionAuthService(new AuthSessionRepository(pool));
  const workspaces: string[] = [], identities: string[] = [];
  const internalToken = "synthetic-task-readiness-internal-bearer";
  const now = new Date("2026-09-10T12:00:00+08:00");
  let workspaceId: string, teamWorkspaceId: string, userId: string, identityId: string, token: string;
  let server: Server, origin: string;
  beforeAll(async () => {
    await runMigrations({ databaseUrl });
    const unrelated = new Proxy({}, { get() { throw new Error("Unexpected unrelated service"); } });
    server = createDataApiServer({ service: unrelated, detailService: unrelated, accountListService: unrelated,
      workItemListService: unrelated, internalToken, sessionAuthService: sessions,
      taskListService: new TaskListService({ repository: repo, now: () => now }) } as unknown as DataApiServerOptions);
    await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
    const address = server.address(); if (!address || typeof address === "string") throw new Error("Missing synthetic listener");
    origin = `http://127.0.0.1:${address.port}`;
  }, 30000);
  beforeEach(async () => {
    workspaceId = randomUUID(); teamWorkspaceId = randomUUID(); userId = randomUUID(); identityId = randomUUID();
    workspaces.push(workspaceId, teamWorkspaceId); identities.push(identityId);
    await pool.query("INSERT INTO auth_identities(id,provider,provider_subject,display_name) VALUES($1::uuid,'internal_test',$1::text,'synthetic')", [identityId]);
    for (const [ws, kind, actor] of [[workspaceId, "personal", userId], [teamWorkspaceId, "team", randomUUID()]] as const) {
      await pool.query("INSERT INTO workspaces(id,name,kind) VALUES($1,'synthetic readiness',$2)", [ws, kind]);
      await pool.query("INSERT INTO users(id,workspace_id,name,role) VALUES($1,$2,'synthetic','optimizer')", [actor, ws]);
      await pool.query("INSERT INTO workspace_memberships(workspace_id,user_id,identity_id,role) VALUES($1,$2,$3,'optimizer')", [ws, actor, identityId]);
      await pool.query(`INSERT INTO accounts(workspace_id,media,account_id) VALUES
        ($1,'KUAISHOU','same'),($1,'TENCENT','same'),($1,'KUAISHOU','synthetic-private')`, [ws]);
      await pool.query("INSERT INTO tasks(workspace_id,task_id,task_name,status) VALUES($1,'synthetic-task',$2,'active')", [ws, kind === "personal" ? "personal task" : "team task"]);
      await pool.query(`INSERT INTO task_accounts(workspace_id,task_id,media,account_id,valid_from)
        SELECT workspace_id,'synthetic-task',media,account_id,'2026-09-01' FROM accounts WHERE workspace_id=$1`, [ws]);
      await pool.query("INSERT INTO account_balance(workspace_id,media,account_id,balance) VALUES($1,'KUAISHOU','same',1)", [ws]);
      await pool.query(`INSERT INTO ad_entities(workspace_id,media,account_id,entity_id,entity_type)
        VALUES($1,'KUAISHOU','same','synthetic-unit','unit')`, [ws]);
    }
    await pool.query("INSERT INTO account_access_grants(workspace_id,identity_id,media,account_id) VALUES($1,$2,'KUAISHOU','same')", [workspaceId, identityId]);
    token = randomUUID() + randomUUID();
    expect((await sessions.issueForIdentity({ identityId, token, expiresAt: new Date(Date.now() + 300000) })).status).toBe("approved");
  });
  afterAll(async () => {
    if (server?.listening) { server.closeAllConnections(); await new Promise<void>((resolve, reject) => server.close(e => e ? reject(e) : resolve())); }
    try {
      await pool.query("DELETE FROM auth_sessions WHERE identity_id=ANY($1::uuid[])", [identities]);
      for (const table of ["ad_entities", "account_balance", "task_accounts", "tasks", "account_access_grants", "workspace_memberships", "accounts", "users"] as const)
        await pool.query(`DELETE FROM ${table} WHERE workspace_id=ANY($1::uuid[])`, [workspaces]);
      await pool.query("DELETE FROM workspaces WHERE id=ANY($1::uuid[])", [workspaces]);
      await pool.query("DELETE FROM auth_identities WHERE id=ANY($1::uuid[])", [identities]);
    } finally { await pool.end(); }
  });
  const query = () => ({ workspaceId, requestingUserId: userId, businessDate: "2026-09-10", scopeKind: "explicit_accounts" as const,
    allowedAccounts: [{ media: "KUAISHOU", accountId: "same" }], page: 1, pageSize: 20 });
  async function get(sessionToken = token) {
    const response = await fetch(`${origin}/api/v1/tasks`, { headers: { authorization: `Bearer ${internalToken}`,
      cookie: `ka_session=${sessionToken}`, "x-request-id": "p200-readiness", "x-ka-workspace-id": teamWorkspaceId,
      "x-ka-account-scope": "*", "x-ka-workspace-kind": "team" } });
    return { status: response.status, body: await response.json() };
  }
  it("SQL readiness counts and missing IDs contain only approved tuple, not same-ID media", async () => {
    const result = await repo.list(query());
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]!.readinessFacts).toEqual({ accountCount: 1, rechargedCount: 1, builtCount: 1,
      unfundedAccounts: [], unbuiltAccounts: [] });
    expect(result.coverageComplete).toBe(false); // scope excludes two task accounts; do not fake full coverage.
  });
  it("HTTP readiness never names a denied account or counts another workspace despite forged headers", async () => {
    const response = await get();
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ ok: true, data: { total: 1, items: [{ taskName: "personal task", linkedAccountCount: 1,
      readiness: { recharge: { ratio: { state: "finite", value: 1 }, missing: [] }, infra: { ratio: { state: "finite", value: 1 }, missing: [] } } }] },
    meta: { requestId: "p200-readiness", dataState: "partial", coverage: { complete: false } } });
    expect(JSON.stringify(response.body)).not.toContain("synthetic-private");
    expect(JSON.stringify(response.body)).not.toContain("team task");
  });
  it("TENCENT grant for the same ID cannot borrow KUAISHOU balance or unit", async () => {
    await pool.query("UPDATE account_access_grants SET media='TENCENT' WHERE workspace_id=$1", [workspaceId]);
    const response = await get();
    expect(response.status).toBe(200);
    expect(response.body.data.items[0].readiness).toMatchObject({ recharge: { ratio: { state: "finite", value: 0 } },
      infra: { ratio: { state: "finite", value: 0 } } });
    expect(JSON.stringify(response.body)).not.toContain("synthetic-private");
  });
  it("team reads its own full readiness with no account grants; old rotated token is rejected", async () => {
    const nextToken = randomUUID() + randomUUID();
    expect((await sessions.switchWorkspace({ token, nextToken, targetWorkspaceId: teamWorkspaceId,
      expiresAt: new Date(Date.now() + 300000) })).status).toBe("approved");
    expect((await get()).status).toBe(401);
    const response = await get(nextToken);
    expect(response.status).toBe(200);
    expect(response.body.data.items[0]).toMatchObject({ taskName: "team task", linkedAccountCount: 3,
      readiness: { recharge: { ratio: { state: "finite", value: 1 / 3 } }, infra: { ratio: { state: "finite", value: 1 / 3 } } } });
    expect(JSON.stringify(response.body)).toContain("synthetic-private");
    expect(JSON.stringify(response.body)).not.toContain("personal task");
  });
  it("revoked or empty grants expose no task facts and logout rejects the request", async () => {
    await pool.query("DELETE FROM account_access_grants WHERE workspace_id=$1", [workspaceId]);
    expect(await get()).toMatchObject({ status: 200, body: { ok: true, data: { total: 0, items: [] } } });
    await sessions.logout(token);
    expect((await get()).status).toBe(401);
  });
});
