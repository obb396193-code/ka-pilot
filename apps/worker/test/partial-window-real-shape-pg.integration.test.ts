import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { runMigrations, SemanticQueryRepository, withSemanticReadSnapshot } from "@ka/db";
import { createPlatformWindowQuery } from "../src/data/platform-window-query.js";
import { createPlatformDimensionQuery } from "../src/data/platform-dimension-query.js";
import { createDataApiServer } from "../src/data/http-server.js";
import { PlatformDataSource } from "../src/data/platform-data-source.js";
import { DataQueryService } from "../src/data/query-service.js";
import { createDataQueryRegistry } from "../src/data/query-registry.js";
import { approvedSessionAuth, businessHeaders, personalAuth } from "./business-auth-fixtures.js";

/**
 * v1.9.40 重做（arch 2026-09-12 P0 打回）：**打真实形态的库**，不是合成桩。
 *
 * 上一版（13d3067a）合成用例全绿、真库全红：只要窗口里有缺数的账户日，`account.summary`
 * 就被 data-api 自己判废成 `UPSTREAM_INVALID_RESPONSE`。根因是两边口径不同——
 * SQL 侧按**账户日**给「有数那部分的和」，而证据侧 `WindowAssessmentRepository.load` 是
 * **按天分组**、同一天只要有一个账户缺数整天就塌成 NULL。于是同一个窗口两边算出不同的数，
 * 一致性核对 `invalid()`。
 *
 * 这个库造齐真实 ETL 每天都会出现的三种账户日：
 *   ① 正常行；② 空值行（行在、指标为 NULL）；③ 失败批次被守卫屏蔽的行（行在、但读不得）。
 * 并且**让缺口发生在「同一天里只有一个账户缺」**——按天塌陷与按账户日部分合计的分歧只在这里显形。
 */
