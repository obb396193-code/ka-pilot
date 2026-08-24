import type { JobEnqueuerPort } from "@ka/db";

import { deterministicJobId } from "../jobs/deterministic-id.js";
import type { JobHandler } from "../jobs/types.js";
import type { QihangQuery } from "../qihang/client.js";
import { shiftIsoDate, trailingDates } from "./date-range.js";
import { fullEtlPayloadSchema } from "./payload.js";
import { rowsToRawRecords } from "./raw-ingest.js";
import { replayRequestParams } from "./replay-params.js";
import { toEtlQueryObservation } from "./query-observation.js";
import { errorSummary } from "./run-utils.js";
import type { EtlRunStore, QihangQueryPort } from "./types.js";

export interface FullEtlDependencies {
  qihang: QihangQueryPort;
  store: EtlRunStore;
  jobs: JobEnqueuerPort;
}

type FullEtlPayload = ReturnType<typeof fullEtlPayloadSchema.parse>;

interface FullEtlProgress {
  currentStep: string;
  rowsIngested: number;
}

interface FullJobIdentity {
  id: string;
  priority: number;
  credentialOwnerUserId: string | null;
}

const OFFLINE_PARTITION_LOOKBACK_DAYS = 3;

export function createFullEtlHandler(dependencies: FullEtlDependencies): JobHandler {
  return async (job) => {
    const payload = fullEtlPayloadSchema.parse(job.payload);
    const runId = await dependencies.store.startRun(job.id, "full", {
      workspaceId: payload.workspaceId,
      asOfDate: payload.asOfDate,
      realtimeDays: payload.realtimeDays,
      requestedAccountIds: payload.accountIds,
      resources: ["account", "account_offline", "account_realtime"],
    });
    const progress: FullEtlProgress = { currentStep: "start", rowsIngested: 0 };

    try {
      const accountIds = await discoverAccountIds(dependencies, payload, progress, runId);
      const offlineDate = await ingestAccountMetrics(
        dependencies,
        payload,
        accountIds,
        progress,
        runId,
      );
      await enqueueCanonical(dependencies, payload, job, progress, offlineDate);
      await dependencies.store.finishRun(runId, progress.rowsIngested);
    } catch (error) {
      await dependencies.store.failRun(runId, progress.currentStep, errorSummary(error));
      throw error;
    }
  };
}

async function discoverAccountIds(
  dependencies: FullEtlDependencies,
  payload: FullEtlPayload,
  progress: FullEtlProgress,
  runId: number,
): Promise<string[]> {
  const discovered = new Set(payload.accountIds);
  let pageNum = 1;
  let fetchedAccounts = 0;
  for (;;) {
    progress.currentStep = `account_page_${pageNum}`;
    const query = accountQuery(payload, pageNum);
    const result = await dependencies.qihang.query(query);
    await recordObservation(dependencies.store, runId, query, result.observation);
    const records = await persistRows(dependencies, payload, query, payload.asOfDate, result.rows);
    progress.rowsIngested += records.length;
    fetchedAccounts += records.length;
    records.forEach((row) => discovered.add(row.accountId));
    if (records.length === 0) break;
    const total = result.pagination?.totalNum;
    if (total === null || total === undefined) {
      throw new Error("Qihang account pagination total is missing");
    }
    if (fetchedAccounts >= total) break;
    pageNum += 1;
    if (pageNum > 10_000) throw new Error("Qihang account pagination exceeded safety limit");
  }
  return [...discovered];
}

function accountQuery(payload: FullEtlPayload, pageNum: number): QihangQuery {
  return {
    resource: "account",
    userId: payload.userId,
    media: payload.media,
    pageNum,
    pageSize: payload.pageSize,
    ...(payload.keyword === undefined ? {} : { keyword: payload.keyword }),
    ...(payload.bizName === undefined ? {} : { bizName: payload.bizName }),
  };
}

