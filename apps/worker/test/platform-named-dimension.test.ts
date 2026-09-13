import { describe, expect, it, vi } from "vitest";
import { metricValue } from "@ka/domain";
import { AccountDimensionEvidenceError, type SemanticQueryScope } from "@ka/db";
import { accountLabelsFromHistory } from "../src/data/account-labels.js";
import { PlatformDimensionQuery } from "../src/data/platform-dimension-query.js";
import { PlatformDataSource } from "../src/data/platform-data-source.js";
import { createDataQueryRegistry } from "../src/data/query-registry.js";

const workspaceId = "00000000-0000-4000-8000-000000000031";
const accounts = ["a", "b", "c"].map(accountId => ({ media: "KUAISHOU", accountId }));
const window = { from: "2026-09-01", to: "2026-09-02" };
const input = { workspaceId, accounts, window, dimensionType: "optimizer" };
const segment = (value: string, mapsTo = "optimizer") => ({ owner: { key: "owner", value, mapsTo, taskIds: [] } });
/** 一行真实形状的归属历史。 */
const historyRow = (accountId: string, effectiveFrom: string, owners: ReturnType<typeof segment>, override: Record<string, string> | null = null) => ({
  workspaceId, media: "KUAISHOU", accountId, effectiveFrom, mappings: [{ key: "owner", mapsTo: "optimizer", pending: false }],
  parse: { ruleVersion: 1, status: "parsed" as const, nameMatches: true, parsedAt: null, conflicts: null, segments: owners, override },
});
/** a 昵称归甲、b 人工改成甲、c 没有任何归属行。 */
const steady = () => [historyRow("a", "2026-08-01", segment("甲")), historyRow("b", "2026-08-01", segment("甲"), { owner: "甲" })];

/**
 * 按 scope 回答的假仓储：`accountDays` 选了哪几天就只出那几天——named 按归属切段重取时靠的就是它。
 * 每户两天，现金 22 / 3，真实转化各 1。
 */
