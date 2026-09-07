import { randomUUID } from "node:crypto";

import {
  DataQualityRepository,
  EtlRunRepository,
  JobRepository,
  MetricsRepository,
  OutboundMessageRepository,
  RawMetricsRepository,
  runMigrations,
  SemanticQueryRepository,
  SemanticReportFactsSource,
  WorkItemRepository,
  type JobRecord,
} from "@ka/db";
import { parseReportExecutionPlan } from "@ka/domain";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";

import { createCanonicalHandler } from "../src/etl/canonical-handler.js";
import { createFullEtlHandler } from "../src/etl/full-handler.js";
import type { QihangQueryPort } from "../src/etl/types.js";
import { createDataQualityHandler } from "../src/quality/check-handler.js";
import { builtInRuleEvaluator, RuleScanHandler } from "../src/rules/rule-scan-handler.js";
import type {
  AlertDelivery,
  AlertSink,
  RuleCandidateProvider,
  WorkItemSink,
} from "../src/rules/types.js";

const databaseUrl =
  process.env.TEST_DATABASE_URL ?? "postgres://ka:ka@127.0.0.1:55432/ka";

function job(input: {
  id: string;
  workspaceId: string;
  jobType: string;
  payload: Record<string, unknown>;
}): JobRecord {
  return {
    ...input,
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

function fakeQihang(
  accountId: string,
  accountName = "合成账户",
  status = "active",
): QihangQueryPort {
  return {
    async query(query) {
      if (query.resource === "account") {
        return {
          rows: [{ account_id: accountId, account_name: accountName, status }],
          pagination: { totalNum: 1, pageNum: 1, pageSize: 50 },
          envelope: { successful: true },
        };
      }
      if (query.resource === "account_offline") {
        return {
          rows: [
            {
              account_id: accountId,
              ds: "20260818",
              cost_api: 5_000,
              exp_pv_api: 10_000,
              clk_api: 800,
              income: 0,
              wake_uv: 400,
              aac_ptt_uv: 200,
            },
          ],
          envelope: { successful: true },
        };
      }
      if (query.resource === "account_realtime") {
        const historical = query.ds === "2026-08-18";
        return {
          rows: [
            {
              account_id: accountId,
              ds: historical ? "20260818" : "20260819",
              account_cost: historical ? 5_100 : 100,
              account_exposure: historical ? 10_100 : 1_000,
              account_click: historical ? 810 : 80,
              account_conversion: historical ? 60 : 2,
              account_real_conversion: historical ? 50 : 1,
              account_budget: 10_000,
              account_budget_usage_rate: historical ? 0.5 : 0.01,
            },
          ],
          envelope: { successful: true },
        };
      }
      throw new Error(`Unexpected fake Qihang resource: ${query.resource}`);
    },
  };
}

async function storedJob(
  pool: Pool,
  workspaceId: string,
  jobType: string,
): Promise<JobRecord> {
  const result = await pool.query<{
    id: string;
    payload: Record<string, unknown>;
    priority: number;
    credential_owner_user_id: string | null;
  }>(
    `SELECT id, payload, priority, credential_owner_user_id
     FROM jobs
     WHERE workspace_id = $1 AND job_type = $2
     ORDER BY created_at DESC, id DESC
     LIMIT 1`,
    [workspaceId, jobType],
  );
  const row = result.rows[0];
  if (!row) throw new Error(`Missing ${jobType} job`);
  return {
    id: row.id,
    workspaceId,
    jobType,
    payload: row.payload,
    priority: row.priority,
    credentialOwnerUserId: row.credential_owner_user_id,
    status: "leased",
    leaseUntil: null,
    leaseToken: randomUUID(),
    attempts: 1,
    maxAttempts: 3,
    runAfter: new Date(0),
  };
}

class MemoryAlerts implements AlertSink {
  readonly deliveries = new Map<string, AlertDelivery>();

  async enqueue(input: AlertDelivery): Promise<"enqueued" | "duplicate"> {
    if (this.deliveries.has(input.deliveryKey)) return "duplicate";
    this.deliveries.set(input.deliveryKey, input);
    return "enqueued";
  }
}

describe("real PostgreSQL data pipeline", () => {
  const pool = new Pool({ connectionString: databaseUrl });

  beforeAll(async () => {
    await runMigrations({ databaseUrl });
  });

  afterAll(async () => {
    await pool.end();
  });

  it("connects fake Qihang to canonical, quality, semantic facts, rules and work items", async () => {
    const suffix = randomUUID();
    const accountId = `synthetic-${suffix}`;
    const taskId = `task-${suffix}`;
    const workspace = await pool.query<{ id: string }>(
      "INSERT INTO workspaces (name) VALUES ($1) RETURNING id",
      [`pipeline-${suffix}`],
    );
    const other = await pool.query<{ id: string }>(
      "INSERT INTO workspaces (name) VALUES ($1) RETURNING id",
      [`pipeline-other-${suffix}`],
    );
    const workspaceId = workspace.rows[0]!.id;
    const otherWorkspaceId = other.rows[0]!.id;
    await pool.query(
      `INSERT INTO accounts (
         workspace_id, account_id, account_name, media, lifecycle_stage, status
       ) VALUES
         ($2, $3, '隔离账户', 'KUAISHOU', 'scaling', 'active'),
         ($1, $3, '跨媒体隔离账户', 'TENCENT', 'scaling', 'active')`,
      [workspaceId, otherWorkspaceId, accountId],
    );
    await pool.query(
      `INSERT INTO tasks (workspace_id, task_id, task_name, biz_name)
       VALUES ($1, $2, '合成任务', '合成业务')`,
      [workspaceId, taskId],
    );
    await pool.query(
      `INSERT INTO channel_coefficients (
         workspace_id, media, coefficient, effective_date
       ) VALUES ($1, 'KUAISHOU', 2, '2026-08-01')`,
      [workspaceId],
    );
    await pool.query(
      `INSERT INTO assessment_price_history (
         workspace_id, task_id, price, effective_date
       ) VALUES ($1, $2, 10, '2026-08-01')`,
      [workspaceId, taskId],
    );
    await pool.query(
      `INSERT INTO account_metrics_daily (
         workspace_id, media, account_id, ds, cost, real_conversion
       ) VALUES ($1, 'KUAISHOU', $2, '2026-08-18', 9999, 1)`,
      [otherWorkspaceId, accountId],
    );

    const raw = new RawMetricsRepository(pool);
    const runs = new EtlRunRepository(pool);
    const jobs = new JobRepository(pool);
    const metrics = new MetricsRepository(pool);
    const fullJob = job({
      id: randomUUID(),
      workspaceId,
      jobType: "etl_full",
      payload: {
        workspaceId,
        userId: "synthetic-user",
        media: "KUAISHOU",
        accountIds: [accountId],
        fetchedByUserId: null,
        asOfDate: "2026-08-19",
        pageSize: 50,
        realtimeDays: 2,
      },
    });
    const etlStore = {
      startRun: runs.startRun.bind(runs),
      appendRaw: raw.appendRaw.bind(raw),
      syncAccountMetadataAndRaw: raw.syncAccountMetadataAndRaw.bind(raw),
      recordObservation: (runId: number, observation: object) =>
        runs.recordObservation(runId, { ...observation }),
      finishRun: runs.finishRun.bind(runs),
      failRun: runs.failRun.bind(runs),
    };

    await createFullEtlHandler({ qihang: fakeQihang(accountId), store: etlStore, jobs })(
      fullJob,
    );
    const fullRun = await pool.query<{ workspace_id: string | null }>(
      "SELECT workspace_id FROM etl_runs WHERE job_id = $1 AND run_kind = 'full'",
      [fullJob.id],
    );
    expect(fullRun.rows[0]?.workspace_id).toBe(workspaceId);
    expect(
      await pool.query(
        "SELECT 1 FROM metrics_raw WHERE workspace_id = $1 AND account_id = $2",
        [workspaceId, accountId],
      ),
    ).toHaveProperty("rowCount", 4);

    const synchronizedAccount = await pool.query<{
      account_name: string | null;
      status: string | null;
      lifecycle_stage: string;
      is_starred: boolean;
      tags: string[] | null;
    }>(
      `SELECT account_name, status, lifecycle_stage, is_starred, tags
       FROM accounts
       WHERE workspace_id = $1 AND media = 'KUAISHOU' AND account_id = $2`,
      [workspaceId, accountId],
    );
    expect(synchronizedAccount.rows).toEqual([{
      account_name: "合成账户",
      status: "active",
      lifecycle_stage: "unknown",
      is_starred: false,
      tags: null,
    }]);
    await pool.query(
      `UPDATE accounts
       SET lifecycle_stage = 'scaling', is_starred = true, tags = ARRAY['protected']::text[]
       WHERE workspace_id = $1 AND media = 'KUAISHOU' AND account_id = $2`,
      [workspaceId, accountId],
    );

    const replayJob = job({
      id: randomUUID(),
      workspaceId,
      jobType: "etl_full",
      payload: fullJob.payload,
    });
    await createFullEtlHandler({
      qihang: fakeQihang(accountId, "合成账户-更新", "paused"),
      store: etlStore,
      jobs,
    })(replayJob);
    const replayedAccounts = await pool.query<{
      workspace_id: string;
      media: string;
      account_name: string | null;
      status: string | null;
      lifecycle_stage: string;
      is_starred: boolean;
      tags: string[];
    }>(
      `SELECT workspace_id, media, account_name, status, lifecycle_stage, is_starred, tags
       FROM accounts
       WHERE account_id = $1
       ORDER BY workspace_id, media`,
      [accountId],
    );
    expect(replayedAccounts.rows).toHaveLength(3);
    expect(replayedAccounts.rows).toContainEqual({
      workspace_id: workspaceId,
      media: "KUAISHOU",
      account_name: "合成账户-更新",
      status: "paused",
      lifecycle_stage: "scaling",
      is_starred: true,
      tags: ["protected"],
    });
    expect(replayedAccounts.rows).toContainEqual(expect.objectContaining({
      workspace_id: workspaceId,
      media: "TENCENT",
      account_name: "跨媒体隔离账户",
    }));
    expect(replayedAccounts.rows).toContainEqual(expect.objectContaining({
      workspace_id: otherWorkspaceId,
      media: "KUAISHOU",
      account_name: "隔离账户",
    }));
    expect(
      await pool.query(
        `SELECT 1 FROM metrics_raw
         WHERE workspace_id = $1 AND media = 'KUAISHOU' AND account_id = $2`,
        [workspaceId, accountId],
      ),
    ).toHaveProperty("rowCount", 8);

    await pool.query(
      `INSERT INTO task_accounts (workspace_id, task_id, media, account_id, valid_from)
       VALUES ($1, $2, 'KUAISHOU', $3, '2026-08-01')`,
      [workspaceId, taskId, accountId],
    );

    const canonicalJob = await storedJob(pool, workspaceId, "canonical_merge");
    await createCanonicalHandler({
      store: {
        loadMergeInputs: raw.loadMergeInputs.bind(raw),
        loadEffectiveSettingsBatch: metrics.loadEffectiveSettingsBatch.bind(metrics),
        loadHistoricalSpendBatch: metrics.loadHistoricalSpendBatch.bind(metrics),
        upsertCanonicalBatch: metrics.upsertCanonicalBatch.bind(metrics),
      },
      runs,
      jobs,
      chunkSize: 1,
    })(canonicalJob);

    const canonicalRows = await pool.query<{
      ds: string;
      cost: string;
      real_conversion: string;
      assessment_price_snapshot: string;
    }>(
      `SELECT to_char(ds, 'YYYY-MM-DD') AS ds, cost::text, real_conversion::text,
              assessment_price_snapshot::text
       FROM account_metrics_daily
       WHERE workspace_id = $1 AND account_id = $2
       ORDER BY ds`,
      [workspaceId, accountId],
    );
    expect(canonicalRows.rows).toEqual([
      {
        ds: "2026-08-18",
        cost: "5000",
        real_conversion: "50",
        assessment_price_snapshot: "10",
      },
      {
        ds: "2026-08-19",
        cost: "100",
        real_conversion: "1",
        assessment_price_snapshot: "10",
      },
    ]);

    const qualityJob = await storedJob(pool, workspaceId, "data_quality_check");
    await createDataQualityHandler({
      quality: new DataQualityRepository(pool),
      runs,
      outbound: new OutboundMessageRepository(pool),
    })(qualityJob);
    const qualityCount = await pool.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM data_quality_checks WHERE workspace_id = $1",
      [workspaceId],
    );
    expect(qualityCount.rows[0]?.count).toBe("6");
    const reconciliationChecks = await pool.query<{ passed: boolean }>(
      `SELECT passed FROM data_quality_checks
       WHERE workspace_id = $1 AND check_type = 'total_reconciliation'
       ORDER BY ds`,
      [workspaceId],
    );
    expect(reconciliationChecks.rows).toEqual([{ passed: true }, { passed: true }]);

    const semantic = new SemanticQueryRepository(pool);
    const scope = {
      workspaceId,
      dateFrom: "2026-08-18",
      dateTo: "2026-08-19",
      filters: { accountScopes: [{ media: "KUAISHOU", accountId }] },
    };
    const summary = await semantic.querySummary(scope);
    expect(summary.cost).toBe(5_100);
    expect(summary.realConversion).toBe(51);
    // Same account ID in the other media has no facts; never silently drop that missing member.
    const mixed = await semantic.querySummary({ ...scope, filters: { accountId } });
    expect(mixed.cost).toBeNull();
    expect(mixed.accountCount).toBe(1);
    const missingDay = await semantic.querySummary({ ...scope, workspaceId: otherWorkspaceId });
    expect(missingDay.cost).toBeNull();
    const isolated = await semantic.querySummary({ ...scope, workspaceId: otherWorkspaceId, dateTo: "2026-08-18" });
    expect(isolated.cost).toBe(9_999);

    const rule = await pool.query<{ id: string }>(
      `INSERT INTO alert_rules (workspace_id, name, rule_type, enabled)
       VALUES ($1, '合成超成本规则', 'over_cost_ramp', true)
       RETURNING id`,
      [workspaceId],
    );
    const workItemRepository = new WorkItemRepository(pool);
    const workItems: WorkItemSink = {
      async createOrMerge(input) {
        const { taskId: candidateTaskId, ...required } = input;
        const result = await workItemRepository.createOrMergeAlert({
          ...required,
          ...(candidateTaskId === undefined ? {} : { taskId: candidateTaskId }),
        });
        return {
          disposition: result.disposition,
          workItemId: result.workItem.id,
        };
      },
    };
    const candidateProvider: RuleCandidateProvider = {
      async listCandidates(input) {
        const table = await semantic.queryTable({
          workspaceId: input.workspaceId,
          dateFrom: "2026-08-18",
          dateTo: "2026-08-18",
          filters: { accountScopes: [{ media: "KUAISHOU", accountId }] },
        });
        return table.rows.map((row) => ({
          candidateId: `${row.accountId}:${row.ds}`,
          workspaceId: row.workspaceId,
          media: row.media,
          accountId: row.accountId,
          taskId,
          ruleId: rule.rows[0]!.id,
          title: "合成账户超成本",
          evidenceSnapshot: { ds: row.ds, cost: row.cost, cashCost: row.cashCost, realCpa: row.realCpa },
          // Synthetic readiness port for this PG pipeline fixture; not the production health provider.
          readiness: { initialFullDone: true, source: { kind: "offline" as const, dataAsOf: new Date("2026-08-19T08:00Z") },
            requiredMetrics: { cashCost: row.cashCost === null ? "missing" as const : "available" as const,
              realConversion: row.realConversion === null ? "missing" as const : "available" as const,
              assessmentPrice: row.assessmentPriceSnapshot === null ? "missing" as const : "available" as const } },
          isQuietHours: false,
          ruleCode: "over_cost_ramp" as const,
          facts: {
            assessmentPrice: row.assessmentPriceSnapshot,
            cashCost: row.cashCost,
            lifecycleStage: "scaling",
            realConversion: row.realConversion,
          },
        }));
      },
    };
    const alerts = new MemoryAlerts();
    const ruleScan = new RuleScanHandler({
      candidateProvider,
      evaluator: builtInRuleEvaluator,
      workItems,
      alerts,
    });
    const firstScan = await ruleScan.run({
      workspaceId,
      now: new Date("2026-08-19T09:00:00Z"),
    });
    const retryScan = await ruleScan.run({
      workspaceId,
      now: new Date("2026-08-19T09:05:00Z"),
    });
    // Same original synthetic facts: book cost=5000, coefficient /2 => cash=2500.
    // High book CPA must not bypass the cash-spend floor or create occurrences.
    const cashRow = await semantic.queryTable({ workspaceId, dateFrom: "2026-08-18", dateTo: "2026-08-18", filters: { accountScopes: [{ media: "KUAISHOU", accountId }] } });
    expect(cashRow.rows[0]?.cashCost).toBe(2500);
    expect(firstScan).toMatchObject({ matched: 0, created: 0, notMatched: 1 });
    expect(retryScan).toMatchObject({ matched: 0, merged: 0, notMatched: 1 });
    expect(alerts.deliveries).toHaveLength(0);

    const plan = parseReportExecutionPlan({
      version: "b6-internal-v1",
      title: "合成投放报告",
      scope: { dateFrom: "2026-08-18", dateTo: "2026-08-19", filters: { media: "KUAISHOU", accountId } },
      components: [
        { id: "cost", title: "消耗", kind: "kpi", metric: "cost" },
        { id: "trend", title: "趋势", kind: "trend", metric: "realCpa" },
        {
          id: "tasks",
          title: "任务",
          kind: "table",
          dimension: "task",
          metrics: ["cost", "realCpa"],
        },
      ],
    });
    const facts = await new SemanticReportFactsSource(semantic, {
      resolve: async () => "2026-08-19T10:00:00.000Z",
    }).load({ workspaceId, plan });
    expect(facts.summary?.cost).toEqual({ value: 5_100, state: "finite" });
    expect(facts.trend).toHaveLength(2);
    expect(facts.dimensions.task).toEqual([
      expect.objectContaining({
        dimensionKey: taskId,
        metrics: expect.objectContaining({ cost: { value: 5_100, state: "finite" } }),
      }),
    ]);
  });
});
