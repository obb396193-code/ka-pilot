import type { JobRecord } from "@ka/db";
import { scheduledSyncAuthorizationSnapshotSchema } from "@ka/domain";

import { BlockedAuthError } from "../qihang/errors.js";
import type { JobHandler } from "./types.js";

export interface QihangCredentialPort {
  resolveQihangUserId(workspaceId: string, userId: string): Promise<string | null>;
  resolveScheduledQihangUserId?(
    workspaceId: string,
    userId: string,
    identityId: string,
  ): Promise<string | null>;
}

interface ScheduledIdentity {
  userId: string;
  identityId: string;
}

function scheduledIdentity(job: JobRecord): ScheduledIdentity | null {
  if (job.payload.authorizationSnapshot === undefined) return null;
  const parsed = scheduledSyncAuthorizationSnapshotSchema.safeParse(
    job.payload.authorizationSnapshot,
  );
  if (!parsed.success || !job.workspaceId || !job.credentialOwnerUserId) {
    throw new BlockedAuthError("Scheduled job authorization snapshot is invalid");
  }
  const snapshot = parsed.data;
  if (
    snapshot.workspaceId !== job.workspaceId ||
    snapshot.userId !== job.credentialOwnerUserId ||
    job.payload.initiatorUserId !== snapshot.userId
  ) {
    throw new BlockedAuthError("Scheduled job authorization identity does not match its owner");
  }
  assertScheduledAccountScope(job, snapshot.allowedAccounts);
  return { userId: snapshot.userId, identityId: snapshot.identityId };
}

function assertScheduledAccountScope(
  job: JobRecord,
  allowedAccounts: ReadonlyArray<{ media: string; accountId: string }>,
): void {
  const media = job.payload.media;
  const accountIds = job.payload.accountIds;
  if (
    typeof media !== "string" ||
    !Array.isArray(accountIds) ||
    !accountIds.every((accountId) => typeof accountId === "string")
  ) {
    throw new BlockedAuthError("Scheduled job account scope is invalid");
  }
  const expected = allowedAccounts
    .filter((account) => account.media === media)
    .map((account) => account.accountId)
    .sort();
  const actual = [...accountIds].sort();
  if (
    expected.length !== actual.length ||
    expected.some((accountId, index) => accountId !== actual[index])
  ) {
    throw new BlockedAuthError("Scheduled job account scope drifted from its frozen authorization");
  }
}

async function resolveJobQihangUserId(
  job: JobRecord,
  credentials: QihangCredentialPort,
  serviceQihangUserId: string | null,
): Promise<string | null> {
  const scheduled = scheduledIdentity(job);
  if (scheduled !== null) {
    if (!credentials.resolveScheduledQihangUserId) return null;
    return credentials.resolveScheduledQihangUserId(
      job.workspaceId!,
      scheduled.userId,
      scheduled.identityId,
    );
  }
  return job.credentialOwnerUserId
    ? credentials.resolveQihangUserId(job.workspaceId!, job.credentialOwnerUserId)
    : serviceQihangUserId;
}

export function withQihangIdentity(
  handler: JobHandler,
  credentials: QihangCredentialPort,
  serviceQihangUserId: string | null,
): JobHandler {
  return async (job: JobRecord): Promise<void> => {
    if (!job.workspaceId) {
      throw new BlockedAuthError("Qihang job is missing workspace ownership");
    }
    const payloadWorkspaceId = job.payload.workspaceId;
    if (payloadWorkspaceId !== undefined && payloadWorkspaceId !== job.workspaceId) {
      throw new BlockedAuthError("Job payload workspace does not match the leased job");
    }

    const userId = await resolveJobQihangUserId(job, credentials, serviceQihangUserId);
    if (!userId) {
      throw new BlockedAuthError(
        job.credentialOwnerUserId
          ? "Credential owner has no usable Qihang identity"
          : "Ownerless job has no configured read-only service identity",
      );
    }

    await handler({
      ...job,
      payload: {
        ...job.payload,
        workspaceId: job.workspaceId,
        userId,
        fetchedByUserId: job.credentialOwnerUserId,
      },
    });
  };
}
