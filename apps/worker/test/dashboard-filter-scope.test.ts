import { describe, expect, it, vi } from "vitest";
import { dashboardScopeResolver } from "../src/data/dashboard-filter-scope.js";
import { createDataQueryRegistry, QueryRegistryError } from "../src/data/query-registry.js";
import { semanticQueryRequestSchema } from "../src/data/semantic-query-request.js";
const ws = "11111111-1111-4111-8111-111111111111";
const account = { media: "KUAISHOU", accountId: "a" };
const scope = { workspaceId: ws, dateFrom: "2026-09-01", dateTo: "2026-09-02", filters: { accountScopes: [account] } };
const days = ["2026-09-01", "2026-09-02"].map((ds, i) => ({ workspaceId: ws, ...account, ds,
  taskId: `t${i}`, taskName: `task${i}`, bizName: `biz${i}` }));
function ports() {
  return { loadDays: vi.fn().mockResolvedValue(days), loadEvidence: vi.fn().mockResolvedValue([{ workspaceId: ws, ...account,
    parse: { ruleVersion: 1, segments: { who: { key: "who", value: "old", mapsTo: "optimizer", taskIds: [] } },
      override: { who: "manual" }, nameMatches: false } }]),
  loadRules: vi.fn().mockResolvedValue([{ workspaceId: ws, ...account, ruleVersion: 1,
    mappings: [{ key: "who", mapsTo: "optimizer", pending: false }] }]) };
}
describe("dashboard filters resolve only approved account-days", () => {
  it("ANDs task/biz/date with manual evidence, ORs labels and keeps approved tuples unchanged", async () => {
    const reader = ports(), result = await dashboardScopeResolver(reader)(scope, { optimizer: ["manual", "other"], biz: ["biz1"], task_id: ["t1"] });
    expect(result).toEqual({ scope: { ...scope, filters: { ...scope.filters, accountDays: [{ ...account, ds: "2026-09-02" }] } }, warnings: ["NAMING_PARSE_STALE"] });
    expect(reader.loadEvidence).toHaveBeenCalledExactlyOnceWith({ workspaceId: ws, accounts: [account] });
    expect(scope.filters).not.toHaveProperty("accountDays");
  });
  it("does not need naming evidence for task/biz and keeps no-match/empty-grant scopes empty", async () => {
    const reader = ports(), resolve = dashboardScopeResolver(reader);
    expect((await resolve(scope, { biz: ["not found"] })).scope.filters?.accountDays).toEqual([]);
    expect(reader.loadEvidence).not.toHaveBeenCalled();
    reader.loadDays.mockClear();
    expect((await resolve({ ...scope, filters: { accountScopes: [] } }, { biz: ["biz1"] })).scope.filters?.accountDays).toEqual([]);
    expect(reader.loadDays).not.toHaveBeenCalled();
    expect(await resolve(scope, {})).toEqual({ scope, warnings: [] });
  });
  it("pending or absent parse is never guessed", async () => {
    const reader = ports(); reader.loadRules.mockResolvedValue([{ workspaceId: ws, ...account, ruleVersion: 1,
      mappings: [{ key: "who", mapsTo: "optimizer", pending: true }] }]);
    expect((await dashboardScopeResolver(reader)(scope, { optimizer: ["manual"] })).scope.filters?.accountDays).toEqual([]);
    reader.loadEvidence.mockResolvedValue([{ workspaceId: ws, ...account, parse: null }]);
    reader.loadRules.mockResolvedValue([{ workspaceId: ws, ...account, ruleVersion: null, mappings: null }]);
    expect(await dashboardScopeResolver(reader)(scope, { optimizer: ["manual"] })).toMatchObject({ warnings: ["NAMING_PARSE_MISSING"] });
  });
  it.each(["workspace", "media", "missing-day", "duplicate-day", "invalid-label"])("fails closed on %s metadata", async kind => {
    const reader = ports(), rows = structuredClone(days);
    if (kind === "workspace") rows[0]!.workspaceId = "22222222-2222-4222-8222-222222222222";
    if (kind === "media") rows[0]!.media = "TENCENT";
    if (kind === "missing-day") rows.pop();
    if (kind === "duplicate-day") rows[1] = rows[0]!;
    if (kind === "invalid-label") (rows[0] as Record<string, unknown>).bizName = false;
    reader.loadDays.mockResolvedValue(rows);
    await expect(dashboardScopeResolver(reader)(scope, { biz: ["biz1"] })).rejects.toThrow();
  });
  it.each(["foreign", "duplicate", "missing", "version", "invalid-rule"])("rejects %s naming evidence", async kind => {
    const reader = ports();
    if (kind === "foreign") reader.loadRules.mockResolvedValue([{ workspaceId: ws, media: "TENCENT", accountId: "a", ruleVersion: 1, mappings: [] }]);
    if (kind === "duplicate") reader.loadRules.mockResolvedValue([{}, {}]);
    if (kind === "missing") reader.loadEvidence.mockResolvedValue([]);
    if (kind === "version") reader.loadRules.mockResolvedValue([{ workspaceId: ws, ...account, ruleVersion: 2, mappings: [] }]);
    if (kind === "invalid-rule") reader.loadRules.mockResolvedValue([{ workspaceId: ws, ...account, ruleVersion: 1, mappings: "false" }]);
    await expect(dashboardScopeResolver(reader)(scope, { optimizer: ["manual"] })).rejects.toThrow();
  });
  it("requires explicit trusted tuples and does not accept recursively prefiltered input", async () => {
    const resolve = dashboardScopeResolver(ports());
    await expect(resolve({ ...scope, filters: {} }, { biz: ["biz1"] })).rejects.toThrow();
    await expect(resolve({ ...scope, filters: { ...scope.filters, accountDays: [] } }, { biz: ["biz1"] })).rejects.toThrow();
  });
});
describe("single registry admits bounded filters, never silently drops unsupported ones", () => {
  const registry = createDataQueryRegistry(), params = { dateFrom: "2026-09-01", dateTo: "2026-09-02", filters: { optimizer: ["literal'; DROP TABLE x;--"], task_id: ["t1"] } };
  it.each(["summary", "trend", "table", "dimension"])("preserves %s canonical and legacy business selections", query => {
    const extra = query === "dimension" ? { dimensionType: "optimizer" } : {};
    expect(registry.resolve(`account.${query}`, { ...params, ...extra }, "platform").params.filters).toEqual(params.filters);
    const request = semanticQueryRequestSchema.parse({ query_type: query, date_from: params.dateFrom, date_to: params.dateTo,
      ...(query === "dimension" ? { dimension_type: "optimizer" } : {}), filters: params.filters });
    expect(registry.resolve(request.queryId, request.params, "platform").params.filters).toEqual(params.filters);
  });
  it.each([{ accountDays: [] }, { optimizer: [] }, { optimizer: "x" }, { workspaceId: ws }, { resource_position: ["a", "a"] }])("rejects invalid filters %j", filters => {
    expect(() => registry.resolve("account.summary", { ...params, filters }, "platform")).toThrow(QueryRegistryError);
  });
  it.each(["ka_data", "reconcile"])("does not silently ignore filters on %s or KA plan builders", view => {
    expect(() => registry.resolve("account.summary", params, view)).toThrow(/not available/);
    const resolved = registry.resolve("account.summary", params, "platform");
    expect(() => registry.buildTeamKaWindowPlan(resolved, { from: params.dateFrom, to: params.dateTo })).toThrow(/not available/);
    expect(() => registry.buildKaDataPlan(resolved, [account])).toThrow(/not available/);
  });
});
