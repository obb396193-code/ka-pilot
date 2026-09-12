import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runMigrations } from "@ka/db";
import { createPlatformWindowQuery } from "../src/data/platform-window-query.js";
import { createPlatformDimensionQuery } from "../src/data/platform-dimension-query.js";
import { SemanticQueryRepository, withSemanticReadSnapshot } from "@ka/db";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { createDataApiServer } from "../src/data/http-server.js";
import { PlatformDataSource } from "../src/data/platform-data-source.js";
import { DataQueryService } from "../src/data/query-service.js";
import { createDataQueryRegistry } from "../src/data/query-registry.js";
import { approvedSessionAuth, businessHeaders, personalAuth } from "./business-auth-fixtures.js";

describe("personal summary window composition / synthetic real PG", () => {
  let pool: Pool;
  const workspaceId = randomUUID(), foreignWorkspaceId = randomUUID();
  const input = { workspaceId, accounts: [{ media: "KUAISHOU", accountId: "synthetic-window" }], window: { from: "2026-09-01", to: "2026-09-02" } };
  beforeAll(async () => {
    const databaseUrl = process.env.TEST_DATABASE_URL;
    if (!databaseUrl) throw new Error("Explicit isolated TEST_DATABASE_URL required");
    await runMigrations({ databaseUrl }); pool = new Pool({ connectionString: databaseUrl, max: 3 });
    for (const ws of [workspaceId, foreignWorkspaceId]) {
      await pool.query("INSERT INTO workspaces(id,name) VALUES($1,'synthetic window')", [ws]);
      await pool.query("INSERT INTO tasks(workspace_id,task_id,task_name,biz_name) VALUES($1,'synthetic-task','synthetic task','synthetic-biz')", [ws]);
      await pool.query("INSERT INTO assessment_price_history(workspace_id,task_id,price,effective_date) VALUES($1,'synthetic-task',20,'2026-09-01'),($1,'synthetic-task',10,'2026-09-02'),($1,'synthetic-task',999,'2026-09-03')", [ws]);
      for (const media of ["KUAISHOU", "TENCENT"]) {
        await pool.query("INSERT INTO accounts(workspace_id,media,account_id) VALUES($1,$2,'synthetic-window')", [ws, media]);
        await pool.query("INSERT INTO task_accounts(workspace_id,media,account_id,task_id,valid_from) VALUES($1,$2,'synthetic-window','synthetic-task','2026-08-01')", [ws, media]);
        for (const [ds, cash, conv] of [["2026-09-01", 22, 1], ["2026-09-02", 3, 1], ["2026-08-25", 10, 2], ["2026-08-26", 10, 2]] as const) {
          const actualCash = ws === workspaceId && media === "KUAISHOU" ? cash : 900;
          await pool.query("INSERT INTO account_metrics_daily(workspace_id,media,account_id,ds,cost,cash_cost,real_conversion,conversion,cost_space,computed_at) VALUES($1,$2,'synthetic-window',$3,40,$4,$5,4,999,'2026-09-02T10:00:00Z')", [ws, media, ds, actualCash, conv]);
        }
      }
    }
  });
  afterAll(async () => {
    if (!pool) return;
    for (const table of ["account_metrics_daily", "assessment_price_history", "task_accounts", "accounts", "tasks", "workspaces"]) {
      await pool.query(`DELETE FROM ${table} WHERE ${table === "workspaces" ? "id" : "workspace_id"}=ANY($1::uuid[])`, [[workspaceId, foreignWorkspaceId]]);
    }
    await pool.end();
  });
  it("returns the real weighted window, not cached costSpace or cross-media/workspace data", async () => {
    const result = await createPlatformWindowQuery(pool).summary({ ...input, compare: "wow" });
    expect(result.row).toMatchObject({ rowCount: 2, accountCount: 1,
      metrics: { cashCost: { value: 25 }, realConversion: { value: 2 }, costSpace: { value: 5 }, ratios: { cashCpa: { value: 12.5 } } },
      assessment: { price: null, priceVersions: 2, costStatus: "yellow", onTarget: true },
      compare: { mode: "wow", deltas: { cashCost: { value: 0.25 }, cashCpa: { value: 7.5 }, realConversion: { value: -0.5 } } },
    });
    expect(result.lineage).toMatchObject({ returnedAccounts: 1, canonicalRows: 2, requestedAccountDays: 2 });
  });
  it("account dimension bulk snapshot retains same-ID media isolation and effective prices", async () => {
    const query = createPlatformDimensionQuery(pool);
    const result = await query.account(input);
    expect(result.rows).toMatchObject([{ key: "KUAISHOU:synthetic-window", metrics: { cashCost: { value: 25 }, costSpace: { value: 5 } },
      assessment: { priceVersions: 2, priceSource: "history", onTarget: true } }]);
    const both = await query.account({ ...input, accounts: [...input.accounts, { media: "TENCENT", accountId: "synthetic-window" }] });
    expect(new Set(both.rows.map((row) => row.key))).toEqual(new Set(["KUAISHOU:synthetic-window", "TENCENT:synthetic-window"]));
    expect(both.rows.find((row) => row.media === "TENCENT")?.metrics.cashCost.value).toBe(1800);
    expect((await query.account({ ...input, accounts: [] })).rows).toEqual([]);
    expect((await query.account({ ...input, window: { from: "2026-09-01", to: "2026-09-03" } })).rows[0]?.assessment.onTarget).toBeNull();
  });
  it("serves the real PG dimension via session-scoped HTTP; forged scope does not widen pairs", async () => {
    const platform = new PlatformDataSource(new SemanticQueryRepository(pool), (read) => withSemanticReadSnapshot(pool,
      (connection) => read(new SemanticQueryRepository(connection))), createPlatformWindowQuery(pool), createPlatformDimensionQuery(pool));
    const service = new DataQueryService({ registry: createDataQueryRegistry(), platform,
      kaData: { query: async () => { throw new Error("No KA fallback allowed"); } } });
    const internalToken = "synthetic-dimension-internal-token-000000001";
    const server = createDataApiServer({ service, internalToken,
      sessionAuthService: approvedSessionAuth(personalAuth({ workspaceId, userId: randomUUID(), accounts: input.accounts })),
      // These unrelated routes are not invoked by this HTTP composition test.
      detailService: {} as never, taskListService: {} as never, accountListService: {} as never, workItemListService: {} as never });
    server.listen(0, "127.0.0.1"); await once(server, "listening");
    const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1/query`;
    try {
      for (const [dimension, key] of [["account", "KUAISHOU:synthetic-window"], ["task", "synthetic-task"], ["biz", "synthetic-biz"]]) {
      const response = await fetch(url, { method: "POST", headers: { ...businessHeaders(internalToken), "content-type": "application/json",
        "x-request-id": "dimension-pg-request", "x-ka-workspace-id": foreignWorkspaceId, "x-ka-account-scope": "*" },
        body: JSON.stringify({ query_type: "dimension", dimension_type: dimension, date_from: "2026-09-01", date_to: "2026-09-02" }) });
      expect(response.status).toBe(200); expect(response.headers.get("x-request-id")).toBe("dimension-pg-request");
      const body = await response.json();
      expect(body).toMatchObject({ ok: true, data: { mode: "platform", source: { dimension, rowSchemaVersion: "account.dimension/v3",
        returnedRowCount: 1, rows: [{ key, metrics: { cashCost: { value: 25 } } }],
        lineage: { dataAsOf: "2026-09-02T10:00:00.000Z", metadataAvailability: "partial", datasetVersion: null,
          timezone: null, dayCut: null, window: { from: "2026-09-01", to: "2026-09-02", preset: "custom" } } } } });
      }
      const denied = await fetch(url, { method: "POST", headers: { authorization: `Bearer ${internalToken}`, "content-type": "application/json" },
        body: JSON.stringify({ query_type: "dimension", dimension_type: "account", date: "2026-09-01" }) });
      expect(denied.status).toBe(401);
    } finally { server.close(); await once(server, "close"); }
  });
  it("task changes partition daily metrics and assessment; orphan and missing days remain unknown", async () => {
    await pool.query("UPDATE task_accounts SET valid_to='2026-09-01' WHERE workspace_id=$1 AND media='KUAISHOU'", [workspaceId]);
    try {
      await pool.query("INSERT INTO task_accounts(workspace_id,media,account_id,task_id,valid_from) VALUES($1,'KUAISHOU','synthetic-window','synthetic-orphan','2026-09-02')", [workspaceId]);
      const query = createPlatformDimensionQuery(pool);
      const tasks = await query.group({ ...input, dimensionType: "task" });
      expect(tasks.lineage.returnedAccounts).toBe(1);
      expect(tasks.rows.find((r) => r.key === "synthetic-task")).toMatchObject(
        { metrics: { cashCost: { value: 22 }, costSpace: { value: -2 } }, assessment: { price: { value: 20 }, onTarget: false } });
      expect(tasks.rows.find((r) => r.key === "synthetic-orphan")).toMatchObject(
        { label: null, metrics: { cashCost: { value: 3 }, costSpace: { value: null } }, assessment: { price: null, onTarget: null } });
      const biz = await query.group({ ...input, dimensionType: "biz" });
      expect(biz.rows.map((r) => r.key)).toEqual([null, "synthetic-biz"]);
      expect(biz.rows.find((r) => r.key === "synthetic-biz")?.metrics.cashCost.value).toBe(22);
      const missing = await query.group({ ...input, dimensionType: "task", window: { from: "2026-09-01", to: "2026-09-03" } });
      expect(missing.rows.find((r) => r.key === "synthetic-orphan")?.metrics.cashCost.value).toBeNull();
      const both = await query.group({ ...input, accounts: [...input.accounts, { media: "TENCENT", accountId: "synthetic-window" }], dimensionType: "task" });
      expect(both.rows.find((r) => r.key === "synthetic-task")?.metrics.cashCost.value).toBe(1822);
      expect((await query.group({ ...input, accounts: [], dimensionType: "biz" })).rows).toEqual([]);
    } finally {
      await pool.query("DELETE FROM task_accounts WHERE workspace_id=$1 AND task_id='synthetic-orphan'", [workspaceId]);
      await pool.query("UPDATE task_accounts SET valid_to=NULL WHERE workspace_id=$1 AND media='KUAISHOU'", [workspaceId]);
    }
  });
  it("rejects overlapping task membership instead of counting the same account-day twice", async () => {
    await expect(pool.query("INSERT INTO task_accounts(workspace_id,media,account_id,task_id,valid_from) VALUES($1,'KUAISHOU','synthetic-window','synthetic-overlap','2026-09-02')", [workspaceId]))
      .rejects.toMatchObject({ code: "23P01", constraint: "task_accounts_account_validity_excl" });
    expect((await createPlatformDimensionQuery(pool).group({ ...input, dimensionType: "task" })).rows).toHaveLength(1);
  });
  it("empty explicit scope stays empty; no workspace discovery fallback", async () => {
    const result = await createPlatformWindowQuery(pool).summary({ ...input, accounts: [] });
    expect(result.row).toMatchObject({ accountCount: 0, rowCount: 0, metrics: { cashCost: { value: null, availability: "missing" } }, assessment: { onTarget: null } });
    expect(result.lineage.returnedAccountDays).toBe(0);
  });
  it("missing account-days give a labelled partial total and suspend the assessment", async () => {
    // v1.9.35（老板拍板 B）：缺账户日不再让整窗变「−」——给有数那部分的和并标 partial；
    // 但**判定一律挂起**（partial_data），所以剩下那部分绝不会被判成「达标」。
    // 变的是「给不给数」，没变的是「绝不拿不完整的数下结论」。
    const result = await createPlatformWindowQuery(pool).summary({ ...input, window: { from: "2026-09-01", to: "2026-09-03" } });
    // 「不能看起来是绿的」这层意图现在由**判定挂起**保证（下面三条），而不是靠把整窗抹成「−」。
    expect(result.row.metrics.cashCost.availability).toBe("partial");
    expect(result.row.metrics.costSpace.availability).toBe("partial");
    expect(result.row.assessment.onTarget).toBeNull();
    expect(result.row.assessment.costStatus).toBeNull();
    expect(result.row.assessment.costStatusReason).toBe("partial_data");
    expect(result.lineage).toMatchObject({ requestedAccountDays: 3, returnedAccountDays: 2 });

    // v1.9.33 缺数点名：少了哪个账户的哪一天、少了哪几个字段，必须逐条说出来——
    // 只给一屏「−」，用户分不清「这天没投」还是「这天没拉到」。
    const named = result.namedGaps.filter((entry) => typeof entry !== "string")
      .map((entry) => entry as unknown as Record<string, unknown>);
    expect(named.length).toBeGreaterThan(0);
    for (const gap of named) {
      expect(["ACCOUNT_DAY_MISSING", "BATCH_FAILED"]).toContain(gap.code);
      expect(typeof gap.media).toBe("string");
      expect(typeof gap.accountId).toBe("string");
      expect(String(gap.businessDate)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      if (gap.code === "ACCOUNT_DAY_MISSING") expect((gap.fields as string[]).length).toBeGreaterThan(0);
    }
    // 有缺口的窗口要在 lineage 上明说 partial，调用方才知道这个数不完整。
    expect((result.lineage as { partial?: boolean }).partial).toBe(true);
  });
  it("compares real account target rates with effective historical prices in the same window snapshot", async () => {
    await pool.query("INSERT INTO assessment_price_history(workspace_id,task_id,price,effective_date) VALUES($1,'synthetic-task',1,'2026-08-01')", [workspaceId]);
    const result = await createPlatformWindowQuery(pool).summary({ ...input, compare: "wow" });
    // Prior window: 20 cash > 1*4 conversions. Current: 25 cash <= 20*1+10*1.
    expect(result.row.compare?.deltas.onTargetRate).toEqual({ value: 1, state: "finite" });
    expect(result.warnings).toContain("BUDGET_SOURCE_NOT_READY");
    expect(result.row.assessment.budgetUsageRate).toEqual({ value: null, state: "undefined" });
  });
  it("failed batch masks old canonical at public summary/table boundaries with partial, not truncated, coverage", async () => {
    // Synthetic persisted failure evidence; actual writer/fencing is exercised by DB suite.
    const inserted = await pool.query(`INSERT INTO etl_runs(workspace_id,run_kind,status,scope)
      VALUES($1,'full','done',$2) RETURNING id::text`, [workspaceId, { batchFailures: [{
        code: "BATCH_FAILED", resource: "account_realtime", ds: "2026-09-02", media: "KUAISHOU",
        accountIds: ["synthetic-window"], fingerprint: "f".repeat(64), failedAt: "2026-09-03T00:00:00Z",
      }] }]);
    try {
      expect((await createPlatformWindowQuery(pool).summary(input)).lineage).toMatchObject({ requestedAccountDays: 2, returnedAccountDays: 1 });
      const platform = new PlatformDataSource(new SemanticQueryRepository(pool), read => withSemanticReadSnapshot(pool,
        connection => read(new SemanticQueryRepository(connection))), createPlatformWindowQuery(pool));
      const execution = { workspaceId, userId: randomUUID(), scopeKind: "explicit_accounts" as const, accounts: input.accounts };
      for (const queryId of ["account.summary", "account.table"] as const) {
        const query = createDataQueryRegistry().resolve(queryId, { dateFrom: "2026-09-01", dateTo: "2026-09-02" }, "platform");
        const result = await platform.query(query, execution);
        expect(result).toMatchObject({ status: "ready", lineage: { partial: true, truncated: false,
          coverage: { complete: false, requestedObjects: 1, returnedObjects: 1 } },
          wholeResultTotal: { value: null, availability: "partial" } });
        if (queryId === "account.summary") {
          // v1.9.35：失败批次屏蔽掉一天之后，现金花费给的是**有数那天的部分合计**（带 partial 标），
          // 而不是整窗一个「−」；判定照样挂起，所以剩下那天绝不会被读成「达标」。
          expect(result.rows[0]).toMatchObject({ metrics: { cashCost: { availability: "partial" } },
            assessment: { onTarget: null, costStatusReason: "partial_data" } });
        } else {
          expect(result.rows).toHaveLength(1); expect(result.rows[0]).toMatchObject({ ds: "2026-09-01" });
        }
      }
    } finally { await pool.query("DELETE FROM etl_runs WHERE id=$1 AND workspace_id=$2", [inserted.rows[0].id, workspaceId]); }
  });
});
