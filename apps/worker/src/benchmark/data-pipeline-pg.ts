import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";

import {
  MetricsRepository,
  RawMetricsRepository,
  runMigrations,
  type JobRecord,
} from "@ka/db";
import type { Pool } from "pg";
import { Pool as PgPool } from "pg";

import { createCanonicalHandler } from "../etl/canonical-handler.js";

const DEFAULT_DATABASE_URL = "postgres://ka:ka@127.0.0.1:55432/ka";
const ALLOWED_SCALES = new Set([100, 1_000, 5_000]);

export interface PgBenchmarkOptions {
  databaseUrl: string;
  accountCounts: number[];
  iterations: number;
  chunkSize: number;
}

export interface QueryPlanSummary {
  name: string;
  nodeType: string;
  executionTimeMs: number;
  sharedHitBlocks: number;
  sharedReadBlocks: number;
}

export interface PgBenchmarkSample {
  accountCount: number;
  chunkSize: number;
  chunkCount: number;
  medianCanonicalMs: number;
  rowsPerSecond: number;
  canonicalRows: number;
  portCalls: number;
  plans: QueryPlanSummary[];
}

export interface PgBenchmarkReport {
  benchmark: "canonical-real-postgres";
  runtime: { node: string; platform: NodeJS.Platform; arch: string; postgres: string };
  iterations: number;
  samples: PgBenchmarkSample[];
}

export function parsePgBenchmarkArgs(args: readonly string[]): PgBenchmarkOptions {
  const options: PgBenchmarkOptions = {
    databaseUrl: process.env.TEST_DATABASE_URL ?? DEFAULT_DATABASE_URL,
    accountCounts: [100, 1_000, 5_000],
    iterations: 3,
    chunkSize: 250,
  };
  for (const argument of args) {
    applyPgBenchmarkArgument(options, argument);
  }
  validatePgBenchmarkOptions(options);
  return options;
}

function applyPgBenchmarkArgument(
  options: PgBenchmarkOptions,
  argument: string,
): void {
  const [name, value] = argument.split("=", 2);
  if (value === undefined) throw new Error(`invalid PostgreSQL benchmark argument: ${argument}`);
  if (name === "--database-url") options.databaseUrl = value;
  else if (name === "--accounts") options.accountCounts = value.split(",").map(Number);
  else if (name === "--iterations") options.iterations = Number(value);
  else if (name === "--chunk-size") options.chunkSize = Number(value);
  else throw new Error(`unknown PostgreSQL benchmark argument: ${argument}`);
}

function validatePgBenchmarkOptions(options: PgBenchmarkOptions): void {
  assertLocalTestDatabase(options.databaseUrl);
  if (
    options.accountCounts.length === 0 ||
    options.accountCounts.some((count) => !ALLOWED_SCALES.has(count))
  ) {
    throw new Error("PostgreSQL benchmark accounts must use 100, 1000 or 5000");
  }
  if (!Number.isInteger(options.iterations) || options.iterations < 1 || options.iterations > 10) {
    throw new Error("PostgreSQL benchmark iterations must be between 1 and 10");
  }
  if (
    !Number.isInteger(options.chunkSize) ||
    options.chunkSize < 1 ||
    options.chunkSize > 1_000
  ) {
    throw new Error("PostgreSQL benchmark chunk size must be between 1 and 1000");
  }
}

export function assertLocalTestDatabase(databaseUrl: string): void {
  const parsed = new URL(databaseUrl);
  if (!new Set(["127.0.0.1", "localhost", "::1"]).has(parsed.hostname)) {
    throw new Error("PostgreSQL benchmark only permits a local test database");
  }
  if (parsed.port !== "55432" || parsed.pathname !== "/ka") {
    throw new Error("PostgreSQL benchmark requires the local ka test database on port 55432");
  }
}

export async function runPgDataPipelineBenchmark(
  options: PgBenchmarkOptions,
): Promise<PgBenchmarkReport> {
  assertLocalTestDatabase(options.databaseUrl);
  await runMigrations({ databaseUrl: options.databaseUrl });
  const pool = new PgPool({ connectionString: options.databaseUrl });
  try {
    const version = await pool.query<{ version: string }>("SELECT version()");
    const samples: PgBenchmarkSample[] = [];
    for (const accountCount of options.accountCounts) {
      samples.push(await runScale(pool, accountCount, options));
    }
    return {
      benchmark: "canonical-real-postgres",
      runtime: {
        node: process.version,
        platform: process.platform,
        arch: process.arch,
        postgres: version.rows[0]?.version ?? "unknown",
      },
      iterations: options.iterations,
      samples,
    };
  } finally {
    await pool.end();
  }
}