function setup(history: ReturnType<typeof historyRow>[] = steady()) {
  const cash = [22, 3], dates = ["2026-09-01", "2026-09-02"];
  const selected = (scope: SemanticQueryScope) => (scope.filters?.accountScopes ?? []).flatMap(account => dates.map((ds, index) => ({ account, ds, index })))
    .filter(({ account, ds }) => scope.filters?.accountDays === undefined ||
      scope.filters.accountDays.some(day => day.media === account.media && day.accountId === account.accountId && day.ds === ds));
  const repository = {
    queryDimension: vi.fn(async (scope: SemanticQueryScope) => {
      const days = selected(scope);
      return [...new Set(days.map(day => day.account))].map(account => {
        const own = days.filter(day => day.account === account), total = own.reduce((sum, day) => sum + cash[day.index]!, 0);
        return { dimensionKey: account.accountId, dimensionLabel: "Synthetic", accountIdentity: { workspaceId, ...account },
          metrics: { rowCount: own.length, accountCount: 1, anomalyRows: 0, cost: total, cashCost: total, realConversion: own.length,
            conversion: own.length * 2, exposure: own.length * 50, click: own.length * 5, costSpace: 999, wakeUv: null, potentialUv: null } };
      });
    }),
    queryLineage: vi.fn(async (scope: SemanticQueryScope) => {
      const days = selected(scope);
      return { dataAsOf: "2026-09-02T10:00:00Z", canonicalRows: days.length, returnedAccounts: new Set(days.map(day => day.account)).size,
        requestedAccountDays: days.length, returnedAccountDays: days.length };
    }),
    loadByAccount: vi.fn(async (scope: SemanticQueryScope) => selected(scope).map(({ account, ds, index }) => ({ workspaceId, ...account, input: {
      ds, cashCost: metricValue(cash[index]!), realConversion: metricValue(1),
      price: { value: index ? 10 : 20, effectiveDate: ds, versionKey: `p${index}` },
    } }))),
    loadLabels: vi.fn(async () => accountLabelsFromHistory(history)),
  };
  const snapshot = vi.fn(async (read: (r: typeof repository) => Promise<unknown>) => read(repository));
  return { repository, snapshot, query: new PlatformDimensionQuery(snapshot as never) };
}
describe("named dimension same-snapshot bulk composition", () => {
  it("counts source per account, not days, and recomputes group assessment with effective daily prices", async () => {
    const { query, repository, snapshot } = setup(), result = await query.named(input);
    expect(snapshot).toHaveBeenCalledTimes(1);
    // 归属在窗口里没变：每个仓储方法只读一次，不因为按天选行多出往返。
    for (const method of Object.values(repository)) expect(method).toHaveBeenCalledTimes(1);
    expect(repository.loadLabels).toHaveBeenCalledWith({ workspaceId, accounts, from: "2026-09-01", to: "2026-09-02" });
    expect(result.rows).toMatchObject([
      { key: null, label: "未标注", source: null, sources: {}, metrics: { cashCost: metricValue(25), costSpace: metricValue(5) } },
      { key: "甲", label: "甲", source: "mixed", sources: { manual: 1, nickname: 1 },
        metrics: { cashCost: metricValue(50), costSpace: metricValue(10), ratios: { cashCpa: { value: 12.5 } } },
        assessment: { price: null, priceVersions: 2, priceSource: "history", onTarget: true } },
    ]);
    expect(result.warnings).toContain("NAMING_PARSE_MISSING");
    expect(result.labelBasis).toEqual([]);
  });
  it("splits an account renamed inside the window between its owners, day by day", async () => {
    // v1.9.49 ①：a 9-02 从甲改名乙。只读最新一行时 a 两天的 25 块全记在乙头上。
    const { query, repository } = setup([...steady(), historyRow("a", "2026-09-02", segment("乙"))]);
    const result = await query.named(input);
    expect(result.rows.map(row => [row.key, row.metrics.cashCost.value, row.source, row.sources])).toEqual([
      [null, 25, null, {}],
      ["乙", 3, "nickname", { nickname: 1 }],
      ["甲", 47, "mixed", { manual: 1, nickname: 1 }],
    ]);
    // 只有跨改名日的那一户按段重取（两段各一次），其余账户不多读。
    expect(repository.queryDimension).toHaveBeenCalledTimes(3);
    expect(result.labelBasis).toEqual([]);
  });
  it("names the account-days that borrowed the earliest known owner", async () => {
    const { query } = setup([historyRow("a", "2026-09-02", segment("甲")), historyRow("b", "2026-08-01", segment("甲"))]);
    const result = await query.named(input);
    expect(result.rows.find(row => row.key === "甲")?.metrics.cashCost.value).toBe(50);
    expect(result.labelBasis).toEqual([{ code: "LABEL_BASIS_EARLIEST_KNOWN", media: "KUAISHOU", accountId: "a", businessDate: "2026-09-01" }]);
  });
  it("groups by a cleaning segment even when the named mapping cannot be interpreted", async () => {
    // 段说 owner→goal、规则说 owner→optimizer：按命名维度必须判废，按段取值不经过 mapsTo，不受连累。
    const mismatched = [historyRow("a", "2026-08-01", segment("甲", "goal"))];
    await expect(setup(mismatched).query.named(input)).rejects.toThrow();
    const bySegment = await setup(mismatched).query.named({ ...input, dimensionType: "segment:owner" });
    expect(bySegment.rows.map(row => [row.key, row.metrics.cashCost.value])).toEqual([[null, 50], ["甲", 25]]);
  });
  it("fails closed when the label read fails", async () => {
    const { query, repository } = setup();
    repository.loadLabels.mockRejectedValue(new AccountDimensionEvidenceError("UPSTREAM_INVALID_RESPONSE"));
    await expect(query.named(input)).rejects.toMatchObject({ code: "UPSTREAM_INVALID_RESPONSE" });
  });
  it("does not silently select a different dimension or widen malformed account scope", async () => {
    const { query, snapshot } = setup();
    await expect(query.named({ ...input, dimensionType: "account" })).rejects.toThrow();
    await expect(query.named({ ...input, accounts: [...accounts, accounts[0]] })).rejects.toThrow();
    expect(snapshot).not.toHaveBeenCalled();
  });
  it("adapter keeps invalid evidence distinct from truncation and source outage", async () => {
    const resolved = createDataQueryRegistry().resolve("account.dimension", { date: "2026-09-01", dimensionType: "optimizer" }, "platform");
    const execution = { workspaceId, userId: "00000000-0000-4000-8000-000000000032", scopeKind: "explicit_accounts" as const, accounts };
    for (const code of ["UPSTREAM_INVALID_RESPONSE", "SOURCE_TRUNCATED", "INVALID_REQUEST"] as const) {
      const query = setup().query; vi.spyOn(query, "named").mockRejectedValue(new AccountDimensionEvidenceError(code));
      const adapter = new PlatformDataSource({} as never, undefined, undefined, query);
      await expect(adapter.query(resolved, execution)).rejects.toMatchObject({ code: code === "SOURCE_TRUNCATED" ? code : "UPSTREAM_INVALID_RESPONSE" });
    }
    const query = setup().query; vi.spyOn(query, "named").mockRejectedValue(new Error("synthetic SQL or secret must not escape"));
    const result = await new PlatformDataSource({} as never, undefined, undefined, query).query(resolved, execution);
    expect(result).toMatchObject({ status: "unavailable", error: { code: "SOURCE_UNAVAILABLE" } });
    expect(JSON.stringify(result)).not.toContain("secret");
  });
});
