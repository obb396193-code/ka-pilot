import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Pool } from "pg";

import { runMigrations } from "../src/migrate.js";
import { MetricsRepository } from "../src/metrics-repository.js";

const databaseUrl =
  process.env.TEST_DATABASE_URL ?? "postgres://ka:ka@127.0.0.1:55432/ka";

describe("MetricsRepository", () => {
  const pool = new Pool({ connectionString: databaseUrl });
  const repository = new MetricsRepository(pool);
  let workspaceId: string;

  beforeAll(async () => {
    await runMigrations({ databaseUrl });
  });

  beforeEach(async () => {
    await pool.query("DELETE FROM ad_metrics_hourly");
    await pool.query("DELETE FROM ad_entities");
    await pool.query("DELETE FROM metrics_raw");
    await pool.query("DELETE FROM account_metrics_daily");
    await pool.query("DELETE FROM account_balance");
    await pool.query("DELETE FROM assessment_price_history");
    await pool.query("DELETE FROM task_accounts");
    await pool.query("DELETE FROM changeset_items");
    await pool.query("DELETE FROM changesets");
    await pool.query("DELETE FROM work_items");
    await pool.query("DELETE FROM account_access_grants");
    await pool.query("DELETE FROM accounts");
    await pool.query("DELETE FROM tasks");
    await pool.query("DELETE FROM channel_coefficients");
    const workspace = await pool.query<{ id: string }>(
      "INSERT INTO workspaces (name) VALUES ('metrics-test') RETURNING id",
    );
    workspaceId = workspace.rows[0]!.id;
    await pool.query(
      "INSERT INTO accounts (account_id, workspace_id, media) VALUES ('a-1', $1, 'KUAISHOU')",
      [workspaceId],
    );
    await pool.query(
      "INSERT INTO tasks (task_id, workspace_id) VALUES ('t-1', $1)",
      [workspaceId],
    );
    await pool.query(
      `INSERT INTO task_accounts (workspace_id, task_id, media, account_id, valid_from)
       VALUES ($1, 't-1', 'KUAISHOU', 'a-1', '2026-01-01')`,
      [workspaceId],
    );
  });

  it("loads settings effective on the metric date", async () => {
    await pool.query(
      `INSERT INTO channel_coefficients (workspace_id, media, coefficient, effective_date)
       VALUES ($1, 'KUAISHOU', 1.5, '2026-01-01'), ($1, 'KUAISHOU', 2, '2026-08-01')`,
      [workspaceId],
    );
    await pool.query(
      `INSERT INTO assessment_price_history (workspace_id, task_id, price, effective_date)
       VALUES ($1, 't-1', 9, '2026-01-01'), ($1, 't-1', 11, '2026-08-01')`,
      [workspaceId],
    );

    await expect(
      repository.loadEffectiveSettingsBatch(workspaceId, [
        { media: "KUAISHOU", accountId: "a-1", ds: "2026-08-18" },
      ]),
    ).resolves.toEqual([
      {
        workspaceId,
        media: "KUAISHOU",
        accountId: "a-1",
        ds: "2026-08-18",
        channelCoefficient: 2,
        assessmentPrice: 11,
      },
    ]);
  });

  it("upserts one canonical row idempotently", async () => {
    const record = {
      workspaceId,
      media: "KUAISHOU",
      accountId: "a-1",
      ds: "2026-08-18",
      cost: 100,
      exposure: 1_000,
      click: 80,
      conversion: 12,
      realConversion: 10,
      realCpa: 10,
      cashCost: 50,
      cashCpa: 5,
      costSpace: 60,
      gap: 0.2,
      budget: 500,
      budgetUsageRate: 0.2,
      deductionRate: 0.1,
      mainAdCostProportion: 0.7,
      assessmentPriceSnapshot: 11,
      wakeUv: 40,
      potentialUv: 20,
      fieldSources: { cost: "offline", realCpa: "derived" },
      dataAnomaly: false,
    };
    await repository.upsertCanonicalBatch([record]);
    await repository.upsertCanonicalBatch([{ ...record, cost: 101 }]);

    const result = await pool.query<{ count: string; cost: string }>(
      `SELECT count(*)::text AS count, max(cost)::text AS cost
       FROM account_metrics_daily WHERE workspace_id = $1 AND account_id = 'a-1'`,
      [workspaceId],
    );
    expect(result.rows[0]).toEqual({ count: "1", cost: "101" });
  });

  it("applies the history limit after excluding zero-spend days", async () => {
    await pool.query(
      `INSERT INTO account_metrics_daily (workspace_id, media, account_id, ds, cost)
       SELECT $1, 'KUAISHOU', 'a-1', day::date, 0
       FROM generate_series('2026-08-04'::date, '2026-08-17'::date, interval '1 day') AS day`,
      [workspaceId],
    );
    await pool.query(
      `INSERT INTO account_metrics_daily (workspace_id, media, account_id, ds, cost)
       VALUES ($1, 'KUAISHOU', 'a-1', '2026-08-03', 100)`,
      [workspaceId],
    );

    await expect(
      repository.loadHistoricalSpendBatch(
        workspaceId,
        [{ media: "KUAISHOU", accountId: "a-1", ds: "2026-08-18" }],
        14,
      ),
    ).resolves.toEqual([
      { workspaceId, media: "KUAISHOU", accountId: "a-1", ds: "2026-08-18", history: [100] },
    ]);
  });

  it("loads multiple account/date settings and histories without crossing workspaces", async () => {
    await pool.query(
      "INSERT INTO accounts (account_id, workspace_id, media) VALUES ('a-2', $1, 'KUAISHOU')",
      [workspaceId],
    );
    await pool.query(
      `INSERT INTO channel_coefficients (workspace_id, media, coefficient, effective_date)
       VALUES ($1, 'KUAISHOU', 2, '2026-08-01')`,
      [workspaceId],
    );
    await pool.query(
      `INSERT INTO account_metrics_daily (workspace_id, media, account_id, ds, cost)
       VALUES ($1, 'KUAISHOU', 'a-1', '2026-08-16', 10),
              ($1, 'KUAISHOU', 'a-2', '2026-08-17', 20)`,
      [workspaceId],
    );
    const keys = [
      { media: "KUAISHOU", accountId: "a-2", ds: "2026-08-18" },
      { media: "KUAISHOU", accountId: "a-1", ds: "2026-08-17" },
    ];

    const settings = await repository.loadEffectiveSettingsBatch(workspaceId, keys);
    const histories = await repository.loadHistoricalSpendBatch(workspaceId, keys);

    expect(settings).toHaveLength(2);
    expect(settings.every((row) => row.workspaceId === workspaceId)).toBe(true);
    expect(histories).toEqual([
      { workspaceId, media: "KUAISHOU", accountId: "a-1", ds: "2026-08-17", history: [10] },
      { workspaceId, media: "KUAISHOU", accountId: "a-2", ds: "2026-08-18", history: [20] },
    ]);
  });

  it("fails closed for missing or duplicate batch lookup keys", async () => {
    await expect(
      repository.loadEffectiveSettingsBatch(workspaceId, [
        { media: "KUAISHOU", accountId: "missing", ds: "2026-08-18" },
      ]),
    ).rejects.toThrow("did not return every requested");

    await expect(
      repository.loadHistoricalSpendBatch(workspaceId, [
        { media: "KUAISHOU", accountId: "a-1", ds: "2026-08-18" },
        { media: "KUAISHOU", accountId: "a-1", ds: "2026-08-18" },
      ]),
    ).rejects.toThrow("duplicate account/date");
  });
});
