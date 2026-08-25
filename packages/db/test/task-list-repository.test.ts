import { randomUUID } from "node:crypto";

import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  Pool,
  type PoolClient,
  type QueryResult,
  type QueryResultRow,
} from "pg";

import { runMigrations } from "../src/migrate.js";
import {
  TaskListRepository,
  type TaskListRepositoryPool,
} from "../src/task-list-repository.js";

const databaseUrl =
  process.env.TEST_DATABASE_URL ?? "postgres://ka:ka@127.0.0.1:55432/ka";

describe("TaskListRepository", () => {
  const pool = new Pool({ connectionString: databaseUrl, max: 8 });
  const repository = new TaskListRepository(pool);
  let workspaceId: string;
  let otherWorkspaceId: string;
  let ownerId: string;
  let activeTaskId: string;
  let secondActiveTaskId: string;
  let preparingTaskId: string;
  let endedTaskId: string;

  beforeAll(async () => {
    await runMigrations({ databaseUrl });
  });

  beforeEach(async () => {
    const suffix = randomUUID();
    const workspaces = await pool.query<{ id: string }>(
      "INSERT INTO workspaces (name) VALUES ($1), ($2) RETURNING id",
      [`task-list-${suffix}`, `task-list-other-${suffix}`],
    );
    workspaceId = workspaces.rows[0]!.id;
    otherWorkspaceId = workspaces.rows[1]!.id;
    const owner = await pool.query<{ id: string }>(
      `INSERT INTO users (workspace_id, buc_id, name)
       VALUES ($1, $2, '脱敏优化师') RETURNING id`,
      [workspaceId, `task-list-owner-${suffix}`],
    );
    ownerId = owner.rows[0]!.id;

    activeTaskId = `active-a-${suffix}`;
    secondActiveTaskId = `active-b-${suffix}`;
    preparingTaskId = `preparing-${suffix}`;
    endedTaskId = `ended-${suffix}`;
    await pool.query(
      `INSERT INTO tasks (
         workspace_id, task_id, task_name, biz_name, period_start, period_end,
         target_volume, budget, owner_user_id, status
       ) VALUES
         ($1, $2, '核心任务', '业务甲', '2026-08-01', '2026-08-31', 1000, 10000, $6, 'active'),
         ($1, $3, '长期任务', '业务乙', '2026-08-01', NULL, 2000, NULL, $6, 'active'),
         ($1, $4, '准备任务', '业务甲', '2026-08-20', '2026-09-30', 500, 5000, NULL, 'preparing'),
         ($1, $5, '结束任务', '业务丙', '2026-07-01', '2026-07-31', 300, 3000, NULL, 'ended'),
         ($7, $2, '其他租户同号任务', '越权业务', '2026-08-01', '2026-08-31', 1, 1, NULL, 'active')`,
      [
        workspaceId,
        activeTaskId,
        secondActiveTaskId,
        preparingTaskId,
        endedTaskId,
        ownerId,
        otherWorkspaceId,
      ],
    );

    await pool.query(
      `INSERT INTO accounts (workspace_id, media, account_id, account_name) VALUES
         ($1, 'KUAISHOU', 'same-id', '授权快手账户'),
         ($1, 'TENCENT', 'same-id', '未授权同号账户'),
         ($1, 'KUAISHOU', 'unapproved', '未授权账户'),
         ($2, 'KUAISHOU', 'same-id', '其他租户同号账户')`,
      [workspaceId, otherWorkspaceId],
    );
    await pool.query(
      `INSERT INTO task_accounts (
         workspace_id, task_id, media, account_id, valid_from, valid_to
       ) VALUES
         ($1, $2, 'KUAISHOU', 'same-id', '2026-08-01', NULL),
         ($1, $2, 'TENCENT', 'same-id', '2026-08-01', NULL),
         ($1, $3, 'KUAISHOU', 'unapproved', '2026-08-01', NULL),
         ($4, $2, 'KUAISHOU', 'same-id', '2026-08-01', NULL)`,
      [workspaceId, activeTaskId, secondActiveTaskId, otherWorkspaceId],
    );
    await pool.query(
      `INSERT INTO account_metrics_daily (
         workspace_id, media, account_id, ds, cost, real_conversion, computed_at
       ) VALUES
         ($1, 'KUAISHOU', 'same-id', '2026-08-24', 100, 10, '2026-08-24T12:00:00Z'),
         ($1, 'KUAISHOU', 'same-id', '2026-08-25', 200, 20, '2026-08-25T12:00:00Z'),
         ($1, 'TENCENT', 'same-id', '2026-08-25', 9000, 900, '2026-08-25T13:00:00Z'),
         ($1, 'KUAISHOU', 'unapproved', '2026-08-25', 8000, 800, '2026-08-25T14:00:00Z'),
         ($2, 'KUAISHOU', 'same-id', '2026-08-25', 7000, 700, '2026-08-25T15:00:00Z')`,
      [workspaceId, otherWorkspaceId],
    );
    await pool.query(
      `INSERT INTO assessment_price_history (
         workspace_id, task_id, price, effective_date, changed_by
       ) VALUES
         ($1, $2, 38, '2026-08-01', $3),
         ($1, $2, 39, '2026-08-01', $3),
         ($1, $2, 99, '2026-08-26', $3)`,
      [workspaceId, activeTaskId, ownerId],
    );
    await pool.query(
      `INSERT INTO work_items (
         workspace_id, type, media, account_id, task_id, severity, title, status
       ) VALUES
         ($1, 'diagnosis', 'KUAISHOU', 'same-id', $2, 'P1', '授权工作项', 'open'),
         ($1, 'diagnosis', 'TENCENT', 'same-id', $2, 'P0', '跨媒体越权', 'processing'),
         ($1, 'self', NULL, NULL, $2, 'P0', '无账户范围工作项', 'escalated'),
         ($1, 'diagnosis', 'KUAISHOU', 'same-id', $2, 'P0', '已完成', 'done')`,
      [workspaceId, activeTaskId],
    );
  });

  const baseQuery = () => ({
    workspaceId,
    businessDate: "2026-08-25",
    allowedAccounts: [{ media: "KUAISHOU", accountId: "same-id" }],
    page: 1,
    pageSize: 20,
  });

  it("returns stable status/end/id ordering with total from the same repository call", async () => {
    const result = await repository.list(baseQuery());

    expect(result.total).toBe(4);
    expect(result.rows.map((row) => row.taskId)).toEqual([
      activeTaskId,
      secondActiveTaskId,
      preparingTaskId,
      endedTaskId,
    ]);
    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(20);

    const firstPage = await repository.list({ ...baseQuery(), pageSize: 1 });
    const secondPage = await repository.list({ ...baseQuery(), page: 2, pageSize: 1 });
    expect(firstPage.rows[0]?.taskId).toBe(activeTaskId);
    expect(secondPage.rows[0]?.taskId).toBe(secondActiveTaskId);
    expect(firstPage.total).toBe(secondPage.total);
  });

  it("applies parameterized search, filters, overlap and authorized open-work-item predicates", async () => {
    expect((await repository.list({ ...baseQuery(), q: "核心" })).rows)
      .toHaveLength(1);
    expect((await repository.list({ ...baseQuery(), status: "preparing" })).rows[0]?.taskId)
      .toBe(preparingTaskId);
    expect((await repository.list({ ...baseQuery(), ownerUserId: ownerId })).total)
      .toBe(2);
    expect((await repository.list({
      ...baseQuery(),
      periodFrom: "2026-08-25",
      periodTo: "2026-09-15",
    })).rows.map((row) => row.taskId)).toEqual([
      activeTaskId,
      preparingTaskId,
    ]);
    expect((await repository.list({ ...baseQuery(), hasOpenWorkItems: true })).rows)
      .toHaveLength(1);
    expect((await repository.list({ ...baseQuery(), hasOpenWorkItems: false })).total)
      .toBe(3);
    expect((await repository.list({ ...baseQuery(), q: "%' OR true --" })).total)
      .toBe(0);
  });

  it("uses only approved media/account tuples for counts, facts and work-item summary", async () => {
    const row = (await repository.list(baseQuery())).rows[0]!;

    expect(row).toMatchObject({
      taskId: activeTaskId,
      owner: { userId: ownerId, displayName: "脱敏优化师" },
      assessmentPrice: { value: 39, effectiveDate: "2026-08-01" },
      linkedAccountCount: 1,
      totalLinkedAccountCount: 2,
      completedVolume: 30,
      spent: 300,
      recentDailyVolumes: [10, 20],
      workItemSummary: {
        openCount: 1,
        highestSeverity: "P1",
        counts: { P0: 0, P1: 1, P2: 0, opportunity: 0 },
      },
      latestMetricDate: "2026-08-25",
      dataAsOf: "2026-08-25T12:00:00.000Z",
    });
    expect(row.completedVolume).not.toBe(930);
    expect(row.dataAsOf).not.toBe("2026-08-25T15:00:00.000Z");
  });

  it("never selects an assessment price that is not yet effective", async () => {
    const row = (await repository.list(baseQuery())).rows[0]!;
    expect(row.assessmentPrice?.value).toBe(39);
    expect(row.assessmentPrice?.value).not.toBe(99);
  });

  it("keeps task metadata but reveals no account-derived facts for an empty grant", async () => {
    const result = await repository.list({ ...baseQuery(), allowedAccounts: [] });
    const row = result.rows[0]!;

    expect(result.total).toBe(4);
    expect(row).toMatchObject({
      taskId: activeTaskId,
      linkedAccountCount: 0,
      totalLinkedAccountCount: 2,
      completedVolume: null,
      spent: null,
      recentDailyVolumes: [],
      dataAsOf: null,
      latestMetricDate: null,
      workItemSummary: {
        openCount: 0,
        highestSeverity: null,
        counts: { P0: 0, P1: 0, P2: 0, opportunity: 0 },
      },
    });
    expect(result.coverageComplete).toBe(false);
  });

  it("does not cross workspace boundaries even when task/account IDs match", async () => {
    const result = await repository.list(baseQuery());
    expect(result.rows.every((row) => row.workspaceId === workspaceId)).toBe(true);
    expect(result.rows.some((row) => row.taskName === "其他租户同号任务")).toBe(false);
  });

  it("rejects malformed and duplicate tuple scope before opening a query", async () => {
    await expect(repository.list({
      ...baseQuery(),
      allowedAccounts: [{ media: "", accountId: "same-id" }],
    })).rejects.toThrow("allowedAccounts");
    await expect(repository.list({
      ...baseQuery(),
      allowedAccounts: [
        { media: "KUAISHOU", accountId: "same-id" },
        { media: "KUAISHOU", accountId: "same-id" },
      ],
    })).rejects.toThrow("duplicate");
  });

  it("holds total and page rows in one repeatable-read snapshot", async () => {
    const insertedTaskId = `snapshot-${randomUUID()}`;
    let inserted = false;
    const instrumentedPool: TaskListRepositoryPool = {
      connect: async () => {
        const client = await pool.connect();
        return {
          query: async <Row extends QueryResultRow>(
            sql: string,
            values?: readonly unknown[],
          ) => {
            const result = await client.query<Row>(sql, values as unknown[] | undefined);
            if (!inserted && sql.includes("task-list-total")) {
              inserted = true;
              await pool.query(
                `INSERT INTO tasks (
                   workspace_id, task_id, task_name, status, period_start, period_end
                 ) VALUES ($1, $2, '并发插入任务', 'active', '2026-08-01', '2026-08-15')`,
                [workspaceId, insertedTaskId],
              );
            }
            return result as QueryResult<Row>;
          },
          release: () => client.release(),
        } as Pick<PoolClient, "query" | "release">;
      },
    };
    const snapshotRepository = new TaskListRepository(instrumentedPool);

    const result = await snapshotRepository.list(baseQuery());
    expect(result.total).toBe(4);
    expect(result.rows.some((row) => row.taskId === insertedTaskId)).toBe(false);
    expect((await repository.list(baseQuery())).total).toBe(5);
  });
});
