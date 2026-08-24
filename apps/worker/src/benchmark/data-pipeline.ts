import { performance } from "node:perf_hooks";

import type { JobRecord } from "@ka/db";

import { createCanonicalHandler, type CanonicalMergeWork } from "../etl/canonical-handler.js";
import { QihangClient } from "../qihang/client.js";

const WORKSPACE_ID = "11111111-1111-4111-8111-111111111111";

export interface DataPipelineBenchmarkSample {
  accountCount: number;
  chunkSize: number;
  chunkCount: number;
  qihangJsonBytes: number;
  qihangRows: number;
  qihangDurationMs: number;
  canonicalDurationMs: number;
  totalDurationMs: number;
  rowsPerSecond: number;
  canonicalPortCalls: {
    loadMergeInputs: number;
    loadEffectiveSettingsBatch: number;
    loadHistoricalSpendBatch: number;
    upsertCanonicalBatch: number;
    startRun: number;
    finishRun: number;
    failRun: number;
    enqueue: number;
    total: number;
  };
}

export interface DataPipelineBenchmarkReport {
  benchmark: "qihang-canonical-synthetic";
  runtime: { node: string; platform: NodeJS.Platform; arch: string };
  sampleCount: number;
  iterationsPerSample: number;
  samples: DataPipelineBenchmarkSample[];
}

export interface DataPipelineBenchmarkArgs {
  accountCounts: number[];
  iterationsPerSample: number;
  chunkSize: number;
}

export function parseDataPipelineBenchmarkArgs(args: readonly string[]): DataPipelineBenchmarkArgs {
  let accountCounts = [100, 1_000, 5_000];
  let iterationsPerSample = 5;
  let chunkSize = 250;
  for (const argument of args) {
    if (argument.startsWith("--accounts=")) {
      accountCounts = argument.slice("--accounts=".length).split(",").map(Number);
    } else if (argument.startsWith("--iterations=")) {
      iterationsPerSample = Number(argument.slice("--iterations=".length));
    } else if (argument.startsWith("--chunk-size=")) {
      chunkSize = Number(argument.slice("--chunk-size=".length));
    } else {
      throw new Error(`unknown benchmark argument: ${argument}`);
    }
  }
  if (accountCounts.length === 0) throw new Error("benchmark requires at least one account scale");
  accountCounts.forEach(assertAccountCount);
  assertAccountCount(iterationsPerSample);
  assertAccountCount(chunkSize);
  return { accountCounts, iterationsPerSample, chunkSize };
}

export async function runDataPipelineBenchmark(
  accountCounts: readonly number[] = [100, 1_000, 5_000],
  iterationsPerSample = 5,
  chunkSize = 250,
): Promise<DataPipelineBenchmarkReport> {
  assertAccountCount(iterationsPerSample);
  assertAccountCount(chunkSize);
  if (chunkSize > 1_000) throw new Error("benchmark chunk size cannot exceed 1000");
  if (accountCounts.length > 0) {
    await runSample(Math.min(accountCounts[0] ?? 1, 10), chunkSize);
  }
  const samples: DataPipelineBenchmarkSample[] = [];
  for (const accountCount of accountCounts) {
    assertAccountCount(accountCount);
    samples.push(await runRepeatedSample(accountCount, iterationsPerSample, chunkSize));
  }
  return {
    benchmark: "qihang-canonical-synthetic",
    runtime: { node: process.version, platform: process.platform, arch: process.arch },
    sampleCount: samples.length,
    iterationsPerSample,
    samples,
  };
}

async function runRepeatedSample(
  accountCount: number,
  iterations: number,
  chunkSize: number,
): Promise<DataPipelineBenchmarkSample> {
  const samples: DataPipelineBenchmarkSample[] = [];
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    samples.push(await runSample(accountCount, chunkSize));
  }
  samples.sort((left, right) => left.totalDurationMs - right.totalDurationMs);
  return samples[Math.floor(samples.length / 2)] as DataPipelineBenchmarkSample;
}

