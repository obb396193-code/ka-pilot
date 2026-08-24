import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Pool } from "pg";

import { AdHourlyMetricsRepository } from "../src/ad-hourly-metrics-repository.js";
import { runMigrations } from "../src/migrate.js";

const databaseUrl = process.env.TEST_DATABASE_URL ?? "postgres://ka:ka@127.0.0.1:55432/ka";

describe("AdHourlyMetricsRepository", () => {
  const pool = new Pool({ connectionString: databaseUrl });
  const repository = new AdHourlyMetricsRepository(pool);
  let firstWorkspace: string;
  let secondWorkspace: string;

  beforeAll(async () => runMigrations({ databaseUrl }));

  beforeEach(async () => {
    await pool.query("DELETE FROM ad_metrics_hourly");
    const workspaces = await pool.query<{ id: string }>(
      "INSERT INTO workspaces (name) VALUES ('hourly-one'), ('hourly-two') RETURNING id",
    );
    firstWorkspace = workspaces.rows[0]!.id;
    secondWorkspace = workspaces.rows[1]!.id;
    await pool.query(
      `INSERT INTO accounts (workspace_id, media, account_id)
       VALUES ($1, 'KUAISHOU', 'account-1'), ($2, 'KUAISHOU', 'account-1')`,
      [firstWorkspace, secondWorkspace],
    );
  });

  it("upserts one workspace/ad/hour while preserving another workspace", async () => {
    const metric = {
      workspaceId: firstWorkspace,
      media: "KUAISHOU",
      adId: "ad-1",
      accountId: "account-1",
      ds: "2026-08-20",
      hh: 9,
      cost: 10,
      exposure: 100,
      click: 5,
      conversion: 2,
      realConversion: 1,
      bid: 30,
      budget: 500,
    };
    await repository.upsertHourly([metric]);
    await repository.upsertHourly([{ ...metric, cost: 12 }]);
    await repository.upsertHourly([{ ...metric, workspaceId: secondWorkspace, cost: 99 }]);

    const result = await pool.query<{ workspace_id: string; cost: string }>(
      `SELECT workspace_id, cost::text FROM ad_metrics_hourly
       WHERE ad_id = 'ad-1' AND ds = '2026-08-20' AND hh = 9
       ORDER BY workspace_id`,
    );
    expect(result.rows).toEqual(expect.arrayContaining([
      { workspace_id: firstWorkspace, cost: "12" },
      { workspace_id: secondWorkspace, cost: "99" },
    ]));
    expect(result.rows).toHaveLength(2);
  });

  it("rejects duplicate keys and invalid hourly values before querying", async () => {
    const metric = {
      workspaceId: firstWorkspace,
      media: "KUAISHOU",
      adId: "ad-1",
      accountId: "account-1",
      ds: "2026-08-20",
      hh: 9,
      cost: 10,
      exposure: 100,
      click: 5,
      conversion: 2,
      realConversion: 1,
      bid: 30,
      budget: 500,
    };
    await expect(repository.upsertHourly([metric, metric])).rejects.toThrow("duplicate");
    await expect(repository.upsertHourly([{ ...metric, cost: Number.NaN }]))
      .rejects.toThrow("finite nonnegative");
  });
});
