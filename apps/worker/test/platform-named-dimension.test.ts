import { describe, expect, it, vi } from "vitest";
import { metricValue } from "@ka/domain";
import { AccountDimensionEvidenceError } from "@ka/db";
import { PlatformDimensionQuery } from "../src/data/platform-dimension-query.js";
import { PlatformDataSource } from "../src/data/platform-data-source.js";
import { createDataQueryRegistry } from "../src/data/query-registry.js";

const workspaceId = "00000000-0000-4000-8000-000000000031";
const accounts = ["a", "b", "c"].map(accountId => ({ media: "KUAISHOU", accountId }));
const input = { workspaceId, accounts, window: { from: "2026-09-01", to: "2026-09-02" }, dimensionType: "optimizer" };
const segment = { key: "owner", value: "甲", mapsTo: "optimizer", taskIds: [] };
function setup() {
  const repository = {
    queryDimension: vi.fn(async () => accounts.map(account => ({ dimensionKey: account.accountId, dimensionLabel: "Synthetic",
      accountIdentity: { workspaceId, ...account }, metrics: { rowCount: 2, accountCount: 1, anomalyRows: 0,
        cost: 40, cashCost: 25, realConversion: 2, conversion: 4, exposure: 100, click: 10,
        costSpace: 999, wakeUv: null, potentialUv: null } }))),
    queryLineage: vi.fn(async () => ({ dataAsOf: "2026-09-02T10:00:00Z", canonicalRows: 6,
      returnedAccounts: 3, requestedAccountDays: 6, returnedAccountDays: 6 })),
    loadByAccount: vi.fn(async () => accounts.flatMap(account => [22, 3].map((cash, index) => ({ workspaceId, ...account, input: {
      ds: `2026-09-0${index + 1}`, cashCost: metricValue(cash), realConversion: metricValue(1),
      price: { value: index ? 10 : 20, effectiveDate: `2026-09-0${index + 1}`, versionKey: `p${index}` },
    } })))),
    loadEvidence: vi.fn(async () => accounts.map((account, index) => ({ workspaceId, ...account, parse: index === 2 ? null : {
      ruleVersion: 1, status: "parsed" as const, nameMatches: true, parsedAt: null, conflicts: null,
      segments: { owner: { ...segment } }, override: index === 1 ? { owner: "甲" } : null,
    } }))),
    loadRules: vi.fn(async () => accounts.map((account, index) => ({ workspaceId, ...account, ruleVersion: index === 2 ? null : 1,
      mappings: index === 2 ? null : [{ key: "owner", mapsTo: "optimizer", pending: false }],
    }))),
  };
  const snapshot = vi.fn(async (read: (r: typeof repository) => Promise<unknown>) => read(repository));
  return { repository, snapshot, query: new PlatformDimensionQuery(snapshot as never) };
}
describe("named dimension same-snapshot bulk composition", () => {
  it("counts source per account, not days, and recomputes group assessment with effective daily prices", async () => {
    const { query, repository, snapshot } = setup(), result = await query.named(input);
    expect(snapshot).toHaveBeenCalledTimes(1);
    for (const method of Object.values(repository)) expect(method).toHaveBeenCalledTimes(1);
    expect(result.rows).toMatchObject([
      { key: null, label: "未标注", source: null, sources: {}, metrics: { cashCost: metricValue(25), costSpace: metricValue(5) } },
      { key: "甲", label: "甲", source: "mixed", sources: { manual: 1, nickname: 1 },
        metrics: { cashCost: metricValue(50), costSpace: metricValue(10), ratios: { cashCpa: { value: 12.5 } } },
        assessment: { price: null, priceVersions: 2, priceSource: "history", onTarget: true } },
    ]);
    expect(result.warnings).toContain("NAMING_PARSE_MISSING");
  });
  it.each(["workspace", "media", "duplicate", "missing", "version", "pending-invalid"])("fails closed on %s evidence", async error => {
    const { query, repository } = setup(), rows = await repository.loadEvidence();
    if (error === "workspace") rows[0]!.workspaceId = "00000000-0000-4000-8000-000000000099";
    if (error === "media") rows[0]!.media = "TENCENT";
    if (error === "duplicate") rows[1] = rows[0]!;
    if (error === "missing") rows.pop();
    if (error === "version") rows[0]!.parse!.ruleVersion = 2;
    if (error === "pending-invalid") repository.loadRules.mockResolvedValue([{ ...(await repository.loadRules())[0], mappings: [{ key: "owner", mapsTo: "optimizer", pending: "false" }] }] as never);
    repository.loadEvidence.mockResolvedValue(rows);
    await expect(query.named(input)).rejects.toThrow();
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
