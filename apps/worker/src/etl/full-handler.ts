import type { JobEnqueuerPort } from "@ka/db";

import { deterministicJobId } from "../jobs/deterministic-id.js";
import type { JobHandler } from "../jobs/types.js";
import type { QihangQuery } from "../qihang/client.js";
import { shiftIsoDate, trailingDates } from "./date-range.js";
import { fullEtlPayloadSchema } from "./payload.js";
import { rowsToRawRecords } from "./raw-ingest.js";
import { replayRequestParams } from "./replay-params.js";
import { errorSummary } from "./run-utils.js";
import type { EtlRunStore, QihangQueryPort } from "./types.js";

export interface FullEtlDependencies {
  qihang: QihangQueryPort;
  store: EtlRunStore;
  jobs: JobEnqueuerPort;
}

export function createFullEtlHandler(dependencies: FullEtlDependencies): JobHandler {
  return async (job) => {
    const payload = fullEtlPayloadSchema.parse(job.payload);
    const runId = await dependencies.store.startRun(job.id, "full", {
      asOfDate: payload.asOfDate,
      realtimeDays: payload.realtimeDays,
      requestedAccountIds: payload.accountIds,
      resources: ["account", "account_offline", "account_realtime"],
    });
    let currentStep = "start";
    let rowsIngested = 0;

    const ingest = async (query: QihangQuery, fallbackDs: string): Promise<void> => {
      const result = await dependencies.qihang.query(query);
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
      const discoveredAccountIds = new Set(payload.accountIds);
      let pageNum = 1;
      let fetchedAccounts = 0;
      for (;;) {
        currentStep = `account_page_${pageNum}`;
        const query = {
          resource: "account" as const,
          userId: payload.userId,
          media: payload.media,
          pageNum,
          pageSize: payload.pageSize,
          ...(payload.keyword === undefined ? {} : { keyword: payload.keyword }),
          ...(payload.bizName === undefined ? {} : { bizName: payload.bizName }),
        };
        const result = await dependencies.qihang.query(query);
        const records = rowsToRawRecords({
          rows: result.rows,
          workspaceId: payload.workspaceId,
          resource: "account",
          requestParams: replayRequestParams(query),
          fallbackDs: payload.asOfDate,
          fetchedByUserId: payload.fetchedByUserId,
        });
        await dependencies.store.appendRaw(records);
        rowsIngested += records.length;
        fetchedAccounts += records.length;
        records.forEach((row) => discoveredAccountIds.add(row.accountId));

        if (records.length === 0) {
          break;
        }
        const total = result.pagination?.totalNum;
        if (total === null || total === undefined) {
          throw new Error("Qihang account pagination total is missing");
        }
        if (fetchedAccounts >= total) break;
        pageNum += 1;
        if (pageNum > 10_000) {
          throw new Error("Qihang account pagination exceeded safety limit");
        }
      }

      const accountIds = [...discoveredAccountIds];
      const yesterday = shiftIsoDate(payload.asOfDate, -1);
      currentStep = "account_offline_yesterday";
      await ingest(
        {
          resource: "account_offline",
          userId: payload.userId,
          media: payload.media,
          accountIds,
          beginDate: yesterday,
          endDate: yesterday,
        },
        yesterday,
      );

      for (const ds of trailingDates(payload.asOfDate, payload.realtimeDays)) {
        currentStep = `account_realtime_${ds}`;
        await ingest(
          {
            resource: "account_realtime",
            userId: payload.userId,
            media: payload.media,
            accountIds,
            ds,
          },
          ds,
        );
      }

      currentStep = "enqueue:canonical";
      const realtimeFrom = shiftIsoDate(payload.asOfDate, -(payload.realtimeDays - 1));
      const dateFrom = realtimeFrom < yesterday ? realtimeFrom : yesterday;
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
      await dependencies.store.finishRun(runId, rowsIngested);
    } catch (error) {
      await dependencies.store.failRun(runId, currentStep, errorSummary(error));
      throw error;
    }
  };
}
