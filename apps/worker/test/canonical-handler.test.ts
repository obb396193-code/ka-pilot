import { describe, expect, it, vi } from "vitest";

import { createCanonicalHandler } from "../src/etl/canonical-handler.js";
import { deterministicJobId } from "../src/jobs/deterministic-id.js";

const workspaceId = "11111111-1111-4111-8111-111111111111";

describe("canonical handler", () => {
  it("merges raw fields, applies effective settings and persists derived metrics", async () => {
    const upsert = vi.fn().mockResolvedValue(undefined);
    const store = {
      loadMergeInputs: vi.fn().mockResolvedValue([
        {
          workspaceId,
          accountId: "a-1",
          ds: "2026-08-18",
          reportDate: "2026-08-19",
          offline: {
            account_id: "a-1",
            cost_api: 100,
            exp_pv_api: 1_000,
            clk_api: 80,
            income: 5,
            wake_uv: 40,
            aac_ptt_uv: 20,
          },
          realtime: {
            account_id: "a-1",
            account_conversion: 12,
            account_real_conversion: 10,
            account_budget: 500,
          },
        },
      ]),
      loadEffectiveSettingsBatch: vi.fn().mockResolvedValue([
        {
          workspaceId,
          accountId: "a-1",
          ds: "2026-08-18",
          channelCoefficient: 2,
          assessmentPrice: 11,
        },
      ]),
      loadHistoricalSpendBatch: vi.fn().mockResolvedValue([
        {
          workspaceId,
          accountId: "a-1",
          ds: "2026-08-18",
          history: [10, 20, 0],
        },
      ]),
      upsertCanonicalBatch: upsert,
    };
    const runs = {
      startRun: vi.fn().mockResolvedValue(51),
      finishRun: vi.fn().mockResolvedValue(undefined),
      failRun: vi.fn().mockResolvedValue(undefined),
    };
    const jobs = { enqueue: vi.fn().mockResolvedValue("quality-job") };
    const handler = createCanonicalHandler({ store, runs, jobs });

    await handler({
      id: "33333333-3333-4333-8333-333333333333",
      workspaceId,
      jobType: "canonical_merge",
      payload: {
        workspaceId,
        dateFrom: "2026-08-18",
        dateTo: "2026-08-18",
        reportDate: "2026-08-19",
        backfillId: 7,
      },
      priority: 5,
      credentialOwnerUserId: null,
      status: "leased",
      leaseUntil: null,
      leaseToken: "44444444-4444-4444-8444-444444444444",
      attempts: 1,
      maxAttempts: 3,
      runAfter: new Date(),
    });

    expect(upsert).toHaveBeenCalledWith([
      expect.objectContaining({
        workspaceId,
        accountId: "a-1",
        cost: 100,
        conversion: 12,
        realConversion: 10,
        realCpa: 10,
        cashCost: 47.5,
        cashCpa: 4.75,
        costSpace: 62.5,
        assessmentPriceSnapshot: 11,
        dataAnomaly: true,
      }),
    ]);
    const record = upsert.mock.calls[0]?.[0]?.[0] as {
      fieldSources: Record<string, string>;
    };
    expect((record as unknown as { gap: number }).gap).toBeCloseTo(0.2);
    expect(record.fieldSources.realCpa).toBe("derived");
    expect(runs.startRun).toHaveBeenCalledWith(
      "33333333-3333-4333-8333-333333333333",
      "canonical",
      {
        workspaceId,
        dateFrom: "2026-08-18",
        dateTo: "2026-08-18",
        reportDate: "2026-08-19",
        credentialOwnerUserId: null,
        backfillId: 7,
      },
    );
    expect(jobs.enqueue).toHaveBeenCalledWith({
      id: deterministicJobId("quality:7:2026-08-18:2026-08-18"),
      workspaceId,
      jobType: "data_quality_check",
      payload: {
        workspaceId,
        backfillId: 7,
        dateFrom: "2026-08-18",
        dateTo: "2026-08-18",
      },
      priority: 5,
      credentialOwnerUserId: null,
      maxAttempts: 3,
    });
    expect(runs.finishRun).toHaveBeenCalledWith(51, 1);
  });

  it("records the failing canonical stage before retrying", async () => {
    const store = {
      loadMergeInputs: vi.fn().mockResolvedValue([
        {
          workspaceId,
          accountId: "a-1",
          ds: "2026-08-18",
          reportDate: "2026-08-19",
          offline: { account_id: "a-1", cost_api: 100 },
        },
      ]),
      loadEffectiveSettingsBatch: vi
        .fn()
        .mockRejectedValue(new Error("settings unavailable")),
      loadHistoricalSpendBatch: vi.fn().mockResolvedValue([]),
      upsertCanonicalBatch: vi.fn(),
    };
    const runs = {
      startRun: vi.fn().mockResolvedValue(52),
      finishRun: vi.fn(),
      failRun: vi.fn().mockResolvedValue(undefined),
    };
    const jobs = { enqueue: vi.fn() };
    const handler = createCanonicalHandler({ store, runs, jobs });

    await expect(
      handler({
        id: "44444444-4444-4444-8444-444444444444",
        workspaceId,
        jobType: "canonical_merge",
        payload: {
          workspaceId,
          dateFrom: "2026-08-18",
          dateTo: "2026-08-18",
          reportDate: "2026-08-19",
        },
        priority: 5,
        credentialOwnerUserId: null,
        status: "leased",
        leaseUntil: null,
        leaseToken: "44444444-4444-4444-8444-444444444444",
        attempts: 1,
        maxAttempts: 3,
        runAfter: new Date(),
      }),
    ).rejects.toThrow("settings unavailable");

    expect(runs.failRun).toHaveBeenCalledWith(52, "aggregate:settings", "settings unavailable");
    expect(jobs.enqueue).not.toHaveBeenCalled();
  });

  it("processes inputs in bounded chunks and only enqueues quality after every batch", async () => {
    const inputs = ["a-1", "a-2", "a-3"].map((accountId) => ({
      workspaceId,
      accountId,
      ds: "2026-08-18",
      reportDate: "2026-08-19",
      offline: { account_id: accountId, cost_api: 100 },
    }));
    const loadEffectiveSettingsBatch = vi.fn().mockImplementation(
      async (_workspaceId: string, keys: { accountId: string; ds: string }[]) =>
        keys.map((key) => ({
          workspaceId,
          ...key,
          channelCoefficient: 1,
          assessmentPrice: 10,
        })),
    );
    const loadHistoricalSpendBatch = vi.fn().mockImplementation(
      async (_workspaceId: string, keys: { accountId: string; ds: string }[]) =>
        keys.map((key) => ({ workspaceId, ...key, history: [] })),
    );
    const upsertCanonicalBatch = vi.fn().mockResolvedValue(undefined);
    const jobs = { enqueue: vi.fn().mockResolvedValue("quality-job") };
    const handler = createCanonicalHandler({
      store: {
        loadMergeInputs: vi.fn().mockResolvedValue(inputs),
        loadEffectiveSettingsBatch,
        loadHistoricalSpendBatch,
        upsertCanonicalBatch,
      },
      runs: {
        startRun: vi.fn().mockResolvedValue(53),
        finishRun: vi.fn().mockResolvedValue(undefined),
        failRun: vi.fn().mockResolvedValue(undefined),
      },
      jobs,
      chunkSize: 2,
    });

    await handler({
      id: "55555555-5555-4555-8555-555555555555",
      workspaceId,
      jobType: "canonical_merge",
      payload: {
        workspaceId,
        dateFrom: "2026-08-18",
        dateTo: "2026-08-18",
        reportDate: "2026-08-19",
      },
      priority: 5,
      credentialOwnerUserId: null,
      status: "leased",
      leaseUntil: null,
      leaseToken: "55555555-5555-4555-8555-555555555555",
      attempts: 1,
      maxAttempts: 3,
      runAfter: new Date(),
    });

    expect(loadEffectiveSettingsBatch.mock.calls.map((call) => call[1])).toEqual([
      [
        { accountId: "a-1", ds: "2026-08-18" },
        { accountId: "a-2", ds: "2026-08-18" },
      ],
      [{ accountId: "a-3", ds: "2026-08-18" }],
    ]);
    expect(loadHistoricalSpendBatch).toHaveBeenCalledTimes(2);
    expect(upsertCanonicalBatch.mock.calls.map((call) => call[0].length)).toEqual([2, 1]);
    expect(jobs.enqueue).toHaveBeenCalledTimes(1);
    expect(upsertCanonicalBatch.mock.invocationCallOrder[1]).toBeLessThan(
      jobs.enqueue.mock.invocationCallOrder[0]!,
    );
  });

  it("fails closed when a batch lookup omits a requested composite key", async () => {
    const failRun = vi.fn().mockResolvedValue(undefined);
    const jobs = { enqueue: vi.fn() };
    const handler = createCanonicalHandler({
      store: {
        loadMergeInputs: vi.fn().mockResolvedValue([
          {
            workspaceId,
            accountId: "a-1",
            ds: "2026-08-18",
            reportDate: "2026-08-19",
            offline: { account_id: "a-1", cost_api: 100 },
          },
        ]),
        loadEffectiveSettingsBatch: vi.fn().mockResolvedValue([]),
        loadHistoricalSpendBatch: vi.fn().mockResolvedValue([
          { workspaceId, accountId: "a-1", ds: "2026-08-18", history: [] },
        ]),
        upsertCanonicalBatch: vi.fn(),
      },
      runs: {
        startRun: vi.fn().mockResolvedValue(54),
        finishRun: vi.fn(),
        failRun,
      },
      jobs,
    });

    await expect(
      handler({
        id: "66666666-6666-4666-8666-666666666666",
        workspaceId,
        jobType: "canonical_merge",
        payload: {
          workspaceId,
          dateFrom: "2026-08-18",
          dateTo: "2026-08-18",
          reportDate: "2026-08-19",
        },
        priority: 5,
        credentialOwnerUserId: null,
        status: "leased",
        leaseUntil: null,
        leaseToken: "66666666-6666-4666-8666-666666666666",
        attempts: 1,
        maxAttempts: 3,
        runAfter: new Date(),
      }),
    ).rejects.toThrow("missing requested key");

    expect(failRun).toHaveBeenCalledWith(
      54,
      "aggregate:settings",
      expect.stringContaining("missing requested key"),
    );
    expect(jobs.enqueue).not.toHaveBeenCalled();
  });

  it("rejects unsafe chunk sizes at construction", () => {
    const dependencies = {
      store: {
        loadMergeInputs: vi.fn(),
        loadEffectiveSettingsBatch: vi.fn(),
        loadHistoricalSpendBatch: vi.fn(),
        upsertCanonicalBatch: vi.fn(),
      },
      runs: { startRun: vi.fn(), finishRun: vi.fn(), failRun: vi.fn() },
      jobs: { enqueue: vi.fn() },
    };

    expect(() => createCanonicalHandler({ ...dependencies, chunkSize: 0 })).toThrow(
      "chunkSize",
    );
    expect(() => createCanonicalHandler({ ...dependencies, chunkSize: 1001 })).toThrow(
      "chunkSize",
    );
  });
});
