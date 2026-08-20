import type { JobEnqueuerPort } from "@ka/db";

import { deterministicJobId } from "../jobs/deterministic-id.js";
import type { JobHandler } from "../jobs/types.js";
import type { QihangQuery } from "../qihang/client.js";
import { shiftIsoDate } from "./date-range.js";
import { incrementalEtlPayloadSchema } from "./payload.js";
import { toEtlQueryObservation } from "./query-observation.js";
import { rowsToRawRecords } from "./raw-ingest.js";
import { replayRequestParams } from "./replay-params.js";
import { errorSummary } from "./run-utils.js";
import type { EtlRunStore, QihangQueryPort } from "./types.js";

export interface IncrementalEtlDependencies {
  qihang: QihangQueryPort;
  store: EtlRunStore;
  jobs: JobEnqueuerPort;
}

export function createIncrementalEtlHandler(
  dependencies: IncrementalEtlDependencies,
): JobHandler {
  return async (job) => {
    const payload = incrementalEtlPayloadSchema.parse(job.payload);
    const runId = await dependencies.store.startRun(job.id, "incr", {
      workspaceId: payload.workspaceId,
      ds: payload.ds,
      accountIds: payload.accountIds,
      focusAccountIds: payload.focusAccountIds,
      resources: [
        ...(payload.offlineReconcileDays > 0 ? ["account_offline"] : []),
        "account_realtime",
        "ad_realtime",
      ],
    });
    let currentStep = "start";
    let rowsIngested = 0;

    const ingest = async (
      query: QihangQuery,
      fallbackDs: string,
    ): Promise<void> => {
      currentStep = query.resource;
      const result = await dependencies.qihang.query(query);
      if (result.observation !== undefined) {
        await dependencies.store.recordObservation(
          runId,
          toEtlQueryObservation(query, result.observation),
        );
      }
      const records = rowsToRawRecords({
        rows: result.rows,
        workspaceId: payload.workspaceId,
        resource: query.resource,
        requestParams: replayRequestParams(query),
        fallbackDs,
        fetchedByUserId: payload.fetchedByUserId,
      });
      await dependencies.store.appendRaw(records);
      rowsIngested += records.length;
    };

    try {
      for (let offset = 1; offset <= payload.offlineReconcileDays; offset += 1) {
        const ds = shiftIsoDate(payload.ds, -offset);
        await ingest({
          resource: "account_offline",
          userId: payload.userId,
          media: payload.media,
          accountIds: payload.accountIds,
          beginDate: ds,
          endDate: ds,
        }, ds);
      }
      await ingest({
        resource: "account_realtime",
        userId: payload.userId,
        media: payload.media,
        accountIds: payload.accountIds,
        ds: payload.ds,
      }, payload.ds);
      if (payload.focusAccountIds.length > 0) {
        await ingest({
          resource: "ad_realtime",
          userId: payload.userId,
          media: payload.media,
          accountIds: payload.focusAccountIds,
          adIds: payload.adIds,
          ds: payload.ds,
          ...(payload.hh === undefined ? {} : { hh: payload.hh }),
        }, payload.ds);
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
