import { beforeAll, describe, expect, it } from "vitest";
import { Client, Pool } from "pg";

import { ensureMetricPartitions } from "../src/partition-maintenance.js";
import { runMigrations } from "../src/migrate.js";
// 真 PG 迁移回放：耗时随迁移数线性增长，5s 默认线注定被推过（已撞 4 次），这一类统一 30s。
const MIGRATION_REPLAY_TIMEOUT_MS = 30_000;
import { migrationCount, windowSize } from "./migration-window.js";

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
    const legacy = await runMigrations({ databaseUrl, count: 4 });
    expect(legacy).toHaveLength(4);

    const backfillWorkspace = "00000000-0000-4000-8000-000000000099";
    const legacyClient = new Client({ connectionString: databaseUrl });
    await legacyClient.connect();
    await legacyClient.query(
      "INSERT INTO workspaces (id, name) VALUES ($1, 'media-backfill')",
      [backfillWorkspace],
    );
    await legacyClient.query(
      `INSERT INTO accounts (workspace_id, account_id, media)
       VALUES ($1, 'legacy-account', 'TENCENT')`,
      [backfillWorkspace],
    );
    await legacyClient.query(
      "INSERT INTO tasks (workspace_id, task_id) VALUES ($1, 'legacy-task')",
      [backfillWorkspace],
    );
    await legacyClient.query(
      `INSERT INTO task_accounts (workspace_id, task_id, account_id, valid_from)
       VALUES ($1, 'legacy-task', 'legacy-account', current_date)`,
      [backfillWorkspace],
    );
    await legacyClient.query(
      `INSERT INTO metrics_raw (
         workspace_id, account_id, ds, resource, source, request_params, payload
       ) VALUES ($1, 'legacy-account', current_date, 'account_realtime', 'realtime', '{}', '{}')`,
      [backfillWorkspace],
    );
    await legacyClient.query(
      `INSERT INTO account_metrics_daily (workspace_id, account_id, ds, cost)
       VALUES ($1, 'legacy-account', current_date, 1)`,
      [backfillWorkspace],
    );
    await legacyClient.query(
      `INSERT INTO account_balance (workspace_id, account_id, balance)
       VALUES ($1, 'legacy-account', 1)`,
      [backfillWorkspace],
    );
    const legacyUser = "00000000-0000-4000-8000-000000000098";
    const legacyWorkItem = "00000000-0000-4000-8000-000000000097";
    const legacyChangeSet = "00000000-0000-4000-8000-000000000096";
    await legacyClient.query(
      `INSERT INTO users (id, workspace_id, name) VALUES ($1, $2, 'legacy-user')`,
      [legacyUser, backfillWorkspace],
    );
    await legacyClient.query(
      `INSERT INTO work_items (id, workspace_id, type, account_id, title)
       VALUES ($1, $2, 'diagnosis', 'legacy-account', 'legacy-work-item')`,
      [legacyWorkItem, backfillWorkspace],
    );
    await legacyClient.query(
      `INSERT INTO changesets (
         id, workspace_id, work_item_id, title, initiator, credential_owner_user_id
       ) VALUES ($1, $2, $3, 'legacy-changeset', $4, $4)`,
      [legacyChangeSet, backfillWorkspace, legacyWorkItem, legacyUser],
    );
    await legacyClient.end();

    const identityMigration = await runMigrations({ databaseUrl, count: 1 });
    expect(identityMigration).toHaveLength(1);
    const foreignKeyStartedAt = performance.now();
    const foreignKeyMigration = await runMigrations({ databaseUrl, count: 1 });
    const foreignKeyDurationMs = performance.now() - foreignKeyStartedAt;
    expect(foreignKeyMigration).toHaveLength(1);
    expect(foreignKeyDurationMs).toBeLessThan(10_000);
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

    const maintenancePool = new Pool({ connectionString: databaseUrl });
    await ensureMetricPartitions(maintenancePool, {
      asOf: new Date("2030-01-15T00:00:00Z"),
      monthsAhead: 2,
    });
    const futurePartitions = await maintenancePool.query<{ table_name: string | null }>(
      `SELECT to_regclass('public.account_metrics_daily_2030_03')::text AS table_name`,
    );
    expect(futurePartitions.rows[0]?.table_name).toBe("account_metrics_daily_2030_03");
    await maintenancePool.end();

    const columns = await client.query<{ table_name: string; column_name: string }>(`
      SELECT table_name, column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND (
          (table_name = 'metrics_raw' AND column_name IN ('resource', 'request_params'))
          OR (table_name = 'jobs' AND column_name = 'lease_token')
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
      { table_name: "jobs", column_name: "lease_token" },
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
      { table_name: "account_balance", columns: ["workspace_id", "media", "account_id"] },
      { table_name: "account_metrics_daily", columns: ["workspace_id", "media", "account_id", "ds"] },
      { table_name: "accounts", columns: ["workspace_id", "media", "account_id"] },
      { table_name: "ad_entities", columns: ["workspace_id", "entity_id", "entity_type"] },
      { table_name: "ad_metrics_hourly", columns: ["workspace_id", "ad_id", "ds", "hh"] },
      { table_name: "tasks", columns: ["workspace_id", "task_id"] },
    ]);

    const backfilled = await client.query<{ table_name: string; media: string }>(`
      SELECT 'account_balance' AS table_name, media FROM account_balance
      WHERE workspace_id = '${backfillWorkspace}' AND account_id = 'legacy-account'
      UNION ALL
      SELECT 'account_metrics_daily', media FROM account_metrics_daily
      WHERE workspace_id = '${backfillWorkspace}' AND account_id = 'legacy-account'
      UNION ALL
      SELECT 'metrics_raw', media FROM metrics_raw
      WHERE workspace_id = '${backfillWorkspace}' AND account_id = 'legacy-account'
      UNION ALL
      SELECT 'task_accounts', media FROM task_accounts
      WHERE workspace_id = '${backfillWorkspace}' AND account_id = 'legacy-account'
      ORDER BY table_name
    `);
    expect(backfilled.rows).toEqual([
      { table_name: "account_balance", media: "TENCENT" },
      { table_name: "account_metrics_daily", media: "TENCENT" },
      { table_name: "metrics_raw", media: "TENCENT" },
      { table_name: "task_accounts", media: "TENCENT" },
    ]);

    const accountForeignKeys = await client.query<{ table_name: string; constraint_name: string }>(`
      SELECT relation.relname AS table_name, constraint_row.conname AS constraint_name
      FROM pg_constraint AS constraint_row
      JOIN pg_class AS relation ON relation.oid = constraint_row.conrelid
      WHERE constraint_row.contype = 'f'
        AND constraint_row.confrelid = 'accounts'::regclass
        AND relation.relname IN (
          'task_accounts', 'metrics_raw', 'account_metrics_daily', 'account_balance',
          'ad_metrics_hourly', 'ad_entities'
        )
      ORDER BY relation.relname
    `);
    expect(accountForeignKeys.rows).toEqual([
      { table_name: "account_balance", constraint_name: "account_balance_account_fk" },
      { table_name: "account_metrics_daily", constraint_name: "account_metrics_daily_account_fk" },
      { table_name: "ad_entities", constraint_name: "ad_entities_account_fk" },
      { table_name: "ad_metrics_hourly", constraint_name: "ad_metrics_hourly_account_fk" },
      { table_name: "metrics_raw", constraint_name: "metrics_raw_account_fk" },
      { table_name: "task_accounts", constraint_name: "task_accounts_account_fk" },
    ]);

    await expect(client.query(
      `INSERT INTO account_metrics_daily (workspace_id, media, account_id, ds, cost)
       VALUES ($1, 'KUAISHOU', 'orphan-account', current_date, 1)`,
      [backfillWorkspace],
    )).rejects.toMatchObject({ code: "23503" });
    await expect(client.query(
      `INSERT INTO account_balance (workspace_id, media, account_id, balance)
       VALUES ($1, 'KUAISHOU', 'orphan-account', 1)`,
      [backfillWorkspace],
    )).rejects.toMatchObject({ code: "23503" });
    await expect(client.query(
      `INSERT INTO metrics_raw (
         workspace_id, media, account_id, ds, resource, source, request_params, payload
       ) VALUES ($1, 'KUAISHOU', 'orphan-account', current_date,
                 'account_offline', 'offline', '{}', '{}')`,
      [backfillWorkspace],
    )).rejects.toMatchObject({ code: "23503" });

    expect(await runMigrations({ databaseUrl, direction: "down", count: 1 })).toHaveLength(1);
    await client.query(
      `INSERT INTO account_balance (workspace_id, media, account_id, balance)
       VALUES ($1, 'KUAISHOU', 'temporary-orphan', 1)`,
      [backfillWorkspace],
    );
    await client.query(
      `DELETE FROM account_balance
       WHERE workspace_id = $1 AND media = 'KUAISHOU' AND account_id = 'temporary-orphan'`,
      [backfillWorkspace],
    );
    expect(await runMigrations({ databaseUrl, count: 1 })).toHaveLength(1);
    await expect(client.query(
      `INSERT INTO account_balance (workspace_id, media, account_id, balance)
       VALUES ($1, 'KUAISHOU', 'temporary-orphan', 1)`,
      [backfillWorkspace],
    )).rejects.toMatchObject({ code: "23503" });

    const ambiguousWorkspace = "00000000-0000-4000-8000-000000000095";
    await client.query(
      `INSERT INTO workspaces (id, name) VALUES ($1, 'ambiguous-detail-scope')`,
      [ambiguousWorkspace],
    );
    await client.query(
      `INSERT INTO accounts (workspace_id, media, account_id)
       VALUES ($1, 'KUAISHOU', 'same-detail-account'),
              ($1, 'TENCENT', 'same-detail-account')`,
      [ambiguousWorkspace],
    );
    await client.query(
      `INSERT INTO work_items (workspace_id, type, account_id, title)
       VALUES ($1, 'diagnosis', 'same-detail-account', 'ambiguous')`,
      [ambiguousWorkspace],
    );
    await expect(runMigrations({ databaseUrl, count: 1 })).rejects.toThrow(
      /without deterministic media/i,
    );
    await client.query("DELETE FROM work_items WHERE workspace_id = $1", [ambiguousWorkspace]);
    await client.query("DELETE FROM accounts WHERE workspace_id = $1", [ambiguousWorkspace]);
    await client.query("DELETE FROM workspaces WHERE id = $1", [ambiguousWorkspace]);

    const detailScopeMigration = await runMigrations({ databaseUrl, count: 1 });
    expect(detailScopeMigration).toHaveLength(1);
    const authMigration = await runMigrations({ databaseUrl, count: 1 });
    expect(authMigration).toHaveLength(1);
    const schedulerMigration = await runMigrations({ databaseUrl, count: 1 });
    expect(schedulerMigration).toHaveLength(1);
    const workspaceKindMigration = await runMigrations({ databaseUrl, count: 1 });
    expect(workspaceKindMigration).toHaveLength(1);
    const contractV12Migration = await runMigrations({ databaseUrl, count: 1 });
    expect(contractV12Migration).toHaveLength(1);
    const contractV13Migration = await runMigrations({ databaseUrl, count: 1 });
    expect(contractV13Migration).toHaveLength(1);
    // 走到 012 之后，剩下的正好是 012 之后的迁移数（不写死"012 就是头部"，新批次落地不错位）
    expect(await runMigrations({ databaseUrl })).toHaveLength(windowSize("012") - 1);
    const workspaceKind = await client.query<{
      column_default: string | null;
      is_nullable: string;
    }>(`
      SELECT column_default, is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'workspaces'
        AND column_name = 'kind'
    `);
    expect(workspaceKind.rows).toEqual([{
      column_default: "'personal'::text",
      is_nullable: "NO",
    }]);
    const detailScopes = await client.query<{
      table_name: string;
      media: string;
      account_id: string;
    }>(`
      SELECT 'changesets' AS table_name, media, account_id
      FROM changesets WHERE id = '${legacyChangeSet}'
      UNION ALL
      SELECT 'work_items', media, account_id
      FROM work_items WHERE id = '${legacyWorkItem}'
      ORDER BY table_name
    `);
    expect(detailScopes.rows).toEqual([
      { table_name: "changesets", media: "TENCENT", account_id: "legacy-account" },
      { table_name: "work_items", media: "TENCENT", account_id: "legacy-account" },
    ]);
    await expect(client.query(
      `INSERT INTO work_items (workspace_id, type, media, account_id, title)
       VALUES ($1, 'diagnosis', 'KUAISHOU', 'orphan-detail-account', 'orphan')`,
      [backfillWorkspace],
    )).rejects.toMatchObject({ code: "23503" });
    await expect(client.query(
      `INSERT INTO work_items (workspace_id, type, account_id, title)
       VALUES ($1, 'diagnosis', 'legacy-account', 'missing-media')`,
      [backfillWorkspace],
    )).rejects.toMatchObject({ code: "23514" });

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
      `INSERT INTO accounts (workspace_id, media, account_id)
       VALUES ($1, 'KUAISHOU', 'same-account'), ($1, 'TENCENT', 'same-account'),
              ($2, 'KUAISHOU', 'same-account')`,
      [workspaceA, workspaceB],
    );
    await client.query(
      `INSERT INTO account_metrics_daily (workspace_id, media, account_id, ds, cost)
       VALUES ($1, 'KUAISHOU', 'same-account', current_date, 1),
              ($1, 'TENCENT', 'same-account', current_date, 3),
              ($2, 'KUAISHOU', 'same-account', current_date, 2)`,
      [workspaceA, workspaceB],
    );
    await client.query(
      `INSERT INTO metrics_raw (
         workspace_id, media, account_id, ds, resource, source, request_params, payload
       ) VALUES ($1, 'KUAISHOU', 'same-account', current_date, 'account_offline', 'offline', $2, $3)`,
      [workspaceA, { date: "today" }, { cost: 1 }],
    );

    const tenantRows = await client.query<{ count: string }>(`
      SELECT count(*)::text AS count
      FROM account_metrics_daily
      WHERE account_id = 'same-account' AND ds = current_date
    `);
    expect(tenantRows.rows[0]?.count).toBe("3");

    // 从头部一路退到 006（含）——不写死步数，新批次落地也不错位；下一步退 005 必须被守卫拒绝
    expect(await runMigrations({ databaseUrl, direction: "down", count: windowSize("006") }))
      .toHaveLength(windowSize("006"));
    await expect(
      runMigrations({ databaseUrl, direction: "down", count: 1 }),
    ).rejects.toThrow(/same account_id exists in multiple media/i);

    await client.query("DELETE FROM metrics_raw");
    await client.query("DELETE FROM account_metrics_daily");
    await client.query("DELETE FROM account_balance");
    await client.query("DELETE FROM task_accounts");
    await client.query("DELETE FROM changeset_items");
    await client.query("DELETE FROM changesets");
    await client.query("DELETE FROM work_items");
    await client.query("DELETE FROM users");
    await client.query("DELETE FROM accounts");
    await client.query("DELETE FROM tasks");
    await client.query("DELETE FROM workspaces WHERE id IN ($1, $2, $3)", [
      workspaceA,
      workspaceB,
      backfillWorkspace,
    ]);
    await client.end();

    await runMigrations({ databaseUrl, direction: "down", count: 5 });
    const replay = await runMigrations({ databaseUrl });
    expect(replay).toHaveLength(migrationCount()); // 不写死总数，新批次落地自动跟上
  }, MIGRATION_REPLAY_TIMEOUT_MS);
});
