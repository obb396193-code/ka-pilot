import type { BackfillBatch, BackfillProgress, JobEnqueuerPort } from "@ka/db";

export interface BackfillBatchPort {
  get(workspaceId: string, id: number): Promise<BackfillBatch>;
  refreshProgress(workspaceId: string, id: number): Promise<BackfillProgress>;
}

export type BackfillJobPort = JobEnqueuerPort;
