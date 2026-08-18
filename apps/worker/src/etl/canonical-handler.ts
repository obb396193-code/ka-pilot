import type { CanonicalMetricRecord, EffectiveMetricSettings } from "@ka/db";
import {
  computeDerivedMetrics,
  isSpendAnomaly,
  mergeAccountCanonical,
  type RawMetricRow,
} from "@ka/domain";
import { z } from "zod";

import type { JobHandler } from "../jobs/types.js";

const payloadSchema = z.object({
  workspaceId: z.string().uuid(),
  dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
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

export function createCanonicalHandler(dependencies: { store: CanonicalStore }): JobHandler {
  return async (job) => {
    const scope = payloadSchema.parse(job.payload);
    const inputs = await dependencies.store.loadMergeInputs(scope);
    for (const input of inputs) {
      if (input.workspaceId !== scope.workspaceId) {
        throw new Error("Canonical input escaped requested workspace scope");
      }
      const base = mergeAccountCanonical(input);
      if (base.accountId !== input.accountId) {
        throw new Error("Canonical input account_id does not match its scope");
      }
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
    }
  };
}
