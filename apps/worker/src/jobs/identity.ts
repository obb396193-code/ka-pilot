import type { JobRecord } from "@ka/db";

import { BlockedAuthError } from "../qihang/errors.js";
import type { JobHandler } from "./types.js";

export interface QihangCredentialPort {
  resolveQihangUserId(workspaceId: string, userId: string): Promise<string | null>;
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

    const userId = job.credentialOwnerUserId
      ? await credentials.resolveQihangUserId(job.workspaceId, job.credentialOwnerUserId)
      : serviceQihangUserId;
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