async function runScale(
  pool: Pool,
  accountCount: number,
  options: PgBenchmarkOptions,
): Promise<PgBenchmarkSample> {
  const fixture = await seedFixture(pool, accountCount);
  try {
    const durations: number[] = [];
    for (let iteration = 0; iteration < options.iterations; iteration += 1) {
      durations.push(await runCanonical(pool, fixture.workspaceId, options.chunkSize));
    }
    durations.sort((left, right) => left - right);
    const medianCanonicalMs = durations[Math.floor(durations.length / 2)]!;
    const count = await pool.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM account_metrics_daily WHERE workspace_id = $1",
      [fixture.workspaceId],
    );
    const plans = await explainFixture(pool, fixture.workspaceId, fixture.accountIds);
    const chunkCount = Math.ceil(accountCount / options.chunkSize);
    return {
      accountCount,
      chunkSize: options.chunkSize,
      chunkCount,
      medianCanonicalMs: round(medianCanonicalMs),
      rowsPerSecond: round(accountCount / Math.max(medianCanonicalMs / 1_000, 0.000_001)),
      canonicalRows: Number(count.rows[0]?.count ?? 0),
      portCalls: 3 * chunkCount + 4,
      plans,
    };
  } finally {
    await cleanupFixture(pool, fixture.workspaceId);
  }
}

async function seedFixture(pool: Pool, accountCount: number) {
  const suffix = randomUUID();
  const workspace = await pool.query<{ id: string }>(
    "INSERT INTO workspaces (name) VALUES ($1) RETURNING id",
    [`pg-benchmark-${accountCount}-${suffix}`],
  );
  const workspaceId = workspace.rows[0]!.id;
  const taskId = `task-${suffix}`;
  const accountIds = Array.from(
    { length: accountCount },
    (_, index) => `synthetic-${suffix}-${String(index + 1).padStart(5, "0")}`,
  );
  await pool.query(
    `INSERT INTO accounts (workspace_id, account_id, account_name, media, lifecycle_stage)
     SELECT $1, value.account_id, '合成压测账户', 'KUAISHOU', 'scaling'
     FROM jsonb_to_recordset($2::jsonb) AS value(account_id text)`,
    [workspaceId, JSON.stringify(accountIds.map((account_id) => ({ account_id })))],
  );
  await pool.query(
    `INSERT INTO tasks (workspace_id, task_id, task_name)
     VALUES ($1, $2, '合成压测任务')`,
    [workspaceId, taskId],
  );
  await pool.query(
    `INSERT INTO task_accounts (workspace_id, task_id, media, account_id, valid_from)
     SELECT $1, $2, 'KUAISHOU', value.account_id, '2026-08-01'
     FROM jsonb_to_recordset($3::jsonb) AS value(account_id text)`,
    [workspaceId, taskId, JSON.stringify(accountIds.map((account_id) => ({ account_id })))],
  );
  await pool.query(
    `INSERT INTO channel_coefficients (workspace_id, media, coefficient, effective_date)
     VALUES ($1, 'KUAISHOU', 2, '2026-08-01')`,
    [workspaceId],
  );
  await pool.query(
    `INSERT INTO assessment_price_history (workspace_id, task_id, price, effective_date)
     VALUES ($1, $2, 11, '2026-08-01')`,
    [workspaceId, taskId],
  );
  await seedRaw(pool, workspaceId, accountIds);
  return { workspaceId, accountIds };
}

async function seedRaw(pool: Pool, workspaceId: string, accountIds: readonly string[]) {
  const raw = new RawMetricsRepository(pool);
  for (let offset = 0; offset < accountIds.length; offset += 500) {
    const ids = accountIds.slice(offset, offset + 500);
    await raw.appendRaw(
      ids.flatMap((accountId, index) => {
        const cost = 100 + ((offset + index) % 50);
        return [
          {
            workspaceId,
            media: "KUAISHOU",
            accountId,
            ds: "2026-08-18",
            resource: "account_offline" as const,
            source: "offline" as const,
            requestParams: { synthetic: true },
            payload: {
              account_id: accountId,
              cost_api: cost,
              exp_pv_api: 1_000,
              clk_api: 80,
              income: 0,
              wake_uv: 40,
              aac_ptt_uv: 20,
            },
            fetchedByUserId: null,
          },
          {
            workspaceId,
            media: "KUAISHOU",
            accountId,
            ds: "2026-08-18",
            resource: "account_realtime" as const,
            source: "realtime" as const,
            requestParams: { synthetic: true },
            payload: {
              account_id: accountId,
              account_conversion: 12,
              account_real_conversion: 10,
              account_budget: 500,
            },
            fetchedByUserId: null,
          },
        ];
      }),
    );
  }
}

