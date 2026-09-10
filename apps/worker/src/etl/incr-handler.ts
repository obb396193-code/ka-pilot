import type { AdHourlyMetricRecord, JobEnqueuerPort } from "@ka/db";
import { deriveHourlyAdMetrics, type HourlyMetricIssue } from "@ka/domain";

import { deterministicJobId } from "../jobs/deterministic-id.js";
import type { JobHandler } from "../jobs/types.js";
import type { QihangQuery, QihangQueryResult } from "../qihang/client.js";
import { createQihangObservation } from "../qihang/observation.js";
import { mergeAdRealtimeRows, planAdRealtimeBatches } from "./ad-query-batches.js";
import { shiftIsoDate } from "./date-range.js";
import { incrementalEtlPayloadSchema } from "./payload.js";
import { toEtlQueryObservation } from "./query-observation.js";
import { rowsToRawRecords } from "./raw-ingest.js";
import { replayRequestParams } from "./replay-params.js";
import { errorSummary } from "./run-utils.js";
import { withEtlAttempt } from "./attempt-scope.js";
import type { AdHourlyStore, EtlRunStore, QihangQueryPort } from "./types.js";
import { partialExecution, queryWithBatchFailure, accountQueryBatches, type BatchFailurePort } from "./partial-query.js";

export interface IncrementalEtlDependencies {
  qihang: QihangQueryPort;
  store: EtlRunStore;
  jobs: JobEnqueuerPort;
  hourly: AdHourlyStore;
  failures?: BatchFailurePort;
}

export function createIncrementalEtlHandler(
  dependencies: IncrementalEtlDependencies,
): JobHandler {
  return async (job) => {
    const payload = incrementalEtlPayloadSchema.parse(job.payload);
    const partial = partialExecution(job, { workspaceId: payload.workspaceId, media: payload.media, accountIds: payload.accountIds,
      dateFrom: shiftIsoDate(payload.ds, -payload.offlineReconcileDays), dateTo: payload.ds }, dependencies.failures);
    if (partial && payload.focusAccountIds.some(id => !partial.scope.accountIds.includes(id))) throw new Error("Focus accounts escaped partial execution scope");
    const runId = await dependencies.store.startRun(job.id, "incr", withEtlAttempt(job, {
      workspaceId: payload.workspaceId,
      ds: payload.ds,
      accountIds: payload.accountIds,
      focusAccountIds: payload.focusAccountIds,
      resources: [
        ...(payload.offlineReconcileDays > 0 ? ["account_offline"] : []),
        "account_realtime",
        "ad_realtime",
      ],
      ...(partial ? { batchScope: partial.scope } : {}),
    }));
    let currentStep = "start";
    let rowsIngested = 0;

    const ingest = async (
      query: QihangQuery,
      fallbackDs: string,
    ): Promise<QihangQueryResult | null> => {
      currentStep = query.resource;
      const result = await queryWithBatchFailure(dependencies.qihang, query, runId, partial);
      if (result === null) return null;
      if (result.observation !== undefined) {
        await dependencies.store.recordObservation(
          runId,
          toEtlQueryObservation(query, result.observation),
        );
      }
      const records = rowsToRawRecords({
        rows: result.rows,
        workspaceId: payload.workspaceId,
        media: query.media ?? payload.media,
        resource: query.resource,
        requestParams: replayRequestParams(query),
        fallbackDs,
        fetchedByUserId: payload.fetchedByUserId,
      });
      await dependencies.store.appendRaw(records);
      rowsIngested += records.length;
      return result;
    };

    try {
      for (let offset = 1; offset <= payload.offlineReconcileDays; offset += 1) {
        const ds = shiftIsoDate(payload.ds, -offset);
        const query: QihangQuery = {
          resource: "account_offline",
          userId: payload.userId,
          media: payload.media,
          accountIds: payload.accountIds,
          beginDate: ds,
          endDate: ds,
        };
        for (const batch of accountQueryBatches(query, partial)) await ingest(batch, ds);
      }
      const realtime: QihangQuery = {
        resource: "account_realtime",
        userId: payload.userId,
        media: payload.media,
        accountIds: payload.accountIds,
        ds: payload.ds,
      };
      for (const batch of accountQueryBatches(realtime, partial)) await ingest(batch, payload.ds);
      if (payload.focusAccountIds.length > 0) {
        await ingestFocusedAds(dependencies, payload, runId, ingest, (step) => {
          currentStep = step;
        });
      }
      currentStep = "enqueue:canonical";
      await dependencies.jobs.enqueue({
        id: deterministicJobId(`canonical:incr:${job.id}:${payload.ds}`),
        workspaceId: payload.workspaceId,
        jobType: "canonical_merge",
        payload: {
          workspaceId: payload.workspaceId,
          dateFrom: shiftIsoDate(payload.ds, -payload.offlineReconcileDays),
          dateTo: payload.ds,
          reportDate: payload.ds,
        },
        priority: job.priority,
        credentialOwnerUserId: job.credentialOwnerUserId,
        maxAttempts: 3,
      });
      await dependencies.store.finishRun(runId, rowsIngested);
    } catch (error) {
      await dependencies.store.failRun(runId, currentStep, errorSummary(error));
      throw error;
    }
  };
}