async function runSample(
  accountCount: number,
  chunkSize: number,
): Promise<DataPipelineBenchmarkSample> {
  const sourceRows = createSyntheticRows(accountCount);
  const qihangBody = JSON.stringify({ successful: true, data: sourceRows });
  const qihangJsonBytes = Buffer.byteLength(qihangBody);
  const qihangStarted = performance.now();
  const qihangResult = await createSyntheticQihangClient(qihangBody, accountCount).query({
    resource: "account_realtime",
    userId: "synthetic-benchmark-user",
    ds: "20260819",
  });
  const qihangDurationMs = performance.now() - qihangStarted;

  const inputs = qihangResult.rows.map(toCanonicalInput);
  const { handler, counters } = createSyntheticCanonicalHandler(inputs, chunkSize);
  const canonicalStarted = performance.now();
  await handler(createCanonicalJob());
  const canonicalDurationMs = performance.now() - canonicalStarted;
  const totalDurationMs = qihangDurationMs + canonicalDurationMs;

  return {
    accountCount,
    chunkSize,
    chunkCount: Math.ceil(accountCount / chunkSize),
    qihangJsonBytes,
    qihangRows: qihangResult.rows.length,
    qihangDurationMs: roundMilliseconds(qihangDurationMs),
    canonicalDurationMs: roundMilliseconds(canonicalDurationMs),
    totalDurationMs: roundMilliseconds(totalDurationMs),
    rowsPerSecond: roundRate(accountCount, totalDurationMs),
    canonicalPortCalls: { ...counters, total: sumCounters(counters) },
  };
}

function createSyntheticQihangClient(body: string, accountCount: number): QihangClient {
  return new QihangClient({
    fetchFn: async () => new Response(body, { status: 200 }),
    maxRows: accountCount,
    maxResponseBytes: Math.max(Buffer.byteLength(body), 1),
  });
}

function createSyntheticRows(accountCount: number): Record<string, unknown>[] {
  return Array.from({ length: accountCount }, (_, index) => ({
    account_id: `synthetic-account-${String(index + 1).padStart(6, "0")}`,
    cost_api: 100 + (index % 50),
    exp_pv_api: 1_000 + index,
    clk_api: 80 + (index % 20),
    account_conversion: 12 + (index % 5),
    account_real_conversion: 10 + (index % 5),
    account_budget: 500,
    income: 5,
    wake_uv: 40,
    aac_ptt_uv: 20,
  }));
}

function toCanonicalInput(row: Record<string, unknown>): CanonicalMergeWork {
  const accountId = String(row.account_id);
  return {
    workspaceId: WORKSPACE_ID,
    media: "KUAISHOU",
    accountId,
    ds: "2026-08-19",
    reportDate: "2026-08-20",
    offline: row,
    realtime: row,
  };
}

function createSyntheticCanonicalHandler(
  inputs: CanonicalMergeWork[],
  chunkSize: number,
) {
  const counters = {
    loadMergeInputs: 0,
    loadEffectiveSettingsBatch: 0,
    loadHistoricalSpendBatch: 0,
    upsertCanonicalBatch: 0,
    startRun: 0,
    finishRun: 0,
    failRun: 0,
    enqueue: 0,
  };
  const handler = createCanonicalHandler({
    store: {
      loadMergeInputs: async () => {
        counters.loadMergeInputs += 1;
        return inputs;
      },
      loadEffectiveSettingsBatch: async (workspaceId, keys) => {
        counters.loadEffectiveSettingsBatch += 1;
        return keys.map((key) => ({
          workspaceId,
          ...key,
          channelCoefficient: 2,
          assessmentPrice: 11,
        }));
      },
      loadHistoricalSpendBatch: async (workspaceId, keys) => {
        counters.loadHistoricalSpendBatch += 1;
        return keys.map((key) => ({
          workspaceId,
          ...key,
          history: [90, 100, 110],
        }));
      },
      upsertCanonicalBatch: async () => {
        counters.upsertCanonicalBatch += 1;
      },
    },
    runs: {
      startRun: async () => {
        counters.startRun += 1;
        return 1;
      },
      finishRun: async () => {
        counters.finishRun += 1;
      },
      failRun: async () => {
        counters.failRun += 1;
      },
    },
    jobs: {
      enqueue: async () => {
        counters.enqueue += 1;
        return "synthetic-quality-job";
      },
    },
    chunkSize,
  });
  return { handler, counters };
}

function createCanonicalJob(): JobRecord {
  return {
    id: "33333333-3333-4333-8333-333333333333",
    workspaceId: WORKSPACE_ID,
    jobType: "canonical_merge",
    payload: {
      workspaceId: WORKSPACE_ID,
      dateFrom: "2026-08-19",
      dateTo: "2026-08-19",
      reportDate: "2026-08-20",
    },
    priority: 5,
    credentialOwnerUserId: null,
    status: "leased",
    leaseUntil: null,
    leaseToken: "44444444-4444-4444-8444-444444444444",
    attempts: 1,
    maxAttempts: 3,
    runAfter: new Date(0),
  };
}

function assertAccountCount(value: number): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error("benchmark account count must be a positive integer");
  }
}

function roundMilliseconds(value: number): number {
  return Number(value.toFixed(3));
}

function roundRate(rows: number, milliseconds: number): number {
  return Number((rows / Math.max(milliseconds / 1_000, Number.EPSILON)).toFixed(1));
}

function sumCounters(counters: Record<string, number>): number {
  return Object.values(counters).reduce((sum, value) => sum + value, 0);
}
