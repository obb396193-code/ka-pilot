import { describe, expect, it } from "vitest";

import {
  scheduledSyncAuthorizationSnapshotSchema,
  workspaceSyncTickRequestSchema,
  workspaceSyncTickResultSchema,
} from "../src/workspace-sync-scheduler.js";

const workspaceId = "11111111-1111-4111-8111-111111111111";
const identityId = "22222222-2222-4222-8222-222222222222";
const userId = "33333333-3333-4333-8333-333333333333";

describe("workspace sync scheduler contract", () => {
  it("accepts only a trusted one-shot tick selector", () => {
    expect(workspaceSyncTickRequestSchema.parse({
      workspaceId,
      media: "KUAISHOU",
      mode: "auto",
      triggeredAt: "2026-08-25T18:59:59.999Z",
    })).toEqual({
      workspaceId,
      media: "KUAISHOU",
      mode: "auto",
      triggeredAt: "2026-08-25T18:59:59.999Z",
    });

    expect(() => workspaceSyncTickRequestSchema.parse({
      workspaceId,
      media: "KUAISHOU",
      mode: "auto",
      triggeredAt: "2026-08-25T18:59:59.999Z",
      userId,
    })).toThrow();
    expect(() => workspaceSyncTickRequestSchema.parse({
      workspaceId,
      media: "kuaishou",
      mode: "daily",
      triggeredAt: "invalid",
    })).toThrow();
  });

  it("freezes a duplicate-free tuple authorization snapshot", () => {
    const input = {
      workspaceId,
      identityId,
      userId,
      role: "optimizer",
      allowedAccounts: [
        { media: "KUAISHOU", accountId: "account-2", accessLevel: "read" },
        { media: "KUAISHOU", accountId: "account-1", accessLevel: "preview" },
      ],
    };
    expect(scheduledSyncAuthorizationSnapshotSchema.parse(input)).toEqual(input);
    expect(() => scheduledSyncAuthorizationSnapshotSchema.parse({
      ...input,
      allowedAccounts: [input.allowedAccounts[0], input.allowedAccounts[0]],
    })).toThrow();
    expect(() => scheduledSyncAuthorizationSnapshotSchema.parse({
      ...input,
      qihangUserId: "must-never-be-persisted",
    })).toThrow();
  });

  it("returns stable queued and blocked_auth outcomes without credentials", () => {
    const result = workspaceSyncTickResultSchema.parse({
      workspaceId,
      media: "KUAISHOU",
      businessDate: "2026-08-25",
      mode: "auto",
      jobs: [
        {
          jobId: "44444444-4444-5444-8444-444444444444",
          userId,
          jobType: "etl_full",
          status: "queued",
          idempotent: false,
        },
        {
          jobId: "55555555-5555-5555-8555-555555555555",
          userId: "66666666-6666-4666-8666-666666666666",
          jobType: "etl_incr",
          status: "blocked_auth",
          reason: "QIHANG_IDENTITY_MISSING",
          idempotent: true,
        },
      ],
    });
    expect(JSON.stringify(result)).not.toContain("qihang");
    expect(result.jobs).toHaveLength(2);
    expect(() => workspaceSyncTickResultSchema.parse({
      ...result,
      qihangUserId: "secret-identity",
    })).toThrow();
  });
});
