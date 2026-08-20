import type { JobEnqueuerPort } from "@ka/db";

import { deterministicJobId } from "../jobs/deterministic-id.js";
import type { JobHandler } from "../jobs/types.js";
import { incrementalEtlPayloadSchema } from "./payload.js";
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
      resources: ["account_realtime", "ad_realtime"],
    });
    let currentStep = "start";
    let rowsIngested = 0;

    const ingest = async (
      resource: "account_realtime" | "ad_realtime",
      query: Parameters<QihangQueryPort["query"]>[0],
    ): Promise<void> => {
      currentStep = resource;
      const result = await dependencies.qihang.query(query);
      const records = rowsToRawRecords({
        rows: result.rows,
        workspaceId: payload.workspaceId,
        resource,
        requestParams: replayRequestParams(query),
        fallbackDs: payload.ds,
        fetchedByUserId: payload.fetchedByUserId,
      });
      await dependencies.store.appendRaw(records);
      rowsIngested += records.length;
    };

    try {
      await ingest("account_realtime", {
        resource: "account_realtime",
        userId: payload.userId,
        media: payload.media,
        accountIds: payload.accountIds,
        ds: payload.ds,
      });
      if (payload.focusAccountIds.length > 0) {
        await ingest("ad_realtime", {
          resource: "ad_realtime",
          userId: payload.userId,
          media: payload.media,
          accountIds: payload.focusAccountIds,
          adIds: payload.adIds,
          ds: payload.ds,
          ...(payload.hh === undefined ? {} : { hh: payload.hh }),
        });
      }
      currentStep = "enqueue:canonical";
      await dependencies.jobs.enqueue({
        id: deterministicJobId(`canonical:incr:${job.id}:${payload.ds}`),
        workspaceId: payload.workspaceId,
        jobType: "canonical_merge",
        payload: {
          workspaceId: payload.workspaceId,
          dateFrom: payload.ds,
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
