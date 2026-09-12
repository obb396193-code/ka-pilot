import { describe, expect, it, vi } from "vitest";
import { metricValue, dataQueryResponseSchema, safeDivide } from "@ka/domain";
import { KaDataClient } from "../src/data/ka-data-client.js";
import { PlatformDataSource } from "../src/data/platform-data-source.js";
import { PlatformWindowQuery } from "../src/data/platform-window-query.js";
import { DataQueryService, createDataQueryHttpHandler } from "../src/data/query-service.js";
import { createDataQueryRegistry } from "../src/data/query-registry.js";
import { personalAuth, teamAuth } from "./business-auth-fixtures.js";
import { windowFixtureRows } from "./ka-window-fixture.js";

const workspaceId = "00000000-0000-4000-8000-000000000031", userId = "00000000-0000-4000-8000-000000000032";
const params = { date_from: "2026-09-01", date_to: "2026-09-01", compare: "dod" };
const summary = { rowCount: 1, accountCount: 1, anomalyRows: 0, cost: 12, cashCost: 10, exposure: 100, click: 10,
  conversion: 3, realConversion: 2, costSpace: 30, wakeUv: null, potentialUv: null,
  ratios: { ctr: safeDivide(10, 100), cvr: safeDivide(3, 10), realCpa: safeDivide(12, 2), cashCpa: safeDivide(10, 2),
    gap: safeDivide(1, 2), potentialRate: safeDivide(null, null), biConversionRate: safeDivide(null, null) } };
function setup() {
  const querySummary = vi.fn(async () => summary);
  const queryLineage = vi.fn(async () => ({ dataAsOf: null, canonicalRows: 1, returnedAccounts: 1, requestedAccountDays: 1, returnedAccountDays: 1 }));
  const repository = { querySummary, queryLineage, queryTrend: vi.fn(async () => [{ ds: "2026-09-01", metrics: summary }]), queryTable: vi.fn() };
  const window = new PlatformWindowQuery(async (read) => read({ querySummary, queryLineage,
    loadAssessment: async (scope) => [{ ds: scope.dateFrom, cashCost: metricValue(10), realConversion: metricValue(2),
      price: { value: 20, effectiveDate: "2026-08-01", versionKey: "fixture-price" } }],
    loadAccountCounts: async () => ({ total: 1, determinable: 1, onTarget: 1 }),
    // 缺数点名（v1.9.33）：本桩不造缺口，恒回空表。
    loadMissingAccountDays: async () => [],
  }));
  const kaData = new KaDataClient({ baseUrl: "https://ka.test.invalid", token: "synthetic", teamWorkspaceId: workspaceId,
    fetchFn: async (_url, init) => {
      const rows = windowFixtureRows(JSON.parse(String(init?.body)).sql, ["2026-08-31", "2026-09-01"].map((ds) => ({
        ds, media: "KUAISHOU", account_id: "a", observed: 1, cost_yuan: 12, cash_yuan: 10, show: 100, click: 10, conv: 2, cash_assessment: 20,
      })));
      return Response.json({ backend: "sqlite", rowCount: rows.length, rows });
    } });
  const platform = new PlatformDataSource(repository, undefined, window);
  const registry = createDataQueryRegistry();
  const service = new DataQueryService({ registry, platform, kaData, sourcePolicy: { kaDataEnabled: true, diagnosticEnabled: false, entitlements: [] } });
  return { service, platform, registry };
}
describe("public v3 source composition", () => {
  it.each(["personal", "team"] as const)("routes %s session to its real window adapter", async (kind) => {
    const { service } = setup();
    const auth = kind === "personal" ? personalAuth({ workspaceId, userId, accounts: [{ media: "KUAISHOU", accountId: "a" }] }) : teamAuth({ workspaceId, userId });
    const response = await service.execute({ queryId: "account.summary", params }, auth, "window-request");
    expect(response.ok).toBe(true); expect(dataQueryResponseSchema.safeParse(response).success).toBe(true);
    if (!response.ok || response.data.mode === "reconcile") throw new Error("Expected window response");
    expect(response.data.source.rowSchemaVersion).toBe("account.summary/v3");
    expect(response.data.source.rows[0]).toMatchObject({ metrics: { costSpace: { value: 30 } },
      assessment: { priceSource: kind === "team" ? "ka_daily" : "history", onTarget: true }, compare: { mode: "dod" } });
    expect(response.data.source.lineage.window).toEqual({ from: "2026-09-01", to: "2026-09-01", preset: "custom" });
  });
  it("keeps the HTTP handler's correlation ID and rejects invalid preset", async () => {
    const { service } = setup(), handler = createDataQueryHttpHandler(service);
    const auth = personalAuth({ workspaceId, userId, accounts: [{ media: "KUAISHOU", accountId: "a" }] });
    const response = await handler({ method: "POST", body: { queryId: "account.summary", params: { ...params, preset: "invalid" } }, auth, requestId: "window-bad" });
    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({ ok: false, error: { requestId: "window-bad" } });
  });
  it("maps the real semantic trend shape with its ratios into flat v3 metrics", async () => {
    const { service } = setup();
    const response = await service.execute({ queryId: "account.trend", params: { date: "2026-09-01" } },
      personalAuth({ workspaceId, userId, accounts: [{ media: "KUAISHOU", accountId: "a" }] }));
    expect(response).toMatchObject({ ok: true, data: { source: { status: "ready", rowSchemaVersion: "account.trend/v3",
      rows: [{ ds: "2026-09-01", metrics: { cost: { value: 12, availability: "available" }, ratios: { cashCpa: { value: 5 } } } }],
    } } });
  });
  it("returns unavailable rather than a v2 summary if no window reader is configured", async () => {
    const repository = { querySummary: vi.fn(), queryTrend: vi.fn(), queryTable: vi.fn(), queryLineage: vi.fn() };
    const source = await new PlatformDataSource(repository).query(setup().registry.resolve("account.summary", params, "platform"), {
      workspaceId, userId, scopeKind: "explicit_accounts", accounts: [],
    });
    expect(source.status).toBe("unavailable"); expect(source.rowSchemaVersion).toBe("account.summary/v3");
    expect(repository.querySummary).not.toHaveBeenCalled();
  });
  it("invalidates a previously determined assessment and comparisons when transport is truncated", async () => {
    const { service, platform } = setup(), query = platform.query.bind(platform);
    vi.spyOn(platform, "query").mockImplementation(async (...args) => {
      const result = await query(...args);
      return { ...result, wholeResultTotal: { value: null, availability: "partial" },
        lineage: { ...result.lineage, partial: true, truncated: true, coverage: { complete: false } } };
    });
    const response = await service.execute({ queryId: "account.summary", params },
      personalAuth({ workspaceId, userId, accounts: [{ media: "KUAISHOU", accountId: "a" }] }));
    expect(response).toMatchObject({ ok: true, data: { source: { rows: [{ metrics: { cashCost: { value: null, availability: "error" } },
      assessment: { onTarget: null, costStatus: null, costStatusReason: "cash_missing" },
      compare: { deltas: { onTargetRate: { value: null, state: "undefined" } } },
    }] } } });
  });
});
