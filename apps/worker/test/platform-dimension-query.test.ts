import { describe, expect, it, vi } from "vitest";
import { metricValue } from "@ka/domain";
import { PlatformDimensionQuery } from "../src/data/platform-dimension-query.js";

const workspaceId = "00000000-0000-4000-8000-000000000031";
const account = { media: "KUAISHOU", accountId: "synthetic" };
const input = { workspaceId, accounts: [account], window: { from: "2026-09-01", to: "2026-09-02" } };
function setup() {
  const repository = {
    queryDimension: vi.fn(async () => [{ dimensionKey: account.accountId, dimensionLabel: "Synthetic",
      accountIdentity: { workspaceId, ...account }, metrics: { rowCount: 2, accountCount: 1, anomalyRows: 0,
        cost: 40, cashCost: 25, realConversion: 2, conversion: 4, exposure: 100, click: 10,
        costSpace: 999, wakeUv: null, potentialUv: null } }]),
    queryLineage: vi.fn(async () => ({ dataAsOf: "2026-09-02T10:00:00Z", canonicalRows: 2,
      returnedAccounts: 1, requestedAccountDays: 2, returnedAccountDays: 2 })),
    loadByAccount: vi.fn(async () => [22, 3].map((cash, index) => ({ workspaceId, ...account, input: {
      ds: `2026-09-0${index + 1}`, cashCost: metricValue(cash), realConversion: metricValue(1),
      price: { value: index ? 10 : 20, effectiveDate: `2026-09-0${index + 1}`, versionKey: `p${index}` },
    } }))),
  };
  const snapshot = vi.fn(async (read: (r: typeof repository) => Promise<unknown>) => read(repository));
  return { repository, snapshot, query: new PlatformDimensionQuery(snapshot as never) };
}
describe("personal account dimension window", () => {
  it("uses one snapshot and batched reads; computes weighted assessment, not stored costSpace or mean CPA", async () => {
    const { query, repository, snapshot } = setup(); const result = await query.account(input);
    expect(snapshot).toHaveBeenCalledTimes(1);
    for (const method of Object.values(repository)) expect(method).toHaveBeenCalledTimes(1);
    expect(result.rows).toMatchObject([{ key: "KUAISHOU:synthetic", ...account,
      metrics: { costSpace: metricValue(5), ratios: { cashCpa: { value: 12.5, state: "finite" } } },
      assessment: { price: null, priceVersions: 2, priceSource: "history", onTarget: true, costStatus: "yellow" }, anomaly: false }]);
  });
  it("rejects missing history days and mismatched totals instead of creating ready results", async () => {
    for (const change of ["drop", "total", "foreign", "duplicate", "missing-row"] as const) {
      const { query, repository } = setup(), history = await repository.loadByAccount();
      if (change === "drop") history.pop();
      if (change === "total") history[0]!.input.cashCost = metricValue(999);
      if (change === "foreign") history[0]!.workspaceId = "00000000-0000-4000-8000-000000000099";
      if (change === "duplicate") history.push(history[0]!);
      if (change === "missing-row") repository.queryDimension.mockResolvedValue([]);
      repository.loadByAccount.mockResolvedValue(history);
      await expect(query.account(input)).rejects.toThrow();
    }
  });
  it("rejects fabricated lineage counts and rows outside the approved tuple", async () => {
    for (const invalid of ["lineage", "workspace", "media", "key"] as const) {
      const { query, repository } = setup(), rows = await repository.queryDimension();
      if (invalid === "lineage") repository.queryLineage.mockResolvedValue({ dataAsOf: null, canonicalRows: 3, returnedAccounts: 1, requestedAccountDays: 2, returnedAccountDays: 2 } as never);
      if (invalid === "workspace") rows[0]!.accountIdentity.workspaceId = "00000000-0000-4000-8000-000000000099";
      if (invalid === "media") rows[0]!.accountIdentity.media = "TENCENT";
      if (invalid === "key") rows[0]!.dimensionKey = "wrong";
      repository.queryDimension.mockResolvedValue(rows);
      await expect(query.account(input)).rejects.toThrow();
    }
  });
  it("keeps empty explicit scope empty and rejects duplicate input tuples before any read", async () => {
    const { query, repository, snapshot } = setup();
    await expect(query.account({ ...input, accounts: [account, account] })).rejects.toThrow();
    expect(snapshot).not.toHaveBeenCalled();
    repository.queryDimension.mockResolvedValue([]); repository.loadByAccount.mockResolvedValue([]);
    repository.queryLineage.mockResolvedValue({ dataAsOf: null, canonicalRows: 0, returnedAccounts: 0, requestedAccountDays: 0, returnedAccountDays: 0 } as never);
    expect((await query.account({ ...input, accounts: [] })).rows).toEqual([]);
  });
  it.each([null, [], "bad", { accountIdentity: { workspaceId, ...account }, metrics: null }])("invalid present dimension row fails as contract error %j", async (row) => {
    const { query, repository } = setup(); repository.queryDimension.mockResolvedValue([row] as never);
    await expect(query.account(input)).rejects.toMatchObject({ name: "SemanticQueryContractError" });
  });
});
