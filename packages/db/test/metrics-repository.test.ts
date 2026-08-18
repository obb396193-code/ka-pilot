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
    await pool.query("DELETE FROM account_metrics_daily");
    await pool.query("DELETE FROM assessment_price_history");
    await pool.query("DELETE FROM task_accounts");
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
      `INSERT INTO task_accounts (workspace_id, task_id, account_id, valid_from)
       VALUES ($1, 't-1', 'a-1', '2026-01-01')`,
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
      repository.loadEffectiveSettings(workspaceId, "a-1", "2026-08-18"),
    ).resolves.toEqual({ channelCoefficient: 2, assessmentPrice: 11 });
  });

  it("upserts one canonical row idempotently", async () => {
    const record = {
      workspaceId,
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
    await repository.upsertCanonical(record);
    await repository.upsertCanonical({ ...record, cost: 101 });

    const result = await pool.query<{ count: string; cost: string }>(
      `SELECT count(*)::text AS count, max(cost)::text AS cost
       FROM account_metrics_daily WHERE workspace_id = $1 AND account_id = 'a-1'`,
      [workspaceId],
    );
    expect(result.rows[0]).toEqual({ count: "1", cost: "101" });
  });
});
