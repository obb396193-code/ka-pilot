import type {
  CanonicalMetricRecord,
  EffectiveMetricSettings,
  JobEnqueuerPort,
} from "@ka/db";
import {
  computeDerivedMetrics,
  isSpendAnomaly,
  mergeAccountCanonical,
  type RawMetricRow,
} from "@ka/domain";
import { z } from "zod";

import type { JobHandler } from "../jobs/types.js";
import { deterministicJobId } from "../jobs/deterministic-id.js";
import { errorSummary } from "./run-utils.js";
import type { EtlRunStore } from "./types.js";

const payloadSchema = z.object({
  workspaceId: z.string().uuid(),
  dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  reportDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  backfillId: z.number().int().positive().optional(),
});

export interface CanonicalMergeWork {
  workspaceId: string;
  accountId: string;
  ds: string;
  reportDate: string;
  offline?: RawMetricRow;
  realtime?: RawMetricRow;
}

export interface CanonicalStore {
  loadMergeInputs(scope: {
    workspaceId: string;
    dateFrom: string;
    dateTo: string;
    reportDate: string;
  }): Promise<CanonicalMergeWork[]>;
  loadEffectiveSettings(
    workspaceId: string,
    accountId: string,
    ds: string,
  ): Promise<EffectiveMetricSettings>;
  loadHistoricalSpend(
    workspaceId: string,
    accountId: string,
    beforeDs: string,
  ): Promise<number[]>;
  upsertCanonical(record: CanonicalMetricRecord): Promise<void>;
}

export function createCanonicalHandler(dependencies: {
  store: CanonicalStore;
  runs: Pick<EtlRunStore, "startRun" | "finishRun" | "failRun">;
  jobs: JobEnqueuerPort;
}): JobHandler {
  return async (job) => {
    const scope = payloadSchema.parse(job.payload);
    const runScope = {
      workspaceId: scope.workspaceId,
      dateFrom: scope.dateFrom,
      dateTo: scope.dateTo,
      reportDate: scope.reportDate,
    };
    const runId = await dependencies.runs.startRun(job.id, "canonical", runScope);
    let currentStep = "aggregate:load_inputs";
    let rowsIngested = 0;
    try {
      const inputs = await dependencies.store.loadMergeInputs(scope);
      for (const input of inputs) {
        currentStep = "aggregate:merge";
        if (input.workspaceId !== scope.workspaceId) {
          throw new Error("Canonical input escaped requested workspace scope");
        }
        const base = mergeAccountCanonical(input);
        if (base.accountId !== input.accountId) {
          throw new Error("Canonical input account_id does not match its scope");
        }
        currentStep = "aggregate:settings";
        const [settings, history] = await Promise.all([
          dependencies.store.loadEffectiveSettings(
            input.workspaceId,
            input.accountId,
            input.ds,
          ),
          dependencies.store.loadHistoricalSpend(
            input.workspaceId,
            input.accountId,
            input.ds,
          ),
        ]);
        const derived = computeDerivedMetrics({
          cost: base.cost,
          compensation: base.compensation,
          channelCoefficient: settings.channelCoefficient,
          exposure: base.exposure,
          click: base.click,
          conversion: base.conversion,
          realConversion: base.realConversion,
          assessmentPrice: settings.assessmentPrice,
          wakeUv: base.wakeUv,
          potentialUv: base.potentialUv,
        });
        currentStep = "aggregate:upsert";
        await dependencies.store.upsertCanonical({
          workspaceId: input.workspaceId,
          accountId: input.accountId,
          ds: input.ds,
          cost: base.cost,
          exposure: base.exposure,
          click: base.click,
          conversion: base.conversion,
          realConversion: base.realConversion,
          realCpa: derived.realCpa.value,
          cashCost: derived.cashCost,
          cashCpa: derived.cashCpa.value,
          costSpace: derived.costSpace,
          gap: derived.gap.value,
          budget: base.budget,
          budgetUsageRate: base.budgetUsageRate,
          deductionRate: base.deductionRate,
          mainAdCostProportion: base.mainAdCostProportion,
          assessmentPriceSnapshot: settings.assessmentPrice,
          wakeUv: base.wakeUv,
          potentialUv: base.potentialUv,
          fieldSources: {
            ...base.fieldSources,
            realCpa: "derived",
            cashCost: "derived",
            cashCpa: "derived",
            costSpace: "derived",
            gap: "derived",
          },
          dataAnomaly: isSpendAnomaly(base.cost, history),
        });
        rowsIngested += 1;
      }
      currentStep = "enqueue:quality";
      const qualityKey = scope.backfillId ?? job.id;
      await dependencies.jobs.enqueue({
        id: deterministicJobId(
          `quality:${qualityKey}:${scope.dateFrom}:${scope.dateTo}`,
        ),
        workspaceId: scope.workspaceId,
        jobType: "data_quality_check",
        payload: {
          workspaceId: scope.workspaceId,
          ...(scope.backfillId === undefined ? {} : { backfillId: scope.backfillId }),
          dateFrom: scope.dateFrom,
          dateTo: scope.dateTo,
        },
        priority: job.priority,
        credentialOwnerUserId: job.credentialOwnerUserId,
        maxAttempts: 3,
      });
      await dependencies.runs.finishRun(runId, rowsIngested);
    } catch (error) {
      await dependencies.runs.failRun(runId, currentStep, errorSummary(error));
      throw error;
    }
  };
}
