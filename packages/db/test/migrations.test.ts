import { beforeAll, describe, expect, it } from "vitest";
import { Client } from "pg";

import { runMigrations } from "../src/migrate.js";

const databaseUrl =
  process.env.TEST_DATABASE_URL ?? "postgres://ka:ka@127.0.0.1:55432/ka";

describe("contract migrations", () => {
  beforeAll(async () => {
    const client = new Client({ connectionString: databaseUrl });
    await client.connect();
    await client.query("DROP SCHEMA IF EXISTS public CASCADE");
    await client.query("CREATE SCHEMA public");
    await client.end();
  });

  it("is replayable and creates the core tables and rolling partitions", async () => {
    const first = await runMigrations({ databaseUrl });
    const second = await runMigrations({ databaseUrl });
    expect(first).toHaveLength(2);
    expect(second).toHaveLength(0);

    const client = new Client({ connectionString: databaseUrl });
    await client.connect();
    const tables = await client.query<{ table_name: string }>(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name IN ('jobs', 'metrics_raw', 'account_metrics_daily', 'etl_runs')
      ORDER BY table_name
    `);
    expect(tables.rows.map((row) => row.table_name)).toEqual([
      "account_metrics_daily",
      "etl_runs",
      "jobs",
      "metrics_raw",
    ]);

    const partitions = await client.query<{ count: string }>(`
      SELECT count(*)::text AS count
      FROM pg_inherits
      JOIN pg_class parent ON pg_inherits.inhparent = parent.oid
      WHERE parent.relname IN ('metrics_raw', 'account_metrics_daily', 'ad_metrics_hourly')
    `);
    expect(Number(partitions.rows[0]?.count)).toBeGreaterThanOrEqual(15);
    await client.end();

    await runMigrations({ databaseUrl, direction: "down", count: 2 });
    const replay = await runMigrations({ databaseUrl });
    expect(replay).toHaveLength(2);
  });
});
