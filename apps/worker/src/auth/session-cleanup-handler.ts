import { LostJobLeaseError, SESSION_CLEANUP_JOB_TYPE, SessionCleanupError } from "@ka/db";
import type { JobHandler } from "../jobs/types.js";

export function createSessionCleanupHandler(repository: {
  cleanupBatch(input: unknown): Promise<{ deletedCount: number }>;
}): JobHandler {
  return async (job) => {
    if (job.jobType !== SESSION_CLEANUP_JOB_TYPE || !job.workspaceId || !job.leaseToken ||
      job.credentialOwnerUserId !== null || !job.payload || typeof job.payload !== "object" || Array.isArray(job.payload) ||
      Object.keys(job.payload).length !== 0) throw new SessionCleanupError();
    try { await repository.cleanupBatch({ id: job.id, workspaceId: job.workspaceId, leaseToken: job.leaseToken }); }
    catch (error) { throw error instanceof LostJobLeaseError ? error : new SessionCleanupError(); }
  };
}
