import type { JobHandler } from "../jobs/types.js";
import type { QihangQueryPort, EtlRunStore } from "../etl/types.js";
import { rowsToRawRecords } from "../etl/raw-ingest.js";
import { replayRequestParams } from "../etl/replay-params.js";
import { errorSummary } from "../etl/run-utils.js";
import { shanghaiBusinessDate } from "../etl/date-range.js";
import { deterministicJobId } from "../jobs/deterministic-id.js";
import { JOB_PRIORITY } from "../jobs/priorities.js";
import { backfillDayPayloadSchema } from "./payload.js";
import type { BackfillJobPort } from "./types.js";

export function createBackfillDayHandler(dependencies: {
  qihang: QihangQueryPort;
  store: EtlRunStore;
  jobs: BackfillJobPort;
  today?: () => string;
}): JobHandler {
  return async (job) => {
    const payload = backfillDayPayloadSchema.parse(job.payload);
    const runId = await dependencies.store.startRun(job.id, "backfill_day", {
      workspaceId: payload.workspaceId,
      userId: payload.fetchedByUserId,
      dateFrom: payload.ds,
      dateTo: payload.ds,
      resource: "account_offline",
    });
    let currentStep = "fetch:account_offline";
    try {
      const query = {
        resource: "account_offline" as const,
        userId: payload.userId,
        media: payload.media,
        accountIds: payload.accountIds,
        beginDate: payload.ds,
        endDate: payload.ds,
      };
      const result = await dependencies.qihang.query(query);
      const records = rowsToRawRecords({
        rows: result.rows,
        workspaceId: payload.workspaceId,
        resource: "account_offline",
        requestParams: replayRequestParams(query),
        fallbackDs: payload.ds,
        fetchedByUserId: payload.fetchedByUserId,
      });
      currentStep = "persist:metrics_raw";
      await dependencies.store.appendRaw(records);
      currentStep = "enqueue:canonical";
      await dependencies.jobs.enqueue({
        id: deterministicJobId(`canonical:${payload.backfillId}:${payload.ds}`),
        workspaceId: payload.workspaceId,
        jobType: "canonical_merge",
        payload: {
          workspaceId: payload.workspaceId,
          backfillId: payload.backfillId,
          dateFrom: payload.ds,
          dateTo: payload.ds,
          reportDate: dependencies.today?.() ?? shanghaiBusinessDate(),
        },
        priority: JOB_PRIORITY.BACKFILL,
        credentialOwnerUserId: job.credentialOwnerUserId,
        maxAttempts: 3,
      });
      await dependencies.store.finishRun(runId, records.length);
    } catch (error) {
      await dependencies.store.failRun(runId, currentStep, errorSummary(error));
      throw error;
    }
  };
}
