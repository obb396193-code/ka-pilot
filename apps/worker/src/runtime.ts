import {
import { r014JobHandlers } from "./r014/handlers.js";
  BackfillRepository,
  AdHourlyMetricsRepository,
  CredentialRepository,
  DataQualityRepository,
  EtlRunRepository,
  JobRepository,
  MetricsRepository,
  OutboundMessageRepository,
  RawMetricsRepository,
  SessionCleanupRepository,
  SESSION_CLEANUP_JOB_TYPE,
  type JobLeaseScope,
  type createPool,
} from "@ka/db";

import { createCanonicalHandler } from "./etl/canonical-handler.js";
import { createBackfillCoordinatorHandler } from "./backfill/coordinator-handler.js";
import { createBackfillDayHandler } from "./backfill/day-handler.js";
import { refreshBackfillJobProgress } from "./backfill/progress.js";
import { createFullEtlHandler } from "./etl/full-handler.js";
import { createIncrementalEtlHandler } from "./etl/incr-handler.js";
import { JobConsumer, type JobStateEvent } from "./jobs/consumer.js";
import { withQihangIdentity } from "./jobs/identity.js";
import { createFailureNotifier } from "./notifications/failure-notifier.js";
import { createDataQualityHandler } from "./quality/check-handler.js";
import { QihangClient } from "./qihang/client.js";
import { createSessionCleanupHandler } from "./auth/session-cleanup-handler.js";

type DatabasePool = ReturnType<typeof createPool>;

export interface WorkerRuntimeOptions {
  pool: DatabasePool;
  qihang: QihangClient;
  leaseSeconds: number;
  serviceQihangUserId: string | null;
  leaseScope?: JobLeaseScope;
  onJobState?: (event: JobStateEvent) => void;
  onNotificationError?: (error: unknown) => void;
}

export function createWorkerConsumer(options: WorkerRuntimeOptions): JobConsumer {
  const jobs = new JobRepository(options.pool, options.leaseScope);
  const credentials = new CredentialRepository(options.pool);
  const etlRuns = new EtlRunRepository(options.pool);
  const rawMetrics = new RawMetricsRepository(options.pool);
  const metrics = new MetricsRepository(options.pool);
  const hourly = new AdHourlyMetricsRepository(options.pool);
  const outbound = new OutboundMessageRepository(options.pool);
  const batches = new BackfillRepository(options.pool);
  const quality = new DataQualityRepository(options.pool);
  const notifyFailure = createFailureNotifier(outbound);

  const etlStore = {
    startRun: etlRuns.startRun.bind(etlRuns),
    appendRaw: rawMetrics.appendRaw.bind(rawMetrics),
    syncAccountMetadataAndRaw: rawMetrics.syncAccountMetadataAndRaw.bind(rawMetrics),
    recordObservation: (runId: number, observation: object) =>
      etlRuns.recordObservation(runId, { ...observation }),
    finishRun: etlRuns.finishRun.bind(etlRuns),
    failRun: etlRuns.failRun.bind(etlRuns),
  };
  const identity = (handler: ReturnType<typeof createFullEtlHandler>) =>
    withQihangIdentity(handler, credentials, options.serviceQihangUserId);

  return new JobConsumer(
    jobs,
    {
      ...r014JobHandlers, // arch 开的缝：be2 在 src/r014/handlers.ts 注册，永不改本文件
      [SESSION_CLEANUP_JOB_TYPE]: createSessionCleanupHandler(new SessionCleanupRepository(options.pool)),
      etl_full: identity(createFullEtlHandler({ qihang: options.qihang, store: etlStore, jobs })),
      etl_incr: identity(
        createIncrementalEtlHandler({ qihang: options.qihang, store: etlStore, jobs, hourly }),
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
          loadEffectiveSettingsBatch: metrics.loadEffectiveSettingsBatch.bind(metrics),
          loadHistoricalSpendBatch: metrics.loadHistoricalSpendBatch.bind(metrics),
          upsertCanonicalBatch: metrics.upsertCanonicalBatch.bind(metrics),
        },
        runs: etlRuns,
        jobs,
      }),
      data_quality_check: createDataQualityHandler({
        quality,
        runs: etlRuns,
        outbound,
      }),
    },
    {
      leaseSeconds: options.leaseSeconds,
      ...(options.onJobState === undefined ? {} : { onJobState: options.onJobState }),
      onTerminalFailure: async (job, failure) => {
        await refreshBackfillJobProgress(batches, job);
        await notifyFailure(job, failure);
      },
      onCompleted: async (job) => {
        await refreshBackfillJobProgress(batches, job);
      },
      ...(options.onNotificationError === undefined
        ? {}
        : { onNotificationError: options.onNotificationError }),
    },
  );
}
