import { describe, expect, it, vi } from "vitest";

import { createBackfillCoordinatorHandler } from "../src/backfill/coordinator-handler.js";
import { deterministicJobId } from "../src/jobs/deterministic-id.js";
import { JOB_PRIORITY } from "../src/jobs/priorities.js";

const workspaceId = "11111111-1111-4111-8111-111111111111";
const ownerId = "22222222-2222-4222-8222-222222222222";

describe("backfill coordinator", () => {
  it("discovers accounts once and fans out one deterministic low-priority job per day", async () => {
    const qihang = {
      query: vi
        .fn()
        .mockResolvedValueOnce({
          rows: [{ account_id: "a-1" }],
          pagination: { totalNum: 2, pageNum: 1, pageSize: 1 },
          envelope: {},
        })
        .mockResolvedValueOnce({
          rows: [{ account_id: "a-2" }],
          pagination: { totalNum: 2, pageNum: 2, pageSize: 1 },
          envelope: {},
        }),
    };
    const batches = {
      get: vi.fn().mockResolvedValue({
        id: 7,
        workspaceId,
        userId: ownerId,
        dateFrom: "2026-08-17",
        dateTo: "2026-08-19",
        cursorDate: null,
        status: "running",
      }),
      refreshProgress: vi.fn(),
    };
    const jobs = { enqueue: vi.fn(async (job: { id?: string }) => job.id!) };
    const store = {
      startRun: vi.fn().mockResolvedValue("31"),
      appendRaw: vi.fn().mockResolvedValue(undefined),
      syncAccountMetadataAndRaw: vi.fn().mockResolvedValue(undefined),
      recordObservation: vi.fn().mockResolvedValue(undefined),
      finishRun: vi.fn().mockResolvedValue(undefined),
      failRun: vi.fn().mockResolvedValue(undefined),
    };
    const handler = createBackfillCoordinatorHandler({ qihang, batches, jobs, store });

    await handler({
      id: "33333333-3333-4333-8333-333333333333",
      workspaceId,
      jobType: "backfill_historical",
      payload: {
        workspaceId,
        backfillId: 7,
        userId: "qihang-owner",
        fetchedByUserId: ownerId,
        pageSize: 1,
      },
      priority: JOB_PRIORITY.BACKFILL,
      credentialOwnerUserId: ownerId,
      status: "leased",
      leaseUntil: null,
      leaseToken: "44444444-4444-4444-8444-444444444444",
      attempts: 1,
      maxAttempts: 3,
      runAfter: new Date(),
    });

    expect(qihang.query).toHaveBeenCalledTimes(2);
    expect(store.syncAccountMetadataAndRaw).toHaveBeenCalledTimes(2);
    expect(store.syncAccountMetadataAndRaw).toHaveBeenNthCalledWith(
      1,
      [expect.objectContaining({ workspaceId, media: "KUAISHOU", accountId: "a-1" })],
      [expect.objectContaining({ workspaceId, media: "KUAISHOU", accountId: "a-1" })],
    );
    expect(store.appendRaw).not.toHaveBeenCalled();
    expect(jobs.enqueue).toHaveBeenCalledTimes(3);
    expect(jobs.enqueue.mock.calls.map(([job]) => job)).toEqual(
      ["2026-08-17", "2026-08-18", "2026-08-19"].map((ds) => ({
        id: deterministicJobId(`backfill:7:${ds}`),
        workspaceId,
        jobType: "backfill_day",
        payload: {
          workspaceId,
          backfillId: 7,
          ds,
          accountIds: ["a-1", "a-2"],
        },
        priority: JOB_PRIORITY.BACKFILL,
        credentialOwnerUserId: ownerId,
        maxAttempts: 3,
      })),
    );
    expect(store.finishRun).toHaveBeenCalledWith("31", 2);
  });

  it("does not fan out any day when an account page transaction fails", async () => {
    const qihang = {
      query: vi.fn().mockResolvedValue({
        rows: [{ account_id: "a-1" }],
        pagination: { totalNum: 1, pageNum: 1, pageSize: 50 },
        envelope: {},
      }),
    };
    const batches = {
      get: vi.fn().mockResolvedValue({
        id: 8,
        workspaceId,
        userId: ownerId,
        dateFrom: "2026-08-17",
        dateTo: "2026-08-19",
        cursorDate: null,
        status: "running",
      }),
      refreshProgress: vi.fn(),
    };
    const jobs = { enqueue: vi.fn() };
    const store = {
      startRun: vi.fn().mockResolvedValue("32"),
      appendRaw: vi.fn(),
      syncAccountMetadataAndRaw: vi.fn().mockRejectedValue(new Error("page transaction failed")),
      recordObservation: vi.fn(),
      finishRun: vi.fn(),
      failRun: vi.fn(),
    };
    const handler = createBackfillCoordinatorHandler({ qihang, batches, jobs, store });

    await expect(handler({
      id: "33333333-3333-4333-8333-333333333334",
      workspaceId,
      jobType: "backfill_historical",
      payload: {
        workspaceId,
        backfillId: 8,
        userId: "qihang-owner",
        fetchedByUserId: ownerId,
        pageSize: 50,
      },
      priority: JOB_PRIORITY.BACKFILL,
      credentialOwnerUserId: ownerId,
      status: "leased",
      leaseUntil: null,
      leaseToken: "44444444-4444-4444-8444-444444444445",
      attempts: 1,
      maxAttempts: 3,
      runAfter: new Date(),
    })).rejects.toThrow("page transaction failed");
    expect(jobs.enqueue).not.toHaveBeenCalled();
    expect(store.failRun).toHaveBeenCalledWith(
      "32",
      "persist:account_page_1_accounts_and_raw",
      "page transaction failed",
    );
  });

  it("rejects a non-empty account page without pagination before persistence", async () => {
    const qihang = {
      query: vi.fn().mockResolvedValue({ rows: [{ account_id: "a-1" }], envelope: {} }),
    };
    const batches = {
      get: vi.fn().mockResolvedValue({
        id: 9,
        workspaceId,
        userId: ownerId,
        dateFrom: "2026-08-17",
        dateTo: "2026-08-19",
        cursorDate: null,
        status: "running",
      }),
      refreshProgress: vi.fn(),
    };
    const jobs = { enqueue: vi.fn() };
    const store = {
      startRun: vi.fn().mockResolvedValue("33"),
      appendRaw: vi.fn(),
      syncAccountMetadataAndRaw: vi.fn(),
      recordObservation: vi.fn(),
      finishRun: vi.fn(),
      failRun: vi.fn(),
    };

    await expect(createBackfillCoordinatorHandler({ qihang, batches, jobs, store })({
      id: "33333333-3333-4333-8333-333333333335",
      workspaceId,
      jobType: "backfill_historical",
      payload: {
        workspaceId,
        backfillId: 9,
        userId: "qihang-owner",
        fetchedByUserId: ownerId,
        pageSize: 50,
      },
      priority: JOB_PRIORITY.BACKFILL,
      credentialOwnerUserId: ownerId,
      status: "leased",
      leaseUntil: null,
      leaseToken: "44444444-4444-4444-8444-444444444446",
      attempts: 1,
      maxAttempts: 3,
      runAfter: new Date(),
    })).rejects.toThrow("pagination total");
    expect(store.syncAccountMetadataAndRaw).not.toHaveBeenCalled();
    expect(jobs.enqueue).not.toHaveBeenCalled();
    expect(store.failRun).toHaveBeenCalledWith(
      "33",
      "validate:account_page_1",
      "Qihang account pagination total is missing",
    );
  });
});
