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
    expect(first).toHaveLength(3);
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

    const columns = await client.query<{ table_name: string; column_name: string }>(`
      SELECT table_name, column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND (
          (table_name = 'metrics_raw' AND column_name IN ('resource', 'request_params'))
          OR (
            table_name IN (
              'etl_runs', 'backfill_jobs', 'data_quality_checks',
              'workflow_versions', 'workflow_runs', 'inbound_events'
            )
            AND column_name = 'workspace_id'
          )
        )
      ORDER BY table_name, column_name
    `);
    expect(columns.rows).toEqual([
      { table_name: "backfill_jobs", column_name: "workspace_id" },
      { table_name: "data_quality_checks", column_name: "workspace_id" },
      { table_name: "etl_runs", column_name: "workspace_id" },
      { table_name: "inbound_events", column_name: "workspace_id" },
      { table_name: "metrics_raw", column_name: "request_params" },
      { table_name: "metrics_raw", column_name: "resource" },
      { table_name: "workflow_runs", column_name: "workspace_id" },
      { table_name: "workflow_versions", column_name: "workspace_id" },
    ]);

    const primaryKeys = await client.query<{ table_name: string; columns: string[] }>(`
      SELECT relation.relname AS table_name,
             array_agg(attribute.attname ORDER BY key_column.ordinality)::text[] AS columns
      FROM pg_constraint AS constraint_row
      JOIN pg_class AS relation ON relation.oid = constraint_row.conrelid
      JOIN unnest(constraint_row.conkey) WITH ORDINALITY AS key_column(attnum, ordinality)
        ON true
      JOIN pg_attribute AS attribute
        ON attribute.attrelid = relation.oid
       AND attribute.attnum = key_column.attnum
      WHERE constraint_row.contype = 'p'
        AND relation.relname IN (
          'tasks', 'accounts', 'account_metrics_daily', 'ad_metrics_hourly',
          'ad_entities', 'account_balance'
        )
      GROUP BY relation.relname
      ORDER BY relation.relname
    `);
    expect(primaryKeys.rows).toEqual([
      { table_name: "account_balance", columns: ["workspace_id", "account_id"] },
      { table_name: "account_metrics_daily", columns: ["workspace_id", "account_id", "ds"] },
      { table_name: "accounts", columns: ["workspace_id", "account_id"] },
      { table_name: "ad_entities", columns: ["workspace_id", "entity_id", "entity_type"] },
      { table_name: "ad_metrics_hourly", columns: ["workspace_id", "ad_id", "ds", "hh"] },
      { table_name: "tasks", columns: ["workspace_id", "task_id"] },
    ]);

    const workspaceA = "00000000-0000-4000-8000-000000000001";
    const workspaceB = "00000000-0000-4000-8000-000000000002";
    await client.query("INSERT INTO workspaces (id, name) VALUES ($1, 'A'), ($2, 'B')", [
      workspaceA,
      workspaceB,
    ]);
    await client.query(
      "INSERT INTO tasks (workspace_id, task_id) VALUES ($1, 'same-task'), ($2, 'same-task')",
      [workspaceA, workspaceB],
    );
    await client.query(
      "INSERT INTO accounts (workspace_id, account_id) VALUES ($1, 'same-account'), ($2, 'same-account')",
      [workspaceA, workspaceB],
    );
    await client.query(
      `INSERT INTO account_metrics_daily (workspace_id, account_id, ds, cost)
       VALUES ($1, 'same-account', current_date, 1), ($2, 'same-account', current_date, 2)`,
      [workspaceA, workspaceB],
    );
    await client.query(
      `INSERT INTO metrics_raw (
         workspace_id, account_id, ds, resource, source, request_params, payload
       ) VALUES ($1, 'same-account', current_date, 'account_offline', 'offline', $2, $3)`,
      [workspaceA, { date: "today" }, { cost: 1 }],
    );

    const tenantRows = await client.query<{ count: string }>(`
      SELECT count(*)::text AS count
      FROM account_metrics_daily
      WHERE account_id = 'same-account' AND ds = current_date
    `);
    expect(tenantRows.rows[0]?.count).toBe("2");

    await client.query("DELETE FROM metrics_raw");
    await client.query("DELETE FROM account_metrics_daily");
    await client.query("DELETE FROM accounts");
    await client.query("DELETE FROM tasks");
    await client.query("DELETE FROM workspaces WHERE id IN ($1, $2)", [workspaceA, workspaceB]);
    await client.end();

    await runMigrations({ databaseUrl, direction: "down", count: 3 });
    const replay = await runMigrations({ databaseUrl });
    expect(replay).toHaveLength(3);
  });
});
