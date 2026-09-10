import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createServer } from "node:net";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { deriveScrypt, runMigrations } from "@ka/db";
import { etlRunListResponseSchema } from "@ka/domain";

describe("real data-api entry + ETL runs + login + PG / synthetic only", { timeout: 30_000 }, () => {
  const workspaceId = randomUUID(), team = randomUUID(), identity = randomUUID(), user = randomUUID(), teamUser = randomUUID();
  const job = randomUUID(), teamJob = randomUUID(), username = `p187.${identity}`, password = "synthetic-etl-login-password";
  const internalToken = "synthetic-etl-pg-service-token-long-enough";
  let pool: Pool, child: ChildProcessWithoutNullStreams | undefined, origin: string;
  let runId: string, teamRunId: string, output = "";
  const headers = (cookie?: string) => ({ authorization: `Bearer ${internalToken}`, "content-type": "application/json", "x-request-id": "etl-pg-http",
    "x-ka-workspace-id": team, "x-ka-role": "admin", ...(cookie ? { cookie } : {}) });
  beforeAll(async () => {
    const databaseUrl = process.env.TEST_DATABASE_URL ?? "", url = new URL(databaseUrl);
    if (!["localhost", "127.0.0.1"].includes(url.hostname) || url.port !== "55432" || !/^\/ka_[a-z0-9_]+_test$/.test(url.pathname)) throw new Error("Dedicated synthetic test DB required");
    await runMigrations({ databaseUrl });
    pool = new Pool({ connectionString: databaseUrl, max: 4 });
    await pool.query("INSERT INTO workspaces(id,name,kind) VALUES($1,'synthetic ETL personal','personal'),($2,'synthetic ETL team','team')", [workspaceId, team]);
    await pool.query("INSERT INTO users(id,workspace_id,name,role) VALUES($1,$2,'synthetic','admin'),($3,$4,'synthetic','admin')", [user, workspaceId, teamUser, team]);
    await pool.query("INSERT INTO auth_identities(id,provider,provider_subject,display_name) VALUES($1,'internal_test',$2,'synthetic')", [identity, username]);
    await pool.query("INSERT INTO workspace_memberships(workspace_id,user_id,identity_id,role) VALUES($1,$2,$5,'admin'),($3,$4,$5,'admin')", [workspaceId, user, team, teamUser, identity]);
    await pool.query("INSERT INTO jobs(id,workspace_id,job_type,payload,status,attempts) VALUES($1,$2,'etl_incr','{}','done',9),($3,$4,'etl_incr','{}','done',9)", [job, workspaceId, teamJob, team]);
    const insert = async (ws: string, jobId: string) => (await pool.query(`INSERT INTO etl_runs(workspace_id,job_id,run_kind,scope,started_at,finished_at,status,rows_ingested,error_summary)
      VALUES($1,$2,'incr','{"ds":"2026-09-08"}','2026-09-08T01:00:00Z','2026-09-08T01:03:00Z','done',2,'synthetic private') RETURNING id`, [ws, jobId])).rows[0].id as string;
    runId = await insert(workspaceId, job); teamRunId = await insert(team, teamJob);
    const salt = Buffer.alloc(16, 7), credentials = JSON.stringify([{ username, identityId: identity,
      passwordSalt: salt.toString("base64url"), passwordScrypt: (await deriveScrypt(password, salt)).toString("hex") }]);
    const probe = createServer();
    await new Promise<void>((resolve, reject) => { probe.once("error", reject); probe.listen(0, "127.0.0.1", resolve); });
    const address = probe.address(); if (!address || typeof address === "string") throw new Error("Missing port");
    await new Promise<void>((resolve, reject) => probe.close(error => error ? reject(error) : resolve()));
    origin = `http://127.0.0.1:${address.port}`;
    // Explicit env allowlist: never inherit real KA/media credentials. This starts only Data API, no worker/beat.
    child = spawn(process.execPath, ["--import", "tsx", "src/data-api.ts"], { cwd: process.cwd(), stdio: "pipe",
      env: { PATH: process.env.PATH, NODE_ENV: "test", DATABASE_URL: databaseUrl, DATA_API_HOST: "127.0.0.1", DATA_API_PORT: String(address.port),
        DATA_API_INTERNAL_TOKEN: internalToken, INTERNAL_TEST_AUTH_ENABLED: "true", INTERNAL_TEST_AUTH_CREDENTIALS_JSON: credentials } });
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Synthetic Data API startup timeout")), 15000);
      const inspect = (chunk: Buffer) => { output += chunk.toString(); if (output.includes("KA data API listening")) { clearTimeout(timer); resolve(); } };
      child!.stdout.on("data", inspect); child!.stderr.on("data", inspect);
      child!.once("error", () => { clearTimeout(timer); reject(new Error("Synthetic Data API spawn failure")); });
      child!.once("close", () => { clearTimeout(timer); if (!output.includes("KA data API listening")) reject(new Error("Synthetic Data API early exit")); });
    });
  }, 30_000);
  afterAll(async () => {
    if (child && child.exitCode === null && child.signalCode === null) {
      const processToStop = child;
      await new Promise<void>(resolve => {
        const timer = setTimeout(() => processToStop.kill("SIGKILL"), 5000);
        processToStop.once("close", () => { clearTimeout(timer); resolve(); }); processToStop.kill("SIGTERM");
      });
    }
    if (!pool) return;
    try {
      await pool.query("DELETE FROM auth_sessions WHERE identity_id=$1", [identity]);
      for (const table of ["etl_runs", "jobs", "workspace_memberships", "users", "workspaces"]) await pool.query(
        `DELETE FROM ${table} WHERE ${table === "workspaces" ? "id" : "workspace_id"}=ANY($1::uuid[])`, [[workspaceId, team]]);
      await pool.query("DELETE FROM auth_identities WHERE id=$1", [identity]);
    } finally { await pool.end(); }
  });
  async function login() {
    const response = await fetch(`${origin}/api/v1/auth/login`, { method: "POST", headers: headers(), body: JSON.stringify({ provider: "internal_test", username, password }) });
    expect(response.status).toBe(200); await response.json(); return response.headers.get("set-cookie")!.split(";")[0]!;
  }
  async function query(cookie?: string, search = "") {
    const response = await fetch(`${origin}/api/v1/system/etl-runs${search}`, { headers: headers(cookie) });
    const body = await response.json(); expect(response.headers.get("x-request-id")).toBe("etl-pg-http");
    expect(etlRunListResponseSchema.safeParse(body).success).toBe(true);
    expect(JSON.stringify(body)).not.toMatch(/synthetic private|password|credential/);
    return { status: response.status, body };
  }
  it("starts with KA default-off and reads actual own runs via login cookie", async () => {
    expect((await fetch(`${origin}/healthz`)).status).toBe(200);
    expect((await query()).status).toBe(401);
    const cookie = await login(), result = await query(cookie);
    expect(result).toMatchObject({ status: 200, body: { data: { total: 1, items: [{ runId, attempt: null, rows: { raw: 2, canonical: null }, warnings: [{ code: "LEGACY_NO_ATTEMPT" }] }] },
      meta: { workspaceKind: "personal", dataAsOf: "2026-09-08T01:03:00.000Z", _note: "运行观测时间，非 canonical 数据新鲜度" } } });
    expect(result.body.data.items).toHaveLength(1); expect(result.body.data.items[0].runId).not.toBe(teamRunId);
    // arch P187: compare actual HTTP response keys to frozen fixture, not another handwritten DTO.
    const fixture = JSON.parse(readFileSync(new URL("../../../packages/contract/fixtures/system/etl-runs-page.json", import.meta.url), "utf8"));
    const keys = (value: object) => Object.keys(value).sort();
    expect(keys(result.body)).toEqual(keys(fixture));
    expect(keys(result.body.data)).toEqual(keys(fixture.data));
    expect(keys(result.body.meta)).toEqual(keys(fixture.meta));
    expect(keys(result.body.data.items[0])).toEqual(keys(fixture.data.items[0]));
    expect(keys(result.body.data.items[0].rows)).toEqual(keys(fixture.data.items[0].rows));
    const legacy = fixture.data.items.find((item: { attempt: number | null }) => item.attempt === null);
    expect(result.body.data.items[0].warnings[0]).toEqual(legacy.warnings[0]);
    expect((await query(cookie, "?page=2&pageSize=1")).body.data).toEqual({ items: [], total: 1, page: 2, pageSize: 1 });
  });
  it("returns missing legacy date through the actual entry with its own warning", async () => {
    const cookie = await login(); await pool.query("UPDATE etl_runs SET scope='{}' WHERE id=$1 AND workspace_id=$2", [runId, workspaceId]);
    try {
      const result = await query(cookie); expect(result.status).toBe(200);
      expect(result.body.data.items[0]).toMatchObject({ businessDate: null, warnings: [{ code: "LEGACY_NO_ATTEMPT" }, { code: "LEGACY_NO_DATE" }] });
    } finally { await pool.query("UPDATE etl_runs SET scope='{\"ds\":\"2026-09-08\"}' WHERE id=$1 AND workspace_id=$2", [runId, workspaceId]); }
  });
  it("switches to readonly team, rotates token, and rejects old/logged-out tokens", async () => {
    const cookie = await login();
    const switched = await fetch(`${origin}/api/v1/auth/workspace`, { method: "POST", headers: headers(cookie), body: JSON.stringify({ workspaceId: team }) });
    expect(switched.status).toBe(200); await switched.json();
    const teamCookie = switched.headers.get("set-cookie")!.split(";")[0]!;
    expect(teamCookie).not.toBe(cookie);
    const result = await query(teamCookie); expect(result.body.meta.workspaceKind).toBe("team");
    expect(result.body.data.items.map((row: { runId: string }) => row.runId)).toEqual([teamRunId]);
    expect((await query(cookie)).status).toBe(401);
    const logout = await fetch(`${origin}/api/v1/auth/session`, { method: "DELETE", headers: headers(teamCookie) });
    expect(logout.status).toBe(200); await logout.json(); expect((await query(teamCookie)).status).toBe(401);
  });
  it.each(["optimizer", "operator", "lead"])("real membership role %s overrides forged admin header", async role => {
    const cookie = await login(); await pool.query("UPDATE workspace_memberships SET role=$2 WHERE workspace_id=$1", [workspaceId, role]);
    try { expect((await query(cookie)).status).toBe(403); }
    finally { await pool.query("UPDATE workspace_memberships SET role='admin' WHERE workspace_id=$1", [workspaceId]); }
  });
  it("rejects revoked membership and malformed stored run without leaking error data", async () => {
    const cookie = await login(); await pool.query("UPDATE workspace_memberships SET is_active=false WHERE workspace_id=$1", [workspaceId]);
    try { expect((await query(cookie)).status).toBe(403); }
    finally { await pool.query("UPDATE workspace_memberships SET is_active=true WHERE workspace_id=$1", [workspaceId]); }
    await pool.query("UPDATE etl_runs SET scope=scope || '{\"execution\":null}'::jsonb WHERE id=$1 AND workspace_id=$2", [runId, workspaceId]);
    try { expect(await query(cookie)).toMatchObject({ status: 502, body: { error: { code: "UPSTREAM_INVALID_RESPONSE" } } }); }
    finally { await pool.query("UPDATE etl_runs SET scope=scope-'execution' WHERE id=$1 AND workspace_id=$2", [runId, workspaceId]); }
    expect(output).not.toContain(password); expect(output).not.toContain(internalToken);
  });
});
