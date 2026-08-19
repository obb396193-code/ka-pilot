import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Pool } from "pg";

import { runMigrations } from "../src/migrate.js";
import { SemanticQueryRepository } from "../src/semantic-query-repository.js";
import { AmbiguousTaskMappingError } from "../src/semantic-query-types.js";

const databaseUrl =
  process.env.TEST_DATABASE_URL ?? "postgres://ka:ka@127.0.0.1:55432/ka";

describe("SemanticQueryRepository", () => {
  const pool = new Pool({ connectionString: databaseUrl });
  const repository = new SemanticQueryRepository(pool);
  let workspaceId: string;
  let otherWorkspaceId: string;
  let ownerId: string;
  let taskOneId: string;
  let taskTwoId: string;

  beforeAll(async () => {
    await runMigrations({ databaseUrl });
  });

  beforeEach(async () => {
    const workspace = await pool.query<{ id: string }>(
      "INSERT INTO workspaces (name) VALUES ('semantic-primary') RETURNING id",
    );
    const otherWorkspace = await pool.query<{ id: string }>(
      "INSERT INTO workspaces (name) VALUES ('semantic-other') RETURNING id",
    );
    workspaceId = workspace.rows[0]!.id;
    otherWorkspaceId = otherWorkspace.rows[0]!.id;
    taskOneId = `t-1-${workspaceId}`;
    taskTwoId = `t-2-${workspaceId}`;

    const owner = await pool.query<{ id: string }>(
      `INSERT INTO users (workspace_id, buc_id, name)
       VALUES ($1, $2, '脱敏优化师') RETURNING id`,
      [workspaceId, `owner-${workspaceId}`],
    );
    ownerId = owner.rows[0]!.id;

    await pool.query(
      `INSERT INTO accounts (
         workspace_id, account_id, account_name, media, owner_user_id, status
       ) VALUES
         ($1, 'a-1', '测试账户一', 'KUAISHOU', $2, 'active'),
         ($1, 'a-2', '测试账户二', 'TENCENT', $2, 'active'),
         ($3, 'a-1', '其他租户同号账户', 'KUAISHOU', NULL, 'active')`,
      [workspaceId, ownerId, otherWorkspaceId],
    );
    await pool.query(
      `INSERT INTO tasks (workspace_id, task_id, task_name, biz_name, owner_user_id)
       VALUES
         ($1, $3, '任务一', '业务甲', $2),
         ($1, $4, '任务二', '业务乙', $2)`,
      [workspaceId, ownerId, taskOneId, taskTwoId],
    );
    await pool.query(
      `INSERT INTO task_accounts (workspace_id, task_id, account_id, valid_from, valid_to)
       VALUES
         ($1, $2, 'a-1', '2026-08-01', '2026-08-18'),
         ($1, $3, 'a-2', '2026-08-19', NULL)`,
      [workspaceId, taskOneId, taskTwoId],
    );
    await pool.query(
      `INSERT INTO account_metrics_daily (
         workspace_id, account_id, ds, cost, exposure, click, conversion,
         real_conversion, real_cpa, cash_cost, cash_cpa, cost_space, gap,
         budget, wake_uv, potential_uv, data_anomaly
       ) VALUES
         ($1, 'a-1', '2026-08-18', 100, 1000, 100, 12, 10, 10, 80, 8, 20, .2, 500, 50, 25, false),
         ($1, 'a-1', '2026-08-19', 120, 1200, 96, 10, 8, 15, 96, 12, 4, .25, 500, 40, 20, true),
         ($1, 'a-2', '2026-08-19', 50, 500, 25, 5, 5, 10, 40, 8, 10, 0, 200, 20, 10, false),
         ($2, 'a-1', '2026-08-19', 9999, 1, 1, 1, 1, 9999, 9999, 9999, 0, 0, 1, 1, 1, true)`,
      [workspaceId, otherWorkspaceId],
    );
  });

  it("rejects unsafe ranges, pagination and sort input before querying", async () => {
    await expect(
      repository.queryTable({
        workspaceId,
        dateFrom: "2026-08-20",
        dateTo: "2026-08-19",
      }),
    ).rejects.toThrow("dateFrom must not be after dateTo");

    await expect(
      repository.queryTable({
        workspaceId,
        dateFrom: "2026-08-18",
        dateTo: "2026-08-19",
        pageSize: 501,
      }),
    ).rejects.toThrow("pageSize must be between 1 and 500");

    await expect(
      repository.queryTable({
        workspaceId,
        dateFrom: "2026-08-18",
        dateTo: "2026-08-19",
        sortBy: "cost; DROP TABLE accounts" as "cost",
      }),
    ).rejects.toThrow("Unsupported sort field");
  });

  it("keeps table rows tenant-isolated and account-day granular", async () => {
    const result = await repository.queryTable({
      workspaceId,
      dateFrom: "2026-08-18",
      dateTo: "2026-08-19",
      page: 1,
      pageSize: 10,
    });

    expect(result.total).toBe(3);
    expect(result.rows.map((row) => [row.accountId, row.ds, row.cost])).toEqual([
      ["a-1", "2026-08-19", 120],
      ["a-2", "2026-08-19", 50],
      ["a-1", "2026-08-18", 100],
    ]);
    expect(result.rows[0]!.tasks).toEqual([]);
    expect(result.rows[1]!.tasks).toEqual([
      { taskId: taskTwoId, taskName: "任务二", bizName: "业务乙" },
    ]);
    expect(result.rows[2]!.tasks).toEqual([
      { taskId: taskOneId, taskName: "任务一", bizName: "业务甲" },
    ]);
    expect(result.rows.every((row) => row.workspaceId === workspaceId)).toBe(true);
  });

  it("filters by effective task relationship without duplicating detail rows", async () => {
    const result = await repository.queryTable({
      workspaceId,
      dateFrom: "2026-08-18",
      dateTo: "2026-08-19",
      filters: { taskId: taskOneId, ownerUserId: ownerId, media: "KUAISHOU" },
    });

    expect(result.total).toBe(1);
    expect(result.rows[0]).toMatchObject({
      accountId: "a-1",
      ds: "2026-08-18",
      cost: 100,
    });
  });

  it("uses a stable whitelisted sort for pagination", async () => {
    const firstPage = await repository.queryTable({
      workspaceId,
      dateFrom: "2026-08-18",
      dateTo: "2026-08-19",
      sortBy: "cost",
      sortDirection: "asc",
      page: 1,
      pageSize: 2,
    });
    const secondPage = await repository.queryTable({
      workspaceId,
      dateFrom: "2026-08-18",
      dateTo: "2026-08-19",
      sortBy: "cost",
      sortDirection: "asc",
      page: 2,
      pageSize: 2,
    });

    expect(firstPage.rows.map((row) => row.cost)).toEqual([50, 100]);
    expect(secondPage.rows.map((row) => row.cost)).toEqual([120]);
    expect(firstPage.total).toBe(3);
    expect(secondPage.total).toBe(3);
  });

  it("builds summary ratios from aggregate numerators instead of averaging row ratios", async () => {
    const result = await repository.querySummary({
      workspaceId,
      dateFrom: "2026-08-18",
      dateTo: "2026-08-19",
    });

    expect(result).toMatchObject({
      rowCount: 3,
      accountCount: 2,
      cost: 270,
      exposure: 2700,
      click: 221,
      conversion: 27,
      realConversion: 23,
      cashCost: 216,
      costSpace: 34,
      wakeUv: 110,
      potentialUv: 55,
      anomalyRows: 1,
    });
    expect(result.ratios.realCpa).toEqual({ value: 270 / 23, state: "finite" });
    expect(result.ratios.ctr).toEqual({ value: 221 / 2700, state: "finite" });
    expect(result.ratios.gap).toEqual({ value: 27 / 23 - 1, state: "finite" });
  });

  it("returns zero totals and undefined ratios for an empty summary", async () => {
    const result = await repository.querySummary({
      workspaceId,
      dateFrom: "2026-07-01",
      dateTo: "2026-07-02",
    });

    expect(result.rowCount).toBe(0);
    expect(result.cost).toBe(0);
    expect(result.ratios.realCpa).toEqual({ value: null, state: "undefined" });
  });

  it("returns only persisted dates in a daily aggregate trend", async () => {
    const rows = await repository.queryTrend({
      workspaceId,
      dateFrom: "2026-08-17",
      dateTo: "2026-08-20",
      filters: { ownerUserId: ownerId },
    });

    expect(rows.map((row) => [row.ds, row.metrics.cost, row.metrics.accountCount])).toEqual([
      ["2026-08-18", 100, 1],
      ["2026-08-19", 170, 2],
    ]);
  });

  it("aggregates account, task and biz dimensions without changing metric formulas", async () => {
    const accounts = await repository.queryDimension({
      workspaceId,
      dateFrom: "2026-08-18",
      dateTo: "2026-08-19",
      dimension: "account",
    });
    const tasks = await repository.queryDimension({
      workspaceId,
      dateFrom: "2026-08-18",
      dateTo: "2026-08-19",
      dimension: "task",
    });
    const businesses = await repository.queryDimension({
      workspaceId,
      dateFrom: "2026-08-18",
      dateTo: "2026-08-19",
      dimension: "biz",
    });

    expect(accounts.map((row) => [row.dimensionKey, row.metrics.cost])).toEqual([
      ["a-1", 220],
      ["a-2", 50],
    ]);
    expect(tasks.map((row) => [row.dimensionKey, row.metrics.cost])).toEqual([
      [null, 120],
      [taskOneId, 100],
      [taskTwoId, 50],
    ]);
    expect(businesses.map((row) => [row.dimensionKey, row.metrics.cost])).toEqual([
      [null, 120],
      ["业务甲", 100],
      ["业务乙", 50],
    ]);
    expect(accounts[0]!.metrics.ratios.realCpa).toEqual({
      value: 220 / 18,
      state: "finite",
    });
  });

  it("rejects dimensions that current canonical data cannot support", async () => {
    await expect(
      repository.queryDimension({
        workspaceId,
        dateFrom: "2026-08-18",
        dateTo: "2026-08-19",
        dimension: "bid_tool" as "account",
      }),
    ).rejects.toThrow("Unsupported dimension");
  });

  it("fails task and biz aggregation when an account-day has overlapping mappings", async () => {
    const overlappingTaskId = `t-overlap-${workspaceId}`;
    await pool.query(
      `INSERT INTO tasks (workspace_id, task_id, task_name, biz_name)
       VALUES ($1, $2, '重叠测试任务', '业务冲突')`,
      [workspaceId, overlappingTaskId],
    );
    await pool.query(
      `INSERT INTO task_accounts (workspace_id, task_id, account_id, valid_from, valid_to)
       VALUES ($1, $2, 'a-1', '2026-08-18', '2026-08-18')`,
      [workspaceId, overlappingTaskId],
    );

    const taskQuery = repository.queryDimension({
      workspaceId,
      dateFrom: "2026-08-18",
      dateTo: "2026-08-18",
      dimension: "task",
    });
    await expect(taskQuery).rejects.toBeInstanceOf(AmbiguousTaskMappingError);
    await expect(
      repository.queryDimension({
        workspaceId,
        dateFrom: "2026-08-18",
        dateTo: "2026-08-18",
        dimension: "biz",
      }),
    ).rejects.toMatchObject({ accountId: "a-1", ds: "2026-08-18" });
  });

  it("reports transparent coverage components and latest pipeline health", async () => {
    await pool.query(
      `INSERT INTO metrics_raw (
         workspace_id, account_id, ds, resource, source, payload, fetched_at
       ) VALUES
         ($1, 'a-1', '2026-08-19', 'account_offline', 'offline', '{}', '2026-08-19T10:00:00Z'),
         ($1, 'a-1', '2026-08-19', 'account_offline', 'offline', '{}', '2026-08-19T11:00:00Z'),
         ($1, 'a-2', '2026-08-19', 'ad_realtime', 'realtime', '{}', '2026-08-19T09:00:00Z'),
         ($2, 'a-1', '2026-08-19', 'account_offline', 'offline', '{}', '2026-08-19T23:00:00Z')`,
      [workspaceId, otherWorkspaceId],
    );
    await pool.query(
      `INSERT INTO etl_runs (
         workspace_id, run_kind, started_at, finished_at, status, rows_ingested
       ) VALUES
         ($1, 'etl_incr', '2026-08-19T08:00:00Z', '2026-08-19T08:01:00Z', 'done', 3),
         ($1, 'etl_incr', '2026-08-19T09:00:00Z', '2026-08-19T09:01:00Z', 'failed', 0),
         ($2, 'etl_incr', '2026-08-19T23:00:00Z', '2026-08-19T23:01:00Z', 'failed', 0)`,
      [workspaceId, otherWorkspaceId],
    );
    await pool.query(
      `INSERT INTO data_quality_checks (
         workspace_id, ds, check_type, sample, passed, delta, checked_at
       ) VALUES
         ($1, '2026-08-19', 'total_reconciliation', '{}', true, '{}', '2026-08-19T10:00:00Z'),
         ($1, '2026-08-19', 'cpa_outlier', '{}', false, '{}', '2026-08-19T10:05:00Z'),
         ($1, '2026-08-18', 'missing_consecutive_days', '{}', true, '{}', '2026-08-18T10:00:00Z')`,
      [workspaceId],
    );

    const result = await repository.queryHealth({
      workspaceId,
      dateFrom: "2026-08-18",
      dateTo: "2026-08-19",
    });

    expect(result.coverage).toEqual({
      canonicalRows: 3,
      accountsInScope: 2,
      accountsWithCanonical: 2,
      dateCount: 2,
      expectedAccountDays: 4,
      missingAccountDays: 1,
    });
    expect(result.rawResources).toEqual([
      {
        resource: "account_offline",
        rowCount: 2,
        latestFetchedAt: "2026-08-19T11:00:00.000Z",
      },
      {
        resource: "ad_realtime",
        rowCount: 1,
        latestFetchedAt: "2026-08-19T09:00:00.000Z",
      },
    ]);
    expect(result.etlStatuses.map((row) => [row.status, row.runCount])).toEqual([
      ["done", 1],
      ["failed", 1],
    ]);
    expect(result.quality).toMatchObject({ passedChecks: 2, failedChecks: 1 });
    expect(result.quality.latestCheckedAt).toBe("2026-08-19T10:05:00.000Z");
  });

  it("applies account filters to health coverage and raw freshness", async () => {
    await pool.query(
      `INSERT INTO metrics_raw (
         workspace_id, account_id, ds, resource, source, payload, fetched_at
       ) VALUES
         ($1, 'a-1', '2026-08-19', 'account_realtime', 'realtime', '{}', '2026-08-19T10:00:00Z'),
         ($1, 'a-2', '2026-08-19', 'account_realtime', 'realtime', '{}', '2026-08-19T11:00:00Z')`,
      [workspaceId],
    );

    const result = await repository.queryHealth({
      workspaceId,
      dateFrom: "2026-08-18",
      dateTo: "2026-08-19",
      filters: { accountId: "a-1", media: "KUAISHOU" },
    });

    expect(result.coverage).toMatchObject({
      canonicalRows: 2,
      accountsInScope: 1,
      accountsWithCanonical: 1,
      expectedAccountDays: 2,
      missingAccountDays: 0,
    });
    expect(result.rawResources).toEqual([
      {
        resource: "account_realtime",
        rowCount: 1,
        latestFetchedAt: "2026-08-19T10:00:00.000Z",
      },
    ]);
  });

  it("applies a task filter consistently to dimensions and coverage", async () => {
    const dimensions = await repository.queryDimension({
      workspaceId,
      dateFrom: "2026-08-18",
      dateTo: "2026-08-19",
      dimension: "task",
      filters: { taskId: taskOneId },
    });
    const health = await repository.queryHealth({
      workspaceId,
      dateFrom: "2026-08-18",
      dateTo: "2026-08-19",
      filters: { taskId: taskOneId },
    });

    expect(dimensions.map((row) => [row.dimensionKey, row.metrics.cost])).toEqual([
      [taskOneId, 100],
    ]);
    expect(health.coverage).toMatchObject({
      canonicalRows: 1,
      accountsInScope: 1,
      accountsWithCanonical: 1,
      expectedAccountDays: 2,
      missingAccountDays: 1,
    });
  });
});
