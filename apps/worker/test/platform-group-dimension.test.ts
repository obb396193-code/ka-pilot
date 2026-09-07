import { describe, expect, it, vi } from "vitest";
import { metricValue } from "@ka/domain";
import { PlatformDimensionQuery } from "../src/data/platform-dimension-query.js";

const workspaceId = "00000000-0000-4000-8000-000000000031";
const account = { media: "KUAISHOU", accountId: "synthetic" };
const input = { workspaceId, accounts: [account], dimensionType: "task", window: { from: "2026-09-01", to: "2026-09-02" } };
function setup() {
  const repository = {
    queryDimension: vi.fn(async () => [22, 3].map((cash, i) => ({ dimensionKey: `task-${i}`, dimensionLabel: `Task ${i}`,
      metrics: { rowCount: 1, accountCount: 1, anomalyRows: 0, cost: 40, cashCost: cash, realConversion: 1,
        conversion: 4, exposure: 100, click: 10, costSpace: 999, wakeUv: null, potentialUv: null } }))),
    queryLineage: vi.fn(async () => ({ dataAsOf: "2026-09-02T10:00:00Z", canonicalRows: 2,
      returnedAccounts: 1, requestedAccountDays: 2, returnedAccountDays: 2 })),
    loadByAccount: vi.fn(async () => [22, 3].map((cash, i) => ({ workspaceId, ...account, taskId: `task-${i}`, bizName: `biz-${i}`, input: {
      ds: `2026-09-0${i + 1}`, cashCost: metricValue(cash), realConversion: metricValue(1),
      price: { value: i ? 10 : 20, effectiveDate: `2026-09-0${i + 1}`, versionKey: `p${i}` },
    } }))),
  };
  const snapshot = vi.fn(async (read: (r: typeof repository) => Promise<unknown>) => read(repository));
  return { repository, snapshot, query: new PlatformDimensionQuery(snapshot as never) };
}
describe("personal task/biz dimension windows", () => {
  it("keeps daily task changes separate without double-counting unique lineage accounts", async () => {
    const { query, repository, snapshot } = setup(); const result = await query.group(input);
    expect(snapshot).toHaveBeenCalledTimes(1);
    for (const method of Object.values(repository)) expect(method).toHaveBeenCalledTimes(1);
    expect(result.rows).toMatchObject([
      { key: "task-0", metrics: { cashCost: metricValue(22), costSpace: metricValue(-2) }, assessment: { price: { value: 20 }, onTarget: false } },
      { key: "task-1", metrics: { cashCost: metricValue(3), costSpace: metricValue(7) }, assessment: { price: { value: 10 }, onTarget: true } },
    ]);
    expect(result.lineage.returnedAccounts).toBe(1);
  });
  it("groups by actual daily business metadata, preserving a null orphan group", async () => {
    const { query, repository } = setup(), rows = await repository.queryDimension(), history = await repository.loadByAccount();
    rows[0]!.dimensionKey = "biz-0"; rows[1]!.dimensionKey = null as never; rows[1]!.dimensionLabel = null as never;
    history[1]!.bizName = null as never;
    repository.queryDimension.mockResolvedValue(rows); repository.loadByAccount.mockResolvedValue(history);
    expect((await query.group({ ...input, dimensionType: "biz" })).rows.map((r) => r.key)).toEqual(["biz-0", null]);
  });
  it.each(["missing-day", "duplicate", "foreign", "media", "invalid-task", "invalid-biz", "money", "key", "duplicate-group", "lineage", "zero-account-count"])("rejects %s without guessing scope or data", async (change) => {
    const { query, repository } = setup(), history = await repository.loadByAccount(), rows = await repository.queryDimension();
    if (change === "missing-day") history.pop();
    if (change === "duplicate") history.push(history[0]!);
    if (change === "foreign") history[0]!.workspaceId = "00000000-0000-4000-8000-000000000099";
    if (change === "media") history[0]!.media = "TENCENT";
    if (change === "invalid-task") history[0]!.taskId = false as never;
    if (change === "invalid-biz") history[0]!.bizName = 4 as never;
    if (change === "money") rows[0]!.metrics.cashCost = 999;
    if (change === "key") rows[0]!.dimensionKey = "other-task";
    if (change === "duplicate-group") rows[1]!.dimensionKey = rows[0]!.dimensionKey;
    if (change === "zero-account-count") rows[0]!.metrics.accountCount = 0;
    if (change === "lineage") repository.queryLineage.mockResolvedValue({ dataAsOf: null, canonicalRows: 2, returnedAccounts: 2, requestedAccountDays: 2, returnedAccountDays: 2 } as never);
    repository.loadByAccount.mockResolvedValue(history); repository.queryDimension.mockResolvedValue(rows);
    await expect(query.group(input)).rejects.toThrow();
  });
  it("keeps empty explicit scope empty and rejects unsupported dimensions before snapshot", async () => {
    const { query, repository, snapshot } = setup();
    await expect(query.group({ ...input, dimensionType: "bid_tool" })).rejects.toThrow(); expect(snapshot).not.toHaveBeenCalled();
    repository.queryDimension.mockResolvedValue([]); repository.loadByAccount.mockResolvedValue([]);
    repository.queryLineage.mockResolvedValue({ dataAsOf: null, canonicalRows: 0, returnedAccounts: 0, requestedAccountDays: 0, returnedAccountDays: 0 } as never);
    expect((await query.group({ ...input, accounts: [] })).rows).toEqual([]);
  });
});
