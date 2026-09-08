// Real src/data-api.ts child + HTTP + PG + DB sessions, synthetic data only.
import { randomUUID } from "node:crypto";
import { execFile, spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { promisify } from "node:util";
import { createServer } from "node:net";
import { Pool } from "pg";
import { AuthSessionRepository, ChangeSetRepository, runMigrations } from "@ka/db";
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
  let cookie = `ka_session=${randomUUID()}${randomUUID()}`, base = "", draftId = "", child: ChildProcessWithoutNullStreams | undefined;
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
    await pool.query("INSERT INTO account_access_grants(workspace_id,identity_id,media,account_id,access_level) VALUES($1,$2,'KUAISHOU','synthetic-same','preview')", [ws, identity]);
    await pool.query("INSERT INTO work_items(id,workspace_id,media,account_id,type,status,title) VALUES($1,$2,'KUAISHOU','synthetic-same','diagnosis','open','synthetic')", [workItem, ws]);
    draftId = (await new ChangeSetRepository(pool).create({ workspaceId: ws, media: "KUAISHOU", accountId: "synthetic-same", title: "synthetic source-off",
      initiator: user, credentialOwnerUserId: user, ttlExpireAt: new Date(Date.now() + 600_000), reasonCode: "synthetic",
      items: [{ targetType: "unit", targetId: "synthetic-unit", field: "bid", fromValue: { type: "number", value: 30 }, toValue: { type: "number", value: 29 } }] })).id;
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
      await pool.query("DELETE FROM execution_runs r USING changesets c WHERE r.changeset_id=c.id AND c.workspace_id=ANY($1::uuid[])", [[ws, team]]);
      for (const table of ["changeset_items", "changesets", "account_mutes", "work_items", "account_access_grants", "workspace_memberships", "account_metrics_daily", "assessment_price_history", "task_accounts", "accounts", "tasks", "users"])
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
  async function bff(path: string, body: unknown, session = cookie) {
    const { stdout } = await promisify(execFile)(process.execPath, ["--input-type=module", "-e",
      `const {handleR010CommandRequest}=await import(process.argv[1]); const p=JSON.parse(process.argv[2]);
       const result=await handleR010CommandRequest(new Request('https://web.example'+p.path,{method:'POST',
         headers:{origin:'https://web.example','content-type':'application/json',cookie:p.cookie,'x-ka-workspace-id':p.team,'x-ka-account-scope':'*'},body:JSON.stringify(p.body)}),
         {environment:{KA_DATA_BACKEND_ORIGIN:p.base,KA_DATA_SERVICE_TOKEN:p.token},requestId:()=> 'r010-bff-pg'});
       process.stdout.write(JSON.stringify(result));`,
      new URL("../../web/lib/data/r010-command-bff.ts", import.meta.url).href, JSON.stringify({ path, body, cookie: session, team, base, token: internalToken })],
    { timeout: 15000, maxBuffer: 1024 * 1024 });
    const result = JSON.parse(stdout);
    expect(result.requestId).toBe("r010-bff-pg");
    expect(result.body.ok ? result.body.meta.requestId : result.body.error.requestId).toBe("r010-bff-pg");
    return result;
  }
  it("queries real scoped pivot, persists mute/ignore, then rejects team and logged-out session", async () => {
    expect((await call("/api/v1/auth/session", {}, "GET")).response.status).toBe(200);
    const hourly = { queryId: "account.hourly", params: { date: "2026-09-01", media: "KUAISHOU" } };
    const unavailableHourly = await call("/api/v1/query", hourly);
    expect(unavailableHourly.response.status).toBe(503);
    expect(unavailableHourly.body).toMatchObject({ ok: false, error: { code: "SOURCE_UNAVAILABLE" } });
    expect((await call("/api/v1/query", { ...hourly, params: { ...hourly.params, accountIds: ["not-granted"] } })).response.status).toBe(403);
    const query = { queryId: "account.pivot2", params: { dimA: "biz", dimB: "account", media: "KUAISHOU", window_from: "2026-09-01", window_to: "2026-09-01", taskIds: ["synthetic-task"] } };
    const pivot = await call("/api/v1/query", query);
    expect(pivot.response.status).toBe(200);
    expect(pivot.body).toMatchObject({ ok: true, data: { source: { rows: [{ metrics: { cashCost: { value: 10 }, costSpace: { value: 10 } } }] } } });
    expect(pivot.body.data.source.rows).toHaveLength(1);
    expect((await call("/api/v1/query", { ...query, params: { ...query.params, taskIds: ["no-match"] } })).body.data.source.rows).toEqual([]);
    expect((await call("/api/v1/accounts/TENCENT/synthetic-same/mute", { days: 1, reason_chip: "synthetic" })).response.status).toBe(403);
    expect((await bff("/api/internal/accounts/TENCENT/synthetic-same/mute", { days: 1, reason_chip: "synthetic" })).status).toBe(403);
    expect((await call("/api/v1/accounts/KUAISHOU/synthetic-same/mute", { days: 1, reason_chip: "synthetic" })).response.status).toBe(200);
    expect((await bff("/api/internal/accounts/KUAISHOU/synthetic-same/mute", { days: 1, reason_chip: "synthetic" })).status).toBe(200);
    expect((await bff(`/api/internal/work-items/${workItem}/ignore`, {})).status).toBe(503);
    expect((await bff(`/api/internal/work-items/${workItem}/ignore`, { mute_days: 3 })).status).toBe(200);
    expect((await bff(`/api/internal/work-items/${workItem}/ignore`, { mute_days: 3 })).status).toBe(409);
    expect(await bff(`/api/internal/changesets/${draftId}/dry-run`, {})).toMatchObject({ status: 503, body: { ok: false, error: {
      code: "SOURCE_UNAVAILABLE", message: "媒体只读通道未接入，试运行无法读取现值", retryable: true } } });
    expect((await pool.query("SELECT status,dry_run_hash,confirm_hash FROM changesets WHERE id=$1", [draftId])).rows[0])
      .toEqual({ status: "draft", dry_run_hash: null, confirm_hash: null });
    expect((await pool.query("SELECT COUNT(*)::int AS n FROM execution_runs WHERE changeset_id=$1", [draftId])).rows[0].n).toBe(0);
    expect((await pool.query("SELECT workspace_id,media,account_id,muted_by FROM account_mutes WHERE workspace_id=ANY($1::uuid[])", [[ws, team]])).rows)
      .toEqual([{ workspace_id: ws, media: "KUAISHOU", account_id: "synthetic-same", muted_by: user }]);
    expect((await pool.query("SELECT status FROM work_items WHERE id=$1", [workItem])).rows[0].status).toBe("ignored");
    const old = cookie, switched = await call("/api/v1/auth/workspace", { workspaceId: team });
    expect(switched.response.status).toBe(200); cookie = switched.response.headers.get("set-cookie")!.split(";")[0]!;
    expect((await call("/api/v1/query", query, "POST", old)).response.status).toBe(401);
    expect((await call("/api/v1/accounts/KUAISHOU/synthetic-same/mute", { days: 1, reason_chip: "synthetic" })).response.status).toBe(403);
    expect((await call(`/api/v1/work-items/${workItem}/ignore`, { mute_days: 1 })).response.status).toBe(403);
    for (const [path, body] of [["/api/internal/accounts/KUAISHOU/synthetic-same/mute", { days: 1, reason_chip: "synthetic" }],
      [`/api/internal/work-items/${workItem}/ignore`, { mute_days: 1 }], [`/api/internal/changesets/${draftId}/dry-run`, {}]] as const) {
      expect((await bff(path, body, old)).status).toBe(401);
      expect((await bff(path, body)).status).toBe(403);
    }
    expect((await call("/api/v1/auth/session", {}, "DELETE")).response.status).toBe(200);
    for (const path of ["/api/v1/query", "/api/v1/accounts/KUAISHOU/synthetic-same/mute", `/api/v1/work-items/${workItem}/ignore`])
      expect((await call(path, {})).response.status).toBe(401);
    for (const [path, body] of [["/api/internal/accounts/KUAISHOU/synthetic-same/mute", { days: 1, reason_chip: "synthetic" }],
      [`/api/internal/work-items/${workItem}/ignore`, { mute_days: 1 }], [`/api/internal/changesets/${draftId}/dry-run`, {}]] as const)
      expect((await bff(path, body)).status).toBe(401);
  }, 30_000);
});
