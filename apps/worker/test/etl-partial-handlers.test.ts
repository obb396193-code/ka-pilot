import { describe, expect, it, vi } from "vitest";
import type { JobRecord } from "@ka/db";
import { createFullEtlHandler } from "../src/etl/full-handler.js";
import { createIncrementalEtlHandler } from "../src/etl/incr-handler.js";
import type { QihangQuery, QihangQueryResult } from "../src/qihang/client.js";
import { BlockedAuthError, QihangSuspectedTruncationError, RetryExhaustedError } from "../src/qihang/errors.js";
const ws = "11111111-1111-4111-8111-111111111111", jobId = "22222222-2222-4222-8222-222222222222", lease = "33333333-3333-4333-8333-333333333333";
const day = "2026-09-10", ids = Array.from({ length: 101 }, (_, i) => `synthetic-${i}`);
function job(type: "etl_full" | "etl_incr", accounts = ids): JobRecord {
  return { id: jobId, workspaceId: ws, jobType: type, status: "leased", attempts: 1, maxAttempts: 3, leaseToken: lease,
    leaseUntil: new Date("2099-01-01"), runAfter: new Date(), credentialOwnerUserId: null, priority: 1,
    payload: { workspaceId: ws, media: "KUAISHOU", userId: "synthetic-private-identity", accountIds: accounts,
      asOfDate: day, realtimeDays: 1, ds: day, offlineReconcileDays: 0, focusAccountIds: accounts, hh: 2 } };
}
function setup(query?: (q: QihangQuery) => Promise<QihangQueryResult>) {
  const store = { startRun: vi.fn().mockResolvedValue("123"), appendRaw: vi.fn().mockResolvedValue(undefined),
    syncAccountMetadataAndRaw: vi.fn().mockResolvedValue(undefined), recordObservation: vi.fn(), finishRun: vi.fn(), failRun: vi.fn() };
  const qihang = { query: vi.fn(query ?? (async (q: QihangQuery) => q.resource === "account"
    ? { rows: [], envelope: {}, pagination: { totalNum: 0, pageNum: 1, pageSize: 50 } }
    : { rows: (q.accountIds ?? []).map(account_id => ({ account_id, ds: q.resource === "account_offline" ? q.beginDate : q.ds, account_cost: 10 })), envelope: {} })) };
  return { store, qihang, jobs: { enqueue: vi.fn().mockResolvedValue(jobId) },
    hourly: { upsertHourly: vi.fn() }, failures: { record: vi.fn().mockResolvedValue({ recorded: true }) } };
}
const exhausted = () => new RetryExhaustedError(4, { cause: new TypeError("synthetic private upstream text") });
describe("P176 Full/Incr scoped partial execution", () => {
  it("full persists warning for the failed middle batch and continues last batch", async () => {
    const s = setup(); s.qihang.query.mockImplementation(async (q: QihangQuery) => {
      if (q.resource === "account") return { rows: [], envelope: {} };
      if (q.resource === "account_realtime" && q.accountIds?.[0] === ids[50]) throw exhausted();
      return { rows: q.resource === "account_offline" ? [] : (q.accountIds ?? []).map(account_id => ({ account_id, ds: day, account_cost: 10 })), envelope: {} };
    });
    await createFullEtlHandler(s)(job("etl_full"));
    expect(s.store.startRun.mock.calls[0]?.[2]).toMatchObject({ batchScope: { workspaceId: ws, media: "KUAISHOU", accountIds: ids, dateFrom: "2026-09-07", dateTo: day } });
    expect(s.failures.record).toHaveBeenCalledOnce(); expect(s.failures.record.mock.calls[0]?.[0]).toMatchObject({ workspaceId: ws, jobId, leaseToken: lease, runId: "123", warning: { accountIds: ids.slice(50, 100), code: "BATCH_FAILED" } });
    expect(JSON.stringify(s.failures.record.mock.calls)).not.toMatch(/synthetic-private|upstream text/);
    expect(s.store.appendRaw.mock.calls.flatMap(c => c[0])).toHaveLength(51);
    expect(s.store.finishRun).toHaveBeenCalledWith("123", 51); expect(s.store.failRun).not.toHaveBeenCalled();
    expect(s.jobs.enqueue).toHaveBeenCalledOnce();
  });
  it("incr does not derive hourly data for either-side failed accounts, other batches survive", async () => {
    const accounts = ids.slice(0, 6), s = setup(async q => {
      if (q.resource === "ad_realtime" && q.hh === 1 && q.accountIds?.[0] === accounts[0]) throw exhausted();
      return { rows: q.resource === "ad_realtime" ? (q.accountIds ?? []).map(account_id => ({ account_id, ad_id: `ad-${account_id}`,
        ds: day, ad_cost_h: Number(q.hh) * 10, ad_exposure_h: Number(q.hh) * 100, ad_click_h: Number(q.hh), ad_conversion_h: 1, ad_real_conversion_h: 1, ad_bid_h: 1, ad_budget_h: 10 })) : [], envelope: {} };
    });
    await createIncrementalEtlHandler(s)(job("etl_incr", accounts));
    expect(s.failures.record).toHaveBeenCalledOnce();
    expect(s.failures.record.mock.calls[0]?.[0]).toMatchObject({ filters: { hh: 1 } });
    expect(s.hourly.upsertHourly).toHaveBeenCalledOnce();
    expect(s.hourly.upsertHourly.mock.calls[0]?.[0]).toEqual([expect.objectContaining({ accountId: accounts[5], cost: 10 })]);
    expect(s.store.finishRun).toHaveBeenCalledOnce();
    expect(s.store.recordObservation).toHaveBeenCalledWith("123", expect.objectContaining({ kind: "hourly_derivation", availability: "observed_unverified" }));
  });
  it.each([new BlockedAuthError("private"), new QihangSuspectedTruncationError(2000, 2000), new Error("unexpected source")])("unsafe failure never becomes partial %s", async error => {
    const s = setup(async () => { throw error; });
    await expect(createIncrementalEtlHandler(s)(job("etl_incr"))).rejects.toBe(error);
    expect(s.failures.record).not.toHaveBeenCalled(); expect(s.store.finishRun).not.toHaveBeenCalled();
  });
  it("recorder failure stops before later source requests and never finishes", async () => {
    const s = setup(async () => { throw exhausted(); }); s.failures.record.mockRejectedValue(new Error("ledger unavailable"));
    await expect(createIncrementalEtlHandler(s)(job("etl_incr"))).rejects.toThrow("ledger unavailable");
    expect(s.qihang.query).toHaveBeenCalledOnce(); expect(s.store.finishRun).not.toHaveBeenCalled();
  });
  it("raw persistence failure is not swallowed even if shaped like exhausted source error", async () => {
    const s = setup(); s.store.appendRaw.mockRejectedValue(exhausted());
    await expect(createIncrementalEtlHandler(s)(job("etl_incr"))).rejects.toBeInstanceOf(RetryExhaustedError);
    expect(s.failures.record).not.toHaveBeenCalled(); expect(s.store.finishRun).not.toHaveBeenCalled();
  });
  it.each(["empty", "lease", "focus"])("invalid execution scope stops before run/source %s", async bad => {
    const s = setup(), j = job("etl_incr");
    if (bad === "empty") j.payload.accountIds = [];
    if (bad === "lease") j.leaseToken = null;
    if (bad === "focus") j.payload.focusAccountIds = ["foreign"];
    await expect(createIncrementalEtlHandler(s)(j)).rejects.toThrow();
    expect(s.store.startRun).not.toHaveBeenCalled(); expect(s.qihang.query).not.toHaveBeenCalled();
  });
});
