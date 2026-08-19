/**
 * B1b PostgreSQL smoke fixture. All accounts, identifiers and metrics are synthetic.
 */
import {
  BackfillRepository,
  DataQualityRepository,
  EtlRunRepository,
  JobRepository,
  MetricsRepository,
  OutboundMessageRepository,
  RawMetricsRepository,
  createPool,
  runMigrations,
} from "../packages/db/src/index.ts";
import { createCanonicalHandler } from "../apps/worker/src/etl/canonical-handler.ts";
import { JobConsumer } from "../apps/worker/src/jobs/consumer.ts";
import { deterministicJobId } from "../apps/worker/src/jobs/deterministic-id.ts";
import { JOB_PRIORITY } from "../apps/worker/src/jobs/priorities.ts";
import { createDataQualityHandler } from "../apps/worker/src/quality/check-handler.ts";

const databaseUrl =
  process.env.TEST_DATABASE_URL ?? "postgres://ka:ka@127.0.0.1:55432/ka";
const workspaceId = "b1b00000-0000-4000-8000-000000000001";
const userId = "b1b00000-0000-4000-8000-000000000002";
const dateFrom = "2026-05-21";
const dateTo = "2026-08-18";
const reportDate = "2026-08-19";

function inclusiveDates(from: string, to: string): string[] {
  const start = new Date(`${from}T00:00:00.000Z`);
  const end = new Date(`${to}T00:00:00.000Z`);
  const dates: string[] = [];
  for (const cursor = new Date(start); cursor <= end; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    dates.push(cursor.toISOString().slice(0, 10));
  }
  return dates;
}

