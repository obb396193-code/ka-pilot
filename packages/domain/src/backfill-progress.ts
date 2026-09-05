export type BackfillStatus = "running" | "raw_done" | "canonical_done" | "done" | "failed";
export type BackfillStage = "raw" | "canonical" | "quality";

export interface BackfillJobEvidence {
  jobType: string;
  status: string;
  dateFrom: string | null;
  dateTo: string | null;
}

export interface BackfillProgress {
  cursorDate: string | null;
  status: BackfillStatus;
  failedStage: BackfillStage | null;
  terminalDays: number;
  failedDays: number;
  totalDays: number;
}

/** Derive batch state from persisted jobs, never from raw row counts alone. */
export function computeBackfillProgress(
  dates: readonly string[], jobs: readonly BackfillJobEvidence[],
): BackfillProgress {
  if (dates.length === 0) throw new Error("Backfill requires at least one date");
  const terminal = new Set(["done", "failed", "blocked_auth"]);
  const failed = new Set(["failed", "blocked_auth"]);
  const covers = (job: BackfillJobEvidence, ds: string): boolean =>
    job.dateFrom !== null && job.dateTo !== null && job.dateFrom <= ds && ds <= job.dateTo;
  const raw = jobs.filter((job) => job.jobType === "backfill_day");
  const dateTerminal = (ds: string): boolean => {
    const matching = raw.filter((job) => covers(job, ds));
    return matching.length > 0 && matching.every((job) => terminal.has(job.status));
  };
  let cursorDate: string | null = null;
  for (const ds of dates) {
    if (!dateTerminal(ds)) break;
    cursorDate = ds;
  }
  const stages = [
    ["raw", "backfill_day"], ["canonical", "canonical_merge"], ["quality", "data_quality_check"],
  ] as const;
  const failedStage = stages.find(([stage, jobType]) => jobs.some((job) =>
    failed.has(job.status) && (
      (job.jobType === jobType && dates.some((ds) => covers(job, ds))) ||
      (stage === "raw" && job.jobType === "backfill_historical")
    )))?.[0] ?? null;
  let status: BackfillStatus = "running";
  const completedStates = ["raw_done", "canonical_done", "done"] as const;
  for (const [index, [, jobType]] of stages.entries()) {
    const stageJobs = jobs.filter((job) => job.jobType === jobType);
    if (!dates.every((ds) => {
      const matching = stageJobs.filter((job) => covers(job, ds));
      return matching.length > 0 && matching.every((job) => job.status === "done");
    })) break;
    status = completedStates[index]!;
  }
  return {
    cursorDate, status: failedStage === null ? status : "failed", failedStage,
    terminalDays: dates.filter(dateTerminal).length,
    failedDays: dates.filter((ds) => jobs.some((job) =>
      stages.some(([, jobType]) => jobType === job.jobType) && failed.has(job.status) && covers(job, ds),
    )).length,
    totalDays: dates.length,
  };
}
