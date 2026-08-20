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
      startRun: vi.fn().mockResolvedValue(31),
      appendRaw: vi.fn().mockResolvedValue(undefined),
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
    expect(store.appendRaw).toHaveBeenCalledTimes(2);
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
    expect(store.finishRun).toHaveBeenCalledWith(31, 2);
  });
});
