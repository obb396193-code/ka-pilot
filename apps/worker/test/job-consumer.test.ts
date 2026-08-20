import { describe, expect, it, vi } from "vitest";

import { LostJobLeaseError, type JobRecord, type JobRepositoryPort } from "@ka/db";

import { JobConsumer } from "../src/jobs/consumer.js";
import { BlockedAuthError } from "../src/qihang/errors.js";

function job(overrides: Partial<JobRecord> = {}): JobRecord {
  return {
    id: "job-1",
    workspaceId: "workspace-1",
    jobType: "etl_incr",
    payload: {},
    priority: 5,
    credentialOwnerUserId: "user-1",
    status: "leased",
    leaseUntil: new Date(Date.now() + 60_000),
    leaseToken: "11111111-1111-4111-8111-111111111111",
    attempts: 1,
    maxAttempts: 3,
    runAfter: new Date(),
    ...overrides,
  };
}

function repositoryFor(nextJob: JobRecord | null): JobRepositoryPort {
  return {
    leaseNext: vi.fn(async () => nextJob),
    markRunning: vi.fn(async () => undefined),
    markDone: vi.fn(async () => undefined),
    markFailure: vi.fn(async () => undefined),
    markBlockedAuth: vi.fn(async () => undefined),
    extendLease: vi.fn(async () => undefined),
  };
}

describe("JobConsumer", () => {
  it("runs a registered handler and completes the job", async () => {
    const repository = repositoryFor(job());
    const handler = vi.fn(async () => undefined);
    const consumer = new JobConsumer(repository, { etl_incr: handler });

    expect(await consumer.processOnce()).toBe(true);
    expect(repository.markRunning).toHaveBeenCalledWith(expect.objectContaining({ id: "job-1" }));
    expect(handler).toHaveBeenCalledTimes(1);
    expect(repository.markDone).toHaveBeenCalledWith(expect.objectContaining({ id: "job-1" }));
  });

  it("marks credential failures blocked_auth without retry", async () => {
    const currentJob = job();
    const repository = repositoryFor(currentJob);
    const consumer = new JobConsumer(repository, {
      etl_incr: async () => {
        throw new BlockedAuthError("expired");
      },
    });

    await consumer.processOnce();

    expect(repository.markBlockedAuth).toHaveBeenCalledWith(currentJob, "expired");
    expect(repository.markFailure).not.toHaveBeenCalled();
  });

  it("schedules ordinary failures with capped exponential backoff", async () => {
    const currentJob = job({ attempts: 2 });
    const repository = repositoryFor(currentJob);
    const now = new Date("2026-08-19T00:00:00.000Z");
    const consumer = new JobConsumer(
      repository,
      { etl_incr: async () => Promise.reject(new Error("boom")) },
      { now: () => now, retryBaseMs: 1_000 },
    );

    await consumer.processOnce();

    const retryAt = vi.mocked(repository.markFailure).mock.calls[0]?.[2];
    expect(retryAt?.toISOString()).toBe("2026-08-19T00:00:02.000Z");
  });

  it("returns false when no job is available", async () => {
    const repository = repositoryFor(null);
    const consumer = new JobConsumer(repository, {});
    expect(await consumer.processOnce()).toBe(false);
  });

  it("stops without retrying after another worker fences out its lease", async () => {
    const currentJob = job();
    const repository = repositoryFor(currentJob);
    vi.mocked(repository.markRunning).mockRejectedValue(new LostJobLeaseError(currentJob.id));
    const handler = vi.fn(async () => undefined);
    const consumer = new JobConsumer(repository, { etl_incr: handler });

    expect(await consumer.processOnce()).toBe(true);
    expect(handler).not.toHaveBeenCalled();
    expect(repository.markFailure).not.toHaveBeenCalled();
    expect(repository.markBlockedAuth).not.toHaveBeenCalled();
  });

  it("keeps a long-running handler leased until it completes", async () => {
    vi.useFakeTimers();
    try {
      const repository = repositoryFor(job());
      let finish: (() => void) | undefined;
      const handler = vi.fn(
        async () =>
          new Promise<void>((resolve) => {
            finish = resolve;
          }),
      );
      const consumer = new JobConsumer(
        repository,
        { etl_incr: handler },
        { leaseSeconds: 60, heartbeatIntervalMs: 10 },
      );

      const processing = consumer.processOnce();
      await vi.advanceTimersByTimeAsync(11);
      expect(repository.extendLease).toHaveBeenCalledWith(expect.objectContaining({ id: "job-1" }), 60);
      finish?.();
      await processing;
      expect(repository.markDone).toHaveBeenCalledWith(expect.objectContaining({ id: "job-1" }));
    } finally {
      vi.useRealTimers();
    }
  });

  it("runs completion bookkeeping only after the job is marked done", async () => {
    const repository = repositoryFor(job());
    const order: string[] = [];
    vi.mocked(repository.markDone).mockImplementation(async () => {
      order.push("done");
    });
    const consumer = new JobConsumer(
      repository,
      { etl_incr: vi.fn().mockResolvedValue(undefined) },
      {
        onCompleted: vi.fn(async () => {
          order.push("bookkeeping");
        }),
      },
    );

    await consumer.processOnce();
    expect(order).toEqual(["done", "bookkeeping"]);
  });
});
