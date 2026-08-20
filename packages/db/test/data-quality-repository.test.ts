import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Pool } from "pg";

import { DataQualityRepository } from "../src/data-quality-repository.js";
import { runMigrations } from "../src/migrate.js";

const databaseUrl =
  process.env.TEST_DATABASE_URL ?? "postgres://ka:ka@127.0.0.1:55432/ka";

describe("DataQualityRepository", () => {
  const pool = new Pool({ connectionString: databaseUrl });
  const repository = new DataQualityRepository(pool);
  let workspaceId: string;

  beforeAll(async () => {
    await runMigrations({ databaseUrl });
  });

  beforeEach(async () => {
    await pool.query("DELETE FROM data_quality_checks");
    await pool.query("DELETE FROM metrics_raw");
    await pool.query("DELETE FROM account_metrics_daily");
    await pool.query("DELETE FROM accounts");
    const workspace = await pool.query<{ id: string }>(
      "INSERT INTO workspaces (name) VALUES ('quality-test') RETURNING id",
    );
    workspaceId = workspace.rows[0]!.id;
    await pool.query(
      `INSERT INTO accounts (workspace_id, account_id, status)
       VALUES
         ($1, 'a-1', 'active'),
         ($1, 'a-5x', 'active'),
         ($1, 'a-missing', 'active'),
         ($1, 'a-one-day', 'active')`,
      [workspaceId],
    );
  });

  it("passes when both raw and canonical totals are zero", async () => {
    await expect(repository.reconcileTotals(workspaceId, "2026-08-18")).resolves.toEqual({
      rawTotal: 0,
      canonicalTotal: 0,
      delta: 0,
      tolerance: 0,
      passed: true,
    });
  });

  it("reconciles against only the latest offline raw row at the 0.1% boundary", async () => {
    await pool.query(
      `INSERT INTO metrics_raw (
         workspace_id, account_id, ds, source, resource, request_params, payload, fetched_at
       ) VALUES
         ($1, 'a-1', '2026-08-18', 'offline', 'account_offline', '{}', '{"cost_api":999}', '2026-08-19T00:00:00Z'),
         ($1, 'a-1', '2026-08-18', 'offline', 'account_offline', '{}', '{"cost_api":1000}', '2026-08-19T00:01:00Z')`,
      [workspaceId],
    );
    await pool.query(
      `INSERT INTO account_metrics_daily (workspace_id, account_id, ds, cost)
       VALUES ($1, 'a-1', '2026-08-18', 1001)`,
      [workspaceId],
    );

    await expect(repository.reconcileTotals(workspaceId, "2026-08-18")).resolves.toEqual({
      rawTotal: 1_000,
      canonicalTotal: 1_001,
      delta: 1,
      tolerance: 1,
      passed: true,
    });

    await pool.query(
      `UPDATE account_metrics_daily SET cost = 1001.01
       WHERE workspace_id = $1 AND account_id = 'a-1' AND ds = '2026-08-18'`,
      [workspaceId],
    );
    const failed = await repository.reconcileTotals(workspaceId, "2026-08-18");
    expect(failed.delta).toBeCloseTo(1.01);
    expect(failed.passed).toBe(false);
  });

  it("reconciles current-day canonical cost against realtime raw instead of reporting a false gap", async () => {
    await pool.query(
      `INSERT INTO metrics_raw (
         workspace_id, account_id, ds, source, resource, request_params, payload, fetched_at
       ) VALUES
         ($1, 'a-1', '2026-08-18', 'offline', 'account_offline', '{}',
          '{"cost_api":9999}', '2026-08-18T23:59:00Z'),
         ($1, 'a-1', '2026-08-18', 'realtime', 'account_realtime', '{}',
          '{"account_cost":100}', '2026-08-19T00:01:00Z')`,
      [workspaceId],
    );
    await pool.query(
      `INSERT INTO account_metrics_daily (
         workspace_id, account_id, ds, cost, field_sources
       ) VALUES ($1, 'a-1', '2026-08-18', 100, '{"cost":"realtime"}')`,
      [workspaceId],
    );

    await expect(repository.reconcileTotals(workspaceId, "2026-08-18")).resolves.toEqual({
      rawTotal: 100,
      canonicalTotal: 100,
      delta: 0,
      tolerance: 0.1,
      passed: true,
    });
  });

  it("marks five-times CPA outliers and finds only two-day missing active accounts", async () => {
    await pool.query(
      `INSERT INTO account_metrics_daily (
         workspace_id, account_id, ds, cost, real_cpa, assessment_price_snapshot
       ) VALUES
         ($1, 'a-1', '2026-08-18', 100, 51, 10),
         ($1, 'a-5x', '2026-08-18', 100, 50, 10),
         ($1, 'a-one-day', '2026-08-17', 10, 5, 10)`,
      [workspaceId],
    );

    await expect(repository.markCpaOutliers(workspaceId, "2026-08-18")).resolves.toEqual([
      { accountId: "a-1", realCpa: 51, assessmentPrice: 10 },
    ]);
    await expect(
      repository.findConsecutiveMissingAccounts(workspaceId, "2026-08-18"),
    ).resolves.toEqual(["a-missing"]);

    const anomaly = await pool.query<{ data_anomaly: boolean }>(
      `SELECT data_anomaly FROM account_metrics_daily
       WHERE workspace_id = $1 AND account_id = 'a-1' AND ds = '2026-08-18'`,
      [workspaceId],
    );
    expect(anomaly.rows[0]?.data_anomaly).toBe(true);
  });

  it("persists a workspace-scoped check record", async () => {
    await repository.recordCheck({
      workspaceId,
      ds: "2026-08-18",
      checkType: "total_reconciliation",
      sample: { rawTotal: 100 },
      passed: false,
      delta: { absolute: 2, tolerance: 0.1 },
    });

    const result = await pool.query<{
      workspace_id: string;
      check_type: string;
      passed: boolean;
    }>("SELECT workspace_id, check_type, passed FROM data_quality_checks");
    expect(result.rows).toEqual([
      {
        workspace_id: workspaceId,
        check_type: "total_reconciliation",
        passed: false,
      },
    ]);
  });
});
