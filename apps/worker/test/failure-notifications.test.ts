import { describe, expect, it, vi } from "vitest";

import { JobConsumer } from "../src/jobs/consumer.js";
import { BlockedAuthError } from "../src/qihang/errors.js";
import { createFailureNotifier } from "../src/notifications/failure-notifier.js";

function repositoryFor(job: Record<string, unknown>) {
  return {
    leaseNext: vi.fn().mockResolvedValue(job),
    markRunning: vi.fn().mockResolvedValue(undefined),
    markDone: vi.fn().mockResolvedValue(undefined),
    markFailure: vi.fn().mockResolvedValue(undefined),
    markBlockedAuth: vi.fn().mockResolvedValue(undefined),
    extendLease: vi.fn().mockResolvedValue(undefined),
  };
}

const baseJob = {
  id: "33333333-3333-4333-8333-333333333333",
  workspaceId: "11111111-1111-4111-8111-111111111111",
  jobType: "etl_incr",
  payload: {},
  priority: 5,
  credentialOwnerUserId: "22222222-2222-4222-8222-222222222222",
  status: "leased" as const,
  leaseUntil: null,
  attempts: 3,
  maxAttempts: 3,
  runAfter: new Date(),
};

describe("terminal failure notifications", () => {
  it("notifies only the credential owner when authentication is blocked", async () => {
    const outbound = { enqueue: vi.fn().mockResolvedValue(undefined) };
    const repo = repositoryFor(baseJob);
    const consumer = new JobConsumer(
      repo,
      { etl_incr: vi.fn().mockRejectedValue(new BlockedAuthError("expired")) },
      { onTerminalFailure: createFailureNotifier(outbound) },
    );

    await consumer.processOnce();

    expect(outbound.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        target: `user:${baseJob.credentialOwnerUserId}`,
        kind: "job_blocked_auth",
      }),
    );
  });

  it("notifies workspace administrators after ordinary retries are exhausted", async () => {
    const outbound = { enqueue: vi.fn().mockResolvedValue(undefined) };
    const repo = repositoryFor(baseJob);
    const consumer = new JobConsumer(
      repo,
      { etl_incr: vi.fn().mockRejectedValue(new Error("still failing")) },
      { onTerminalFailure: createFailureNotifier(outbound) },
    );

    await consumer.processOnce();

    expect(outbound.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        target: `workspace:${baseJob.workspaceId}:admins`,
        kind: "job_failed",
      }),
    );
  });
});