describe("v1.9.40 partial totals on a real-shaped window / real PG", () => {
  let pool: Pool;
  const workspaceId = randomUUID();
  const accounts = [
    { media: "KUAISHOU", accountId: "ws-full" },
    { media: "KUAISHOU", accountId: "ws-gappy" },
  ];
  const window = { from: "2026-09-01", to: "2026-09-03" };
  const input = { workspaceId, accounts, window };

  beforeAll(async () => {
    const databaseUrl = process.env.TEST_DATABASE_URL;
    if (!databaseUrl) throw new Error("Explicit isolated TEST_DATABASE_URL required");
    await runMigrations({ databaseUrl });
    pool = new Pool({ connectionString: databaseUrl, max: 3 });
    await pool.query("INSERT INTO workspaces(id,name) VALUES($1,'synthetic partial real shape')", [workspaceId]);
    await pool.query("INSERT INTO tasks(workspace_id,task_id,task_name,biz_name) VALUES($1,'t','任务','业务')", [workspaceId]);
    await pool.query(
      "INSERT INTO assessment_price_history(workspace_id,task_id,price,effective_date) VALUES($1,'t',20,'2026-09-01')",
      [workspaceId]);
    for (const account of accounts) {
      await pool.query("INSERT INTO accounts(workspace_id,media,account_id) VALUES($1,$2,$3)",
        [workspaceId, account.media, account.accountId]);
      await pool.query(
        `INSERT INTO task_accounts(workspace_id,media,account_id,task_id,valid_from)
         VALUES($1,$2,$3,'t','2026-08-01')`, [workspaceId, account.media, account.accountId]);
    }
    const daily = (accountId: string, ds: string, cash: number | null, conv: number | null, cost: number | null) =>
      pool.query(
        `INSERT INTO account_metrics_daily(workspace_id,media,account_id,ds,cost,cash_cost,real_conversion,conversion,exposure,click,computed_at)
         VALUES($1,'KUAISHOU',$2,$3,$4,$5,$6,4,1000,50,'2026-09-04T10:00:00Z')`,
        [workspaceId, accountId, ds, cost, cash, conv]);
    // ws-full：三天都正常。
    for (const ds of ["2026-09-01", "2026-09-02", "2026-09-03"]) await daily("ws-full", ds, 20, 2, 40);
    // ws-gappy：09-01 正常；09-02 空值行；09-03 行在但属于失败批次，被守卫屏蔽。
    await daily("ws-gappy", "2026-09-01", 10, 1, 30);
    await daily("ws-gappy", "2026-09-02", null, null, null);
    await daily("ws-gappy", "2026-09-03", 77, 7, 77);
    await pool.query(
      `INSERT INTO etl_runs(workspace_id,run_kind,status,scope,started_at,finished_at)
       VALUES($1,'canonical','failed',$2::jsonb,'2026-09-04T09:00:00Z','2026-09-04T09:05:00Z')`,
      [workspaceId, JSON.stringify({ batchFailures: [{
        media: "KUAISHOU", accountIds: ["ws-gappy"], ds: "2026-09-03",
        resource: "account", failedAt: "2026-09-04T09:01:00Z" }] })]);
  }, 60_000);

  afterAll(async () => {
    if (!pool) return;
    for (const table of ["account_metrics_daily", "etl_runs", "assessment_price_history", "task_accounts", "accounts", "tasks"]) {
      await pool.query(`DELETE FROM ${table} WHERE workspace_id=$1`, [workspaceId]);
    }
    await pool.query("DELETE FROM workspaces WHERE id=$1", [workspaceId]);
    await pool.end();
  });

  it("answers at all, instead of failing the whole window closed", async () => {
    // 这是打回那条的最小复现：真实窗口里有缺数账户日时，summary 整条被判废。
    await expect(createPlatformWindowQuery(pool).summary(input)).resolves.toBeDefined();
  });

  it("gives the partial totals for every summable metric and suspends the judgement", async () => {
    const result = await createPlatformWindowQuery(pool).summary(input);
    // 现金：ws-full 20×3 + ws-gappy 09-01 的 10 = 70。09-02 空值、09-03 被屏蔽，都不算进来，也不当 0。
    expect(result.row.metrics.cashCost).toEqual({ value: 70, availability: "partial" });
    expect(result.row.metrics.realConversion).toEqual({ value: 7, availability: "partial" });
    // 消耗类同样要给部分合计——大盘第一张卡就是它，老板拍的 B 是「窗口合计一律部分合计」。
    expect(result.row.metrics.cost).toEqual({ value: 150, availability: "partial" });
    // 由部分分子/分母算出的比率照常算，前端挂「部分」标。
    expect(result.row.metrics.ratios.cashCpa).toEqual({ value: 10, state: "finite" });
    // 判定一律挂起：拿缺了两个账户日的窗口去判达标，结论必错且看不出来。
    expect(result.row.assessment.onTarget).toBeNull();
    expect(result.row.assessment.costStatus).toBeNull();
    expect(result.row.assessment.costStatusReason).toBe("partial_data");
  });

  it("keeps the dimension rows on the same口径 as the summary", async () => {
    const rows = (await createPlatformDimensionQuery(pool).account(input)).rows;
    const gappy = rows.find((row) => row.key === "KUAISHOU:ws-gappy")!;
    expect(gappy.metrics.cashCost).toEqual({ value: 10, availability: "partial" });
    expect(gappy.assessment.onTarget).toBeNull();
    // 三天齐的那户不受影响：部分合计不能把正常账户也染成 partial。
    const full = rows.find((row) => row.key === "KUAISHOU:ws-full")!;
    expect(full.metrics.cashCost).toEqual({ value: 60, availability: "available" });
    expect(full.assessment.onTarget).not.toBeNull();
  });

  /**
   * arch 2026-09-12 打回的第 3 条：**按四种窗口形态打一遍真 data-api 再交**。
   * 上一版正是「查询类单测全绿、真 HTTP 全 502」——服务层的一致性核对在真实数据上判废整条响应，
   * 而所有合成用例都没造出那个形态。这条用例把那五个探针搬进来。
   */
  it("answers every real window shape over the actual data-api, never UPSTREAM_INVALID_RESPONSE", async () => {
    const platform = new PlatformDataSource(
      new SemanticQueryRepository(pool),
      (read) => withSemanticReadSnapshot(pool, (connection) => read(new SemanticQueryRepository(connection))),
      createPlatformWindowQuery(pool), createPlatformDimensionQuery(pool));
    const service = new DataQueryService({ registry: createDataQueryRegistry(), platform,
      kaData: { query: async () => { throw new Error("No KA fallback allowed"); } } });
    const internalToken = "synthetic-partial-internal-token-0000000001";
    const server = createDataApiServer({ service, internalToken,
      sessionAuthService: approvedSessionAuth(personalAuth({ workspaceId, userId: randomUUID(), accounts })),
      detailService: {} as never, taskListService: {} as never,
      accountListService: {} as never, workItemListService: {} as never });
    server.listen(0, "127.0.0.1"); await once(server, "listening");
    const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1/data/query`;
    try {
      const shapes = [
        { label: "空值行 + 失败批次行 + 正常行", from: "2026-09-01", to: "2026-09-03", partial: true },
        { label: "只含空值行", from: "2026-09-01", to: "2026-09-02", partial: true },
        { label: "只含失败批次行", from: "2026-09-03", to: "2026-09-03", partial: true },
        { label: "全齐", from: "2026-09-01", to: "2026-09-01", partial: false },
      ] as const;
      for (const shape of shapes) {
        const response = await fetch(url, { method: "POST", headers: {
          ...businessHeaders(internalToken), "content-type": "application/json", "x-request-id": `partial-${shape.from}` },
          body: JSON.stringify({ queryId: "account.summary", params: { dateFrom: shape.from, dateTo: shape.to } }) });
        const body = await response.json();
        // 判废的表现就是这个：200 之外的状态，或 ok:false 带 UPSTREAM_INVALID_RESPONSE。
        expect({ shape: shape.label, status: response.status, ok: body.ok, error: body.error?.code })
          .toEqual({ shape: shape.label, status: 200, ok: true, error: undefined });
        const cashCost = body.data.source.rows[0].metrics.cashCost;
        expect({ shape: shape.label, availability: cashCost.availability })
          .toEqual({ shape: shape.label, availability: shape.partial ? "partial" : "available" });
        expect(cashCost.value).not.toBeNull();
      }
    } finally {
      server.close(); await once(server, "close");
    }
  }, 60_000);

  it("still reports a fully covered window as available, not partial", async () => {
    // 分界线：窗口缩到两边都齐的那一天，一切照旧。
    const result = await createPlatformWindowQuery(pool)
      .summary({ ...input, window: { from: "2026-09-01", to: "2026-09-01" } });
    expect(result.row.metrics.cashCost).toEqual({ value: 30, availability: "available" });
    expect(result.row.assessment.costStatusReason).toBe("window_ok");
  });
});
