import { describe, expect, it, vi } from "vitest";

import { createDataQualityHandler } from "../src/quality/check-handler.js";

const workspaceId = "11111111-1111-4111-8111-111111111111";

function leasedJob() {
  return {
    id: "33333333-3333-4333-8333-333333333333",
    workspaceId,
    jobType: "data_quality_check",
    payload: {
      workspaceId,
      dateFrom: "2026-08-18",
      dateTo: "2026-08-18",
    },
    priority: 9,
    credentialOwnerUserId: null,
    status: "leased" as const,
    leaseUntil: null,
    leaseToken: "44444444-4444-4444-8444-444444444444",
    attempts: 1,
    maxAttempts: 3,
    runAfter: new Date(),
  };
}

describe("data quality handler", () => {
  it.each([false, null])("does not complete a backfill quality stage when validation is %s", async (passed) => {
    const quality = {
      reconcileTotals: vi.fn().mockResolvedValue(passed === null
        ? { rawTotal: null, canonicalTotal: null, delta: null, tolerance: null, passed }
        : { rawTotal: 100, canonicalTotal: 102, delta: 2, tolerance: 0.1, passed }),
      markCpaOutliers: vi.fn().mockResolvedValue([]),
      findConsecutiveMissingAccounts: vi.fn().mockResolvedValue([]),
      recordCheck: vi.fn(),
    };
    const runs = { startRun: vi.fn().mockResolvedValue("63"), finishRun: vi.fn(), failRun: vi.fn() };
    const outbound = { enqueue: vi.fn() };
    const job = leasedJob();
    await expect(createDataQualityHandler({ quality, runs, outbound })({
      ...job, payload: { ...job.payload, backfillId: 9 },
    })).rejects.toThrow("Backfill quality checks did not pass");
    expect(quality.recordCheck).toHaveBeenCalledTimes(3);
    expect(quality.recordCheck.mock.calls[0]?.[0]).toMatchObject({ passed });
    expect(runs.finishRun).not.toHaveBeenCalled();
    expect(runs.failRun).toHaveBeenCalledWith("63", "quality:validation_failed", "Backfill quality checks did not pass");
  });
  it("records all checks and emits one alert without failing the completed canonical data", async () => {
    const quality = {
      reconcileTotals: vi.fn().mockResolvedValue({
        rawTotal: 100,
        canonicalTotal: 102,
        delta: 2,
        tolerance: 0.1,
        passed: false,
      }),
      markCpaOutliers: vi.fn().mockResolvedValue([]),
      findConsecutiveMissingAccounts: vi.fn().mockResolvedValue(["a-missing"]),
      recordCheck: vi.fn().mockResolvedValue(undefined),
    };
    const runs = {
      startRun: vi.fn().mockResolvedValue("61"),
      finishRun: vi.fn().mockResolvedValue(undefined),
      failRun: vi.fn().mockResolvedValue(undefined),
    };
    const outbound = { enqueue: vi.fn().mockResolvedValue(undefined) };

    await createDataQualityHandler({ quality, runs, outbound })(leasedJob());

    expect(quality.recordCheck).toHaveBeenCalledTimes(3);
    expect(quality.recordCheck.mock.calls.map(([check]) => check.checkType)).toEqual([
      "total_reconciliation",
      "cpa_outlier",
      "missing_consecutive_days",
    ]);
    expect(outbound.enqueue).toHaveBeenCalledWith({
      workspaceId,
      channel: "dingtalk",
      target: `workspace:${workspaceId}:admins`,
      kind: "data_quality_failed",
      payload: {
        ds: "2026-08-18",
        failedChecks: ["total_reconciliation", "missing_consecutive_days"],
      },
    });
    expect(runs.finishRun).toHaveBeenCalledWith("61", 3);
    expect(runs.failRun).not.toHaveBeenCalled();
  });

  it("records the technical failure stage and lets the job retry", async () => {
    const quality = {
      reconcileTotals: vi.fn().mockRejectedValue(new Error("query failed")),
      markCpaOutliers: vi.fn(),
      findConsecutiveMissingAccounts: vi.fn(),
      recordCheck: vi.fn(),
    };
    const runs = {
      startRun: vi.fn().mockResolvedValue("62"),
      finishRun: vi.fn(),
      failRun: vi.fn().mockResolvedValue(undefined),
    };
    const outbound = { enqueue: vi.fn() };

    await expect(
      createDataQualityHandler({ quality, runs, outbound })(leasedJob()),
    ).rejects.toThrow("query failed");
    expect(runs.failRun).toHaveBeenCalledWith(
      "62",
      "quality:total_reconciliation",
      "query failed",
    );
    expect(runs.finishRun).not.toHaveBeenCalled();
  });
});
