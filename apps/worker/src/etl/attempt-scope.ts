import type { JobRecord } from "@ka/db";
import { z } from "zod";

const claimedJobSchema = z.object({
  id: z.string().uuid(), workspaceId: z.string().uuid(),
  jobType: z.enum(["etl_full", "etl_incr", "backfill_historical", "backfill_day", "canonical_merge", "data_quality_check"]),
  attempts: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  maxAttempts: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  status: z.enum(["leased", "running"]),
});

/** Snapshot the claimed attempt at startRun, not the mutable job at read time.
 * This is evidence, not a replacement for queue lease/fencing authorization.
 * Existing rows without execution remain unverified; never infer attempt=1.
 */
export function withEtlAttempt(job: JobRecord, scope: Record<string, unknown>) {
  const parsed = claimedJobSchema.safeParse(job);
  if (!parsed.success || parsed.data.workspaceId !== scope.workspaceId ||
    parsed.data.attempts > parsed.data.maxAttempts) throw new Error("Invalid ETL attempt context");
  const trusted = parsed.data;
  return {
    ...scope,
    execution: {
      version: "etl-attempt/v1" as const,
      jobId: trusted.id, workspaceId: trusted.workspaceId, jobType: trusted.jobType, attempt: trusted.attempts,
    },
  };
}
