import type { JobHandler } from "../jobs/types.js";
import type { QihangQueryPort, EtlRunStore } from "../etl/types.js";
import { inclusiveDates } from "../etl/date-range.js";
import { rowsToRawRecords } from "../etl/raw-ingest.js";
import { replayRequestParams } from "../etl/replay-params.js";
import { errorSummary } from "../etl/run-utils.js";
import { deterministicJobId } from "../jobs/deterministic-id.js";
import { JOB_PRIORITY } from "../jobs/priorities.js";
import { backfillCoordinatorPayloadSchema } from "./payload.js";
import type { BackfillBatchPort, BackfillJobPort } from "./types.js";

export function createBackfillCoordinatorHandler(dependencies: {
  qihang: QihangQueryPort;
  batches: BackfillBatchPort;
  jobs: BackfillJobPort;
  store: EtlRunStore;
}): JobHandler {
  return async (job) => {
    const payload = backfillCoordinatorPayloadSchema.parse(job.payload);
    const batch = await dependencies.batches.get(payload.workspaceId, payload.backfillId);
    if (batch.userId !== payload.fetchedByUserId) {
      throw new Error("Backfill batch owner does not match the frozen credential owner");
    }
    const runId = await dependencies.store.startRun(job.id, "backfill_coordinator", {
      workspaceId: payload.workspaceId,
      userId: payload.fetchedByUserId,
      dateFrom: batch.dateFrom,
      dateTo: batch.dateTo,
      resource: "account",
    });
    let currentStep = "fetch:account";
    let rowsIngested = 0;
    try {
      const accountIds = new Set(payload.accountIds ?? []);
      if (accountIds.size === 0) {
        let pageNum = 1;
        let fetched = 0;
        for (;;) {
          const query = {
            resource: "account" as const,
            userId: payload.userId,
            media: payload.media,
            pageNum,
            pageSize: payload.pageSize,
          };
          const result = await dependencies.qihang.query(query);
          const records = rowsToRawRecords({
            rows: result.rows,
            workspaceId: payload.workspaceId,
            media: payload.media,
            resource: "account",
            requestParams: replayRequestParams(query),
            fallbackDs: batch.dateTo,
            fetchedByUserId: payload.fetchedByUserId,
          });
          await dependencies.store.appendRaw(records);
          records.forEach((record) => accountIds.add(record.accountId));
          rowsIngested += records.length;
          fetched += records.length;
          const total = result.pagination?.totalNum;
          if (records.length === 0 || total === null || total === undefined || fetched >= total) {
            break;
          }
          pageNum += 1;
          if (pageNum > 10_000) {
            throw new Error("Qihang account pagination exceeded safety limit");
          }
        }
      }
      if (accountIds.size === 0) {
        throw new Error("Backfill cannot start without accounts");
      }
      currentStep = "fanout:backfill_day";
      for (const ds of inclusiveDates(batch.dateFrom, batch.dateTo)) {
        await dependencies.jobs.enqueue({
          id: deterministicJobId(`backfill:${batch.id}:${ds}`),
          workspaceId: payload.workspaceId,
          jobType: "backfill_day",
          payload: {
            workspaceId: payload.workspaceId,
            backfillId: batch.id,
            ds,
            accountIds: [...accountIds],
          },
          priority: JOB_PRIORITY.BACKFILL,
          credentialOwnerUserId: job.credentialOwnerUserId,
          maxAttempts: 3,
        });
      }
      await dependencies.store.finishRun(runId, rowsIngested);
    } catch (error) {
      await dependencies.store.failRun(runId, currentStep, errorSummary(error));
      throw error;
    }
  };
}
