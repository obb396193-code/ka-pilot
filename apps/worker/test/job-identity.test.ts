import { describe, expect, it, vi } from "vitest";

import { withQihangIdentity } from "../src/jobs/identity.js";
import { BlockedAuthError } from "../src/qihang/errors.js";

const workspaceId = "11111111-1111-4111-8111-111111111111";
const ownerUserId = "22222222-2222-4222-8222-222222222222";

function job(owner: string | null = ownerUserId) {
  return {
    id: "33333333-3333-4333-8333-333333333333",
    workspaceId,
    jobType: "etl_incr",
    payload: { workspaceId, ds: "2026-08-19", userId: "untrusted-input" },
    priority: 5,
    credentialOwnerUserId: owner,
    status: "leased" as const,
    leaseUntil: null,
    leaseToken: "44444444-4444-4444-8444-444444444444",
    attempts: 2,
    maxAttempts: 3,
    runAfter: new Date(),
  };
}

function scheduledJob() {
  return {
    ...job(),
    payload: {
      workspaceId,
      media: "KUAISHOU",
      ds: "2026-08-19",
      businessDate: "2026-08-19",
      initiatorUserId: ownerUserId,
      accountIds: ["account-1"],
      authorizationSnapshot: {
        workspaceId,
        identityId: "55555555-5555-4555-8555-555555555555",
        userId: ownerUserId,
        role: "optimizer",
        allowedAccounts: [{
          media: "KUAISHOU",
          accountId: "account-1",
          accessLevel: "read",
        }],
      },
    },
  };
}

describe("withQihangIdentity", () => {
  it("replaces payload identity with the immutable credential owner mapping", async () => {
    const handler = vi.fn().mockResolvedValue(undefined);
    const credentials = {
      resolveQihangUserId: vi.fn().mockResolvedValue("qihang-owner"),
    };
    const wrapped = withQihangIdentity(handler, credentials, null);

    await wrapped(job());

    expect(credentials.resolveQihangUserId).toHaveBeenCalledWith(workspaceId, ownerUserId);
    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({
        credentialOwnerUserId: ownerUserId,
        payload: expect.objectContaining({
          workspaceId,
          userId: "qihang-owner",
          fetchedByUserId: ownerUserId,
        }),
      }),
    );
  });

  it("uses the configured read-only service identity only for ownerless jobs", async () => {
    const handler = vi.fn().mockResolvedValue(undefined);
    const credentials = { resolveQihangUserId: vi.fn() };
    const wrapped = withQihangIdentity(handler, credentials, "qihang-service");

    await wrapped(job(null));

    expect(credentials.resolveQihangUserId).not.toHaveBeenCalled();
    expect(handler.mock.calls[0]?.[0].payload).toMatchObject({
      userId: "qihang-service",
      fetchedByUserId: null,
    });
  });

  it("blocks without retry when the frozen owner has no usable credential", async () => {
    const wrapped = withQihangIdentity(
      vi.fn(),
      { resolveQihangUserId: vi.fn().mockResolvedValue(null) },
      null,
    );

    await expect(wrapped(job())).rejects.toBeInstanceOf(BlockedAuthError);
  });

  it("revalidates a scheduled identity chain without using the service fallback", async () => {
    const handler = vi.fn().mockResolvedValue(undefined);
    const credentials = {
      resolveQihangUserId: vi.fn(),
      resolveScheduledQihangUserId: vi.fn().mockResolvedValue("qihang-owner"),
    };
    const wrapped = withQihangIdentity(handler, credentials, "qihang-service");

    await wrapped(scheduledJob());

    expect(credentials.resolveScheduledQihangUserId).toHaveBeenCalledWith(
      workspaceId,
      ownerUserId,
      "55555555-5555-4555-8555-555555555555",
    );
    expect(credentials.resolveQihangUserId).not.toHaveBeenCalled();
    expect(handler.mock.calls[0]?.[0].payload.userId).toBe("qihang-owner");
  });

  it("fails closed when a retry cannot revalidate its original owner", async () => {
    const credentials = {
      resolveQihangUserId: vi.fn(),
      resolveScheduledQihangUserId: vi.fn().mockResolvedValue(null),
    };
    const wrapped = withQihangIdentity(vi.fn(), credentials, "qihang-service");

    await expect(wrapped(scheduledJob())).rejects.toBeInstanceOf(BlockedAuthError);
    expect(credentials.resolveScheduledQihangUserId).toHaveBeenCalledWith(
      workspaceId,
      ownerUserId,
      "55555555-5555-4555-8555-555555555555",
    );
  });

  it("rejects payload owner and account scope drift before resolving credentials", async () => {
    const credentials = {
      resolveQihangUserId: vi.fn(),
      resolveScheduledQihangUserId: vi.fn(),
    };
    const wrapped = withQihangIdentity(vi.fn(), credentials, null);
    const changedOwner = scheduledJob();
    changedOwner.payload.initiatorUserId = "66666666-6666-4666-8666-666666666666";
    const changedScope = scheduledJob();
    changedScope.payload.accountIds = ["account-2"];

    await expect(wrapped(changedOwner)).rejects.toBeInstanceOf(BlockedAuthError);
    await expect(wrapped(changedScope)).rejects.toBeInstanceOf(BlockedAuthError);
    expect(credentials.resolveScheduledQihangUserId).not.toHaveBeenCalled();
  });
});
