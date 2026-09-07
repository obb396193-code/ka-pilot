import type {
  CpaOutlier,
  MissingAccount,
  NewDataQualityCheck,
  ReconciliationResult,
} from "@ka/db";
import { z } from "zod";

import { inclusiveDates } from "../etl/date-range.js";
import { errorSummary } from "../etl/run-utils.js";
import { withEtlAttempt } from "../etl/attempt-scope.js";
import type { EtlRunStore } from "../etl/types.js";
import type { JobHandler } from "../jobs/types.js";
import type { OutboundStore } from "../notifications/types.js";

const payloadSchema = z.object({
  workspaceId: z.string().uuid(),
  backfillId: z.number().int().positive().optional(),
  dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export interface DataQualityPort {
  reconcileTotals(workspaceId: string, ds: string): Promise<ReconciliationResult>;
  markCpaOutliers(workspaceId: string, ds: string): Promise<CpaOutlier[]>;
  findConsecutiveMissingAccounts(workspaceId: string, ds: string): Promise<MissingAccount[]>;
  recordCheck(check: NewDataQualityCheck): Promise<void>;
}

export function createDataQualityHandler(dependencies: {
  quality: DataQualityPort;
  runs: Pick<EtlRunStore, "startRun" | "finishRun" | "failRun">;
  outbound: OutboundStore;
}): JobHandler {
  return async (job) => {
    const payload = payloadSchema.parse(job.payload);
    if (job.workspaceId !== payload.workspaceId) {
      throw new Error("Data quality job workspace does not match its payload");
    }
    const runId = await dependencies.runs.startRun(job.id, "quality", withEtlAttempt(job, {
      workspaceId: payload.workspaceId,
      dateFrom: payload.dateFrom,
      dateTo: payload.dateTo,
      credentialOwnerUserId: job.credentialOwnerUserId,
      ...(payload.backfillId === undefined ? {} : { backfillId: payload.backfillId }),
    }));
    let currentStep = "quality:start";
    let checksRecorded = 0;
    let backfillQualityFailed = false;
    try {
      for (const ds of inclusiveDates(payload.dateFrom, payload.dateTo)) {
        const failedChecks: string[] = [];

        currentStep = "quality:total_reconciliation";
        const totals = await dependencies.quality.reconcileTotals(payload.workspaceId, ds);
        await dependencies.quality.recordCheck({
          workspaceId: payload.workspaceId,
          ds,
          checkType: "total_reconciliation",
          sample: { rawTotal: totals.rawTotal, canonicalTotal: totals.canonicalTotal },
          passed: totals.passed,
          delta: { absolute: totals.delta, tolerance: totals.tolerance },
        });
        checksRecorded += 1;
        if (totals.passed !== true) {
          failedChecks.push("total_reconciliation");
        }

        currentStep = "quality:cpa_outlier";
        const outliers = await dependencies.quality.markCpaOutliers(payload.workspaceId, ds);
        const cpaPassed = outliers.length === 0;
        await dependencies.quality.recordCheck({
          workspaceId: payload.workspaceId,
          ds,
          checkType: "cpa_outlier",
          sample: { accounts: outliers.slice(0, 50), total: outliers.length },
          passed: cpaPassed,
          delta: { thresholdMultiple: 5 },
        });
        checksRecorded += 1;
        if (!cpaPassed) {
          failedChecks.push("cpa_outlier");
        }

        currentStep = "quality:missing_consecutive_days";
        const missing = await dependencies.quality.findConsecutiveMissingAccounts(
          payload.workspaceId,
          ds,
        );
        const missingPassed = missing.length === 0;
        await dependencies.quality.recordCheck({
          workspaceId: payload.workspaceId,
          ds,
          checkType: "missing_consecutive_days",
          sample: { accountIds: missing.slice(0, 50), total: missing.length },
          passed: missingPassed,
          delta: { requiredConsecutiveDays: 2 },
        });
        checksRecorded += 1;
        if (!missingPassed) {
          failedChecks.push("missing_consecutive_days");
        }

        if (failedChecks.length > 0) {
          backfillQualityFailed = true;
          currentStep = "quality:notify";
          await dependencies.outbound.enqueue({
            workspaceId: payload.workspaceId,
            channel: "dingtalk",
            target: `workspace:${payload.workspaceId}:admins`,
            kind: "data_quality_failed",
            payload: { ds, failedChecks },
          });
        }
      }
      if (payload.backfillId !== undefined && backfillQualityFailed) {
        currentStep = "quality:validation_failed";
        throw new Error("Backfill quality checks did not pass");
      }
      await dependencies.runs.finishRun(runId, checksRecorded);
    } catch (error) {
      await dependencies.runs.failRun(runId, currentStep, errorSummary(error));
      throw error;
    }
  };
}