async function ingestAccountMetrics(
  dependencies: FullEtlDependencies,
  payload: FullEtlPayload,
  accountIds: string[],
  progress: FullEtlProgress,
  runId: number,
): Promise<string | null> {
  const offlineDate = await ingestLatestAvailableOffline(
    dependencies,
    payload,
    accountIds,
    progress,
    runId,
  );
  for (const ds of trailingDates(payload.asOfDate, payload.realtimeDays)) {
    progress.currentStep = `account_realtime_${ds}`;
    progress.rowsIngested += await ingestQuery(dependencies, payload, runId, {
      resource: "account_realtime",
      userId: payload.userId,
      media: payload.media,
      accountIds,
      ds,
    }, ds);
  }
  return offlineDate;
}

async function ingestLatestAvailableOffline(
  dependencies: FullEtlDependencies,
  payload: FullEtlPayload,
  accountIds: string[],
  progress: FullEtlProgress,
  runId: number,
): Promise<string | null> {
  for (let offset = 1; offset <= OFFLINE_PARTITION_LOOKBACK_DAYS; offset += 1) {
    const ds = shiftIsoDate(payload.asOfDate, -offset);
    progress.currentStep = `account_offline_${ds}`;
    const count = await ingestQuery(dependencies, payload, runId, {
      resource: "account_offline",
      userId: payload.userId,
      media: payload.media,
      accountIds,
      beginDate: ds,
      endDate: ds,
    }, ds);
    progress.rowsIngested += count;
    if (count > 0) return ds;
  }
  return null;
}

async function ingestQuery(
  dependencies: FullEtlDependencies,
  payload: FullEtlPayload,
  runId: number,
  query: QihangQuery,
  fallbackDs: string,
): Promise<number> {
  const result = await dependencies.qihang.query(query);
  await recordObservation(dependencies.store, runId, query, result.observation);
  return (await persistRows(dependencies, payload, query, fallbackDs, result.rows)).length;
}

async function recordObservation(
  store: EtlRunStore,
  runId: number,
  query: QihangQuery,
  observation: Awaited<ReturnType<QihangQueryPort["query"]>>["observation"],
): Promise<void> {
  if (observation !== undefined) {
    await store.recordObservation(runId, toEtlQueryObservation(query, observation));
  }
}

async function persistRows(
  dependencies: FullEtlDependencies,
  payload: FullEtlPayload,
  query: QihangQuery,
  fallbackDs: string,
  rows: Record<string, unknown>[],
) {
  const records = rowsToRawRecords({
    rows,
    workspaceId: payload.workspaceId,
    media: query.media ?? payload.media,
    resource: query.resource,
    requestParams: replayRequestParams(query),
    fallbackDs,
    fetchedByUserId: payload.fetchedByUserId,
  });
  await dependencies.store.appendRaw(records);
  return records;
}

async function enqueueCanonical(
  dependencies: FullEtlDependencies,
  payload: FullEtlPayload,
  job: FullJobIdentity,
  progress: FullEtlProgress,
  offlineDate: string | null,
): Promise<void> {
  progress.currentStep = "enqueue:canonical";
  const yesterday = shiftIsoDate(payload.asOfDate, -1);
  const realtimeFrom = shiftIsoDate(payload.asOfDate, -(payload.realtimeDays - 1));
  const offlineFrom = offlineDate ?? yesterday;
  const dateFrom = realtimeFrom < offlineFrom ? realtimeFrom : offlineFrom;
  await dependencies.jobs.enqueue({
    id: deterministicJobId(`canonical:full:${job.id}:${dateFrom}:${payload.asOfDate}`),
    workspaceId: payload.workspaceId,
    jobType: "canonical_merge",
    payload: {
      workspaceId: payload.workspaceId,
      dateFrom,
      dateTo: payload.asOfDate,
      reportDate: payload.asOfDate,
    },
    priority: job.priority,
    credentialOwnerUserId: job.credentialOwnerUserId,
    maxAttempts: 3,
  });
}
