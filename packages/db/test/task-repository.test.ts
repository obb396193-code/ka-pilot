import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Pool } from "pg";

import { runMigrations } from "../src/migrate.js";
import {
  TaskAccountOverlapError,
  TaskRepository,
} from "../src/task-repository.js";

const databaseUrl =
  process.env.TEST_DATABASE_URL ?? "postgres://ka:ka@127.0.0.1:55432/ka";

describe("TaskRepository", () => {
  const pool = new Pool({ connectionString: databaseUrl, max: 6 });
  const repository = new TaskRepository(pool);
  let workspaceId: string;
  let otherWorkspaceId: string;
  let userId: string;
  let otherUserId: string;
  let taskId: string;

  beforeAll(async () => {
    await runMigrations({ databaseUrl });
  });
  afterAll(async () => { await pool.end(); });

  beforeEach(async () => {
    const suffix = randomUUID();
    taskId = `task-shared-${suffix}`;
    const workspaces = await pool.query<{ id: string }>(
      "INSERT INTO workspaces (name) VALUES ($1), ($2) RETURNING id",
      [`task-a-${suffix}`, `task-b-${suffix}`],
    );
    workspaceId = workspaces.rows[0]!.id;
    otherWorkspaceId = workspaces.rows[1]!.id;
    const user = await pool.query<{ id: string }>(
      `INSERT INTO users (workspace_id, buc_id, name)
       VALUES ($1, $2, '脱敏优化师') RETURNING id`,
      [workspaceId, `owner-${suffix}`],
    );
    userId = user.rows[0]!.id;
    const otherUser = await pool.query<{ id: string }>(
      `INSERT INTO users (workspace_id, buc_id, name)
       VALUES ($1, $2, '其他租户用户') RETURNING id`,
      [otherWorkspaceId, `other-owner-${suffix}`],
    );
    otherUserId = otherUser.rows[0]!.id;

    await pool.query(
      `INSERT INTO tasks (
         workspace_id, task_id, task_name, biz_name, rta_flag, delivery_mode,
         placement_pref, conversion_metric, period_start, period_end,
         target_volume, budget, owner_user_id, status
       ) VALUES
         ($1, $3, '主租户任务', '业务甲', true, '常规', '信息流', '激活',
          '2026-08-01', '2026-08-31', 500000, 600000, $4, 'active'),
         ($2, $3, '其他租户同号任务', '业务乙', false, '常规', '联盟', '下单',
          '2026-08-01', '2026-08-31', 1, 1, NULL, 'active')`,
      [workspaceId, otherWorkspaceId, taskId, userId],
    );
    await pool.query(
      `INSERT INTO accounts (workspace_id, account_id, account_name, media)
       VALUES
         ($1, 'account-1', '测试账户一', 'KUAISHOU'),
         ($1, 'account-2', '测试账户二', 'KUAISHOU'),
         ($2, 'other-account', '其他租户账户', 'KUAISHOU')`,
      [workspaceId, otherWorkspaceId],
    );
  });

  it("loads the frozen task fields without crossing workspaces", async () => {
    const task = await repository.getTask(workspaceId, taskId);
    const other = await repository.getTask(otherWorkspaceId, taskId);

    expect(task).toMatchObject({
      workspaceId,
      taskId,
      taskName: "主租户任务",
      bizName: "业务甲",
      targetVolume: 500_000,
      budget: 600_000,
      ownerUserId: userId,
    });
    expect(other?.taskName).toBe("其他租户同号任务");
    expect(await repository.getTask(workspaceId, "missing")).toBeNull();
  });

  it("adds non-overlapping task-account periods and rejects overlap", async () => {
    const first = await repository.assignAccount({
      workspaceId,
      taskId,
      media: "KUAISHOU",
      accountId: "account-1",
      validFrom: "2026-08-01",
      validTo: "2026-08-10",
    });
    const second = await repository.assignAccount({
      workspaceId,
      taskId,
      media: "KUAISHOU",
      accountId: "account-1",
      validFrom: "2026-08-11",
      validTo: null,
    });

    expect(first).toMatchObject({ validFrom: "2026-08-01", validTo: "2026-08-10" });
    expect(second).toMatchObject({ validFrom: "2026-08-11", validTo: null });
    await expect(
      repository.assignAccount({
        workspaceId,
        taskId,
        media: "KUAISHOU",
        accountId: "account-1",
        validFrom: "2026-08-20",
        validTo: "2026-08-25",
      }),
    ).rejects.toBeInstanceOf(TaskAccountOverlapError);
  });

  it("rejects invalid periods and references outside the workspace", async () => {
    await expect(
      repository.assignAccount({
        workspaceId,
        taskId,
        media: "KUAISHOU",
        accountId: "account-1",
        validFrom: "2026-08-20",
        validTo: "2026-08-19",
      }),
    ).rejects.toThrow("validFrom");
    await expect(
      repository.assignAccount({
        workspaceId,
        taskId,
        media: "KUAISHOU",
        accountId: "other-account",
        validFrom: "2026-08-01",
        validTo: null,
      }),
    ).rejects.toThrow("account not found in workspace");
  });

  it("serializes concurrent assignments so only one overlapping period wins", async () => {
    const input = {
      workspaceId,
      taskId,
      media: "KUAISHOU",
      accountId: "account-2",
      validFrom: "2026-08-01",
      validTo: null,
    };
    const results = await Promise.allSettled([
      repository.assignAccount(input),
      repository.assignAccount(input),
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((result) => result.status === "rejected");
    expect(rejected).toMatchObject({ reason: expect.any(TaskAccountOverlapError) });
  });

  it("serializes different tasks for one tuple and returns the stable conflict", async () => {
    const secondTask = `${taskId}-second`;
    await pool.query("INSERT INTO tasks(workspace_id,task_id) VALUES ($1,$2)", [workspaceId, secondTask]);
    const base = { workspaceId, media: "KUAISHOU", accountId: "account-1", validFrom: "2026-08-01", validTo: null };
    const results = await Promise.allSettled([
      repository.assignAccount({ ...base, taskId }), repository.assignAccount({ ...base, taskId: secondTask }),
    ]);
    expect(results.filter((value) => value.status === "fulfilled")).toHaveLength(1);
    expect(results.find((value) => value.status === "rejected")).toMatchObject({
      reason: { name: "TaskAccountOverlapError", code: "TASK_ACCOUNT_OVERLAP", statusCode: 409 },
    });
    const rows = await pool.query("SELECT task_id FROM task_accounts WHERE workspace_id=$1 AND account_id='account-1'", [workspaceId]);
    expect(rows.rows).toHaveLength(1);
  });

  it("keeps same account ids independent across media and workspaces", async () => {
    await pool.query(`INSERT INTO accounts(workspace_id,media,account_id)
      VALUES ($1,'TENCENT','account-1'),($2,'KUAISHOU','account-1')`, [workspaceId, otherWorkspaceId]);
    const base = { taskId, accountId: "account-1", validFrom: "2026-08-01", validTo: null };
    const results = await Promise.all([
      repository.assignAccount({ ...base, workspaceId, media: "KUAISHOU" }),
      repository.assignAccount({ ...base, workspaceId, media: "TENCENT" }),
      repository.assignAccount({ ...base, workspaceId: otherWorkspaceId, media: "KUAISHOU" }),
    ]);
    expect(new Set(results.map((row) => JSON.stringify([row.workspaceId,row.media,row.accountId]))).size).toBe(3);
  });

  it("appends assessment-price versions with evidence and resolves by date", async () => {
    await repository.appendAssessmentPrice({
      workspaceId,
      taskId,
      price: 12.5,
      effectiveDate: "2026-08-01",
      changedBy: userId,
      evidenceUrl: "https://example.invalid/evidence/v1",
    });
    await repository.appendAssessmentPrice({
      workspaceId,
      taskId,
      price: 11,
      effectiveDate: "2026-08-15",
      changedBy: userId,
      evidenceUrl: "https://example.invalid/evidence/v2",
    });
    const latestSameDay = await repository.appendAssessmentPrice({
      workspaceId,
      taskId,
      price: 10.5,
      effectiveDate: "2026-08-15",
      changedBy: userId,
      evidenceUrl: null,
    });

    expect(await repository.getEffectiveAssessmentPrice(workspaceId, taskId, "2026-07-31")).toBeNull();
    expect(
      await repository.getEffectiveAssessmentPrice(workspaceId, taskId, "2026-08-10"),
    ).toMatchObject({ price: 12.5, evidenceUrl: "https://example.invalid/evidence/v1" });
    expect(
      await repository.getEffectiveAssessmentPrice(workspaceId, taskId, "2026-08-20"),
    ).toEqual(latestSameDay);

    const history = await repository.listAssessmentPriceHistory(workspaceId, taskId);
    expect(history.map((version) => version.price)).toEqual([10.5, 11, 12.5]);
    expect(history.every((version) => version.changedBy === userId)).toBe(true);
    await expect(
      repository.appendAssessmentPrice({
        workspaceId,
        taskId,
        price: 0,
        effectiveDate: "2026-08-20",
        changedBy: userId,
        evidenceUrl: null,
      }),
    ).rejects.toThrow("price");
    await expect(
      repository.appendAssessmentPrice({
        workspaceId,
        taskId,
        price: 10,
        effectiveDate: "2026-08-20",
        changedBy: otherUserId,
        evidenceUrl: null,
      }),
    ).rejects.toThrow("task or actor not found in workspace");
  });

  it("aggregates canonical facts only while a task-account mapping is effective", async () => {
    await repository.assignAccount({
      workspaceId,
      taskId,
      media: "KUAISHOU",
      accountId: "account-1",
      validFrom: "2026-08-01",
      validTo: "2026-08-18",
    });
    await repository.assignAccount({
      workspaceId,
      taskId,
      media: "KUAISHOU",
      accountId: "account-2",
      validFrom: "2026-08-19",
      validTo: null,
    });
    await pool.query(
      `INSERT INTO account_metrics_daily (
         workspace_id, media, account_id, ds, cost, exposure, click, conversion,
         real_conversion, cash_cost, cost_space, wake_uv, potential_uv, data_anomaly
       ) VALUES
         ($1, 'KUAISHOU', 'account-1', '2026-08-18', 100, 1000, 100, 12, 10, 80, 20, 50, 25, false),
         ($1, 'KUAISHOU', 'account-1', '2026-08-19', 999, 1, 1, 1, 1, 999, 0, 1, 1, true),
         ($1, 'KUAISHOU', 'account-2', '2026-08-19', 50, 500, 25, 5, 5, 40, 10, 20, 10, true),
         ($2, 'KUAISHOU', 'other-account', '2026-08-19', 9000, 1, 1, 1, 1, 9000, 0, 1, 1, true)`,
      [workspaceId, otherWorkspaceId],
    );

    const rows = await repository.queryDailyMetrics({
      workspaceId,
      taskId,
      dateFrom: "2026-08-18",
      dateTo: "2026-08-19",
    });

    expect(rows.map((row) => [row.ds, row.metrics.cost, row.metrics.realConversion])).toEqual([
      ["2026-08-18", 100, 10],
      ["2026-08-19", 50, 5],
    ]);
    expect(rows[1]!.metrics.anomalyRows).toBe(1);
    await pool.query("DELETE FROM account_metrics_daily WHERE workspace_id=$1 AND media='KUAISHOU' AND account_id='account-2'", [workspaceId]);
    const missing = await repository.queryDailyMetrics({ workspaceId, taskId,
      dateFrom: "2026-08-18", dateTo: "2026-08-19" });
    expect(missing.map((row) => [row.ds, row.metrics.cost, row.metrics.rowCount])).toEqual([
      ["2026-08-18", 100, 1], ["2026-08-19", null, 0],
    ]);
  });
});
