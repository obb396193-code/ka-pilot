import { describe, expect, it, vi } from "vitest";

import { hourlySampleTargets, sampleAccountHourly } from "../src/etl/account-hourly-job.js";

/**
 * v1.9.47（Q-042）：小时采样。契约（api.md F-P153-1）是每小时 HH:05 抓
 * `hh=HH−1`（已完整）与 `hh=HH`（还在涨，下一轮覆盖）。
 */
const ws = "00000000-0000-4000-8000-000000000001";
const context = (over: Partial<Parameters<typeof sampleAccountHourly>[2]> = {}) => ({
  workspaceId: ws, jobId: ws, leaseToken: ws, runId: "17",
  userId: "Cf-user", media: "KUAISHOU",
  accountIds: ["a", "b"], timeZone: "Asia/Shanghai",
  now: new Date("2026-09-12T02:05:00Z"), ...over,
});
const sourceRow = (accountId: string, ds: string) => ({
  account_id: accountId, ds, account_cost: 12.5, account_exposure: 100, account_click: 10,
  account_conversion: 2, account_real_conversion: 1, account_budget: 500,
  last_sync_time: "2026-09-12 10:02:00",
});

describe("v1.9.47 hourly sampling targets", () => {
  it("takes the finished hour and the one still running", () => {
    // 上海 10:05 → 抓 09 点（已完整）与 10 点（还在涨）。
    expect(hourlySampleTargets(new Date("2026-09-12T02:05:00Z"), "Asia/Shanghai"))
      .toEqual([{ ds: "2026-09-12", hh: 9 }, { ds: "2026-09-12", hh: 10 }]);
  });

  it("puts the previous hour on the previous day just after midnight", () => {
    // 上海 00:05 → 上一个小时是**昨天的 23 点**。直接 hh-1 会把它记到今天 −1 或今天 23，
    // 前者非法、后者会盖掉今天真正的 23 点累计。
    expect(hourlySampleTargets(new Date("2026-09-11T16:05:00Z"), "Asia/Shanghai"))
      .toEqual([{ ds: "2026-09-11", hh: 23 }, { ds: "2026-09-12", hh: 0 }]);
  });

  it("reads the hour in the source zone, not the server's", () => {
    const utc = hourlySampleTargets(new Date("2026-09-12T02:05:00Z"), "UTC");
    expect(utc).toEqual([{ ds: "2026-09-12", hh: 1 }, { ds: "2026-09-12", hh: 2 }]);
  });
});

describe("v1.9.47 hourly sampling run", () => {
  function setup(rows: Record<string, unknown>[]) {
    const query: (query: unknown) => Promise<{ rows: Record<string, unknown>[] }> =
      vi.fn(async () => ({ rows }));
    const persist = vi.fn(async (batch: unknown) => ({ rawRows: rows.length,
      writtenRows: (batch as { rows: unknown[] }).rows.length }));
    return { qihang: { query }, writer: { persist }, query, persist };
  }

  it("asks the source for both hours and persists what came back", async () => {
    const { qihang, writer, query, persist } = setup([sourceRow("a", "2026-09-12"), sourceRow("b", "2026-09-12")]);
    const result = await sampleAccountHourly(qihang as never, writer, context());
    expect(vi.mocked(query)).toHaveBeenCalledTimes(2);
    expect(vi.mocked(query).mock.calls.map((call) => (call[0] as { hh: number }).hh)).toEqual([9, 10]);
    expect(result).toEqual({ writtenRows: 4, skipped: null });
    // 写入要带上本次 run，否则写库那道「同一租约」的闸认不出它。
    expect((persist.mock.calls[0]?.[0] as { runId: string } | undefined)?.runId).toBe("17");
  });

  it("does not sample at all when the source timezone is unconfigured", async () => {
    const { qihang, writer, query } = setup([]);
    expect(await sampleAccountHourly(qihang as never, writer, context({ timeZone: null })))
      .toEqual({ writtenRows: 0, skipped: "no_timezone" });
    // 一次都不该打——没有时区就判不出 complete，采回来的行会被错标，比不采更糟。
    expect(vi.mocked(query)).not.toHaveBeenCalled();
  });

  it("writes nothing when the source returned no rows, rather than filling zeros", async () => {
    const { qihang, writer, persist } = setup([]);
    expect(await sampleAccountHourly(qihang as never, writer, context())).toEqual({ writtenRows: 0, skipped: null });
    expect(persist).not.toHaveBeenCalled();
  });

  it("splits accounts into batches the storage contract accepts", async () => {
    const ids = Array.from({ length: 120 }, (_, index) => `acc-${index}`);
    const { qihang, writer, query } = setup([]);
    await sampleAccountHourly(qihang as never, writer, context({ accountIds: ids }));
    // 两个小时 × 三批（50/50/20）；每批都在写入契约的 50 户上限内。
    expect(vi.mocked(query)).toHaveBeenCalledTimes(6);
    for (const call of vi.mocked(query).mock.calls) {
      expect((call[0] as { accountIds: string[] }).accountIds.length).toBeLessThanOrEqual(50);
    }
  });

  it("skips an empty account list without calling the source", async () => {
    const { qihang, writer, query } = setup([]);
    expect(await sampleAccountHourly(qihang as never, writer, context({ accountIds: [] })))
      .toEqual({ writtenRows: 0, skipped: "no_accounts" });
    expect(vi.mocked(query)).not.toHaveBeenCalled();
  });
});
