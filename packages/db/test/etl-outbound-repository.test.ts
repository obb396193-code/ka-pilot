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
