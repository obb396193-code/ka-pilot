import type {
  NewJob,
  ScheduledJobEnqueueResult,
  ScheduledJobInitialState,
  WorkspaceSyncCandidate,
  WorkspaceSyncTickSnapshot,
} from "@ka/db";
import {
  candidateBlockedReason,
} from "@ka/db";
import {
  approvedScheduledSyncPayload,
  scheduledSyncAuthorizationSnapshotSchema,
  shanghaiTaskBusinessDate,
  workspaceSyncTickRequestSchema,
  workspaceSyncTickResultSchema,
  type WorkspaceSyncBlockedReason,
  type WorkspaceSyncJobType,
  type WorkspaceSyncTickResult,
  type ScheduledSyncAuthorizationSnapshot,
} from "@ka/domain";

import { deterministicJobId } from "../jobs/deterministic-id.js";
import { JOB_PRIORITY } from "../jobs/priorities.js";
import { shiftIsoDate } from "../etl/date-range.js";

export interface WorkspaceSyncSnapshotPort {
  loadTickSnapshot(workspaceId: string, media: string,
    window: { dateFrom: string; dateTo: string }): Promise<WorkspaceSyncTickSnapshot>;
}

export interface WorkspaceSyncJobPort {
  recoverQihangIdentityBlocked?(snapshot: ScheduledSyncAuthorizationSnapshot, media: string): Promise<string[]>;
  enqueueScheduled(
    job: NewJob,
    initialState: ScheduledJobInitialState,
  ): Promise<ScheduledJobEnqueueResult>;
}

interface PlannedJob {
  jobType: WorkspaceSyncJobType;
  reason: WorkspaceSyncBlockedReason | null;
}

function planJob(
  snapshot: WorkspaceSyncTickSnapshot,
  candidate: WorkspaceSyncCandidate,
  mode: "auto" | "full" | "incr",
  media: string,
): PlannedJob {
  const jobType = mode === "full"
    ? "etl_full"
    : mode === "incr"
      ? "etl_incr"
      : candidate.hasSuccessfulFull
        ? "etl_incr"
        : "etl_full";
  const authReason = candidateBlockedReason(snapshot, candidate);
  if (authReason !== null) return { jobType, reason: authReason };
  const mediaAccounts = candidate.allowedAccounts.filter((account) => account.media === media);
  if (mediaAccounts.length === 0) {
    return { jobType, reason: "ACCOUNT_SCOPE_MISSING" };
  }
  if (jobType === "etl_incr" && !candidate.hasSuccessfulFull) {
    return { jobType, reason: "INITIAL_FULL_REQUIRED" };
  }
  return { jobType, reason: null };
}

function jobPayload(
  candidate: WorkspaceSyncCandidate,
  jobType: WorkspaceSyncJobType,
  reason: WorkspaceSyncBlockedReason | null,
  media: string,
  businessDate: string,
): Record<string, unknown> {
  if (reason !== null) {
    return {
      workspaceId: candidate.workspaceId,
      media,
      businessDate,
      initiatorUserId: candidate.userId,
      authorizationSnapshot: {
        workspaceId: candidate.workspaceId,
        userId: candidate.userId,
        status: "blocked_auth",
        reason,
      },
    };
  }
  if (
    candidate.identityId === null ||
    candidate.membershipRole === null
  ) {
    throw new Error("Approved candidate is missing an identity chain");
  }
  const allowedAccounts = candidate.allowedAccounts
    .filter((account) => account.media === media)
    .sort((left, right) => left.accountId.localeCompare(right.accountId));
  const authorizationSnapshot = scheduledSyncAuthorizationSnapshotSchema.parse({
    workspaceId: candidate.workspaceId,
    identityId: candidate.identityId,
    userId: candidate.userId,
    role: candidate.membershipRole,
    allowedAccounts,
  });
  return approvedScheduledSyncPayload(authorizationSnapshot, jobType, media, businessDate);
}

function scheduledJob(
  candidate: WorkspaceSyncCandidate,
  jobType: WorkspaceSyncJobType,
  media: string,
  businessDate: string,
  payload: Record<string, unknown>,
): NewJob {
  return {
    id: deterministicJobId(
      `workspace-sync:${candidate.workspaceId}:${candidate.userId}:${media}:${businessDate}:${jobType}`,
    ),
    workspaceId: candidate.workspaceId,
    jobType,
    payload,
    priority: jobType === "etl_incr" ? JOB_PRIORITY.ETL_INCREMENTAL : JOB_PRIORITY.DEFAULT,
    credentialOwnerUserId: candidate.userId,
    maxAttempts: 3,
  };
}

export class WorkspaceSyncTickService {
  constructor(
    private readonly repository: WorkspaceSyncSnapshotPort,
    private readonly jobs: WorkspaceSyncJobPort,
  ) {}

  async execute(input: unknown): Promise<WorkspaceSyncTickResult> {
    const request = workspaceSyncTickRequestSchema.parse(input);
    const businessDate = shanghaiTaskBusinessDate(new Date(request.triggeredAt));
    // auto tests the prospective incr window (D-1..D); if incomplete it selects full.
    // Forced full uses its existing default seven-day window. No wall-clock dates in DB.
    const snapshot = await this.repository.loadTickSnapshot(request.workspaceId, request.media, {
      dateFrom: shiftIsoDate(businessDate, request.mode === "full" ? -6 : -1), dateTo: businessDate,
    });
    if (snapshot.workspaceActive === null) throw new Error("Workspace does not exist");
    const jobs = [];
    for (const candidate of snapshot.candidates) {
      const plan = planJob(snapshot, candidate, request.mode, request.media);
      const payload = jobPayload(
        candidate,
        plan.jobType,
        plan.reason,
        request.media,
        businessDate,
      );
      const job = scheduledJob(candidate, plan.jobType, request.media, businessDate, payload);
      const recoveredIds = plan.reason === null
        ? await this.jobs.recoverQihangIdentityBlocked?.(
          scheduledSyncAuthorizationSnapshotSchema.parse(payload.authorizationSnapshot), request.media,
        ) ?? [] : [];
      const initialState: ScheduledJobInitialState = plan.reason === null
        ? { status: "queued" }
        : { status: "blocked_auth", reason: plan.reason };
      // A recovered same-day job keeps its original approved scope. Do not try
      // to replace it with a wider fresh snapshot through ordinary enqueue.
      const saved = recoveredIds.includes(job.id!) ? { id: job.id!, inserted: false }
        : await this.jobs.enqueueScheduled(job, initialState);
      jobs.push(plan.reason === null
        ? {
            jobId: saved.id,
            userId: candidate.userId,
            jobType: plan.jobType,
            status: "queued" as const,
            idempotent: !saved.inserted,
          }
        : {
            jobId: saved.id,
            userId: candidate.userId,
            jobType: plan.jobType,
            status: "blocked_auth" as const,
            reason: plan.reason,
            idempotent: !saved.inserted,
          });
    }
    return workspaceSyncTickResultSchema.parse({
      workspaceId: request.workspaceId,
      media: request.media,
      businessDate,
      mode: request.mode,
      jobs,
    });
  }
}
