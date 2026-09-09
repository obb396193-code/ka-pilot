import { z } from "zod";

import {
  approvedAccountAccessSchema,
  authRoleSchema,
} from "./auth-context.js";
import { taskListCalendarDateSchema } from "./task-list-contract.js";

const mediaSchema = z.string().min(1).max(32).regex(/^[A-Z0-9_]+$/);

export const workspaceSyncTickModeSchema = z.enum(["auto", "full", "incr"]);
export const workspaceSyncJobTypeSchema = z.enum(["etl_full", "etl_incr"]);

export const workspaceSyncTickRequestSchema = z
  .object({
    workspaceId: z.string().uuid(),
    media: mediaSchema,
    mode: workspaceSyncTickModeSchema,
    triggeredAt: z.string().datetime({ offset: true }),
  })
  .strict();

export const scheduledSyncAuthorizationSnapshotSchema = z
  .object({
    workspaceId: z.string().uuid(),
    identityId: z.string().uuid(),
    userId: z.string().uuid(),
    role: authRoleSchema,
    allowedAccounts: z.array(approvedAccountAccessSchema).max(1_000),
  })
  .strict()
  .superRefine((snapshot, context) => {
    const tuples = new Set<string>();
    for (const account of snapshot.allowedAccounts) {
      const tuple = `${account.media}\u0000${account.accountId}`;
      if (tuples.has(tuple)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "allowedAccounts contain a duplicate tuple",
          path: ["allowedAccounts"],
        });
        return;
      }
      tuples.add(tuple);
    }
  });

export const workspaceSyncBlockedReasonSchema = z.enum([
  "WORKSPACE_INACTIVE",
  "IDENTITY_MISSING",
  "IDENTITY_INACTIVE",
  "MEMBERSHIP_MISSING",
  "MEMBERSHIP_INACTIVE",
  "USER_INACTIVE",
  "QIHANG_IDENTITY_MISSING",
  "ACCOUNT_SCOPE_MISSING",
  "INITIAL_FULL_REQUIRED",
  "AUTH_SNAPSHOT_CONFLICT",
]);

export const blockedSyncAuthorizationSnapshotSchema = z
  .object({
    workspaceId: z.string().uuid(),
    userId: z.string().uuid(),
    status: z.literal("blocked_auth"),
    reason: workspaceSyncBlockedReasonSchema,
  })
  .strict();

export const workspaceSyncAuthorizationSnapshotSchema = z.union([
  scheduledSyncAuthorizationSnapshotSchema,
  blockedSyncAuthorizationSnapshotSchema,
]);

const scheduledJobBaseSchema = z
  .object({
    jobId: z.string().uuid(),
    userId: z.string().uuid(),
    jobType: workspaceSyncJobTypeSchema,
    idempotent: z.boolean(),
  })
  .strict();

export const workspaceSyncScheduledJobSchema = z.discriminatedUnion("status", [
  scheduledJobBaseSchema.extend({
    status: z.literal("queued"),
  }),
  scheduledJobBaseSchema.extend({
    status: z.literal("blocked_auth"),
    reason: workspaceSyncBlockedReasonSchema,
  }),
]);

export const workspaceSyncTickResultSchema = z
  .object({
    workspaceId: z.string().uuid(),
    media: mediaSchema,
    businessDate: taskListCalendarDateSchema,
    mode: workspaceSyncTickModeSchema,
    jobs: z.array(workspaceSyncScheduledJobSchema),
  })
  .strict();

export type WorkspaceSyncTickMode = z.infer<typeof workspaceSyncTickModeSchema>;
export type WorkspaceSyncJobType = z.infer<typeof workspaceSyncJobTypeSchema>;
export type WorkspaceSyncTickRequest = z.infer<typeof workspaceSyncTickRequestSchema>;
export type ScheduledSyncAuthorizationSnapshot = z.infer<
  typeof scheduledSyncAuthorizationSnapshotSchema
>;
export type BlockedSyncAuthorizationSnapshot = z.infer<
  typeof blockedSyncAuthorizationSnapshotSchema
>;
export type WorkspaceSyncBlockedReason = z.infer<typeof workspaceSyncBlockedReasonSchema>;
export type WorkspaceSyncScheduledJob = z.infer<typeof workspaceSyncScheduledJobSchema>;
export type WorkspaceSyncTickResult = z.infer<typeof workspaceSyncTickResultSchema>;

export const scheduledQihangRecoveryRequestSchema = z.object({
  snapshot: scheduledSyncAuthorizationSnapshotSchema, media: mediaSchema,
}).strict();

/** Shared scheduler/recovery payload: contains authorization facts, never credentials. */
export function approvedScheduledSyncPayload(
  value: ScheduledSyncAuthorizationSnapshot, jobType: WorkspaceSyncJobType,
  media: string, businessDate: string,
): Record<string, unknown> {
  const snapshot = scheduledSyncAuthorizationSnapshotSchema.parse(value);
  workspaceSyncJobTypeSchema.parse(jobType); mediaSchema.parse(media); taskListCalendarDateSchema.parse(businessDate);
  if (snapshot.allowedAccounts.length === 0 || snapshot.allowedAccounts.some(a => a.media !== media)) throw new Error("Scheduled sync scope is invalid");
  const common = { workspaceId: snapshot.workspaceId, media, businessDate, initiatorUserId: snapshot.userId,
    authorizationSnapshot: snapshot, accountIds: snapshot.allowedAccounts.map(a => a.accountId) };
  return jobType === "etl_full" ? { ...common, asOfDate: businessDate }
    : { ...common, ds: businessDate, offlineReconcileDays: 1, focusAccountIds: [], adIds: [] };
}
