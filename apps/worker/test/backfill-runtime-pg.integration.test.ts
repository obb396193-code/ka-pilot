import { randomUUID } from "node:crypto";
import { BackfillRepository, JobRepository, runMigrations } from "@ka/db";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createWorkerConsumer } from "../src/runtime.js";
import { QihangClient } from "../src/qihang/client.js";

const databaseUrl = process.env.TEST_DATABASE_URL ?? "postgres://ka:ka@127.0.0.1:55432/ka";

describe("backfill runtime / real PG", () => {
  const pool = new Pool({ connectionString: databaseUrl });
  beforeAll(async () => { await runMigrations({ databaseUrl }); });
  afterAll(async () => { await pool.end(); });

  it.each(["complete", "mismatch", "missing"])("only finishes after persisted quality success (%s)", async (qualityState) => {
    const failQuality = qualityState !== "complete";
    // This suite runs only in a synthetic test database, never an application DB.
    await pool.query("DELETE FROM jobs");
    const workspaceId = (await pool.query("INSERT INTO workspaces(name) VALUES ($1) RETURNING id", [randomUUID()])).rows[0].id;
    const userId = (await pool.query(`INSERT INTO users(workspace_id,name,qihang_user_id)
      VALUES ($1,'synthetic-owner','synthetic-identity') RETURNING id`, [workspaceId])).rows[0].id;
    await pool.query(`INSERT INTO accounts(workspace_id,media,account_id,status)
      VALUES ($1,'KUAISHOU','synthetic-account','active')`, [workspaceId]);
    const batches = new BackfillRepository(pool);
    const backfillId = await batches.create({ workspaceId, userId, dateFrom: "2026-08-19", dateTo: "2026-08-19" });
    const fetchFn = vi.fn(async () => Response.json({ successful: true, data: [{
      account_id: "synthetic-account", ds: "20260819", cost_api: 100, exp_pv_api: 1000, clk_api: 10,
    }] }));
    const callbackError = vi.fn();
    const worker = createWorkerConsumer({ pool, qihang: new QihangClient({ fetchFn }),
      leaseSeconds: 60, serviceQihangUserId: null, onNotificationError: callbackError });
    await new JobRepository(pool).enqueue({ workspaceId, jobType: "backfill_historical",
      credentialOwnerUserId: userId, payload: { workspaceId, backfillId, accountIds: ["synthetic-account"] } });
    const processDue = async () => {
      // Deterministic eligibility despite host/VM clock skew; no sleeps/retries.
      await pool.query("UPDATE jobs SET run_after=now()-interval '1 second' WHERE workspace_id=$1 AND status='queued'", [workspaceId]);
      return worker.processOnce();
    };
    for (const expected of ["running", "raw_done", "canonical_done"]) {
      expect(await processDue()).toBe(true);
      expect((await batches.get(workspaceId, backfillId)).status).toBe(expected);
      expect((await batches.get(workspaceId, backfillId)).finishedAt).toBeNull();
    }
    if (failQuality) {
      await pool.query("UPDATE account_metrics_daily SET cost=$2 WHERE workspace_id=$1",
        [workspaceId, qualityState === "missing" ? null : 999]);
      await pool.query("UPDATE jobs SET max_attempts=1 WHERE workspace_id=$1 AND job_type='data_quality_check'", [workspaceId]);
    }
    expect(await processDue()).toBe(true);
    expect(await batches.get(workspaceId, backfillId)).toMatchObject({
      status: failQuality ? "failed" : "done", failedStage: failQuality ? "quality" : null,
      finishedAt: expect.any(Date), cursorDate: "2026-08-19",
    });
    expect((await pool.query("SELECT status FROM jobs WHERE workspace_id=$1 AND job_type='data_quality_check'", [workspaceId])).rows)
      .toEqual([{ status: failQuality ? "failed" : "done" }]);
    expect((await pool.query("SELECT passed FROM data_quality_checks WHERE workspace_id=$1", [workspaceId])).rows)
      .toHaveLength(3);
    if (qualityState === "missing") {
      expect((await pool.query("SELECT passed FROM data_quality_checks WHERE workspace_id=$1 AND check_type='total_reconciliation'", [workspaceId])).rows)
        .toEqual([{ passed: null }]);
    }
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(callbackError).not.toHaveBeenCalled();
    expect(await worker.processOnce()).toBe(false);
  });
});