async function runCanonical(pool: Pool, workspaceId: string, chunkSize: number) {
  const raw = new RawMetricsRepository(pool);
  const metrics = new MetricsRepository(pool);
  const started = performance.now();
  await createCanonicalHandler({
    store: {
      loadMergeInputs: raw.loadMergeInputs.bind(raw),
      loadEffectiveSettingsBatch: metrics.loadEffectiveSettingsBatch.bind(metrics),
      loadHistoricalSpendBatch: metrics.loadHistoricalSpendBatch.bind(metrics),
      upsertCanonicalBatch: metrics.upsertCanonicalBatch.bind(metrics),
    },
    runs: {
      startRun: async () => 1,
      finishRun: async () => undefined,
      failRun: async () => undefined,
    },
    jobs: { enqueue: async () => "synthetic-quality" },
    chunkSize,
  })(canonicalJob(workspaceId));
  return performance.now() - started;
}

function canonicalJob(workspaceId: string): JobRecord {
  return {
    id: randomUUID(),
    workspaceId,
    jobType: "canonical_merge",
    payload: {
      workspaceId,
      dateFrom: "2026-08-18",
      dateTo: "2026-08-18",
      reportDate: "2026-08-19",
    },
    priority: 5,
    credentialOwnerUserId: null,
    status: "leased",
    leaseUntil: null,
    leaseToken: randomUUID(),
    attempts: 1,
    maxAttempts: 3,
    runAfter: new Date(0),
  };
}

async function explainFixture(
  pool: Pool,
  workspaceId: string,
  accountIds: readonly string[],
): Promise<QueryPlanSummary[]> {
  const sampleIds = accountIds.slice(0, 250);
  const queries = [
    {
      name: "accounts_workspace_batch",
      text: `SELECT account_id, media FROM accounts
             WHERE workspace_id = $1 AND account_id = ANY($2::text[])`,
      values: [workspaceId, sampleIds],
    },
    {
      name: "canonical_workspace_date",
      text: `SELECT account_id, cost FROM account_metrics_daily
             WHERE workspace_id = $1 AND ds = '2026-08-18'::date`,
      values: [workspaceId],
    },
    {
      name: "raw_latest_merge_input",
      text: `SELECT DISTINCT ON (workspace_id, account_id, ds, resource)
               workspace_id, account_id, ds, resource
             FROM metrics_raw
             WHERE workspace_id = $1 AND ds = '2026-08-18'::date
               AND resource IN ('account_offline', 'account_realtime')
             ORDER BY workspace_id, account_id, ds, resource, fetched_at DESC, id DESC`,
      values: [workspaceId],
    },
  ];
  const plans: QueryPlanSummary[] = [];
  for (const query of queries) {
    const result = await pool.query<{
      "QUERY PLAN": [{ Plan: Record<string, unknown>; "Execution Time": number }];
    }>(
      `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${query.text}`,
      query.values,
    );
    plans.push(summarizePlan(query.name, result.rows[0]));
  }
  return plans;
}

function summarizePlan(
  name: string,
  row:
    | { "QUERY PLAN": [{ Plan: Record<string, unknown>; "Execution Time": number }] }
    | undefined,
): QueryPlanSummary {
  const root = row?.["QUERY PLAN"]?.[0];
  const plan = root?.Plan ?? {};
  return {
    name,
    nodeType: String(plan["Node Type"] ?? "unknown"),
    executionTimeMs: round(Number(root?.["Execution Time"] ?? 0)),
    sharedHitBlocks: Number(plan["Shared Hit Blocks"] ?? 0),
    sharedReadBlocks: Number(plan["Shared Read Blocks"] ?? 0),
  };
}

async function cleanupFixture(pool: Pool, workspaceId: string): Promise<void> {
  await pool.query("DELETE FROM account_metrics_daily WHERE workspace_id = $1", [workspaceId]);
  await pool.query("DELETE FROM metrics_raw WHERE workspace_id = $1", [workspaceId]);
  await pool.query("DELETE FROM assessment_price_history WHERE workspace_id = $1", [workspaceId]);
  await pool.query("DELETE FROM task_accounts WHERE workspace_id = $1", [workspaceId]);
  await pool.query("DELETE FROM channel_coefficients WHERE workspace_id = $1", [workspaceId]);
  await pool.query("DELETE FROM accounts WHERE workspace_id = $1", [workspaceId]);
  await pool.query("DELETE FROM tasks WHERE workspace_id = $1", [workspaceId]);
  await pool.query("DELETE FROM workspaces WHERE id = $1", [workspaceId]);
}

function round(value: number): number {
  return Number(value.toFixed(3));
}
