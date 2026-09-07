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
import { withEtlAttempt } from "./attempt-scope.js";
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
  media: string;
  accountId: string;
  ds: string;
  reportDate: string;
  offline?: RawMetricRow;
  realtime?: RawMetricRow;
}

export interface CanonicalLookupKey {
  media: string;
  accountId: string;
  ds: string;
}

export interface CanonicalSettingsBatchRow extends CanonicalLookupKey, EffectiveMetricSettings {
  workspaceId: string;
}

export interface CanonicalHistoryBatchRow extends CanonicalLookupKey {
  workspaceId: string;
  history: number[];
}

export interface CanonicalStore {
  loadMergeInputs(scope: {
    workspaceId: string;
    dateFrom: string;
    dateTo: string;
    reportDate: string;
  }): Promise<CanonicalMergeWork[]>;
  loadEffectiveSettingsBatch(
    workspaceId: string,
    keys: readonly CanonicalLookupKey[],
  ): Promise<CanonicalSettingsBatchRow[]>;
  loadHistoricalSpendBatch(
    workspaceId: string,
    keys: readonly CanonicalLookupKey[],
  ): Promise<CanonicalHistoryBatchRow[]>;
  upsertCanonicalBatch(records: readonly CanonicalMetricRecord[]): Promise<void>;
}

const DEFAULT_CHUNK_SIZE = 250;
const MAX_CHUNK_SIZE = 1_000;

function lookupKey(value: CanonicalLookupKey): string {
  return JSON.stringify([value.media, value.accountId, value.ds]);
}

function indexLookupRows<T extends CanonicalLookupKey & { workspaceId: string }>(input: {
  workspaceId: string;
  requested: readonly CanonicalLookupKey[];
  rows: readonly T[];
  kind: string;
}): Map<string, T> {
  const requested = new Set(input.requested.map(lookupKey));
  const indexed = new Map<string, T>();
  for (const row of input.rows) {
    const key = lookupKey(row);
    if (row.workspaceId !== input.workspaceId || !requested.has(key)) {
      throw new Error(`Canonical ${input.kind} returned an out-of-scope key`);
    }
    if (indexed.has(key)) {
      throw new Error(`Canonical ${input.kind} returned a duplicate requested key`);
    }
    indexed.set(key, row);
  }
  if (indexed.size !== requested.size) {
    throw new Error(`Canonical ${input.kind} is missing requested key`);
  }
  return indexed;
}

function validateInputs(
  inputs: readonly CanonicalMergeWork[],
  workspaceId: string,
): void {
  const seen = new Set<string>();
  for (const input of inputs) {
    if (input.workspaceId !== workspaceId) {
      throw new Error("Canonical input escaped requested workspace scope");
    }
    const key = lookupKey(input);
    if (seen.has(key)) {
      throw new Error("Canonical inputs contain a duplicate account/date key");
    }
    seen.add(key);
  }
}

function canonicalRecord(input: {
  work: CanonicalMergeWork;
  settings: EffectiveMetricSettings;
  history: readonly number[];
}): CanonicalMetricRecord {
  const base = mergeAccountCanonical(input.work);
  if (base.accountId !== input.work.accountId) {
    throw new Error("Canonical input account_id does not match its scope");
  }
  const derived = computeDerivedMetrics({
    cost: base.cost,
    compensation: base.compensation,
    channelCoefficient: input.settings.channelCoefficient,
    channelCoefficientOp: input.settings.channelCoefficientOp,
    exposure: base.exposure,
    click: base.click,
    conversion: base.conversion,
    realConversion: base.realConversion,
    assessmentPrice: input.settings.assessmentPrice,
    wakeUv: base.wakeUv,
    potentialUv: base.potentialUv,
  });
  return {
    workspaceId: input.work.workspaceId,
    media: input.work.media,
    accountId: input.work.accountId,
    ds: input.work.ds,
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
    assessmentPriceSnapshot: input.settings.assessmentPrice,
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
    dataAnomaly: isSpendAnomaly(base.cost, input.history),
  };
}

async function mergeChunk(input: {
  store: CanonicalStore;
  workspaceId: string;
  works: readonly CanonicalMergeWork[];
}): Promise<CanonicalMetricRecord[]> {
  const keys = input.works.map(({ media, accountId, ds }) => ({ media, accountId, ds }));
  const [settingsRows, historyRows] = await Promise.all([
    input.store.loadEffectiveSettingsBatch(input.workspaceId, keys),
    input.store.loadHistoricalSpendBatch(input.workspaceId, keys),
  ]);
  const settings = indexLookupRows({
    workspaceId: input.workspaceId,
    requested: keys,
    rows: settingsRows,
    kind: "settings",
  });
  const histories = indexLookupRows({
    workspaceId: input.workspaceId,
    requested: keys,
    rows: historyRows,
    kind: "history",
  });
  return input.works.map((work) => {
    const key = lookupKey(work);
    return canonicalRecord({
      work,
      settings: settings.get(key)!,
      history: histories.get(key)!.history,
    });
  });
}

function validChunkSize(value: number): number {
  if (!Number.isInteger(value) || value < 1 || value > MAX_CHUNK_SIZE) {
    throw new Error(`chunkSize must be an integer between 1 and ${MAX_CHUNK_SIZE}`);
  }
  return value;
}

export function createCanonicalHandler(dependencies: {
  store: CanonicalStore;
  runs: Pick<EtlRunStore, "startRun" | "finishRun" | "failRun">;
  jobs: JobEnqueuerPort;
  chunkSize?: number;
}): JobHandler {
  const chunkSize = validChunkSize(dependencies.chunkSize ?? DEFAULT_CHUNK_SIZE);
  return async (job) => {
    const scope = payloadSchema.parse(job.payload);
    if (job.workspaceId !== scope.workspaceId) {
      throw new Error("Canonical job workspace does not match its payload");
    }
    const runScope = {
      workspaceId: scope.workspaceId,
      dateFrom: scope.dateFrom,
      dateTo: scope.dateTo,
      reportDate: scope.reportDate,
      credentialOwnerUserId: job.credentialOwnerUserId,
      ...(scope.backfillId === undefined ? {} : { backfillId: scope.backfillId }),
    };
    const runId = await dependencies.runs.startRun(job.id, "canonical", withEtlAttempt(job, runScope));
    let currentStep = "aggregate:load_inputs";
    let rowsIngested = 0;
    try {
      const inputs = await dependencies.store.loadMergeInputs(scope);
      validateInputs(inputs, scope.workspaceId);
      for (let offset = 0; offset < inputs.length; offset += chunkSize) {
        const works = inputs.slice(offset, offset + chunkSize);
        currentStep = "aggregate:settings";
        const records = await mergeChunk({
          store: dependencies.store,
          workspaceId: scope.workspaceId,
          works,
        });
        currentStep = "aggregate:upsert";
        await dependencies.store.upsertCanonicalBatch(records);
        rowsIngested += records.length;
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
