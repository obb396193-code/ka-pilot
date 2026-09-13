import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Pool } from "pg";

import { runMigrations } from "../src/migrate.js";
import { SemanticQueryRepository } from "../src/semantic-query-repository.js";
import { SemanticQueryContractError } from "../src/semantic-query-support.js";

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
      `INSERT INTO task_accounts (workspace_id, task_id, media, account_id, valid_from, valid_to)
       VALUES
         ($1, $2, 'KUAISHOU', 'a-1', '2026-08-01', '2026-08-18'),
         ($1, $3, 'TENCENT', 'a-2', '2026-08-19', NULL)`,
      [workspaceId, taskOneId, taskTwoId],
    );
    await pool.query(
      `INSERT INTO account_metrics_daily (
         workspace_id, media, account_id, ds, cost, exposure, click, conversion,
         real_conversion, real_cpa, cash_cost, cash_cpa, cost_space, gap,
         budget, wake_uv, potential_uv, data_anomaly
       ) VALUES
         ($1, 'KUAISHOU', 'a-1', '2026-08-18', 100, 1000, 100, 12, 10, 10, 80, 8, 20, .2, 500, 50, 25, false),
         ($1, 'KUAISHOU', 'a-1', '2026-08-19', 120, 1200, 96, 10, 8, 15, 96, 12, 4, .25, 500, 40, 20, true),
         ($1, 'TENCENT', 'a-2', '2026-08-19', 50, 500, 25, 5, 5, 10, 40, 8, 10, 0, 200, 20, 10, false),
         ($2, 'KUAISHOU', 'a-1', '2026-08-19', 9999, 1, 1, 1, 1, 9999, 9999, 9999, 0, 0, 1, 1, 1, true)`,
      [workspaceId, otherWorkspaceId],
    );
  });

  it("rejects unsafe ranges, pagination and sort input before querying", async () => {
    await expect(repository.queryTable({ workspaceId: "not-a-uuid", dateFrom: "2026-08-18", dateTo: "2026-08-19" })).rejects.toThrow("workspaceId must be a UUID");
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

  it("fails closed when PostgreSQL numeric NaN is present instead of SQL NULL", async () => {
    await pool.query(
      `UPDATE account_metrics_daily
       SET cost = 'NaN'::numeric
       WHERE workspace_id = $1 AND media = 'KUAISHOU' AND account_id = 'a-1' AND ds = '2026-08-18'`,
      [workspaceId],
    );
    const scope = { workspaceId, dateFrom: "2026-08-18", dateTo: "2026-08-18", filters: { accountScopes: [{ media: "KUAISHOU", accountId: "a-1" }] } };
    await expect(repository.queryTable(scope)).rejects.toBeInstanceOf(SemanticQueryContractError);
    await expect(repository.querySummary(scope)).rejects.toBeInstanceOf(SemanticQueryContractError);
  });

  it("applies server-side account-list and anomaly scope to canonical rows", async () => {
    const result = await repository.queryTable({
      workspaceId,
      dateFrom: "2026-08-18",
      dateTo: "2026-08-19",
      filters: { accountIds: ["a-1"], dataAnomaly: true },
    });

    expect(result.total).toBe(1);
    expect(result.rows[0]).toMatchObject({
      workspaceId,
      media: "KUAISHOU",
      accountId: "a-1",
      ds: "2026-08-19",
      dataAnomaly: true,
    });
  });

  it("keeps tuple authorization inside SQL when two media share one account_id", async () => {
    await pool.query(
      `INSERT INTO accounts (
         workspace_id, media, account_id, account_name, owner_user_id, status
       ) VALUES ($1, 'TENCENT', 'a-1', '跨媒体同号反例', $2, 'active')`,
      [workspaceId, ownerId],
    );
    await pool.query(
      `INSERT INTO account_metrics_daily (
         workspace_id, media, account_id, ds, cost, exposure, click, conversion,
         real_conversion, cash_cost, cost_space, wake_uv, potential_uv, data_anomaly
       ) VALUES
         ($1, 'TENCENT', 'a-1', '2026-08-18', 9000, 1, 1, 1, 1, 9000, 0, 1, 1, true),
         ($1, 'TENCENT', 'a-1', '2026-08-19', 9100, 1, 1, 1, 1, 9100, 0, 1, 1, true)`,
      [workspaceId],
    );
    const scope = {
      workspaceId,
      dateFrom: "2026-08-18",
      dateTo: "2026-08-19",
      filters: { accountScopes: [{ media: "KUAISHOU", accountId: "a-1" }] },
    };

    const [summary, trend, table, lineage, health] = await Promise.all([
      repository.querySummary(scope),
      repository.queryTrend(scope),
      repository.queryTable(scope),
      repository.queryLineage(scope),
      repository.queryHealth(scope),
    ]);

    expect(summary).toMatchObject({ rowCount: 2, accountCount: 1, cost: 220 });
    expect(trend.map((row) => [row.ds, row.metrics.cost])).toEqual([
      ["2026-08-18", 100],
      ["2026-08-19", 120],
    ]);
    expect(table.rows).toHaveLength(2);
    expect(table.rows.every((row) => row.media === "KUAISHOU")).toBe(true);
    expect(lineage).toMatchObject({
      canonicalRows: 2,
      returnedAccounts: 1,
      requestedAccountDays: 2,
      returnedAccountDays: 2,
    });
    expect(health.coverage).toMatchObject({
      canonicalRows: 2,
      accountsInScope: 1,
      accountsWithCanonical: 1,
      expectedAccountDays: 2,
      missingAccountDays: 0,
    });
  });

  it("derives lineage freshness from persisted canonical rows", async () => {
    const result = await repository.queryLineage({
      workspaceId,
      dateFrom: "2026-08-18",
      dateTo: "2026-08-19",
      filters: { accountIds: ["a-1"] },
    });

    expect(result).toMatchObject({
      canonicalRows: 2,
      requestedAccountDays: 2,
      returnedAccountDays: 2,
    });
    expect(result.dataAsOf).toMatch(/^\d{4}-\d{2}-\d{2}T/);
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
    // A real zero row makes the requested two-account/two-day window complete.
    await pool.query(`INSERT INTO account_metrics_daily
      (workspace_id,media,account_id,ds,cost,exposure,click,conversion,real_conversion,
       cash_cost,cost_space,wake_uv,potential_uv,data_anomaly)
      VALUES ($1,'TENCENT','a-2','2026-08-18',0,0,0,0,0,0,0,0,0,false)`, [workspaceId]);
    const result = await repository.querySummary({
      workspaceId,
      dateFrom: "2026-08-18",
      dateTo: "2026-08-19",
    });

    expect(result).toMatchObject({
      rowCount: 4,
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

  it("returns missing totals and undefined ratios for an empty summary", async () => {
    const result = await repository.querySummary({
      workspaceId,
      dateFrom: "2026-07-01",
      dateTo: "2026-07-02",
    });

    expect(result.rowCount).toBe(0);
    expect(result.cost).toBeNull();
    expect(result.ratios.realCpa).toEqual({ value: null, state: "undefined" });
  });

  it("labels a missing account-day as a partial total instead of passing it off as complete", async () => {
    const result = await repository.querySummary({ workspaceId,
      dateFrom: "2026-08-18", dateTo: "2026-08-19" });
    // v1.9.40（老板拍板 B）：缺成员时给 Σ 有数的那部分，并在 `partial` 里点名哪几列不完整。
    // 原来的做法是整窗抹成 null——一屏「−」比不完整的数更没用；而「不完整」这件事没被丢掉，
    // 它一路带到 DTO 的 availability:"partial"，判定那侧据此挂起。
    expect(result).toMatchObject({ rowCount: 3, accountCount: 2,
      partial: expect.arrayContaining(["cost", "real_conversion"]) });
    // 比率照着部分合计算：它是「已观测那部分的 CPA」，不是凭空造的数；
    // 不可比这件事由 partial 名单表达，而不是把比率也抹掉。
    expect(result.ratios.realCpa.state).toBe("finite");
  });

  it("an empty approved tuple scope cannot obtain values or expected-day rows", async () => {
    const scope = { workspaceId, dateFrom: "2026-08-18", dateTo: "2026-08-19",
      filters: { accountScopes: [] } };
    expect(await repository.querySummary(scope)).toMatchObject({ rowCount: 0, accountCount: 0, cost: null });
    expect(await repository.queryTrend(scope)).toEqual([]);
    expect(await repository.queryDimension({ ...scope, dimension: "account" })).toEqual([]);
  });

  it("keeps true zeros, propagates individual NULL fields and rejects NaN hidden by NULL", async () => {
    const scope = { workspaceId, dateFrom: "2026-08-18", dateTo: "2026-08-19",
      filters: { accountScopes: [{ media: "KUAISHOU", accountId: "a-1" }] } };
    await pool.query("UPDATE account_metrics_daily SET cost=0 WHERE workspace_id=$1", [workspaceId]);
    expect((await repository.querySummary(scope)).cost).toBe(0);
    await pool.query("UPDATE account_metrics_daily SET cost=NULL WHERE workspace_id=$1 AND ds='2026-08-18'", [workspaceId]);
    const partial = await repository.querySummary(scope);
    // v1.9.40：单列 NULL 也是「缺一部分」——给那一列的部分合计（这里 08-19 的 0）并点名它，
    // 其它列不受影响。关键是「不完整」没被吞掉，而不是把这一列抹成 null。
    expect(partial.cost).toBe(0);
    expect(partial.partial).toContain("cost");
    expect(partial.exposure).toBe(2200);
    expect(partial.partial).not.toContain("exposure");
    await pool.query("UPDATE account_metrics_daily SET cost='NaN'::numeric WHERE workspace_id=$1 AND ds='2026-08-19'", [workspaceId]);
    await expect(repository.querySummary(scope)).rejects.toBeInstanceOf(SemanticQueryContractError);
  });

  it("keeps missing dates in the trend without counting expected placeholders as source rows", async () => {
    const rows = await repository.queryTrend({
      workspaceId,
      dateFrom: "2026-08-17",
      dateTo: "2026-08-20",
      filters: { ownerUserId: ownerId },
    });

    // v1.9.40：某天只有一部分账户有数 → 给那部分的和（08-18 的 100），整天没有数才是 null。
    // 「哪天缺」这件事由 accountCount 与 partial 名单表达，不靠把当天的和抹掉。
    expect(rows.map((row) => [row.ds, row.metrics.cost, row.metrics.accountCount])).toEqual([
      ["2026-08-17", null, 0],
      ["2026-08-18", 100, 1],
      ["2026-08-19", 170, 2],
      ["2026-08-20", null, 0],
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

    // v1.9.40：a-2 缺一天 → 给有数那天的和（50）而不是整行 null；不完整由 partial 名单表达。
    expect(accounts.map((row) => [row.dimensionKey, row.metrics.cost])).toEqual([
      ["a-1", 220],
      ["a-2", 50],
    ]);
    // v1.9.40：未归属那一组（key=null）同样给部分合计；顺序按 key 排，null 组在前。
    expect(new Map(tasks.map((row) => [row.dimensionKey, row.metrics.cost])))
      .toEqual(new Map([[taskOneId, 100], [taskTwoId, 50], [null, 120]]));
    expect(new Map(businesses.map((row) => [row.dimensionKey, row.metrics.cost])))
      .toEqual(new Map([["业务甲", 100], ["业务乙", 50], [null, 120]]));
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

  it("rejects overlapping account-day mappings before aggregation", async () => {
    const overlappingTaskId = `t-overlap-${workspaceId}`;
    await pool.query(
      `INSERT INTO tasks (workspace_id, task_id, task_name, biz_name)
       VALUES ($1, $2, '重叠测试任务', '业务冲突')`,
      [workspaceId, overlappingTaskId],
    );
    await expect(pool.query(
      `INSERT INTO task_accounts (workspace_id, task_id, media, account_id, valid_from, valid_to)
       VALUES ($1, $2, 'KUAISHOU', 'a-1', '2026-08-18', '2026-08-18')`,
      [workspaceId, overlappingTaskId],
    )).rejects.toMatchObject({ code: "23P01" });
  });

  it("reports transparent coverage components and latest pipeline health", async () => {
    await pool.query(
      `INSERT INTO metrics_raw (
         workspace_id, media, account_id, ds, resource, source, payload, fetched_at
       ) VALUES
         ($1, 'KUAISHOU', 'a-1', '2026-08-19', 'account_offline', 'offline', '{}', '2026-08-19T10:00:00Z'),
         ($1, 'KUAISHOU', 'a-1', '2026-08-19', 'account_offline', 'offline', '{}', '2026-08-19T11:00:00Z'),
         ($1, 'TENCENT', 'a-2', '2026-08-19', 'ad_realtime', 'realtime', '{}', '2026-08-19T09:00:00Z'),
         ($2, 'KUAISHOU', 'a-1', '2026-08-19', 'account_offline', 'offline', '{}', '2026-08-19T23:00:00Z')`,
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
         workspace_id, media, account_id, ds, resource, source, payload, fetched_at
       ) VALUES
         ($1, 'KUAISHOU', 'a-1', '2026-08-19', 'account_realtime', 'realtime', '{}', '2026-08-19T10:00:00Z'),
         ($1, 'TENCENT', 'a-2', '2026-08-19', 'account_realtime', 'realtime', '{}', '2026-08-19T11:00:00Z')`,
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
