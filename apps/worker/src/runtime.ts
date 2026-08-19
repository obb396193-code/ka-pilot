import {
  BackfillRepository,
  CredentialRepository,
  EtlRunRepository,
  JobRepository,
  MetricsRepository,
  OutboundMessageRepository,
  RawMetricsRepository,
  type createPool,
} from "@ka/db";

import { createCanonicalHandler } from "./etl/canonical-handler.js";
import { createBackfillCoordinatorHandler } from "./backfill/coordinator-handler.js";
import { createBackfillDayHandler } from "./backfill/day-handler.js";
import { createFullEtlHandler } from "./etl/full-handler.js";
import { createIncrementalEtlHandler } from "./etl/incr-handler.js";
import { JobConsumer } from "./jobs/consumer.js";
import { withQihangIdentity } from "./jobs/identity.js";
import { createFailureNotifier } from "./notifications/failure-notifier.js";
import { QihangClient } from "./qihang/client.js";

type DatabasePool = ReturnType<typeof createPool>;

export interface WorkerRuntimeOptions {
  pool: DatabasePool;
  qihang: QihangClient;
  leaseSeconds: number;
  serviceQihangUserId: string | null;
  onNotificationError?: (error: unknown) => void;
}

export function createWorkerConsumer(options: WorkerRuntimeOptions): JobConsumer {
  const jobs = new JobRepository(options.pool);
  const credentials = new CredentialRepository(options.pool);
  const etlRuns = new EtlRunRepository(options.pool);
  const rawMetrics = new RawMetricsRepository(options.pool);
  const metrics = new MetricsRepository(options.pool);
  const outbound = new OutboundMessageRepository(options.pool);
  const batches = new BackfillRepository(options.pool);
  const notifyFailure = createFailureNotifier(outbound);

  const etlStore = {
    startRun: etlRuns.startRun.bind(etlRuns),
    appendRaw: rawMetrics.appendRaw.bind(rawMetrics),
    finishRun: etlRuns.finishRun.bind(etlRuns),
    failRun: etlRuns.failRun.bind(etlRuns),
  };
  const identity = (handler: ReturnType<typeof createFullEtlHandler>) =>
    withQihangIdentity(handler, credentials, options.serviceQihangUserId);

  return new JobConsumer(
    jobs,
    {
      etl_full: identity(createFullEtlHandler({ qihang: options.qihang, store: etlStore })),
      etl_incr: identity(
        createIncrementalEtlHandler({ qihang: options.qihang, store: etlStore }),
      ),
      backfill_historical: identity(
        createBackfillCoordinatorHandler({
          qihang: options.qihang,
          batches,
          jobs,
          store: etlStore,
        }),
      ),
      backfill_day: identity(
        createBackfillDayHandler({ qihang: options.qihang, store: etlStore, jobs }),
      ),
      canonical_merge: createCanonicalHandler({
        store: {
          loadMergeInputs: rawMetrics.loadMergeInputs.bind(rawMetrics),
          loadEffectiveSettings: metrics.loadEffectiveSettings.bind(metrics),
          loadHistoricalSpend: metrics.loadHistoricalSpend.bind(metrics),
          upsertCanonical: metrics.upsertCanonical.bind(metrics),
        },
        runs: etlRuns,
        jobs,
      }),
    },
    {
      leaseSeconds: options.leaseSeconds,
      onTerminalFailure: async (job, failure) => {
        await notifyFailure(job, failure);
        const backfillId = job.payload.backfillId;
        if (job.jobType === "backfill_day" && typeof backfillId === "number" && job.workspaceId) {
          await batches.refreshProgress(job.workspaceId, backfillId);
        }
      },
      onCompleted: async (job) => {
        const backfillId = job.payload.backfillId;
        if (job.jobType === "backfill_day" && typeof backfillId === "number" && job.workspaceId) {
          await batches.refreshProgress(job.workspaceId, backfillId);
        }
      },
      ...(options.onNotificationError === undefined
        ? {}
        : { onNotificationError: options.onNotificationError }),
    },
  );
}
