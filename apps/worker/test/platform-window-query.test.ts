import { describe, expect, it, vi } from "vitest";
import { metricValue } from "@ka/domain";
import { PlatformWindowQuery } from "../src/data/platform-window-query.js";

const workspaceId = "00000000-0000-4000-8000-000000000031";
const input = { workspaceId, accounts: [{ media: "KUAISHOU", accountId: "synthetic" }], window: { from: "2026-09-01", to: "2026-09-02" } };
function summary(cash = 25, realConversion = 2) {
  return { rowCount: 2, accountCount: 1, anomalyRows: 0, cost: 40, cashCost: cash, realConversion,
    conversion: 4, exposure: 100, click: 10, costSpace: 999, wakeUv: null, potentialUv: null };
}
function setup() {
  const repository = {
    querySummary: vi.fn(async (scope: unknown) => { void scope; return summary(); }),
    queryLineage: vi.fn(async () => ({ dataAsOf: "2026-09-02T10:00:00Z", canonicalRows: 2, returnedAccounts: 1, requestedAccountDays: 2, returnedAccountDays: 2 })),
    loadAssessment: vi.fn(async () => [
      { ds: "2026-09-01", cashCost: metricValue(22), realConversion: metricValue(1), price: { value: 20, effectiveDate: "2026-09-01", versionKey: "p1" } },
      { ds: "2026-09-02", cashCost: metricValue(3), realConversion: metricValue(1), price: { value: 10, effectiveDate: "2026-09-02", versionKey: "p2" } },
    ]),
  };
  const snapshot = vi.fn(async (read: (r: typeof repository) => Promise<unknown>) => read(repository));
  return { repository, snapshot, query: new PlatformWindowQuery(snapshot as never) };
}
describe("personal window query composition", () => {
  it("uses actual daily prices, replaces cached costSpace, and keeps one approved tuple snapshot", async () => {
    const { query, repository, snapshot } = setup();
    const result = await query.summary(input);
    expect(snapshot).toHaveBeenCalledTimes(1);
    expect(result.row).toMatchObject({
      metrics: { cashCost: metricValue(25), costSpace: metricValue(5), ratios: { cashCpa: { value: 12.5, state: "finite" } } },
      assessment: { price: null, priceVersions: 2, onTarget: true, costStatus: "yellow", budgetUsageRate: { value: null, state: "undefined" } },
    });
    expect(result.window.preset).toBe("custom");
    for (const fn of Object.values(repository)) expect(fn).toHaveBeenCalledWith({
      workspaceId, dateFrom: "2026-09-01", dateTo: "2026-09-02",
      filters: { accountScopes: input.accounts },
    });
  });
  it("shifts both comparison endpoints with unchanged tuple scope, never averages daily CPA", async () => {
    const { query, repository } = setup();
    repository.querySummary.mockResolvedValueOnce(summary()).mockResolvedValueOnce(summary(20, 4));
    const result = await query.summary({ ...input, compare: "wow" });
    expect(repository.querySummary.mock.calls[1]?.[0]).toMatchObject({ dateFrom: "2026-08-25", dateTo: "2026-08-26", filters: { accountScopes: input.accounts } });
    expect(result.row.compare).toMatchObject({ mode: "wow", deltas: {
      cashCost: { value: 0.25, state: "finite" }, cashCpa: { value: 7.5, state: "finite" },
      realConversion: { value: -0.5, state: "finite" }, onTargetRate: { value: null, state: "undefined" },
    } });
  });
  it("today comparison is undefined and does not query yesterday's whole day", async () => {
    const { query, repository } = setup();
    const result = await query.summary({ ...input, window: { ...input.window, preset: "today" }, compare: "dod" });
    expect(repository.querySummary).toHaveBeenCalledTimes(1);
    expect(Object.values(result.row.compare!.deltas)).toEqual(Array(5).fill({ value: null, state: "undefined" }));
  });
  it("missing history prices do not borrow the cached costSpace or invent effective dates", async () => {
    const { query, repository } = setup();
    repository.loadAssessment.mockResolvedValueOnce([
      { ds: "2026-09-01", cashCost: metricValue(22), realConversion: metricValue(1), price: null },
      { ds: "2026-09-02", cashCost: metricValue(3), realConversion: metricValue(1), price: null },
    ] as never);
    const result = await query.summary(input);
    expect(result.row.metrics.costSpace).toEqual(metricValue(null));
    expect(result.row.assessment).toMatchObject({ price: null, onTarget: null, costStatusReason: "assessment_missing" });
  });
  it.each([
    { ...input, workspaceId: "invalid" },
    { ...input, accounts: undefined },
    { ...input, scopeKind: "team_workspace_readonly" },
    { ...input, accounts: [...input.accounts, ...input.accounts] },
    { ...input, window: { from: "2026-02-31", to: "2026-03-01" } },
    { ...input, window: { from: "2026-01-01", to: "2026-12-31" } },
    { ...input, compare: "monthly" },
  ])("rejects invalid or unbounded input before DB", async (invalid) => {
    const { query, snapshot } = setup();
    await expect(query.summary(invalid)).rejects.toThrow(); expect(snapshot).not.toHaveBeenCalled();
  });
  it("inconsistent account counts or history totals fail closed instead of producing a cost status", async () => {
    const { query, repository } = setup();
    repository.querySummary.mockResolvedValueOnce({ ...summary(), accountCount: 2 });
    await expect(query.summary(input)).rejects.toThrow("Invalid window source result");
    repository.querySummary.mockResolvedValueOnce(summary(30));
    await expect(query.summary(input)).rejects.toThrow("Invalid window source result");
  });
  it.each(["missing-day", "invalid-history", "invalid-lineage", "previous-scope"])("rejects %s source evidence", async (kind) => {
    const { query, repository } = setup();
    if (kind === "missing-day") repository.loadAssessment.mockResolvedValueOnce([
      { ds: "2026-09-01", cashCost: metricValue(25), realConversion: metricValue(2), price: { value: 20, effectiveDate: "2026-09-01", versionKey: "p1" } },
    ]);
    if (kind === "invalid-history") repository.loadAssessment.mockResolvedValueOnce([{ ds: "2026-09-01", cashCost: "25" }] as never);
    if (kind === "invalid-lineage") repository.queryLineage.mockResolvedValueOnce({ dataAsOf: "made-up" } as never);
    if (kind === "previous-scope") repository.querySummary.mockResolvedValueOnce(summary()).mockResolvedValueOnce({ ...summary(), accountCount: 2 });
    await expect(query.summary({ ...input, compare: "wow" })).rejects.toThrow("Invalid window source result");
  });
  it("snapshot commit failure never returns a calculated successful row", async () => {
    const { repository } = setup();
    const query = new PlatformWindowQuery(async (read) => { await read(repository as never); throw new Error("synthetic commit failed"); });
    await expect(query.summary(input)).rejects.toThrow("synthetic commit failed");
  });
});