function assertEqual(actual: number | string | null, expected: number | string, label: string): void {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${expected}, received ${String(actual)}`);
  }
}

async function main(): Promise<void> {
  const pool = createPool(databaseUrl, { max: 4 });
  try {
  await runMigrations({ databaseUrl });
  for (const month of ["2026-05-01", "2026-06-01", "2026-07-01", "2026-08-01"]) {
    await pool.query("SELECT ensure_monthly_metric_partitions($1::date)", [month]);
  }

  await pool.query("DELETE FROM outbound_messages WHERE workspace_id = $1", [workspaceId]);
  await pool.query("DELETE FROM data_quality_checks WHERE workspace_id = $1", [workspaceId]);
  await pool.query("DELETE FROM etl_runs WHERE workspace_id = $1", [workspaceId]);
  await pool.query("DELETE FROM jobs WHERE workspace_id = $1", [workspaceId]);
  await pool.query("DELETE FROM backfill_jobs WHERE workspace_id = $1", [workspaceId]);
  await pool.query("DELETE FROM metrics_raw WHERE workspace_id = $1", [workspaceId]);
  await pool.query("DELETE FROM account_metrics_daily WHERE workspace_id = $1", [workspaceId]);
  await pool.query("DELETE FROM assessment_price_history WHERE workspace_id = $1", [workspaceId]);
  await pool.query("DELETE FROM task_accounts WHERE workspace_id = $1", [workspaceId]);
  await pool.query("DELETE FROM tasks WHERE workspace_id = $1", [workspaceId]);
  await pool.query("DELETE FROM channel_coefficients WHERE workspace_id = $1", [workspaceId]);
  await pool.query("DELETE FROM accounts WHERE workspace_id = $1", [workspaceId]);
  await pool.query("DELETE FROM users WHERE workspace_id = $1", [workspaceId]);
  await pool.query("DELETE FROM workspaces WHERE id = $1", [workspaceId]);

  await pool.query("INSERT INTO workspaces (id, name) VALUES ($1, 'B1b synthetic smoke')", [
    workspaceId,
  ]);
  await pool.query(
    "INSERT INTO users (id, workspace_id, name) VALUES ($1, $2, 'Synthetic operator')",
    [userId, workspaceId],
  );
  await pool.query(
    "INSERT INTO tasks (workspace_id, task_id, task_name) VALUES ($1, 'task-smoke', 'Synthetic task')",
    [workspaceId],
  );
  await pool.query(
    `INSERT INTO channel_coefficients (workspace_id, media, coefficient, effective_date)
     VALUES ($1, 'KUAISHOU', 1, $2::date)`,
    [workspaceId, dateFrom],
  );
  await pool.query(
    `INSERT INTO assessment_price_history (workspace_id, task_id, price, effective_date)
     VALUES ($1, 'task-smoke', 100, $2::date)`,
    [workspaceId, dateFrom],
  );

  const accountIds = Array.from({ length: 10 }, (_, index) => `mock-account-${index + 1}`);
  for (const accountId of accountIds) {
    await pool.query(
      `INSERT INTO accounts (
         workspace_id, account_id, account_name, media, owner_user_id, lifecycle_stage, status
       ) VALUES ($1, $2, $3, 'KUAISHOU', $4, 'stable', 'active')`,
      [workspaceId, accountId, `Synthetic ${accountId}`, userId],
    );
    await pool.query(
      `INSERT INTO task_accounts (workspace_id, task_id, account_id, valid_from)
       VALUES ($1, 'task-smoke', $2, $3::date)`,
      [workspaceId, accountId, dateFrom],
    );
  }

  const dates = inclusiveDates(dateFrom, dateTo);
  assertEqual(dates.length, 90, "fixture day count");
  const raw = new RawMetricsRepository(pool);
  await raw.appendRaw(
    dates.flatMap((ds, dayIndex) =>
      accountIds.map((accountId, accountIndex) => ({
        workspaceId,
        accountId,
        ds,
        resource: "account_offline" as const,
        source: "offline" as const,
        requestParams: { fixture: "b1b-90d", beginDate: ds, endDate: ds },
        payload: {
          account_id: accountId,
          ds: ds.replaceAll("-", ""),
          cost_api: 100 + accountIndex + (dayIndex % 3),
          exp_pv_api: 10_000 + accountIndex,
          clk_api: 500 + accountIndex,
          income: 0,
          wake_uv: 200,
          aac_ptt_uv: 100,
        },
        fetchedByUserId: userId,
      })),
    ),
  );
  console.log(`[fixture] synthetic raw rows=900 accounts=10 days=${dates.length}`);

  const backfills = new BackfillRepository(pool);
  const backfillId = await backfills.create({ workspaceId, userId, dateFrom, dateTo });
  for (const ds of dates) {
    await pool.query(
      `INSERT INTO jobs (
         id, workspace_id, job_type, payload, priority, credential_owner_user_id,
         status, attempts, max_attempts, finished_at
       ) VALUES ($1, $2, 'backfill_day', $3::jsonb, $4, $5, 'done', 1, 3, now())`,
      [
        deterministicJobId(`backfill:${backfillId}:${ds}`),
        workspaceId,
        { workspaceId, backfillId, ds, accountIds },
        JOB_PRIORITY.BACKFILL,
        userId,
      ],
    );
  }

  const jobs = new JobRepository(pool);
  for (const ds of dates) {
    await jobs.enqueue({
      id: deterministicJobId(`canonical:${backfillId}:${ds}`),
      workspaceId,
      jobType: "canonical_merge",
      payload: { workspaceId, backfillId, dateFrom: ds, dateTo: ds, reportDate },
      priority: JOB_PRIORITY.BACKFILL,
      credentialOwnerUserId: userId,
      maxAttempts: 3,
    });
  }
  console.log("[queue] canonical jobs=90 quality jobs=deterministic downstream");

  const etlRuns = new EtlRunRepository(pool);
  const metrics = new MetricsRepository(pool);
  const quality = new DataQualityRepository(pool);
  const outbound = new OutboundMessageRepository(pool);
  const canonicalHandler = createCanonicalHandler({
    store: {
      loadMergeInputs: raw.loadMergeInputs.bind(raw),
      loadEffectiveSettings: metrics.loadEffectiveSettings.bind(metrics),
      loadHistoricalSpend: metrics.loadHistoricalSpend.bind(metrics),
      upsertCanonical: metrics.upsertCanonical.bind(metrics),
    },
    runs: etlRuns,
    jobs,
  });
  const qualityHandler = createDataQualityHandler({ quality, runs: etlRuns, outbound });
  const consumer = new JobConsumer(
    jobs,
    { canonical_merge: canonicalHandler, data_quality_check: qualityHandler },
    { leaseSeconds: 60 },
  );

  let processed = 0;
  while (await consumer.processOnce()) {
    processed += 1;
    if (processed % 30 === 0) {
      console.log(`[worker] processed=${processed}/180`);
    }
    if (processed > 180) {
      throw new Error("worker processed more jobs than expected");
    }
  }
  assertEqual(processed, 180, "processed job count");

  const progress = await backfills.refreshProgress(workspaceId, backfillId);
  const counts = await pool.query<{
    canonical_count: string;
    quality_count: string;
    quality_failed: string;
    bad_jobs: string;
    outbound_count: string;
    run_count: string;
  }>(
    `SELECT
       (SELECT count(*) FROM account_metrics_daily WHERE workspace_id = $1) AS canonical_count,
       (SELECT count(*) FROM data_quality_checks WHERE workspace_id = $1) AS quality_count,
       (SELECT count(*) FROM data_quality_checks WHERE workspace_id = $1 AND NOT passed) AS quality_failed,
       (SELECT count(*) FROM jobs WHERE workspace_id = $1 AND status IN ('failed', 'blocked_auth')) AS bad_jobs,
       (SELECT count(*) FROM outbound_messages WHERE workspace_id = $1) AS outbound_count,
       (SELECT count(*) FROM etl_runs WHERE workspace_id = $1 AND status = 'done') AS run_count`,
    [workspaceId],
  );
  const row = counts.rows[0]!;
  assertEqual(row.canonical_count, "900", "canonical rows");
  assertEqual(row.quality_count, "270", "quality checks");
  assertEqual(row.quality_failed, "0", "failed quality checks");
  assertEqual(row.bad_jobs, "0", "failed or blocked jobs");
  assertEqual(row.outbound_count, "0", "quality failure notifications");
  assertEqual(row.run_count, "180", "completed ETL runs");
  assertEqual(progress.status, "done", "backfill status");
  assertEqual(progress.cursorDate, dateTo, "backfill cursor");

  console.log(`[result] canonical=${row.canonical_count} quality=${row.quality_count} passed=270/270`);
  console.log(`[result] jobs_failed=${row.bad_jobs} etl_runs_done=${row.run_count} outbound=${row.outbound_count}`);
  console.log(`[result] backfill=${progress.status} cursor=${progress.cursorDate}`);
  console.log("B1b 10-account x 90-day PostgreSQL smoke: PASS");
  } finally {
    await pool.end();
  }
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
