import { describe, expect, it, vi } from "vitest";

import type { NewJob, WorkspaceSyncTickSnapshot } from "@ka/db";
import type { ScheduledJobInitialState } from "@ka/db";

import { WorkspaceSyncTickService } from "../src/scheduling/workspace-sync-service.js";

const workspaceId = "11111111-1111-4111-8111-111111111111";
const identityId = "22222222-2222-4222-8222-222222222222";
const userId = "33333333-3333-4333-8333-333333333333";

function snapshot(overrides: Partial<WorkspaceSyncTickSnapshot["candidates"][number]> = {}): WorkspaceSyncTickSnapshot {
  return {
    workspaceId,
    workspaceActive: true,
    candidates: [{
      workspaceId,
      userId,
      userActive: true,
      identityId,
      identityActive: true,
      membershipActive: true,
      membershipRole: "optimizer",
      hasQihangIdentity: true,
      allowedAccounts: [{ media: "KUAISHOU", accountId: "a-1", accessLevel: "read" }],
      hasSuccessfulFull: false,
      ...overrides,
    }],
  };
}

function setup(value = snapshot()) {
  const persisted: Array<{ job: NewJob; state: ScheduledJobInitialState }> = [];
  const repository = { loadTickSnapshot: vi.fn().mockResolvedValue(value) };
  const jobs = {
    enqueueScheduled: vi.fn(async (job: NewJob, state: ScheduledJobInitialState) => {
      persisted.push({ job, state });
      return { id: job.id!, inserted: persisted.length === 1 };
    }),
  };
  return { service: new WorkspaceSyncTickService(repository, jobs), repository, jobs, persisted };
}

