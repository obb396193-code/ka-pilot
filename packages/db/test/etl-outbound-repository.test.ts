import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Pool } from "pg";

import { EtlRunRepository } from "../src/etl-run-repository.js";
import { runMigrations } from "../src/migrate.js";
import { OutboundMessageRepository } from "../src/outbound-message-repository.js";

const databaseUrl =
  process.env.TEST_DATABASE_URL ?? "postgres://ka:ka@127.0.0.1:55432/ka";

describe("ETL run and outbound repositories", () => {
  const workspaceId = "11111111-1111-4111-8111-111111111111";
  const pool = new Pool({ connectionString: databaseUrl });
  const etlRuns = new EtlRunRepository(pool);
  const outbound = new OutboundMessageRepository(pool);

  beforeAll(async () => {
    await runMigrations({ databaseUrl });
  });

  beforeEach(async () => {
    await pool.query("DELETE FROM outbound_messages");
    await pool.query("DELETE FROM etl_runs");
  });

  it("records successful and failed ETL lifecycle details", async () => {
    const successId = await etlRuns.startRun(
      "33333333-3333-4333-8333-333333333333",
      "full",
      { workspaceId },
    );
    await etlRuns.finishRun(successId, 17);
    const failureId = await etlRuns.startRun(
      "44444444-4444-4444-8444-444444444444",
      "incr",
      { workspaceId },
    );
    await etlRuns.failRun(failureId, "account_realtime", "upstream timeout");

    const result = await pool.query<{
      id: string;
      workspace_id: string;
      status: string;
      rows_ingested: number | null;
      step_failed: string | null;
      error_summary: string | null;
    }>(
      `SELECT id, workspace_id, status, rows_ingested, step_failed, error_summary
       FROM etl_runs ORDER BY id`,
    );

    expect(result.rows).toEqual([
      expect.objectContaining({ workspace_id: workspaceId, status: "done", rows_ingested: 17 }),
      expect.objectContaining({
        status: "failed",
        step_failed: "account_realtime",
        error_summary: "upstream timeout",
      }),
    ]);
  });

  it("appends safe query observations while the ETL run is active", async () => {
    const runId = await etlRuns.startRun(
      "55555555-5555-4555-8555-555555555555",
      "incr",
      { workspaceId, ds: "2026-08-20" },
    );
    await etlRuns.recordObservation(runId, {
      resource: "account_offline",
      rowCount: 0,
      fingerprint: "a".repeat(64),
      observedAt: "2026-08-20T07:00:00.000Z",
      lastSyncTime: null,
      availability: "not_observed",
      beginDate: "2026-08-19",
      endDate: "2026-08-19",
      accountIds: ["must-not-be-persisted"],
    });
    await etlRuns.recordObservation(runId, {
      resource: "account_realtime",
      rowCount: 1,
      fingerprint: "b".repeat(64),
      observedAt: "2026-08-20T07:01:00.000Z",
      lastSyncTime: "2026-08-20 14:58:00",
      availability: "observed",
      ds: "2026-08-20",
    });

    const result = await pool.query<{ scope: { observations: unknown[] } }>(
      "SELECT scope FROM etl_runs WHERE id = $1",
      [runId],
    );
    expect(result.rows[0]?.scope.observations).toEqual([
      expect.objectContaining({ resource: "account_offline", availability: "not_observed" }),
      expect.objectContaining({ resource: "account_realtime", availability: "observed" }),
    ]);
    expect(JSON.stringify(result.rows[0]?.scope.observations)).not.toContain("must-not-be-persisted");

    await etlRuns.finishRun(runId, 1);
    await expect(etlRuns.recordObservation(runId, {
      resource: "account_realtime",
      rowCount: 0,
      fingerprint: "c".repeat(64),
      observedAt: "2026-08-20T07:02:00.000Z",
      lastSyncTime: null,
      availability: "not_observed",
      ds: "2026-08-20",
    })).rejects.toThrow("is not running");
  });

  it("queues a structured outbound message without storing a credential", async () => {
    await outbound.enqueue({
      workspaceId: null,
      channel: "dingtalk",
      target: "user:u-1",
      kind: "job_blocked_auth",
      payload: { jobId: "j-1", error: "expired" },
    });

    const result = await pool.query<{
      channel: string;
      target: string;
      kind: string;
      payload: Record<string, unknown>;
      status: string;
    }>("SELECT channel, target, kind, payload, status FROM outbound_messages");
    expect(result.rows[0]).toEqual({
      channel: "dingtalk",
      target: "user:u-1",
      kind: "job_blocked_auth",
      payload: { jobId: "j-1", error: "expired" },
      status: "queued",
    });
  });
});