type IncrementalPayload = ReturnType<typeof incrementalEtlPayloadSchema.parse>;
type IngestQuery = (query: QihangQuery, fallbackDs: string) => Promise<QihangQueryResult | null>;
type AdRealtimeQuery = Extract<QihangQuery, { resource: "ad_realtime" }>;

async function ingestFocusedAds(
  dependencies: IncrementalEtlDependencies,
  payload: IncrementalPayload,
  runId: string,
  ingest: IngestQuery,
  setStep: (step: string) => void,
): Promise<void> {
  const query = (hh?: number): AdRealtimeQuery => ({
    resource: "ad_realtime",
    userId: payload.userId,
    media: payload.media,
    accountIds: payload.focusAccountIds,
    adIds: payload.adIds,
    ds: payload.ds,
    ...(hh === undefined ? {} : { hh }),
  });
  if (payload.hh === undefined) {
    await ingestAdSnapshot(query(), ingest, payload.ds);
    return;
  }

  const previous = payload.hh === 0
    ? { rows: [], failedAccounts: [] }
    : await ingestAdSnapshot(query(payload.hh - 1), ingest, payload.ds);
  const current = await ingestAdSnapshot(query(payload.hh), ingest, payload.ds);
  const failed = new Set([...previous.failedAccounts, ...current.failedAccounts]);
  setStep("hourly_derive");
  const derived = deriveHourlyAdMetrics({
    currentHh: payload.hh,
    previousRows: previous.rows.filter(row => !failed.has(String(row.account_id))),
    currentRows: current.rows.filter(row => !failed.has(String(row.account_id))),
  });
  assertDerivedDate(payload.ds, derived.rows);
  setStep("hourly_upsert");
  await dependencies.hourly.upsertHourly(derived.rows.map((row): AdHourlyMetricRecord => ({
    workspaceId: payload.workspaceId,
    media: payload.media,
    adId: row.adId,
    accountId: row.accountId,
    ds: row.ds,
    hh: row.hh,
    cost: row.cost,
    exposure: row.exposure,
    click: row.click,
    conversion: row.conversion,
    realConversion: row.realConversion,
    bid: row.bid,
    budget: row.budget,
  })));
  await dependencies.store.recordObservation(runId, { ...derivationObservation(payload, current, derived.issues, derived.rows.length),
    ...(failed.size ? { availability: "observed_unverified" as const } : {}) });
}

async function ingestAdSnapshot(
  query: AdRealtimeQuery,
  ingest: IngestQuery,
  fallbackDs: string,
): Promise<QihangQueryResult & { failedAccounts: string[] }> {
  const results: QihangQueryResult[] = [];
  const failedAccounts = new Set<string>();
  for (const batch of planAdRealtimeBatches(query)) {
    const result = await ingest(batch, fallbackDs);
    if (result === null) batch.accountIds?.forEach(id => failedAccounts.add(id));
    else results.push(result);
  }
  const rows = mergeAdRealtimeRows(results.map((result) => result.rows));
  return {
    rows,
    failedAccounts: [...failedAccounts],
    envelope: { batched: true, batchCount: results.length },
    observation: createQihangObservation("ad_realtime", rows, new Date()),
  };
}

function assertDerivedDate(
  expected: string,
  rows: readonly { ds: string }[],
): void {
  if (rows.some((row) => row.ds !== expected)) {
    throw new Error("Qihang ad snapshot returned a date outside the requested ds");
  }
}

function derivationObservation(
  payload: IncrementalPayload,
  current: QihangQueryResult,
  issues: readonly HourlyMetricIssue[],
  rowCount: number,
) {
  const issueFields = [...new Set(issues.flatMap((issue) =>
    issue.code === "data_correction" ? issue.fields : []))].sort();
  return {
    kind: "hourly_derivation" as const,
    resource: "ad_realtime" as const,
    rowCount,
    observedAt: current.observation?.observedAt ?? new Date().toISOString(),
    lastSyncTime: current.observation?.lastSyncTime ?? null,
    availability: issues.length === 0 ? "observed" as const : "observed_unverified" as const,
    ds: payload.ds,
    hh: payload.hh!,
    issueCount: issues.length,
    issueFields,
  };
}