describe("WorkspaceSyncTickService", () => {
  it("queues the first full sync with a frozen authorization snapshot", async () => {
    const { service, persisted, repository } = setup();
    const result = await service.execute({
      workspaceId,
      media: "KUAISHOU",
      mode: "auto",
      triggeredAt: "2026-08-25T18:59:59.999Z",
    });

    expect(result).toMatchObject({
      workspaceId,
      media: "KUAISHOU",
      businessDate: "2026-08-25",
      jobs: [{ userId, jobType: "etl_full", status: "queued", idempotent: false }],
    });
    expect(persisted[0]?.state).toEqual({ status: "queued" });
    expect(persisted[0]?.job).toMatchObject({
      workspaceId,
      jobType: "etl_full",
      credentialOwnerUserId: userId,
      payload: {
        workspaceId,
        media: "KUAISHOU",
        asOfDate: "2026-08-25",
        businessDate: "2026-08-25",
        initiatorUserId: userId,
        accountIds: ["a-1"],
        authorizationSnapshot: {
          workspaceId,
          identityId,
          userId,
          role: "optimizer",
          allowedAccounts: [{ media: "KUAISHOU", accountId: "a-1", accessLevel: "read" }],
        },
      },
    });
    expect(JSON.stringify(persisted)).not.toContain("qihang-private");
    expect(repository.loadTickSnapshot).toHaveBeenCalledWith(workspaceId, "KUAISHOU", {
      dateFrom: "2026-08-24", dateTo: "2026-08-25",
    });
  });

  it("queues incremental sync when its frozen data window is readable", async () => {
    const { service, persisted, repository } = setup(snapshot({
      hasSuccessfulFull: true,
      allowedAccounts: [
        { media: "KUAISHOU", accountId: "a-2", accessLevel: "preview" },
        { media: "KUAISHOU", accountId: "a-1", accessLevel: "read" },
      ],
    }));
    const result = await service.execute({
      workspaceId,
      media: "KUAISHOU",
      mode: "auto",
      triggeredAt: "2026-08-25T19:00:00.000Z",
    });

    expect(result.businessDate).toBe("2026-08-26");
    expect(repository.loadTickSnapshot).toHaveBeenCalledWith(workspaceId, "KUAISHOU", {
      dateFrom: "2026-08-25", dateTo: "2026-08-26",
    });
    expect(result.jobs[0]).toMatchObject({ jobType: "etl_incr", status: "queued" });
    expect(persisted[0]?.job.payload).toMatchObject({
      ds: "2026-08-26",
      accountIds: ["a-1", "a-2"],
      focusAccountIds: [],
      adIds: [],
    });
  });

  it("creates terminal blocked_auth jobs for invalid identities", async () => {
    const inactive = setup(snapshot({ identityActive: false }));

    const first = await inactive.service.execute({
      workspaceId,
      media: "KUAISHOU",
      mode: "auto",
      triggeredAt: "2026-08-25T20:00:00Z",
    });
    expect(first.jobs[0]).toMatchObject({
      status: "blocked_auth",
      reason: "IDENTITY_INACTIVE",
    });
    expect(inactive.persisted[0]?.state).toEqual({
      status: "blocked_auth",
      reason: "IDENTITY_INACTIVE",
    });
  });

  it.each([
    { mode: "auto" as const, hasSuccessfulFull: false, jobType: "etl_full" },
    { mode: "full" as const, hasSuccessfulFull: false, jobType: "etl_full" },
    { mode: "incr" as const, hasSuccessfulFull: true, jobType: "etl_incr" },
  ])("blocks $mode sync when this media has no explicit grant", async ({
    mode,
    hasSuccessfulFull,
    jobType,
  }) => {
    const missingScope = setup(snapshot({ hasSuccessfulFull, allowedAccounts: [] }));
    const result = await missingScope.service.execute({
      workspaceId,
      media: "KUAISHOU",
      mode,
      triggeredAt: "2026-08-25T20:00:00Z",
    });

    expect(result.jobs[0]).toMatchObject({
      jobType,
      status: "blocked_auth",
      reason: "ACCOUNT_SCOPE_MISSING",
    });
    expect(missingScope.persisted[0]?.state).toEqual({
      status: "blocked_auth",
      reason: "ACCOUNT_SCOPE_MISSING",
    });
    expect(missingScope.persisted[0]?.job.payload.authorizationSnapshot).toEqual({
      workspaceId,
      userId,
      status: "blocked_auth",
      reason: "ACCOUNT_SCOPE_MISSING",
    });
    expect(missingScope.persisted[0]?.job.payload).not.toHaveProperty("accountIds");
  });

  it("blocks explicit incremental sync while its expected data window is incomplete", async () => {
    const { service } = setup();
    const result = await service.execute({
      workspaceId,
      media: "KUAISHOU",
      mode: "incr",
      triggeredAt: "2026-08-25T20:00:00Z",
    });
    expect(result.jobs[0]).toMatchObject({
      jobType: "etl_incr",
      status: "blocked_auth",
      reason: "INITIAL_FULL_REQUIRED",
    });
  });

  it("uses the forced full job's default frozen seven-day window", async () => {
    const { service, repository } = setup();
    await service.execute({ workspaceId, media: "KUAISHOU", mode: "full", triggeredAt: "2026-09-01T00:00:00Z" });
    expect(repository.loadTickSnapshot).toHaveBeenCalledWith(workspaceId, "KUAISHOU", {
      dateFrom: "2026-08-26", dateTo: "2026-09-01",
    });
  });

  it("rejects an unknown workspace and never accepts a user selector", async () => {
    const missing = setup({ workspaceId, workspaceActive: null, candidates: [] });
    await expect(missing.service.execute({
      workspaceId,
      media: "KUAISHOU",
      mode: "auto",
      triggeredAt: "2026-08-25T20:00:00Z",
    })).rejects.toThrow("Workspace does not exist");
    await expect(missing.service.execute({
      workspaceId,
      media: "KUAISHOU",
      mode: "auto",
      triggeredAt: "2026-08-25T20:00:00Z",
      userId,
    })).rejects.toThrow();
  });
});
