// Real src/data-api.ts child + HTTP + PG + DB sessions, synthetic data only.
import { randomUUID } from "node:crypto";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createServer } from "node:net";
import { Pool } from "pg";
import { AuthSessionRepository, runMigrations } from "@ka/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SessionAuthService } from "../src/auth/session-auth-service.js";

const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl) throw new Error("Explicit isolated test DB required");
const db = new URL(databaseUrl);
if (!["localhost", "127.0.0.1"].includes(db.hostname) || db.port !== "55432" || !/^\/ka_[a-z0-9_]*_test$/.test(db.pathname))
  throw new Error("Local55432 ka_*_test only");

describe("R010 actual production composition with KA disabled", () => {
  const pool = new Pool({ connectionString: databaseUrl, max: 2, connectionTimeoutMillis: 3000 });
  const ws = randomUUID(), team = randomUUID(), user = randomUUID(), teamUser = randomUUID(), identity = randomUUID();
  const workItem = randomUUID(), internalToken = "synthetic-r010-production-test-internal-token";
  let cookie = `ka_session=${randomUUID()}${randomUUID()}`, base = "", child: ChildProcessWithoutNullStreams | undefined;
  beforeAll(async () => {
    await runMigrations({ databaseUrl });
    for (const [workspace, kind, actor] of [[ws, "personal", user], [team, "team", teamUser]]) {
      await pool.query("INSERT INTO workspaces(id,name,kind) VALUES($1,'synthetic R010 process',$2)", [workspace, kind]);
      await pool.query("INSERT INTO users(id,workspace_id,name,role) VALUES($1,$2,'synthetic','optimizer')", [actor, workspace]);
      await pool.query("INSERT INTO tasks(workspace_id,task_id,task_name,biz_name) VALUES($1,'synthetic-task','synthetic','synthetic-biz')", [workspace]);
      await pool.query("INSERT INTO assessment_price_history(workspace_id,task_id,price,effective_date) VALUES($1,'synthetic-task',20,'2026-09-01')", [workspace]);
      for (const media of ["KUAISHOU", "TENCENT"]) {
        await pool.query("INSERT INTO accounts(workspace_id,media,account_id) VALUES($1,$2,'synthetic-same')", [workspace, media]);
        await pool.query("INSERT INTO task_accounts(workspace_id,media,account_id,task_id,valid_from) VALUES($1,$2,'synthetic-same','synthetic-task','2026-09-01')", [workspace, media]);
        await pool.query("INSERT INTO account_metrics_daily(workspace_id,media,account_id,ds,cash_cost,real_conversion,computed_at) VALUES($1,$2,'synthetic-same','2026-09-01',$3,1,'2026-09-01T01:00:00Z')", [workspace, media, workspace === ws && media === "KUAISHOU" ? 10 : 900]);
      }
    }
    await pool.query("INSERT INTO auth_identities(id,provider,provider_subject,display_name) VALUES($1::uuid,'internal_test',$1::text,'synthetic')", [identity]);
    for (const [workspace, actor] of [[ws, user], [team, teamUser]])
      await pool.query("INSERT INTO workspace_memberships(workspace_id,identity_id,user_id,role) VALUES($1,$2,$3,'optimizer')", [workspace, identity, actor]);
    await pool.query("INSERT INTO account_access_grants(workspace_id,identity_id,media,account_id) VALUES($1,$2,'KUAISHOU','synthetic-same')", [ws, identity]);
    await pool.query("INSERT INTO work_items(id,workspace_id,media,account_id,type,status,title) VALUES($1,$2,'KUAISHOU','synthetic-same','diagnosis','open','synthetic')", [workItem, ws]);
    const auth = new SessionAuthService(new AuthSessionRepository(pool));
    expect((await auth.issueForIdentity({ identityId: identity, token: cookie.slice(11), expiresAt: new Date(Date.now() + 600_000) })).status).toBe("approved");
    const probe = createServer(); await new Promise<void>(r => probe.listen(0, "127.0.0.1", r));
    const address = probe.address(); if (!address || typeof address === "string") throw new Error("No port");
    const port = address.port; await new Promise<void>(r => probe.close(() => r())); base = `http://127.0.0.1:${port}`;
    const env = { ...process.env, DATABASE_URL: databaseUrl, DATA_API_HOST: "127.0.0.1", DATA_API_PORT: String(port),
      DATA_API_INTERNAL_TOKEN: internalToken, INTERNAL_TEST_AUTH_ENABLED: "false", KA_DATA_ENABLED: "false", DATA_DIAGNOSTIC_ENABLED: "false" };
    child = spawn(process.execPath, ["--import", "tsx", "src/data-api.ts"], { cwd: process.cwd(), env, stdio: "pipe" });
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Synthetic data-api startup timeout")), 15_000);
      let text = ""; child!.stdout.on("data", (chunk: Buffer) => { text += chunk.toString(); if (text.includes("KA data API listening")) { clearTimeout(timer); resolve(); } });
      child!.once("error", () => { clearTimeout(timer); reject(new Error("Synthetic process error")); });
      child!.once("exit", code => { clearTimeout(timer); reject(new Error(`Synthetic process exited ${code}`)); });
      child!.stderr.on("data", () => undefined); // Never print environment/upstream output.
    });
  }, 30_000);
  afterAll(async () => {
    if (child && child.exitCode === null && child.signalCode === null) {
      const closed = new Promise<void>(resolve => child!.once("close", () => resolve())); child.kill("SIGTERM"); await closed;
    }
    try {
      await pool.query("DELETE FROM auth_sessions WHERE identity_id=$1", [identity]);
      for (const table of ["account_mutes", "work_items", "account_access_grants", "workspace_memberships", "account_metrics_daily", "assessment_price_history", "task_accounts", "accounts", "tasks", "users"])
        await pool.query(`DELETE FROM ${table} WHERE workspace_id=ANY($1::uuid[])`, [[ws, team]]);
      await pool.query("DELETE FROM workspaces WHERE id=ANY($1::uuid[])", [[ws, team]]);
      await pool.query("DELETE FROM auth_identities WHERE id=$1", [identity]);
    } finally { await pool.end(); }
  });
  async function call(path: string, body: unknown = {}, method = "POST", session = cookie) {
    const response = await fetch(base + path, { method, headers: { authorization: `Bearer ${internalToken}`, cookie: session,
      "content-type": "application/json", "x-request-id": "r010-process", "x-ka-workspace-id": team, "x-ka-account-scope": "*" },
      ...(method === "GET" ? {} : { body: JSON.stringify(body) }) });
    return { response, body: await response.json() };
  }
  it("queries real scoped pivot, persists mute/ignore, then rejects team and logged-out session", async () => {
    expect((await call("/api/v1/auth/session", {}, "GET")).response.status).toBe(200);
    const query = { queryId: "account.pivot2", params: { dimA: "biz", dimB: "account", media: "KUAISHOU", window_from: "2026-09-01", window_to: "2026-09-01", taskIds: ["synthetic-task"] } };
    const pivot = await call("/api/v1/query", query);
    expect(pivot.response.status).toBe(200);
    expect(pivot.body).toMatchObject({ ok: true, data: { source: { rows: [{ metrics: { cashCost: { value: 10 }, costSpace: { value: 10 } } }] } } });
    expect(pivot.body.data.source.rows).toHaveLength(1);
    expect((await call("/api/v1/query", { ...query, params: { ...query.params, taskIds: ["no-match"] } })).body.data.source.rows).toEqual([]);
    expect((await call("/api/v1/accounts/TENCENT/synthetic-same/mute", { days: 1, reason_chip: "synthetic" })).response.status).toBe(403);
    expect((await call("/api/v1/accounts/KUAISHOU/synthetic-same/mute", { days: 1, reason_chip: "synthetic" })).response.status).toBe(200);
    expect((await call(`/api/v1/work-items/${workItem}/ignore`, { mute_days: 3 })).response.status).toBe(200);
    expect((await pool.query("SELECT workspace_id,media,account_id,muted_by FROM account_mutes WHERE workspace_id=ANY($1::uuid[])", [[ws, team]])).rows)
      .toEqual([{ workspace_id: ws, media: "KUAISHOU", account_id: "synthetic-same", muted_by: user }]);
    expect((await pool.query("SELECT status FROM work_items WHERE id=$1", [workItem])).rows[0].status).toBe("ignored");
    const old = cookie, switched = await call("/api/v1/auth/workspace", { workspaceId: team });
    expect(switched.response.status).toBe(200); cookie = switched.response.headers.get("set-cookie")!.split(";")[0]!;
    expect((await call("/api/v1/query", query, "POST", old)).response.status).toBe(401);
    expect((await call("/api/v1/accounts/KUAISHOU/synthetic-same/mute", { days: 1, reason_chip: "synthetic" })).response.status).toBe(403);
    expect((await call(`/api/v1/work-items/${workItem}/ignore`, { mute_days: 1 })).response.status).toBe(403);
    expect((await call("/api/v1/auth/session", {}, "DELETE")).response.status).toBe(200);
    for (const path of ["/api/v1/query", "/api/v1/accounts/KUAISHOU/synthetic-same/mute", `/api/v1/work-items/${workItem}/ignore`])
      expect((await call(path, {})).response.status).toBe(401);
  });
});
