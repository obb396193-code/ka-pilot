import { randomUUID } from "node:crypto";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { mkdir, writeFile } from "node:fs/promises";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { runMigrations, SemanticQueryRepository, WindowAssessmentRepository, withSemanticReadSnapshot } from "@ka/db";
import { PlatformDataSource, createPlatformReadSnapshot } from "../src/data/platform-data-source.js";
import { createPlatformWindowQuery, PlatformWindowQuery } from "../src/data/platform-window-query.js";
import { createPlatformDimensionQuery } from "../src/data/platform-dimension-query.js";
import { createDashboardScopeResolver } from "../src/data/dashboard-filter-scope.js";
import { DataQueryService } from "../src/data/query-service.js";
import { createDataQueryRegistry } from "../src/data/query-registry.js";
import { createDataApiServer } from "../src/data/http-server.js";
import { approvedSessionAuth, businessHeaders, personalAuth } from "./business-auth-fixtures.js";

describe("P211 multi-filter / dedicated synthetic PG + public HTTP", () => {
  const ws = randomUUID(), other = randomUUID(), userId = randomUUID(); let pool: Pool;
  const accounts = ["a", "b", "c"].map(accountId => ({ media: "KUAISHOU", accountId }));
  const window = { from: "2026-09-01", to: "2026-09-02" };
  const filters = { optimizer: ["owner-a"], biz: ["biz-two"], task_id: ["two"], goal: ["goal"], resource_position: ["placement"] };
  const rule = ["optimizer", "goal", "placement"].map(key => ({ key, mapsTo: key, pending: false }));
  beforeAll(async () => {
    const databaseUrl = process.env.TEST_DATABASE_URL ?? "", url = new URL(databaseUrl);
    if (url.hostname !== "127.0.0.1" || url.port !== "55432" || !/^\/ka_[a-z0-9_]+_test$/.test(url.pathname)) throw new Error("Dedicated synthetic DB required");
    await runMigrations({ databaseUrl }); pool = new Pool({ connectionString: databaseUrl, max: 4 });
    for (const workspaceId of [ws, other]) {
      await pool.query("INSERT INTO workspaces(id,name) VALUES($1,'synthetic dashboard')", [workspaceId]);
      await pool.query("INSERT INTO tasks(workspace_id,task_id,task_name,biz_name) VALUES($1,'one','task-one','biz-one'),($1,'two','task-two','biz-two')", [workspaceId]);
      await pool.query("INSERT INTO assessment_price_history(workspace_id,task_id,price,effective_date) VALUES($1,'one',100,'2026-08-01'),($1,'two',10,'2026-08-01')", [workspaceId]);
      for (const media of ["KUAISHOU", "TENCENT"]) {
        await pool.query("INSERT INTO naming_rules(workspace_id,media,version,segments,effective_from) VALUES($1,$2,1,$3,'2026-09-01')", [workspaceId, media, JSON.stringify(rule)]);
        for (const { accountId } of accounts) {
          await pool.query("INSERT INTO accounts(workspace_id,media,account_id,account_name) VALUES($1,$2,$3,'synthetic')", [workspaceId, media, accountId]);
          await pool.query("INSERT INTO task_accounts(workspace_id,media,account_id,task_id,valid_from,valid_to) VALUES($1,$2,$3,'one','2026-09-01','2026-09-01'),($1,$2,$3,'two','2026-09-02',NULL)", [workspaceId, media, accountId]);
          const segments = Object.fromEntries(rule.map(({ key }) => [key, { key, mapsTo: key, taskIds: [], value: key === "optimizer" ? `owner-${accountId}` : key }]));
          await pool.query("INSERT INTO account_name_parses(workspace_id,media,account_id,account_name,rule_version,status,segments) VALUES($1,$2,$3,'synthetic',1,'parsed',$4)", [workspaceId, media, accountId, JSON.stringify(segments)]);
          const cash = workspaceId === ws && media === "KUAISHOU" ? 10 : 900;
          await pool.query(`INSERT INTO account_metrics_daily(workspace_id,media,account_id,ds,cost,cash_cost,real_conversion,conversion,exposure,click,computed_at)
            VALUES($1,$2,$3,'2026-09-01',1000,1000,1,2,100,10,'2026-09-02T10:00:00Z'),($1,$2,$3,'2026-09-02',$4,$4,1,2,100,10,'2026-09-02T10:00:00Z')`, [workspaceId, media, accountId, cash]);
        }
      }
    }
  }, 30000);
  afterAll(async () => {
    if (!pool) return;
    for (const table of ["account_name_parses", "naming_rules", "account_metrics_daily", "assessment_price_history", "task_accounts", "accounts", "tasks", "workspaces"]) await pool.query(
      `DELETE FROM ${table} WHERE ${table === "workspaces" ? "id" : "workspace_id"}=ANY($1::uuid[])`, [[ws, other]]);
    await pool.end();
  });
  it("summary/dimensions filter before money and daily assessment, OR within / AND across", async () => {
    const summary = createPlatformWindowQuery(pool), dimensions = createPlatformDimensionQuery(pool);
    const input = { workspaceId: ws, accounts, window, filters };
    const value = await summary.summary(input);
    expect(value.row).toMatchObject({ accountCount: 1, rowCount: 1, metrics: { cashCost: { value: 10 }, costSpace: { value: 0 } }, assessment: { price: { value: 10, effectiveDate: "2026-08-01" }, onTarget: true } });
    expect(value.lineage).toMatchObject({ requestedAccountDays: 1, returnedAccountDays: 1, requestedDates: ["2026-09-02"] });
    expect((await summary.summary({ ...input, filters: { ...filters, optimizer: ["owner-a", "owner-b"] } })).row.metrics.cashCost.value).toBe(20);
    expect((await summary.summary({ ...input, accounts: [{ media: "TENCENT", accountId: "a" }] })).row.metrics.cashCost.value).toBe(900);
    expect((await summary.summary({ ...input, workspaceId: other })).row.metrics.cashCost.value).toBe(900);
    for (const dimensionType of ["account", "task", "biz", "optimizer", "goal", "placement"]) {
      const result = dimensionType === "account" ? await dimensions.account(input) : dimensionType === "task" || dimensionType === "biz"
        ? await dimensions.group({ ...input, dimensionType }) : await dimensions.named({ ...input, dimensionType });
      expect(result.rows).toHaveLength(1); expect(result.rows[0]).toMatchObject({ metrics: { cashCost: { value: 10 } }, assessment: { price: { value: 10 } } });
    }
  });
  it("unmatched labels and empty grants are empty; missing days remain partial; comparison resolves its own dates", async () => {
    const summary = createPlatformWindowQuery(pool);
    const input = { workspaceId: ws, accounts, window, filters };
    const noMatch = await summary.summary({ ...input, filters: { optimizer: ["not-found"] } });
    expect(noMatch.lineage).toMatchObject({ requestedAccountDays: 0, canonicalRows: 0 });
    expect((await summary.summary({ ...input, accounts: [] })).lineage.requestedAccountDays).toBe(0);
    const missing = await summary.summary({ ...input, window: { ...window, to: "2026-09-03" } });
    expect(missing.lineage).toMatchObject({ requestedAccountDays: 2, returnedAccountDays: 1 });
    expect(missing.row).toMatchObject({ metrics: { cashCost: { value: null } }, assessment: { onTarget: null } });
    const comparison = await summary.summary({ ...input, compare: "dod" });
    expect(comparison.row.compare).toBeDefined();
    expect(comparison.row.metrics.cashCost.value).toBe(10);
  });
  it("metadata selection and metrics use the same RR snapshot across a concurrent change", async () => {
    const query = new PlatformWindowQuery(read => withSemanticReadSnapshot(pool, async connection => {
      const semantic = new SemanticQueryRepository(connection), assessment = new WindowAssessmentRepository(connection);
      const resolve = createDashboardScopeResolver(connection);
      return read({ querySummary: semantic.querySummary.bind(semantic), queryLineage: semantic.queryLineage.bind(semantic),
        loadAssessment: assessment.load.bind(assessment), loadAccountCounts: assessment.loadAccountCounts.bind(assessment),
        resolveDashboardScope: async (scope, selected) => {
          const result = await resolve(scope, selected);
          await pool.query("UPDATE account_metrics_daily SET cash_cost=700 WHERE workspace_id=$1 AND media='KUAISHOU' AND ds='2026-09-02'", [ws]);
          await pool.query("UPDATE tasks SET biz_name='changed' WHERE workspace_id=$1 AND task_id='two'", [ws]);
          return result;
        } });
    }));
    try {
      expect((await query.summary({ workspaceId: ws, accounts, window, filters })).row.metrics.cashCost.value).toBe(10);
      expect((await createPlatformWindowQuery(pool).summary({ workspaceId: ws, accounts, window, filters })).lineage.requestedAccountDays).toBe(0);
    } finally {
      await pool.query("UPDATE account_metrics_daily SET cash_cost=10 WHERE workspace_id=$1 AND media='KUAISHOU' AND ds='2026-09-02'", [ws]);
      await pool.query("UPDATE tasks SET biz_name='biz-two' WHERE workspace_id=$1 AND task_id='two'", [ws]);
    }
  });
  it("public HTTP filters all four queries and rejects forged selectors / unsupported sources", async () => {
    const platform = new PlatformDataSource(new SemanticQueryRepository(pool), createPlatformReadSnapshot(pool), createPlatformWindowQuery(pool), createPlatformDimensionQuery(pool));
    const kaQuery = vi.fn(async () => { throw new Error("No external source calls"); });
    const service = new DataQueryService({ registry: createDataQueryRegistry(), platform, kaData: { query: kaQuery } });
    const internalToken = "synthetic-dashboard-filter-token-000000001";
    const server = createDataApiServer({ service, internalToken, sessionAuthService: approvedSessionAuth(personalAuth({ workspaceId: ws, userId, accounts })),
      detailService: {} as never, taskListService: {} as never, accountListService: {} as never, workItemListService: {} as never });
    server.listen(0, "127.0.0.1"); await once(server, "listening");
    const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1/query`;
    const send = (body: unknown, headers = businessHeaders(internalToken)) => fetch(url, { method: "POST", headers: { ...headers,
      "content-type": "application/json", "x-request-id": "dashboard-filter-pg", "x-ka-workspace-id": other, "x-ka-account-scope": "*" }, body: JSON.stringify(body) });
    try {
      for (const query of ["summary", "trend", "table", "dimension"]) {
        const request = { queryId: `account.${query}`, params: { dateFrom: window.from, dateTo: window.to, filters, ...(query === "dimension" ? { dimensionType: "optimizer" } : {}) } };
        const response = await send(request), body = await response.json();
        expect(response.status, JSON.stringify(body)).toBe(200);
        expect(body).toMatchObject({ ok: true, data: { mode: "platform", source: { returnedRowCount: 1, rows: [{ metrics: { cashCost: { value: 10 } } }],
          lineage: { coverage: { complete: true, returnedObjects: 1 }, dataAsOf: "2026-09-02T10:00:00.000Z" } } } });
        expect(response.headers.get("x-request-id")).toBe("dashboard-filter-pg");
        if (query === "table" || query === "trend") expect(body.data.source.rows[0].ds).toBe("2026-09-02");
        if (process.env.EXPORT_SYNTHETIC_DASHBOARD_FIXTURES === "1") {
          const dir = new URL("../../../docs/plans/fixtures/selfcheck11/", import.meta.url); await mkdir(dir, { recursive: true });
          await writeFile(new URL(`${query}-filtered.json`, dir), `${JSON.stringify(body, null, 2)}\n`);
        }
      }
      const legacy = await send({ query_type: "summary", date_from: window.from, date_to: window.to, filters });
      expect(legacy.status).toBe(200); expect((await legacy.json()).data.source.rows[0].metrics.cashCost.value).toBe(10);
      for (const invalid of [{ optimizer: [] }, { accountDays: [] }, { optimizer: "owner-a" }]) {
        const response = await send({ queryId: "account.summary", params: { dateFrom: window.from, dateTo: window.to, filters: invalid } });
        expect(response.status).toBe(400); expect(await response.json()).toMatchObject({ ok: false, error: { code: "INVALID_REQUEST", requestId: "dashboard-filter-pg" } });
      }
      expect((await send({ queryId: "account.summary", params: { dateFrom: window.from, dateTo: window.to, filters } }, { authorization: `Bearer ${internalToken}` })).status).toBe(401);
      expect(kaQuery).not.toHaveBeenCalled();
    } finally { server.close(); await once(server, "close"); }
  });
});
