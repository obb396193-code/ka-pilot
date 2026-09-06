import { workspaceSyncTickModeSchema, workspaceSyncTickRequestSchema, workspaceSyncTickResultSchema } from "@ka/domain";
import { z } from "zod";
import type { JobStateEvent } from "../jobs/consumer.js";
import { assertProductionEnvironment } from "../production-environment.js";

export const workerOnceJobTypes = ["etl_full", "etl_incr", "backfill_historical", "backfill_day", "canonical_merge", "data_quality_check"] as const;
const configSchema = z.object({
  workspaceId: z.string().uuid(),
  media: z.string().min(1).max(32).regex(/^[A-Z0-9_]+$/),
  mode: workspaceSyncTickModeSchema.default("auto"),
  databaseUrl: z.string().trim().min(1),
  qihangBaseUrl: z.string().url().refine((value) => {
    try { const url = new URL(value); return url.protocol === "https:" && !url.username && !url.password && !url.search && !url.hash; }
    catch { return false; }
  }),
  maxMs: z.coerce.number().int().positive().max(2_147_483_647).default(600_000),
  leaseSeconds: z.coerce.number().int().positive().max(3600).default(60),
}).strict();
export type WorkerOnceConfig = z.infer<typeof configSchema>;

export function parseWorkerOnceConfig(env: Readonly<NodeJS.ProcessEnv>): WorkerOnceConfig {
  assertProductionEnvironment(env);
  return configSchema.parse({
    workspaceId: env.WORKER_ONCE_WORKSPACE_ID, media: env.WORKER_ONCE_MEDIA, mode: env.WORKER_ONCE_MODE,
    databaseUrl: env.DATABASE_URL, qihangBaseUrl: env.QIHANG_BASE_URL,
    maxMs: env.WORKER_ONCE_MAX_MS, leaseSeconds: env.WORKER_LEASE_SECONDS,
  });
}

export interface WorkerOncePorts {
  tick: { execute(input: unknown): Promise<unknown> };
  prepare(): Promise<void>;
  consumer: { processOnce(): Promise<boolean> };
  onJobState?: (event: JobStateEvent) => void;
}

/** Only the supervisor owns the wall-clock deadline and kills the child when it expires.
 * A Promise.race here would leave live handlers/heartbeats and would not be cancellation.
 */
export async function runWorkerOnceIteration(input: unknown, ports: WorkerOncePorts): Promise<{
  status: "drained" | "empty" | "blocked_auth";
  attemptedJobs: number;
}> {
  const request = workspaceSyncTickRequestSchema.parse(input);
  const result = workspaceSyncTickResultSchema.parse(await ports.tick.execute(request));
  if (result.workspaceId !== request.workspaceId || result.media !== request.media || result.mode !== request.mode || result.jobs.length > 1000) {
    throw new Error("Worker once tick scope mismatch");
  }
  for (const job of result.jobs) {
    try { ports.onJobState?.({ jobId: job.jobId, jobType: job.jobType, status: job.status }); }
    catch { /* Telemetry is not authorization or execution state. */ }
  }
  if (result.jobs.length === 0) return { status: "empty", attemptedJobs: 0 };
  if (result.jobs.some((job) => job.status === "blocked_auth")) return { status: "blocked_auth", attemptedJobs: 0 };
  await ports.prepare();
  let attemptedJobs = 0;
  while (await ports.consumer.processOnce()) attemptedJobs++;
  return { status: "drained", attemptedJobs };
}
