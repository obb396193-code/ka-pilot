// Actual HTTP composition + DB sessions and RR repository, synthetic local data only.
import { randomUUID } from "node:crypto";
import type { Server } from "node:http";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { AuthSessionRepository, SettingsChangeLogRepository, runMigrations } from "@ka/db";
import { settingsChangeLogResponseSchema } from "@ka/domain";
import { SettingsChangeLogService } from "../src/admin/settings-change-log-service.js";
import { SessionAuthService } from "../src/auth/session-auth-service.js";
import { createDataApiServer, type DataApiServerOptions } from "../src/data/http-server.js";

const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl) throw new Error("Explicit TEST_DATABASE_URL required");
const db = new URL(databaseUrl);
if (!["127.0.0.1", "localhost"].includes(db.hostname) || db.port !== "55432" || !/^\/ka_[a-z0-9_]+_test$/.test(db.pathname)) throw new Error("Isolated local DB required");

describe("P194 history real HTTP/PG", () => {
  const pool = new Pool({ connectionString: databaseUrl, max: 3 });
  const session = new SessionAuthService(new AuthSessionRepository(pool));
  const spaces: string[] = [], identities: string[] = [];
  let ws: string, team: string, token: string, identity: string, server: Server, origin: string;
  const bearer = "synthetic-change-log-internal-token-long";
  beforeAll(async () => {
    await runMigrations({ databaseUrl });
    const unrelated = new Proxy({}, { get() { throw new Error("Unrelated service called"); } });
    server = createDataApiServer({ internalToken: bearer, sessionAuthService: session,
      service: unrelated, detailService: unrelated, taskListService: unrelated, accountListService: unrelated, workItemListService: unrelated,
      settingsChangeLogService: new SettingsChangeLogService(new SettingsChangeLogRepository(pool), () => new Date("2026-09-13T10:00:00+08:00")),
    } as unknown as DataApiServerOptions);
    await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
    const address = server.address(); if (!address || typeof address === "string") throw new Error("No listener");
    origin = `http://127.0.0.1:${address.port}`;
  }, 30000);
  beforeEach(async () => {
    ws = randomUUID(); team = randomUUID(); identity = randomUUID(); spaces.push(ws, team); identities.push(identity);
    await pool.query("INSERT INTO auth_identities(id,provider,provider_subject,display_name) VALUES($1::uuid,'internal_test',$1::text,'Synthetic')", [identity]);
    for (const [space, kind] of [[ws, "personal"], [team, "team"]]) {
      const user = randomUUID();
      await pool.query("INSERT INTO workspaces(id,name,kind) VALUES($1,'Synthetic log',$2)", [space, kind]);
      await pool.query("INSERT INTO users(id,workspace_id,name,role) VALUES($1,$2,'Synthetic','optimizer')", [user, space]);
      await pool.query("INSERT INTO workspace_memberships(workspace_id,user_id,identity_id,role) VALUES($1,$2,$3,'optimizer')", [space, user, identity]);
      await pool.query("INSERT INTO accounts(workspace_id,media,account_id) VALUES($1,'KUAISHOU','same'),($1,'TENCENT','same')", [space]);
      for (const [task, media] of [["allowed", "KUAISHOU"], ["denied", "TENCENT"]]) {
        await pool.query("INSERT INTO tasks(workspace_id,task_id) VALUES($1,$2)", [space, task]);
        await pool.query("INSERT INTO task_accounts(workspace_id,task_id,media,account_id,valid_from) VALUES($1,$2,$3,'same','2026-09-01')", [space, task, media]);
        await pool.query(`INSERT INTO assessment_price_history(workspace_id,task_id,price,effective_date,created_at)
          VALUES($1,$2,$3,'2026-09-01','2026-09-01T00:00:00.000001Z')`, [space, task, space === team ? 70 : task === "denied" ? 90 : 30]);
      }
    }
    await pool.query("INSERT INTO account_access_grants(workspace_id,identity_id,media,account_id) VALUES($1,$2,'KUAISHOU','same')", [ws, identity]);
    await pool.query(`INSERT INTO assessment_price_history(workspace_id,task_id,price,effective_date,created_at,op)
      VALUES($1,'allowed',30,'2026-09-01','2026-09-02T00:00:00.000001Z','revoke')`, [ws]);
    await pool.query(`INSERT INTO task_budget_history(workspace_id,task_id,daily_cap,effective_date,created_at)
      VALUES($1,'allowed',100,'2026-09-01','2026-09-03T00:00:00.000001Z')`, [ws]);
    await pool.query(`INSERT INTO channel_coefficients(workspace_id,media,coefficient,op,effective_date,created_at)
      VALUES($1,'KUAISHOU',0.8,'multiply','2026-09-01','2026-09-04T00:00:00.000001Z')`, [ws]);
    token = randomUUID() + randomUUID();
    expect((await session.issueForIdentity({ identityId: identity, token, expiresAt: new Date(Date.now() + 600000) })).status).toBe("approved");
  });
  afterAll(async () => {
    if (server?.listening) { server.closeAllConnections(); await new Promise<void>((resolve, reject) => server.close(e => e ? reject(e) : resolve())); }
    try {
      await pool.query("DELETE FROM auth_sessions WHERE identity_id=ANY($1::uuid[])", [identities]);
      for (const table of ["task_budget_history", "channel_coefficients", "assessment_price_history", "task_accounts", "tasks", "account_access_grants", "workspace_memberships", "accounts", "users"])
        await pool.query(`DELETE FROM ${table} WHERE workspace_id=ANY($1::uuid[])`, [spaces]);
      await pool.query("DELETE FROM workspaces WHERE id=ANY($1::uuid[])", [spaces]);
      await pool.query("DELETE FROM auth_identities WHERE id=ANY($1::uuid[])", [identities]);
    } finally { await pool.end(); }
  }, 30000);
  async function get(search = "", options: { method?: string; token?: string; bearer?: string; noBearer?: boolean } = {}) {
    const response = await fetch(`${origin}/api/v1/settings/change-log${search}`, { method: options.method ?? "GET", headers: {
      ...(options.noBearer ? {} : { authorization: `Bearer ${options.bearer ?? bearer}` }), cookie: `ka_session=${options.token ?? token}`, "x-request-id": "p194-history-http",
      "x-ka-workspace-id": team, "x-ka-account-scope": "*", "x-ka-user-id": "forged",
    } });
    expect(response.headers.get("x-request-id")).toBe("p194-history-http");
    return { status: response.status, body: await response.json() };
  }
  it("captures canonical real response; includes three sources and revoke, never unauthorized tasks", async () => {
    const result = await get(); expect(result.status).toBe(200);
    expect(settingsChangeLogResponseSchema.parse(result.body)).toEqual(result.body);
    expect(result.body.data.items.map((r: { kind: string }) => r.kind)).toEqual(["channel_coefficient", "daily_budget_cap", "assessment_price", "assessment_price"]);
    expect(result.body.data.items[2]).toMatchObject({ op: "revoke", oldValue: 30, newValue: null, changedBy: null });
    expect(result.body.data.items.some((r: { newValue: unknown }) => r.newValue === 90 || r.newValue === 70)).toBe(false);
    if (process.env.CAPTURE_P194_FIXTURES === "1") console.info("P194_HISTORY_FIXTURE " + JSON.stringify(result.body));
    const task = await get("?task_id=allowed");
    expect(task.status).toBe(200); expect(task.body.data).toEqual(result.body.data);
    expect((await get("?task_id=denied")).body.data.items).toEqual([]);
    expect((await get("?media=TENCENT")).body.data.items).toEqual([]);
  });
  it("requires bearer/session, rotates scope to team and rejects old/logout token", async () => {
    // Existing shell distinguishes an invalid trusted-caller bearer (403) from missing auth (401).
    expect((await get("", { bearer: "invalid" })).status).toBe(403);
    expect((await get("", { noBearer: true })).status).toBe(401);
    expect((await get("", { token: "invalid" })).status).toBe(401);
    const old = token, next = randomUUID() + randomUUID();
    expect((await session.switchWorkspace({ token, nextToken: next, targetWorkspaceId: team, expiresAt: new Date(Date.now() + 600000) })).status).toBe("approved"); token = next;
    expect((await get("", { token: old })).status).toBe(401);
    const read = await get(); expect(read.status).toBe(200); expect(read.body.data.items.map((r: { newValue: unknown }) => r.newValue)).toEqual([70, 70]);
    expect((await get("", { method: "POST" })).status).toBe(405);
    await session.logout(token); expect((await get()).status).toBe(401);
  });
  it("revoked grants become empty immediately and inactive membership cannot read", async () => {
    await pool.query("UPDATE account_access_grants SET revoked_at=now() WHERE workspace_id=$1", [ws]);
    expect((await get()).body.data.items).toEqual([]);
    await pool.query("UPDATE workspace_memberships SET is_active=false WHERE workspace_id=$1", [ws]);
    expect((await get()).status).toBe(403);
  });
  it("unknown timestamps come back as null instead of failing the page; bad values are invalid, not zero", async () => {
    await pool.query("UPDATE channel_coefficients SET created_at=NULL WHERE workspace_id=$1", [ws]);
    // v1.9.48 ⑤：老行没有修改时间 → at=null 照常返回，不再整页 503，也不拿响应时刻冒充。
    const timeless = await get(); expect(timeless.status).toBe(200);
    const coefficients = timeless.body.data.items.filter((r: { kind: string }) => r.kind === "channel_coefficient");
    expect(coefficients.length).toBeGreaterThan(0); expect(coefficients.every((r: { at: unknown }) => r.at === null)).toBe(true);
    expect((await get("?kinds=assessment_price")).status).toBe(200);
    await pool.query("UPDATE assessment_price_history SET price='NaN'::numeric WHERE workspace_id=$1 AND op='set'", [ws]);
    expect(await get("?kinds=assessment_price")).toMatchObject({ status: 502, body: { error: { code: "UPSTREAM_INVALID_RESPONSE" } } });
    expect((await get("?scope=all")).status).toBe(400);
  });
});
