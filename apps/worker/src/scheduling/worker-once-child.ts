import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  BackfillRepository, JobRepository, OutboundMessageRepository,
  WorkspaceSyncRepository, createPool, ensureMetricPartitions,
} from "@ka/db";
import { refreshBackfillJobProgress } from "../backfill/progress.js";
import type { JobStateEvent } from "../jobs/consumer.js";
import { createFailureNotifier } from "../notifications/failure-notifier.js";
import { QihangClient } from "../qihang/client.js";
import { createWorkerConsumer } from "../runtime.js";
import { WorkspaceSyncTickService } from "./workspace-sync-service.js";
import { parseWorkerOnceConfig, runWorkerOnceIteration, workerOnceJobTypes, type WorkerOnceConfig } from "./worker-once.js";

/** No migrations, global recovery, daemon timers, or service-identity fallback here. */
export async function executeWorkerOnceChild(
  config: WorkerOnceConfig, triggeredAt: string,
  dependencies: { qihang?: QihangClient; onJobState?: (event: JobStateEvent, phase: "tick" | "consumer") => void } = {},
) {
  const pool = createPool(config.databaseUrl);
  const leaseScope = { workspaceId: config.workspaceId, jobTypes: workerOnceJobTypes };
  const jobs = new JobRepository(pool, leaseScope);
  const batches = new BackfillRepository(pool);
  const notifyFailure = createFailureNotifier(new OutboundMessageRepository(pool));
  let blocked = false;
  const emit = (event: JobStateEvent, phase: "tick" | "consumer"): void => {
    if (event.status === "blocked_auth") blocked = true;
    dependencies.onJobState?.(event, phase);
  };
  try {
    const result = await runWorkerOnceIteration({
      workspaceId: config.workspaceId, media: config.media, mode: config.mode, triggeredAt,
    }, {
      tick: new WorkspaceSyncTickService(new WorkspaceSyncRepository(pool), jobs),
      onJobState: (event) => emit(event, "tick"),
      prepare: async () => {
        await ensureMetricPartitions(pool);
        const recovered = await jobs.recoverStaleLeases(1);
        for (const job of recovered.failed) {
          await refreshBackfillJobProgress(batches, job);
          await notifyFailure(job, { kind: "failed", message: "Lease expired after maximum attempts" });
        }
      },
      consumer: createWorkerConsumer({
        pool, leaseScope, leaseSeconds: config.leaseSeconds, serviceQihangUserId: null,
        qihang: dependencies.qihang ?? new QihangClient({ baseUrl: config.qihangBaseUrl }),
        onJobState: (event) => emit(event, "consumer"),
      }),
    });
    return blocked ? { ...result, status: "blocked_auth" as const } : result;
  } finally { await pool.end(); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  // An orphan must not keep consuming after the supervisor and its lock disappear.
  const orphaned = (): never => process.exit(1);
  process.once("disconnect", orphaned);
  try {
    if (!process.send || process.argv.length !== 3) throw new Error("Invalid child invocation");
    const result = await executeWorkerOnceChild(parseWorkerOnceConfig(process.env), process.argv[2]!, {
      onJobState: (event, phase) => {
        if (process.connected) process.send?.({ ...event, kind: "job_state", phase }, () => { /* No private error forwarding. */ });
      },
    });
    await new Promise<void>((resolve, reject) => {
      if (!process.connected || !process.send) { reject(new Error("Worker once failed")); return; }
      process.send({ kind: "terminal", status: result.status === "blocked_auth" ? "blocked_auth" : "completed" },
        (error) => error ? reject(new Error("Worker once failed")) : resolve());
    });
  } catch { process.exitCode = 1; }
  finally { process.removeListener("disconnect", orphaned); if (process.connected) process.disconnect(); }
}
