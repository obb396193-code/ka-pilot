import { describe, expect, it, vi } from "vitest";
import { accountLabelsFromHistory } from "../src/data/account-labels.js";
import { dashboardScopeResolver } from "../src/data/dashboard-filter-scope.js";
import { createDataQueryRegistry, QueryRegistryError } from "../src/data/query-registry.js";
import { semanticQueryRequestSchema } from "../src/data/semantic-query-request.js";
const ws = "11111111-1111-4111-8111-111111111111";
const account = { media: "KUAISHOU", accountId: "a" };
const scope = { workspaceId: ws, dateFrom: "2026-09-01", dateTo: "2026-09-02", filters: { accountScopes: [account] } };
const days = ["2026-09-01", "2026-09-02"].map((ds, i) => ({ workspaceId: ws, ...account, ds,
  taskId: `t${i}`, taskName: `task${i}`, bizName: `biz${i}` }));
const who = (value: string, mapsTo = "optimizer") => ({ who: { key: "who", value, mapsTo, taskIds: [] } });
/** 一行真实形状的归属历史；缺省是「人工改成 manual、昵称已对不上」的那种。 */
function historyRow(effectiveFrom: string, extra: {
  segments?: ReturnType<typeof who>; override?: Record<string, string> | null; nameMatches?: boolean; pending?: boolean;
} = {}) {
  return { workspaceId: ws, ...account, effectiveFrom, mappings: [{ key: "who", mapsTo: "optimizer", pending: extra.pending ?? false }],
    parse: { ruleVersion: 1, status: "overridden" as const, segments: extra.segments ?? who("old"),
      override: extra.override === undefined ? { who: "manual" } : extra.override, conflicts: null, parsedAt: null,
      nameMatches: extra.nameMatches ?? false } };
}
function ports(history: ReturnType<typeof historyRow>[] = [historyRow("2026-08-01")]) {
  return { loadDays: vi.fn().mockResolvedValue(days), loadLabels: vi.fn(async () => accountLabelsFromHistory(history)) };
}
describe("dashboard filters resolve only approved account-days", () => {
  it("ANDs task/biz/date with manual evidence, ORs labels and keeps approved tuples unchanged", async () => {
    const reader = ports(), result = await dashboardScopeResolver(reader)(scope, { optimizer: ["manual", "other"], biz: ["biz1"], task_id: ["t1"] });
    expect(result).toEqual({ scope: { ...scope, filters: { ...scope.filters, accountDays: [{ ...account, ds: "2026-09-02" }] } },
      warnings: ["NAMING_PARSE_STALE"], labelBasis: [] });
    expect(reader.loadLabels).toHaveBeenCalledExactlyOnceWith({ workspaceId: ws, accounts: [account], from: "2026-09-01", to: "2026-09-02" });
    expect(scope.filters).not.toHaveProperty("accountDays");
  });
  it("does not need naming evidence for task/biz and keeps no-match/empty-grant scopes empty", async () => {
    const reader = ports(), resolve = dashboardScopeResolver(reader);
    expect((await resolve(scope, { biz: ["not found"] })).scope.filters?.accountDays).toEqual([]);
    expect(reader.loadLabels).not.toHaveBeenCalled();
    reader.loadDays.mockClear();
    expect((await resolve({ ...scope, filters: { accountScopes: [] } }, { biz: ["biz1"] })).scope.filters?.accountDays).toEqual([]);
    expect(reader.loadDays).not.toHaveBeenCalled();
    expect(await resolve(scope, {})).toEqual({ scope, warnings: [], labelBasis: [] });
  });
  it("pending or absent parse is never guessed", async () => {
    expect((await dashboardScopeResolver(ports([historyRow("2026-08-01", { pending: true })]))(scope, { optimizer: ["manual"] }))
      .scope.filters?.accountDays).toEqual([]);
    expect(await dashboardScopeResolver(ports([]))(scope, { optimizer: ["manual"] })).toMatchObject({ warnings: ["NAMING_PARSE_MISSING"] });
  });
  it("selects each account-day by the owner in effect that day when the window crosses a rename", async () => {
    // v1.9.49 ①：9-02 起从 old 改名 new。只读最新一行时按 old 筛出来是空的，9-01 那天凭空消失。
    const renamed = ports([
      historyRow("2026-09-01", { segments: who("old"), override: null, nameMatches: true }),
      historyRow("2026-09-02", { segments: who("new"), override: null, nameMatches: true }),
    ]);
    const resolve = dashboardScopeResolver(renamed);
    expect(await resolve(scope, { optimizer: ["old"] })).toMatchObject({
      scope: { filters: { accountDays: [{ ...account, ds: "2026-09-01" }] } }, warnings: [], labelBasis: [] });
    expect((await resolve(scope, { optimizer: ["new"] })).scope.filters?.accountDays).toEqual([{ ...account, ds: "2026-09-02" }]);
  });
  it("names the selected account-days that borrowed the earliest known owner, and only those", async () => {
    const late = dashboardScopeResolver(ports([historyRow("2026-09-02", { segments: who("new"), override: null, nameMatches: true })]));
    expect(await late(scope, { optimizer: ["new"] })).toMatchObject({
      scope: { filters: { accountDays: [{ ...account, ds: "2026-09-01" }, { ...account, ds: "2026-09-02" }] } },
      labelBasis: [{ code: "LABEL_BASIS_EARLIEST_KNOWN", ...account, businessDate: "2026-09-01" }] });
    // 按任务把 9-01 筛掉之后，它就不在结果里，也就不该被点名。
    expect((await late(scope, { optimizer: ["new"], task_id: ["t1"] })).labelBasis).toEqual([]);
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
  it("fails closed on naming evidence it cannot interpret, and on a failed label read", async () => {
    // 段说 who→goal、规则说 who→optimizer：解释不了，不能当「未标注」让这户悄悄从结果里消失。
    const mismatched = ports([historyRow("2026-08-01", { segments: who("x", "goal") })]);
    await expect(dashboardScopeResolver(mismatched)(scope, { optimizer: ["manual"] })).rejects.toThrow();
    const broken = ports(); broken.loadLabels.mockRejectedValue(new Error("snapshot lost"));
    await expect(dashboardScopeResolver(broken)(scope, { optimizer: ["manual"] })).rejects.toThrow("snapshot lost");
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
