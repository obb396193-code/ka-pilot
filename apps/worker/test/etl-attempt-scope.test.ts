import { describe, expect, it, vi } from "vitest";
import type { JobRecord } from "@ka/db";
import { withEtlAttempt } from "../src/etl/attempt-scope.js";
import { createFullEtlHandler } from "../src/etl/full-handler.js";
import { createIncrementalEtlHandler } from "../src/etl/incr-handler.js";
import { createCanonicalHandler } from "../src/etl/canonical-handler.js";
import { createBackfillDayHandler } from "../src/backfill/day-handler.js";
import { createBackfillCoordinatorHandler } from "../src/backfill/coordinator-handler.js";
import { createDataQualityHandler } from "../src/quality/check-handler.js";

const workspaceId = "11111111-1111-4111-8111-111111111111";
const base: JobRecord = {
  id: "22222222-2222-4222-8222-222222222222", workspaceId, jobType: "etl_full", attempts: 1,
  maxAttempts: 3, status: "leased", payload: { token: "synthetic-not-for-storage", attempt: 99 },
  priority: 1, credentialOwnerUserId: null, leaseToken: "synthetic-lease-secret", leaseUntil: null, runAfter: new Date(0),
};
describe("immutable ETL attempt evidence", () => {
  it("projects only trusted fields and replaces a forged scope execution without mutation", () => {
    const scope = { workspaceId, ds: "2026-09-07", execution: { attempt: 99 } };
    const output = withEtlAttempt(base, scope);
    expect(output.execution).toEqual({ version: "etl-attempt/v1", jobId: base.id, workspaceId, jobType: "etl_full", attempt: 1 });
    expect(output).toMatchObject({ ds: scope.ds }); expect(scope.execution.attempt).toBe(99);
    expect(JSON.stringify(output)).not.toContain("synthetic");
    expect(JSON.stringify(output)).not.toContain("leaseToken");
  });
  it("retains old attempt after the mutable job advances to a retry", () => {
    const job = { ...base }; const old = withEtlAttempt(job, { workspaceId });
    job.attempts = 2;
    expect(withEtlAttempt(job, { workspaceId }).execution.attempt).toBe(2);
    expect(old.execution.attempt).toBe(1);
  });
  it.each(["etl_full", "etl_incr", "backfill_historical", "backfill_day", "canonical_merge", "data_quality_check"])(
    "accepts existing job type %s in running state", (jobType) => {
      expect(withEtlAttempt({ ...base, jobType, status: "running" }, { workspaceId }).execution.jobType).toBe(jobType);
    });
  it.each([0, -1, 1.5, NaN, Infinity, 4, Number.MAX_SAFE_INTEGER + 1])("rejects impossible attempt %s", (attempts) => {
    expect(() => withEtlAttempt({ ...base, attempts }, { workspaceId })).toThrow();
  });
  it.each(["queued", "done", "failed", "blocked_auth"] as const)("rejects unclaimed/terminal status %s", (status) => {
    expect(() => withEtlAttempt({ ...base, status }, { workspaceId })).toThrow();
  });
  it("rejects missing/mismatched workspace, invalid job identity and unknown job type", () => {
    for (const job of [{ ...base, workspaceId: null }, { ...base, id: "bad" }, { ...base, jobType: "media_write" }, { ...base, maxAttempts: 0 }]) {
      expect(() => withEtlAttempt(job, { workspaceId })).toThrow();
    }
    expect(() => withEtlAttempt(base, {})).toThrow();
    expect(() => withEtlAttempt(base, { workspaceId: base.id })).toThrow();
  });
});

describe("six production ETL entry points capture their claimed attempt", () => {
  const cases = [
    ["etl_full", "full", createFullEtlHandler], ["etl_incr", "incr", createIncrementalEtlHandler],
    ["canonical_merge", "canonical", createCanonicalHandler], ["backfill_day", "backfill_day", createBackfillDayHandler],
    ["backfill_historical", "backfill_coordinator", createBackfillCoordinatorHandler],
    ["data_quality_check", "quality", createDataQualityHandler],
  ] as const;
  it.each(cases)("%s persists evidence before upstream work", async (jobType, runKind, factory) => {
    const stop = new Error("synthetic stop after capture");
    const store = {
      startRun: vi.fn().mockRejectedValue(stop), finishRun: vi.fn(), failRun: vi.fn(),
      recordObservation: vi.fn(), appendRaw: vi.fn(), syncAccountMetadataAndRaw: vi.fn(),
      loadMergeInputs: vi.fn(), loadEffectiveSettingsBatch: vi.fn(), loadHistoricalSpendBatch: vi.fn(), upsertCanonicalBatch: vi.fn(),
    };
    const owner = "33333333-3333-4333-8333-333333333333";
    const qihang = { query: vi.fn() };
    const dependencies = { store, runs: store, qihang, jobs: { enqueue: vi.fn() }, hourly: { upsertHourly: vi.fn() },
      batches: { get: vi.fn().mockResolvedValue({ userId: owner, dateFrom: "2026-09-06", dateTo: "2026-09-06" }), refreshProgress: vi.fn() },
      quality: { reconcileTotals: vi.fn(), markCpaOutliers: vi.fn(), findConsecutiveMissingAccounts: vi.fn(), recordCheck: vi.fn() },
      outbound: { enqueue: vi.fn() },
    };
    const job = { ...base, jobType, attempts: 2, payload: { workspaceId, userId: "synthetic-query-identity", fetchedByUserId: owner,
      accountIds: ["synthetic-account"], asOfDate: "2026-09-07", ds: "2026-09-06", dateFrom: "2026-09-06",
      dateTo: "2026-09-06", reportDate: "2026-09-07", backfillId: 1, attempt: 99,
    } };
    await expect(factory(dependencies)(job)).rejects.toBe(stop);
    expect(store.startRun).toHaveBeenCalledWith(base.id, runKind, expect.objectContaining({ execution: {
      version: "etl-attempt/v1", jobId: base.id, workspaceId, jobType, attempt: 2,
    } }));
    expect(qihang.query).not.toHaveBeenCalled(); expect(store.loadMergeInputs).not.toHaveBeenCalled();
    expect(JSON.stringify(store.startRun.mock.calls)).not.toContain("synthetic-query-identity");
    expect(JSON.stringify(store.startRun.mock.calls)).not.toContain(base.leaseToken);
  });
});
