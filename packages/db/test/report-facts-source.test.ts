import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Pool } from "pg";

import { parseReportExecutionPlan } from "@ka/domain";

import { runMigrations } from "../src/migrate.js";
import {
  SemanticReportFactsSource,
  type SemanticReportQueryPort,
} from "../src/report-facts-source.js";
import { SemanticQueryRepository } from "../src/semantic-query-repository.js";
import { AmbiguousTaskMappingError } from "../src/semantic-query-types.js";

const databaseUrl =
  process.env.TEST_DATABASE_URL ?? "postgres://ka:ka@127.0.0.1:55432/ka";

function reportPlan() {
  return parseReportExecutionPlan({
    version: "b6-internal-v1",
    title: "事实适配测试",
    scope: { dateFrom: "2026-08-18", dateTo: "2026-08-19" },
    components: [
      { id: "cost", title: "消耗", kind: "kpi", metric: "cost" },
      { id: "trend", title: "CPA", kind: "trend", metric: "realCpa" },
      { id: "task_one", title: "任务一", kind: "table", dimension: "task", metrics: ["cost"] },
      { id: "task_two", title: "任务二", kind: "bar", dimension: "task", metrics: ["realCpa"] },
    ],
  });
}

describe("SemanticReportFactsSource", () => {
  const pool = new Pool({ connectionString: databaseUrl });
  let workspaceId: string;
  let otherWorkspaceId: string;
  let taskId: string;

  beforeAll(async () => {
    await runMigrations({ databaseUrl });
  });

  beforeEach(async () => {
    const workspace = await pool.query<{ id: string }>(
      "INSERT INTO workspaces (name) VALUES ('report-primary') RETURNING id",
    );
    const other = await pool.query<{ id: string }>(
      "INSERT INTO workspaces (name) VALUES ('report-other') RETURNING id",
    );
    workspaceId = workspace.rows[0]!.id;
    otherWorkspaceId = other.rows[0]!.id;
    taskId = `task-${workspaceId}`;

    await pool.query(
      `INSERT INTO accounts (workspace_id, account_id, account_name, media, status)
       VALUES ($1, 'a-1', '脱敏账户', 'KUAISHOU', 'active'),
              ($2, 'a-1', '其他租户账户', 'KUAISHOU', 'active')`,
      [workspaceId, otherWorkspaceId],
    );
    await pool.query(
      `INSERT INTO tasks (workspace_id, task_id, task_name, biz_name)
       VALUES ($1, $2, '脱敏任务', '业务甲')`,
      [workspaceId, taskId],
    );
    await pool.query(
      `INSERT INTO task_accounts (workspace_id, task_id, media, account_id, valid_from)
       VALUES ($1, $2, 'KUAISHOU', 'a-1', '2026-08-01')`,
      [workspaceId, taskId],
    );
    await pool.query(
      `INSERT INTO account_metrics_daily (
         workspace_id, media, account_id, ds, cost, exposure, click, conversion,
         real_conversion, cash_cost, cost_space, wake_uv, potential_uv, data_anomaly
       ) VALUES
         ($1, 'KUAISHOU', 'a-1', '2026-08-18', 100, 1000, 100, 12, 10, 80, 20, 50, 25, false),
         ($1, 'KUAISHOU', 'a-1', '2026-08-19', 120, 1200, 96, 10, 8, 96, 4, 40, 20, true),
         ($2, 'KUAISHOU', 'a-1', '2026-08-19', 9999, 1, 1, 1, 1, 9999, 0, 1, 1, true)`,
      [workspaceId, otherWorkspaceId],
    );
  });

  it("loads requested semantic facts once and preserves aggregate ratio states", async () => {
    const repository = new SemanticQueryRepository(pool);
    const calls = { summary: 0, trend: 0, dimension: 0 };
    const port: SemanticReportQueryPort = {
      querySummary: async (scope) => {
        calls.summary += 1;
        return repository.querySummary(scope);
      },
      queryTrend: async (scope) => {
        calls.trend += 1;
        return repository.queryTrend(scope);
      },
      queryDimension: async (scope) => {
        calls.dimension += 1;
        return repository.queryDimension(scope);
      },
    };
    const source = new SemanticReportFactsSource(port, {
      resolve: async () => "2026-08-19T10:30:00.000Z",
    });

    const facts = await source.load({ workspaceId, plan: reportPlan() });

    expect(calls).toEqual({ summary: 1, trend: 1, dimension: 1 });
    expect(facts.workspaceId).toBe(workspaceId);
    expect(facts.summary?.cost).toEqual({ value: 220, state: "finite" });
    expect(facts.summary?.realCpa).toEqual({ value: 220 / 18, state: "finite" });
    expect(facts.trend).toHaveLength(2);
    expect(facts.dimensions.task).toEqual([
      expect.objectContaining({
        dimensionKey: taskId,
        metrics: expect.objectContaining({ cost: { value: 220, state: "finite" } }),
      }),
    ]);
  });

  it("loads only the facts required by the plan", async () => {
    const repository = new SemanticQueryRepository(pool);
    const calls = { summary: 0, trend: 0, dimension: 0 };
    const port: SemanticReportQueryPort = {
      querySummary: async (scope) => {
        calls.summary += 1;
        return repository.querySummary(scope);
      },
      queryTrend: async (scope) => {
        calls.trend += 1;
        return repository.queryTrend(scope);
      },
      queryDimension: async (scope) => {
        calls.dimension += 1;
        return repository.queryDimension(scope);
      },
    };
    const source = new SemanticReportFactsSource(port, {
      resolve: async () => "2026-08-19T10:30:00.000Z",
    });
    const plan = parseReportExecutionPlan({
      version: "b6-internal-v1",
      title: "账户分组",
      scope: { dateFrom: "2026-08-18", dateTo: "2026-08-19" },
      components: [
        { id: "accounts", title: "账户", kind: "bar", dimension: "account", metrics: ["cost"] },
      ],
    });

    const facts = await source.load({ workspaceId, plan });

    expect(calls).toEqual({ summary: 0, trend: 0, dimension: 1 });
    expect(facts.summary).toBeNull();
    expect(facts.trend).toBeNull();
    expect(facts.dimensions.account).toHaveLength(1);
  });

  it("propagates ambiguous task ownership instead of double counting", async () => {
    await pool.query(
      `INSERT INTO tasks (workspace_id, task_id, task_name)
       VALUES ($1, $2, '重叠任务')`,
      [workspaceId, `overlap-${workspaceId}`],
    );
    await pool.query(
      `INSERT INTO task_accounts (workspace_id, task_id, media, account_id, valid_from)
       VALUES ($1, $2, 'KUAISHOU', 'a-1', '2026-08-01')`,
      [workspaceId, `overlap-${workspaceId}`],
    );
    const source = new SemanticReportFactsSource(new SemanticQueryRepository(pool), {
      resolve: async () => "2026-08-19T10:30:00.000Z",
    });

    await expect(source.load({ workspaceId, plan: reportPlan() })).rejects.toBeInstanceOf(
      AmbiguousTaskMappingError,
    );
  });
});
