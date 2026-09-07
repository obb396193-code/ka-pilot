import { fork, spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { createServer, type Server } from "node:http";
import { BootstrapSeedRepository, JobRepository, runMigrations } from "@ka/db";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createWorkerOnceHttpServer, parseWorkerOnceHttpConfig } from "../src/scheduling/worker-once-http.js";
import { workerOnceLock } from "../src/scheduling/worker-once-lock.js";
import { runWorkerOnceProcess } from "../src/scheduling/worker-once-process.js";
import { superviseWorkerOnce } from "../src/scheduling/worker-once-supervisor.js";

describe("Worker HTTP -> real process/PG, synthetic isolated scope only", () => {
  let pool: Pool, databaseUrl: string;
  const workspace = randomUUID(), foreign = randomUUID(), user = randomUUID(), identity = randomUUID();
  const token = "synthetic-worker-http-token-0000000001";
  const servers: Server[] = [];
  const env = () => ({ PATH: process.env.PATH, DATABASE_URL: databaseUrl, NODE_ENV: "production",
    QIHANG_BASE_URL: "https://synthetic.invalid/get_data", WORKER_ONCE_WORKSPACE_ID: workspace,
    WORKER_ONCE_MEDIA: "KUAISHOU", WORKER_ONCE_MAX_MS: "15000", WORKER_TRIGGER_TOKEN: token });
  const headers = { "X-Worker-Trigger-Token": token };
  async function listen(server: Server) {
    servers.push(server); server.listen(0, "127.0.0.1"); await once(server, "listening");
    const address = server.address(); if (!address || typeof address === "string") throw new Error("No listener");
    return `http://127.0.0.1:${address.port}`;
  }
  beforeAll(async () => {
    databaseUrl = process.env.TEST_DATABASE_URL ?? "";
    if (!/^ka_be_.*_test$/.test(new URL(databaseUrl).pathname.slice(1))) throw new Error("Explicit isolated ka_be_*_test database required");
    await runMigrations({ databaseUrl }); pool = new Pool({ connectionString: databaseUrl, max: 4, connectionTimeoutMillis: 3000, query_timeout: 3000 });
    await new BootstrapSeedRepository(pool).seed({
      identities: [{ id: identity, display_name: "Synthetic HTTP worker" }],
      workspaces: [{ id: workspace, kind: "personal", name: `Synthetic HTTP ${workspace}` }, { id: foreign, kind: "personal", name: `Synthetic foreign ${foreign}` }],
      memberships: [{ identity_id: identity, workspace_id: workspace, user_id: user, role: "optimizer" }], grants: [],
    });
    await pool.query("UPDATE users SET qihang_user_id='synthetic-private-http-identity' WHERE id=$1", [user]);
  });
  afterAll(async () => {
    for (const server of servers) { server.closeAllConnections(); await new Promise<void>((resolve) => server.close(() => resolve())); }
    if (!pool) return;
    for (const table of ["jobs", "account_access_grants", "workspace_memberships", "users", "workspaces"]) {
      await pool.query(`DELETE FROM ${table} WHERE ${table === "workspaces" ? "id" : "workspace_id"}=ANY($1::uuid[])`, [[workspace, foreign]]);
    }
    await pool.query("DELETE FROM auth_identities WHERE id=$1", [identity]); await pool.end();
  });
  it("a real child returns blocked_auth without consuming unauthorized/foreign/media-write jobs", async () => {
    const foreignJob = await new JobRepository(pool).enqueue({ workspaceId: foreign, jobType: "etl_full", payload: {}, credentialOwnerUserId: null });
    const mediaWrite = await new JobRepository(pool).enqueue({ workspaceId: workspace, jobType: "changeset_execute", payload: {}, credentialOwnerUserId: user });
    const config = parseWorkerOnceHttpConfig(env());
    const base = await listen(createWorkerOnceHttpServer({ token,
      acquireLock: workerOnceLock(pool, workspace), run: (signal) => runWorkerOnceProcess(config.worker, signal) }));
    const response = await fetch(`${base}/internal/worker/once`, { method: "POST", headers: { ...headers, "x-request-id": "worker-pg-readonly", "x-ka-workspace-id": foreign } });
    expect(response.status).toBe(200); expect(response.headers.get("x-request-id")).toBe("worker-pg-readonly");
    expect(await response.json()).toEqual({ status: "blocked_auth", jobs: { leased: 0, done: 0, failed: 0 } });
    expect((await pool.query("SELECT status,attempts FROM jobs WHERE id=ANY($1::uuid[])", [[foreignJob, mediaWrite]])).rows).toEqual([
      { status: "queued", attempts: 0 }, { status: "queued", attempts: 0 },
    ]);
    expect((await pool.query("SELECT status FROM jobs WHERE workspace_id=$1 AND job_type='etl_full'", [workspace])).rows).toEqual([{ status: "blocked_auth" }]);
  }, 25000);
  it("two HTTP instances share a PG lock; other workspace is independent, and release permits rerun", async () => {
    let finish!: () => void;
    const run = vi.fn(() => new Promise<unknown>((resolve) => { finish = () => resolve({ status: "completed", jobs: { leased: 0, done: 0, failed: 0 } }); }));
    const firstBase = await listen(createWorkerOnceHttpServer({ token, acquireLock: workerOnceLock(pool, workspace), run }));
    const secondRun = vi.fn(async () => ({ status: "completed", jobs: { leased: 0, done: 0, failed: 0 } }));
    const secondBase = await listen(createWorkerOnceHttpServer({ token, acquireLock: workerOnceLock(pool, workspace), run: secondRun }));
    const first = fetch(`${firstBase}/internal/worker/once`, { method: "POST", headers });
    await vi.waitFor(() => expect(run).toHaveBeenCalledTimes(1));
    const releaseForeign = await workerOnceLock(pool, foreign)(new AbortController()); expect(releaseForeign).not.toBeNull(); await releaseForeign?.();
    const blocked = await fetch(`${secondBase}/internal/worker/once`, { method: "POST", headers });
    expect(blocked.status).toBe(409); expect(secondRun).not.toHaveBeenCalled();
    finish(); expect((await first).status).toBe(200);
    expect((await fetch(`${secondBase}/internal/worker/once`, { method: "POST", headers })).status).toBe(200); expect(secondRun).toHaveBeenCalledTimes(1);
  });
  it("actual HTTP entry starts without KA env, health does not enqueue, unauthorized trigger does not run", async () => {
    const probe = createServer(); probe.listen(0, "127.0.0.1"); await once(probe, "listening");
    const address = probe.address(); if (!address || typeof address === "string") throw new Error("No port");
    await new Promise<void>((resolve) => probe.close(() => resolve()));
    const before = (await pool.query("SELECT count(*)::int AS n FROM jobs WHERE workspace_id=$1", [workspace])).rows[0].n;
    const child = spawn(process.execPath, ["--import", "tsx", "src/scheduling/worker-once-http-cli.ts"], {
      cwd: new URL("..", import.meta.url), env: { ...env(), WORKER_HTTP_PORT: String(address.port) }, stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "", stderr = ""; child.stdout.on("data", (chunk: Buffer) => { stdout += chunk; }); child.stderr.on("data", (chunk: Buffer) => { stderr += chunk; });
    const closed = once(child, "close");
    try {
      await vi.waitFor(() => expect(stdout).toContain("Worker HTTP listening"), { timeout: 10000 });
      const base = `http://127.0.0.1:${address.port}`;
      expect((await fetch(`${base}/health`)).status).toBe(200);
      expect((await fetch(`${base}/internal/worker/once`, { method: "POST" })).status).toBe(401);
      expect((await pool.query("SELECT count(*)::int AS n FROM jobs WHERE workspace_id=$1", [workspace])).rows[0].n).toBe(before);
    } finally { child.kill("SIGTERM"); await closed; }
    expect(stderr).toBe(""); expect(stdout).not.toContain(token); expect(stdout).not.toContain(databaseUrl); expect(child.exitCode).toBe(0);
  }, 20000);
  it("HTTP budget response comes after real SIGKILL and releases the database lock", async () => {
    let child: ChildProcess | undefined;
    const base = await listen(createWorkerOnceHttpServer({ token, acquireLock: workerOnceLock(pool, workspace),
      run: (signal) => superviseWorkerOnce({ maxMs: 600, signal, startChild: () => {
        child = fork(new URL("./fixtures/worker-once-process.mjs", import.meta.url), ["hang"], { execArgv: [], stdio: ["ignore", "ignore", "ignore", "ipc"] });
        return child;
      } }),
    }));
    const response = await fetch(`${base}/internal/worker/once`, { method: "POST", headers });
    expect(response.status).toBe(200); expect(await response.json()).toEqual({ status: "budget", jobs: { leased: 1, done: 0, failed: 0 } });
    expect(child?.signalCode).toBe("SIGKILL"); expect(() => process.kill(child!.pid!, 0)).toThrow();
    const release = await workerOnceLock(pool, workspace)(new AbortController()); expect(release).not.toBeNull(); await release?.();
  });
  it("a lost real PG lock connection aborts its owner and can be reacquired", async () => {
    const dedicated = new Pool({ connectionString: databaseUrl, max: 1, connectionTimeoutMillis: 3000, query_timeout: 3000 });
    const pid = (await dedicated.query("SELECT pg_backend_pid() AS pid")).rows[0].pid;
    const controller = new AbortController(); const release = await workerOnceLock(dedicated, workspace)(controller);
    try {
      // Only the backend PID obtained from this test-owned dedicated pool is terminated.
      expect((await pool.query("SELECT pg_terminate_backend($1::int) AS terminated", [pid])).rows[0].terminated).toBe(true);
      await vi.waitFor(() => expect(controller.signal.aborted).toBe(true));
      await expect(release?.()).rejects.toThrow();
      const next = await workerOnceLock(pool, workspace)(new AbortController()); expect(next).not.toBeNull(); await next?.();
    } finally { await dedicated.end(); }
  });
  it("parent disconnect before module initialization cannot enqueue even a blocked_auth job", async () => {
    await pool.query("DELETE FROM jobs WHERE workspace_id=$1 AND job_type='etl_full'", [workspace]);
    const child = fork(new URL("./fixtures/worker-once-orphan.ts", import.meta.url), [], {
      cwd: new URL("..", import.meta.url), execArgv: ["--import", "tsx"], env: env(), stdio: ["ignore", "ignore", "ignore", "ipc"],
    });
    const exited = once(child, "exit"), message = await once(child, "message"); expect(message[0]).toEqual({ ready: true });
    child.disconnect(); await exited; expect(child.exitCode).toBe(1);
    expect((await pool.query("SELECT count(*)::int AS n FROM jobs WHERE workspace_id=$1 AND job_type='etl_full'", [workspace])).rows[0].n).toBe(0);
  }, 20000);
});
