import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { EtlRunRepository, JobRepository, RawMetricsRepository, runMigrations } from "@ka/db";
import { QihangClient } from "../src/qihang/client.js";
import { createFullEtlHandler } from "../src/etl/full-handler.js";
import { JobConsumer } from "../src/jobs/consumer.js";

describe("protocol retry diagnostics through real full handler / PG jobs", () => {
  const workspaceId = randomUUID();
  let pool: Pool;
  beforeAll(async () => {
    const databaseUrl = process.env.TEST_DATABASE_URL;
    if (!databaseUrl) throw new Error("Explicit isolated TEST_DATABASE_URL required");
    const url = new URL(databaseUrl);
    if (!["localhost", "127.0.0.1"].includes(url.hostname) || url.port !== "55432" || !/^\/ka_be_[a-z0-9_]+_test$/.test(url.pathname)) throw new Error("Dedicated local be test DB required");
    await runMigrations({ databaseUrl }); pool = new Pool({ connectionString: databaseUrl });
    await pool.query("INSERT INTO workspaces(id,name) VALUES($1,'synthetic protocol retry')", [workspaceId]);
  });
  afterAll(async () => {
    if (!pool) return;
    for (const table of ["etl_runs", "jobs", "workspaces"]) {
      await pool.query(`DELETE FROM ${table} WHERE ${table === "workspaces" ? "id" : "workspace_id"}=$1`, [workspaceId]);
    }
    await pool.end();
  });
  it("persists safe exhausted request detail, retains the job for retry, then leases the same job successfully", async () => {
    const jobs = new JobRepository(pool, { workspaceId, jobTypes: ["etl_full"] });
    const runs = new EtlRunRepository(pool), raw = new RawMetricsRepository(pool);
    const fetchFn = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input));
      return Response.json({ successful: true, data: url.searchParams.get("resource") === "account" ? { rows: [], totalNum: 0 } : [] });
    });
    for (let i = 0; i < 4; i++) fetchFn.mockImplementationOnce(async () => new Response("<html>secret=synthetic-credential</html>"));
    const qihang = new QihangClient({ fetchFn, sleep: async () => undefined });
    const full = createFullEtlHandler({ qihang, jobs, store: {
      startRun: runs.startRun.bind(runs), finishRun: runs.finishRun.bind(runs), failRun: runs.failRun.bind(runs),
      recordObservation: (runId, observation) => runs.recordObservation(runId, { ...observation }), appendRaw: raw.appendRaw.bind(raw),
      syncAccountMetadataAndRaw: raw.syncAccountMetadataAndRaw.bind(raw),
    } });
    // Tests the real handler/queue error channel, not credential resolution (synthetic runtime-only identity).
    const consumer = new JobConsumer(jobs, { etl_full: job => full({ ...job, payload: { ...job.payload, userId: "synthetic-private-user" } }) }, { retryBaseMs: 0 });
    const id = await jobs.enqueue({ workspaceId, jobType: "etl_full", credentialOwnerUserId: null, maxAttempts: 3,
      payload: { workspaceId, accountIds: ["synthetic-account"], media: "KUAISHOU", asOfDate: "2026-09-09", realtimeDays: 1 } });
    expect(await consumer.processOnce()).toBe(true);
    const failure = (await pool.query("SELECT status,attempts,last_error FROM jobs WHERE id=$1", [id])).rows[0];
    expect(failure).toMatchObject({ status: "queued", attempts: 1 });
    expect(failure.last_error).toContain('"resource":"account"');
    expect(failure.last_error).toContain('"kind":"invalid_json"');
    expect(failure.last_error).not.toMatch(/synthetic-private-user|synthetic-credential|<html>/);
    const attempt = (await pool.query("SELECT status,step_failed,error_summary FROM etl_runs WHERE job_id=$1", [id])).rows[0];
    expect(attempt).toMatchObject({ status: "failed", step_failed: "fetch:account_page_1", error_summary: failure.last_error });
    expect(await consumer.processOnce()).toBe(true);
    expect((await pool.query("SELECT status,attempts,last_error FROM jobs WHERE id=$1", [id])).rows[0])
      .toEqual({ status: "done", attempts: 2, last_error: null });
    expect((await pool.query("SELECT status FROM etl_runs WHERE job_id=$1 ORDER BY id", [id])).rows.map(row => row.status)).toEqual(["failed", "done"]);
  });
});
