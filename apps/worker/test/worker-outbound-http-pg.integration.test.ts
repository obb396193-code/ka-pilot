import { randomUUID } from "node:crypto";
import { once } from "node:events";
import type { Server } from "node:http";
import { runMigrations } from "@ka/db";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { parseOutboundConfig } from "../src/notifications/outbound-config.js";
import { runOutboundOnceProcess } from "../src/notifications/outbound-process.js";
import { executeOutboundRuntime } from "../src/notifications/outbound-runtime.js";
import { createWorkerOnceHttpServer } from "../src/scheduling/worker-once-http.js";
import { workerOnceLock } from "../src/scheduling/worker-once-lock.js";

const databaseUrl = process.env.TEST_DATABASE_URL ?? ""; const url = new URL(databaseUrl);
if (!["localhost", "127.0.0.1"].includes(url.hostname) || url.port !== "55432" || !/^\/ka_[a-z0-9_]+_test$/.test(url.pathname)) {
  throw new Error("Isolated local test DB required");
}

/**
 * P-198：钉钉出站经既有 worker HTTP 触发口跑一轮。真实 PG、真实子进程，不发任何外部请求；
 * 假 transport 那条在同进程里跑同一个运行时（子进程里注不进假 fetch）。
 */
describe("P-198 outbound through the worker HTTP entry / real PG, no external sends", () => {
  const pool = new Pool({ connectionString: databaseUrl, max: 4 }), ws = randomUUID(), other = randomUUID();
  const token = "synthetic-worker-outbound-token-000001";
  const base = { DATABASE_URL: databaseUrl, OUTBOUND_WORKSPACE_ID: ws, KA_WEB_BASE_URL: "https://ka.example.test" };
  const group = JSON.stringify({ [ws]: { webhook: "https://oapi.dingtalk.com/robot/send?access_token=synthetic", secret: "synthetic" } });
  const servers: Server[] = [];
  const etl = vi.fn(async (): Promise<unknown> => { throw new Error("ETL round must not run"); });
  async function listen(outboundRun: (signal: AbortSignal) => Promise<unknown>) {
    const server = createWorkerOnceHttpServer({ token, run: etl, acquireLock: workerOnceLock(pool, ws), outbound: { run: outboundRun } });
    servers.push(server); server.listen(0, "127.0.0.1"); await once(server, "listening");
    const address = server.address(); if (!address || typeof address === "string") throw new Error("No listener");
    return (headers: Record<string, string> = {}) => fetch(`http://127.0.0.1:${address.port}/internal/worker/outbound-once`,
      { method: "POST", headers: { "X-Worker-Trigger-Token": token, ...headers } });
  }
  const enqueue = (workspaceId = ws, channel = "dingtalk") => pool.query(
    "INSERT INTO outbound_messages(workspace_id,channel,target,kind,payload) VALUES($1,$2,$3,'job_failed',$4)",
    [workspaceId, channel, `workspace:${workspaceId}:admins`, { jobId: randomUUID() }]);
  const rows = async () => (await pool.query(
    `SELECT workspace_id=$1 AS own, channel, status, attempts, fail_reason FROM outbound_messages
     WHERE workspace_id=ANY($2::uuid[]) ORDER BY workspace_id=$1 DESC, channel`, [ws, [ws, other]])).rows;

  beforeAll(async () => {
    await runMigrations({ databaseUrl });
    await pool.query("INSERT INTO workspaces(id,name) VALUES($1,'synthetic outbound http'),($2,'synthetic outbound other')", [ws, other]);
  });
  beforeEach(async () => { await pool.query("DELETE FROM outbound_messages WHERE workspace_id=ANY($1::uuid[])", [[ws, other]]); });
  afterAll(async () => {
    for (const server of servers) { server.closeAllConnections(); await new Promise<void>((resolve) => server.close(() => resolve())); }
    await pool.query("DELETE FROM outbound_messages WHERE workspace_id=ANY($1::uuid[])", [[ws, other]]);
    await pool.query("DELETE FROM workspaces WHERE id=ANY($1::uuid[])", [[ws, other]]);
    await pool.end();
  });

  it("a real outbound child consumes only this workspace's DingTalk queue through the HTTP entry", async () => {
    await enqueue(); await enqueue(other); await enqueue(ws, "inbox");
    const post = await listen((signal) => runOutboundOnceProcess(parseOutboundConfig(base), signal));
    const response = await post({ "x-request-id": "outbound-http-pg" });
    expect(response.status).toBe(200); expect(response.headers.get("x-request-id")).toBe("outbound-http-pg");
    // 这套配置没有群：按 v1.9.48 只失败这一条、不外发；别的空间与站内信一行不动。
    expect(await response.json()).toEqual({ status: "drained", outbound: { claimed: 1, sent: 0, retried: 0, failed: 1, deduplicated: 0 } });
    expect(await rows()).toEqual([
      { own: true, channel: "dingtalk", status: "failed", attempts: 1, fail_reason: "NO_CHANNEL_FOR_WORKSPACE" },
      { own: true, channel: "inbox", status: "queued", attempts: 0, fail_reason: null },
      { own: false, channel: "dingtalk", status: "queued", attempts: 0, fail_reason: null },
    ]);
    expect(etl).not.toHaveBeenCalled();
  }, 30000);

  it("answers busy while another round holds the workspace lock, and leaves the queue untouched", async () => {
    await enqueue();
    const release = await workerOnceLock(pool, ws)(new AbortController());
    expect(release).not.toBeNull();
    try {
      const post = await listen((signal) => runOutboundOnceProcess(parseOutboundConfig(base), signal));
      const response = await post();
      expect(response.status).toBe(409);
      expect(await response.json()).toMatchObject({ ok: false, error: { code: "WORKER_BUSY" } });
    } finally { await release!(); }
    expect(await rows()).toEqual([{ own: true, channel: "dingtalk", status: "queued", attempts: 0, fail_reason: null }]);
  }, 30000);

  it("with a fake DingTalk transport, one HTTP-triggered pass sends and persists exactly one message", async () => {
    await enqueue();
    const fetchFn = vi.fn<typeof fetch>().mockImplementation(async () => new Response('{"errcode":0}'));
    const config = parseOutboundConfig({ ...base, DINGTALK_ROBOT_WEBHOOK_BY_WORKSPACE: group });
    const post = await listen(async (signal) => {
      const { status, ...counts } = await executeOutboundRuntime(config, { fetchFn, signal });
      return { status, outbound: counts };
    });
    const response = await post();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "drained", outbound: { claimed: 1, sent: 1, retried: 0, failed: 0, deduplicated: 0 } });
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(await rows()).toEqual([{ own: true, channel: "dingtalk", status: "sent", attempts: 1, fail_reason: null }]);
  }, 30000);
});
