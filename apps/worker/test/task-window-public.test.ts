import { describe, expect, it, vi } from "vitest";
import { metricValue, type ApprovedWorkspaceAuthContext } from "@ka/domain";
import { PlatformDataSource } from "../src/data/platform-data-source.js";
import { PlatformWindowQuery } from "../src/data/platform-window-query.js";
import { createDataQueryRegistry } from "../src/data/query-registry.js";
import { DataQueryService, createDataQueryHttpHandler } from "../src/data/query-service.js";
import { DisabledKaDataSource } from "../src/data/disabled-ka-data-source.js";
import { canonicalMetrics } from "./canonical-query-fixtures.js";

const workspaceId = "00000000-0000-4000-8000-000000000024";
const auth: ApprovedWorkspaceAuthContext = { workspaceId, userId: "00000000-0000-4000-8000-000000000025",
  role: "optimizer", workspaceKind: "personal", scope: { kind: "explicit_accounts",
    accounts: [{ media: "KUAISHOU", accountId: "same", accessLevel: "read" }] } };
const summary = { rowCount: 1, accountCount: 1, anomalyRows: 0, cost: 10, cashCost: 10, realConversion: 1,
  conversion: 2, exposure: 100, click: 10, costSpace: 0, wakeUv: null, potentialUv: null, ratios: canonicalMetrics(10).ratios };
function setup() {
  const repository = {
    querySummary: vi.fn(async () => summary), queryTable: vi.fn(),
    queryTrend: vi.fn(async () => [{ ds: "2026-08-01", metrics: summary }]),
    queryLineage: vi.fn(async () => ({ dataAsOf: null, canonicalRows: 1, returnedAccounts: 1,
      requestedAccountDays: 1, returnedAccountDays: 1, requestedDates: ["2026-08-01"] })),
    loadAccountCounts: vi.fn(async () => ({ total: 1, determinable: 1, onTarget: 1 })),
    // 缺数点名（v1.9.33）：本桩不造缺口，恒回空表。
    loadMissingAccountDays: async () => [],
    loadAssessment: vi.fn(async () => [{ ds: "2026-08-01", cashCost: metricValue(10), realConversion: metricValue(1),
      price: { value: 20, effectiveDate: "2026-08-01", versionKey: "price-a" } }]),
  };
  const platform = new PlatformDataSource(repository, (read) => read(repository), new PlatformWindowQuery((read) => read(repository)));
  const handler = createDataQueryHttpHandler(new DataQueryService({ registry: createDataQueryRegistry(), platform, kaData: new DisabledKaDataSource() }));
  const request = (queryId: string) => handler({ method: "POST", auth, requestId: "task-window-request", body: {
    queryId, params: { date_from: "2026-08-01", date_to: "2026-08-03", taskId: "task-a" },
  } });
  return { repository, request };
}
describe("task window through actual public handler and platform adapter", () => {
  it.each(["account.summary", "account.trend"])("team %s returns explicit unsupported before any reader call", async (queryId) => {
    const reader = { query: vi.fn() };
    const handler = createDataQueryHttpHandler(new DataQueryService({ registry: createDataQueryRegistry(),
      platform: reader, kaData: reader, sourcePolicy: { kaDataEnabled: true, diagnosticEnabled: false, entitlements: [] } }));
    const result = await handler({ method: "POST", requestId: "team-task-window", auth: { ...auth,
      workspaceKind: "team", scope: { kind: "team_workspace_readonly" } },
      body: { queryId, params: { date: "2026-08-01", taskId: "task-a" } } });
    expect(result.status).toBe(422);
    expect(result.body).toMatchObject({ ok: false, error: { code: "VIEW_UNSUPPORTED", requestId: "team-task-window" } });
    expect(reader.query).not.toHaveBeenCalled();
  });
  it.each(["account.summary", "account.trend"])("%s keeps the task and tuple on every underlying read", async (id) => {
    const { repository, request } = setup();
    const result = await request(id);
    expect(result.status).toBe(200);
    if (!result.body.ok || result.body.data.mode !== "platform") throw new Error("Expected personal result");
    expect(result.body.data.source.lineage.coverage).toEqual({ complete: true, returnedObjects: 1 });
    expect(result.body.data.source.rows).toHaveLength(1);
    expect(result.body.data.source.rows[0]).not.toHaveProperty("tasks");
    const calls = [repository.queryLineage, id === "account.summary" ? repository.querySummary : repository.queryTrend];
    for (const fn of calls) expect(fn).toHaveBeenCalledWith(expect.objectContaining({ workspaceId,
      filters: { taskId: "task-a", accountScopes: [{ media: "KUAISHOU", accountId: "same" }] },
    }));
  });
  it.each(["missing", "extra", "duplicate", "no-proof", "invalid-count", "extra-count", "non-array", "null-row"])("refuses %s task trend days as stable 502", async (kind) => {
    const { repository, request } = setup();
    if (kind === "missing") repository.queryTrend.mockResolvedValue([]);
    if (kind === "extra") repository.queryTrend.mockResolvedValue([{ ds: "2026-08-02", metrics: summary }]);
    if (kind === "duplicate") repository.queryTrend.mockResolvedValue([{ ds: "2026-08-01", metrics: summary }, { ds: "2026-08-01", metrics: summary }]);
    if (kind === "no-proof") repository.queryLineage.mockResolvedValue({ dataAsOf: null, canonicalRows: 1,
      returnedAccounts: 1, requestedAccountDays: 1, returnedAccountDays: 1 } as never);
    if (kind === "invalid-count") repository.queryTrend.mockResolvedValue([{ ds: "2026-08-01", metrics: { ...summary, rowCount: "1" } }] as never);
    if (kind === "extra-count") repository.queryTrend.mockResolvedValue([{ ds: "2026-08-01", metrics: { ...summary, rowCount: 2 } }]);
    if (kind === "non-array") repository.queryTrend.mockResolvedValue({} as never);
    if (kind === "null-row") repository.queryTrend.mockResolvedValue([null] as never);
    const result = await request("account.trend");
    expect(result.status).toBe(502);
    expect(result.body).toMatchObject({ ok: false, error: { code: "UPSTREAM_INVALID_RESPONSE", requestId: "task-window-request" } });
  });
  it.each(["account.summary", "account.trend"])("%s handles a genuine empty task scope without fabricated values", async (id) => {
    const { repository, request } = setup();
    repository.queryLineage.mockResolvedValue({ dataAsOf: null, canonicalRows: 0, returnedAccounts: 0,
      requestedAccountDays: 0, returnedAccountDays: 0, requestedDates: [] });
    repository.querySummary.mockResolvedValue({ ...summary, rowCount: 0, accountCount: 0,
      cost: null, cashCost: null, realConversion: null } as never);
    repository.queryTrend.mockResolvedValue([]); repository.loadAssessment.mockResolvedValue([]);
    repository.loadAccountCounts.mockResolvedValue({ total: 0, determinable: 0, onTarget: 0 });
    const result = await request(id);
    expect(result.status).toBe(200);
    if (!result.body.ok || result.body.data.mode !== "platform") throw new Error("Expected personal result");
    expect(result.body.data.source.lineage.coverage).toEqual({ complete: true, returnedObjects: 0 });
    if (id === "account.summary") expect(result.body.data.source.rows[0]).toMatchObject({
      rowCount: 0, metrics: { cashCost: { value: null, availability: "missing" } }, assessment: { onTarget: null },
    });
    else expect(result.body.data.source.rows).toEqual([]);
  });
});
