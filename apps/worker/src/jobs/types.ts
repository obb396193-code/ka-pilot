import type { JobRecord } from "@ka/db";

export type JobHandler = (job: JobRecord) => Promise<void>;
export type JobHandlers = Record<string, JobHandler>;
