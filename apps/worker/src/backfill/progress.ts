import type { JobRecord } from "@ka/db";
import type { BackfillBatchPort } from "./types.js";

const BACKFILL_JOB_TYPES = new Set([
  "backfill_historical", "backfill_day", "canonical_merge", "data_quality_check",
]);

export async function refreshBackfillJobProgress(
  batches: Pick<BackfillBatchPort, "refreshProgress">,
  job: Pick<JobRecord, "jobType" | "workspaceId" | "payload">,
): Promise<void> {
  const id = job.payload.backfillId;
  if (BACKFILL_JOB_TYPES.has(job.jobType) && job.workspaceId &&
      typeof id === "number" && Number.isSafeInteger(id) && id > 0) {
    await batches.refreshProgress(job.workspaceId, id);
  }
}
