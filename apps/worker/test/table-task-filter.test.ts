import { DatabaseSync } from "node:sqlite";
import { describe, expect, it, vi } from "vitest";
import type { ApprovedWorkspaceAuthContext } from "@ka/domain";
import { createDataQueryRegistry } from "../src/data/query-registry.js";
import { semanticQueryRequestSchema } from "../src/data/semantic-query-request.js";
import { PlatformDataSource } from "../src/data/platform-data-source.js";
import { DataQueryService, createDataQueryHttpHandler } from "../src/data/query-service.js";
import { canonicalRow, readySource } from "./canonical-query-fixtures.js";

const workspaceId = "00000000-0000-4000-8000-000000000024", userId = "00000000-0000-4000-8000-000000000001";
const accounts = [{ media: "KUAISHOU", accountId: "allowed-account" }];
const auth: ApprovedWorkspaceAuthContext = { workspaceId, userId, role: "optimizer", workspaceKind: "personal",
  scope: { kind: "explicit_accounts", accounts: accounts.map((a) => ({ ...a, accessLevel: "read" })) } };
const body = { queryId: "account.table", params: { date: "2026-08-24", taskId: "task-a" } };
const registry = createDataQueryRegistry();

describe("table task selector vertical slice", () => {
  it("normalizes the frozen legacy selector into the same strict Registry", () => {
    const input = semanticQueryRequestSchema.parse({ query_type: "table", date: "2026-08-24", filters: { task_id: "task-a" } });
    expect(registry.resolve(input.queryId, input.params, "platform").params.taskId).toBe("task-a");
  });
  it.each([null, "", "x".repeat(257), [], 2, "invalid\nidentifier"])("rejects invalid task selector %j", (taskId) => {
    expect(() => registry.resolve(body.queryId, { ...body.params, taskId }, "platform")).toThrow();
  });
  it("enables personal task windows but refuses unsupported KA/reconcile task windows", () => {
    for (const id of ["account.summary", "account.trend"]) {
      expect(registry.resolve(id, body.params, "platform").params.taskId).toBe("task-a");
      for (const source of ["ka_data", "reconcile"]) expect(() => registry.resolve(id, body.params, source)).toThrow();
      const resolved = registry.resolve(id, body.params, "platform");
      expect(() => registry.buildTeamKaWindowPlan(resolved, { from: "2026-08-24", to: "2026-08-24" })).toThrow();
      expect(() => registry.buildTeamKaWindowAggregatePlan(resolved, { from: "2026-08-24", to: "2026-08-24" })).toThrow();
      expect(() => registry.buildTeamKaDataPlan(resolved)).toThrow();
      expect(() => registry.buildKaDataPlan(resolved, accounts)).toThrow();
    }
  });
  it("executes actual KA task SQL intersected with approved tuple, dates and paging", () => {
    const db = new DatabaseSync(":memory:");
    try {
      db.exec(`CREATE TABLE dwd_account_daily(ds INTEGER,media TEXT,account_id TEXT,account_name TEXT,task_id TEXT,biz_name TEXT,
        sub_biz TEXT,cost_yuan REAL,cash_yuan REAL,assessment REAL,cash_assessment REAL,conv REAL,show REAL,click REAL)`);
      const insert = db.prepare("INSERT INTO dwd_account_daily(ds,media,account_id,task_id,cost_yuan) VALUES(?,?,?,?,?)");
      insert.run(20260824,"KUAISHOU","allowed-account","task-a",10);
      insert.run(20260824,"KUAISHOU","allowed-account","task-b",90);
      insert.run(20260824,"TENCENT","allowed-account","task-a",900);
      insert.run(20260823,"KUAISHOU","allowed-account","task-a",9000);
      for (const scoped of [accounts, []]) {
        const plan = registry.buildKaDataPlan(registry.resolve(body.queryId, body.params, "ka_data"), scoped);
        const result = db.prepare(plan.sql).all();
        expect(result.map((r) => r.cost_yuan)).toEqual(scoped.length ? [10] : []);
      }
      const quoted = "task'quoted";
      insert.run(20260824,"KUAISHOU","allowed-account",quoted,11);
      const plan = registry.buildTeamKaDataPlan(registry.resolve(body.queryId, { ...body.params, taskId: quoted }, "ka_data"));
      expect(db.prepare(plan.sql).all().map((r) => r.cost_yuan)).toEqual([11]);
    } finally { db.close(); }
  });
  it("passes taskId into lineage and table in the same snapshot, keeping tuple grants", async () => {
    const repository = { querySummary: vi.fn(), queryTrend: vi.fn(),
      queryLineage: vi.fn(async () => ({ dataAsOf: null, canonicalRows: 0, returnedAccounts: 0, requestedAccountDays: 0, returnedAccountDays: 0 })),
      queryTable: vi.fn(async () => ({ rows: [], total: 0, page: 1, pageSize: 50 })) };
    const snapshot = vi.fn(async (read: (port: typeof repository) => Promise<unknown>) => read(repository));
    const source = new PlatformDataSource(repository, snapshot as ConstructorParameters<typeof PlatformDataSource>[1]);
    const result = await source.query(registry.resolve(body.queryId, body.params, "platform"), { workspaceId, userId, scopeKind: "explicit_accounts", accounts });
    expect(snapshot).toHaveBeenCalledTimes(1);
    for (const call of [repository.queryLineage, repository.queryTable]) expect(call).toHaveBeenCalledWith(expect.objectContaining({
      workspaceId, filters: expect.objectContaining({ taskId: "task-a", accountScopes: accounts }),
    }));
    expect(result.lineage.coverage).toEqual({ complete: true, returnedObjects: 0 });
  });
  it.each([true, false])("never accepts an adapter silently dropping task filter (team=%s)", async (team) => {
    for (const taskId of ["task-a", "other", null]) {
      const row = canonicalRow("account.table", 10);
      row.tasks = taskId === null ? [] : [{ taskId, taskName: null, bizName: null }];
      const source = { query: vi.fn(async () => readySource("account.table", team ? "ka_data" : "canonical", [row])) };
      const service = new DataQueryService({ registry, kaData: source, platform: source,
        sourcePolicy: { kaDataEnabled: true, diagnosticEnabled: false, entitlements: [] } });
      const context: ApprovedWorkspaceAuthContext = team ? { ...auth, workspaceKind: "team", scope: { kind: "team_workspace_readonly" } } : auth;
      const response = await createDataQueryHttpHandler(service)({ method: "POST", body, auth: context, requestId: "task-filter-request" });
      expect(response.status).toBe(taskId === "task-a" ? 200 : 502);
      const result = response.body;
      expect(result.ok).toBe(taskId === "task-a");
      if (!result.ok) expect(result.error.requestId).toBe("task-filter-request");
    }
  });
});
