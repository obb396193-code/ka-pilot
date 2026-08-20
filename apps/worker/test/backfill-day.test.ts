import { describe, expect, it, vi } from "vitest";

import { createBackfillDayHandler } from "../src/backfill/day-handler.js";
import { deterministicJobId } from "../src/jobs/deterministic-id.js";
import { JOB_PRIORITY } from "../src/jobs/priorities.js";

const workspaceId = "11111111-1111-4111-8111-111111111111";
const ownerId = "22222222-2222-4222-8222-222222222222";

function leasedJob() {
  return {
    id: "33333333-3333-4333-8333-333333333333",
    workspaceId,
    jobType: "backfill_day",
    payload: {
      workspaceId,
      backfillId: 7,
      ds: "2026-08-18",
      accountIds: ["a-1"],
      userId: "qihang-owner",
      fetchedByUserId: ownerId,
    },
    priority: JOB_PRIORITY.BACKFILL,
    credentialOwnerUserId: ownerId,
    status: "leased" as const,
    leaseUntil: null,
    leaseToken: "44444444-4444-4444-8444-444444444444",
    attempts: 1,
    maxAttempts: 3,
    runAfter: new Date(),
  };
}

function dependencies() {
  return {
    qihang: {
      query: vi.fn().mockResolvedValue({
        rows: [{ account_id: "a-1", ds: "20260818", cost_api: 10 }],
        envelope: {},
      }),
    },
    store: {
      startRun: vi.fn().mockResolvedValue(41),
      appendRaw: vi.fn().mockResolvedValue(undefined),
      recordObservation: vi.fn().mockResolvedValue(undefined),
      finishRun: vi.fn().mockResolvedValue(undefined),
      failRun: vi.fn().mockResolvedValue(undefined),
    },
    jobs: { enqueue: vi.fn().mockResolvedValue("canonical-job") },
  };
}

describe("backfill day", () => {
  it("uses the Asia/Shanghai business day instead of the UTC calendar day", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-19T23:00:00.000Z"));
    try {
      const deps = dependencies();
      await createBackfillDayHandler(deps)(leasedJob());

      expect(deps.jobs.enqueue).toHaveBeenCalledWith(
        expect.objectContaining({
          payload: expect.objectContaining({ reportDate: "2026-08-20" }),
        }),
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("fetches only the target offline day and queues canonical idempotently", async () => {
    const deps = dependencies();
    await createBackfillDayHandler(deps)(leasedJob());

    expect(deps.qihang.query).toHaveBeenCalledWith({
      resource: "account_offline",
      userId: "qihang-owner",
      media: "KUAISHOU",
      accountIds: ["a-1"],
      beginDate: "2026-08-18",
      endDate: "2026-08-18",
    });
    const raw = deps.store.appendRaw.mock.calls[0]?.[0][0];
    expect(raw).toMatchObject({
      resource: "account_offline",
      ds: "2026-08-18",
      requestParams: {
        media: "KUAISHOU",
        accountIds: ["a-1"],
        beginDate: "2026-08-18",
        endDate: "2026-08-18",
      },
    });
    expect(deps.jobs.enqueue).toHaveBeenCalledWith({
      id: deterministicJobId("canonical:7:2026-08-18"),
      workspaceId,
      jobType: "canonical_merge",
      payload: {
        workspaceId,
        backfillId: 7,
        dateFrom: "2026-08-18",
        dateTo: "2026-08-18",
        reportDate: expect.any(String),
      },
      priority: JOB_PRIORITY.BACKFILL,
      credentialOwnerUserId: ownerId,
      maxAttempts: 3,
    });
    expect(deps.store.finishRun).toHaveBeenCalledWith(41, 1);
  });

  it("records the fetch stage before allowing the day job to retry", async () => {
    const deps = dependencies();
    deps.qihang.query.mockRejectedValue(new Error("offline failed"));

    await expect(createBackfillDayHandler(deps)(leasedJob())).rejects.toThrow(
      "offline failed",
    );
    expect(deps.store.failRun).toHaveBeenCalledWith(
      41,
      "fetch:account_offline",
      "offline failed",
    );
    expect(deps.jobs.enqueue).not.toHaveBeenCalled();
  });
});
