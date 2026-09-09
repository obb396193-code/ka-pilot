import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runMigrations } from "../../src/migrate.js";

// Synthetic data only. Execute on the explicitly selected isolated test database (ka_be2_r014_test).
const databaseUrl = process.env.TEST_DATABASE_URL ?? "postgres://ka:ka@127.0.0.1:55432/ka_be2_r014_test";

const NEW_TABLES = [
  "external_changes", "account_transfers", "user_watchlists", "saved_views", "exports",
  "capabilities", "decision_policies", "report_runs", "changeset_groups",
  "task_readiness_overrides", "identity_preferences",
] as const;

describe("contract v1.5 / v1.5.1 / v1.7.1 migration 015 (real PostgreSQL)", () => {
  const pool = new Pool({ connectionString: databaseUrl });
  let workspace = "";
  let user = "";
  let task = "";

  const tableExists = async (name: string): Promise<boolean> =>
    (await pool.query("SELECT to_regclass($1) AS name", [`public.${name}`])).rows[0].name !== null;
  const columnDefault = async (table: string, column: string): Promise<string | null> =>
    (await pool.query(
      `SELECT column_default FROM information_schema.columns
       WHERE table_schema='public' AND table_name=$1 AND column_name=$2`,
      [table, column],
    )).rows[0]?.column_default ?? null;

  beforeAll(async () => {
    await runMigrations({ databaseUrl });
    workspace = (await pool.query("INSERT INTO workspaces(name) VALUES($1) RETURNING id", [`r014-${randomUUID()}`])).rows[0].id;
    user = (await pool.query("INSERT INTO users(workspace_id,name) VALUES($1,'synthetic') RETURNING id", [workspace])).rows[0].id;
    task = `r014-task-${randomUUID()}`;
    await pool.query("INSERT INTO accounts(workspace_id,media,account_id) VALUES($1,'KUAISHOU','r014-a1')", [workspace]);
    await pool.query("INSERT INTO tasks(workspace_id,task_id,task_name) VALUES($1,$2,'synthetic')", [workspace, task]);
  });

  afterAll(async () => {
    await pool.query("DELETE FROM tasks WHERE workspace_id=$1", [workspace]);
    await pool.query("DELETE FROM accounts WHERE workspace_id=$1", [workspace]);
    await pool.query("DELETE FROM users WHERE workspace_id=$1", [workspace]);
    await pool.query("DELETE FROM workspaces WHERE id=$1", [workspace]);
    await pool.end();
  });

  it("creates all eleven tables and the frozen columns on the five shared tables", async () => {
    for (const table of NEW_TABLES) expect(await tableExists(table)).toBe(true);
    expect(await columnDefault("accounts", "pool_status")).toBe("'available'::text");
    expect(await columnDefault("accounts", "pool_status_source")).toBe("'system'::text");
    expect(await columnDefault("tasks", "stage")).toBe("'preparing'::text");
    expect(await columnDefault("tasks", "stage_source")).toBe("'system'::text");
    expect(await columnDefault("report_configs", "version")).toBe("'report-config/v1'::text");
    for (const [table, column] of [
      ["accounts", "product_name"], ["accounts", "product_ref"], ["accounts", "pool_status_overridden_by"],
      ["accounts", "pool_status_changed_at"], ["tasks", "sop_run_id"], ["tasks", "stage_changed_at"],
      ["workflow_runs", "task_id"], ["changesets", "group_id"], ["report_configs", "is_shared"],
      ["report_configs", "updated_at"],
    ] as const) {
      expect(
        (await pool.query(
          `SELECT count(*)::int AS n FROM information_schema.columns
           WHERE table_schema='public' AND table_name=$1 AND column_name=$2`,
          [table, column],
        )).rows[0].n,
      ).toBe(1);
    }
  });

  it("backfills existing rows with the frozen defaults instead of NULL", async () => {
    expect((await pool.query(
      "SELECT pool_status, pool_status_source FROM accounts WHERE workspace_id=$1 AND media='KUAISHOU' AND account_id='r014-a1'",
      [workspace],
    )).rows[0]).toEqual({ pool_status: "available", pool_status_source: "system" });
    expect((await pool.query("SELECT stage, stage_source FROM tasks WHERE workspace_id=$1 AND task_id=$2", [workspace, task])).rows[0])
      .toEqual({ stage: "preparing", stage_source: "system" });
  });

  it("enforces the nine pool states, seven task stages and six readiness dimensions", async () => {
    await expect(pool.query(
      "UPDATE accounts SET pool_status='delivering' WHERE workspace_id=$1 AND account_id='r014-a1'", [workspace],
    )).rejects.toThrow(/pool_status/);
    for (const state of ["available", "assigned", "pending_open", "pending_recharge", "pending_build", "in_delivery", "paused", "closed", "abnormal"]) {
      await pool.query("UPDATE accounts SET pool_status=$2 WHERE workspace_id=$1 AND account_id='r014-a1'", [workspace, state]);
    }
    await pool.query("UPDATE accounts SET pool_status='available' WHERE workspace_id=$1 AND account_id='r014-a1'", [workspace]);
    await expect(pool.query("UPDATE tasks SET stage='in_delivery' WHERE workspace_id=$1 AND task_id=$2", [workspace, task]))
      .rejects.toThrow(/stage/);
    for (const stage of ["preparing", "opening", "recharging", "building", "cold_start", "delivering", "ended"]) {
      await pool.query("UPDATE tasks SET stage=$3 WHERE workspace_id=$1 AND task_id=$2", [workspace, task, stage]);
    }
    await pool.query("UPDATE tasks SET stage='preparing' WHERE workspace_id=$1 AND task_id=$2", [workspace, task]);
    await expect(pool.query(
      "INSERT INTO task_readiness_overrides(workspace_id,task_id,dimension,ready) VALUES($1,$2,'budget',true)", [workspace, task],
    )).rejects.toThrow(/dimension/);
    for (const dimension of ["accounts", "recharge", "products", "materials", "strategy", "infra"]) {
      await pool.query(
        "INSERT INTO task_readiness_overrides(workspace_id,task_id,dimension,ready,marked_by) VALUES($1,$2,$3,true,$4)",
        [workspace, task, dimension, user],
      );
    }
    expect((await pool.query("SELECT count(*)::int AS n FROM task_readiness_overrides WHERE workspace_id=$1", [workspace])).rows[0].n).toBe(6);
    await pool.query("DELETE FROM task_readiness_overrides WHERE workspace_id=$1", [workspace]);
  });

  it("keeps referential integrity to accounts, tasks, identities and changeset groups", async () => {
    await expect(pool.query(
      `INSERT INTO external_changes(workspace_id,media,account_id,target_type,target_id,field)
       VALUES($1,'KUAISHOU','missing-account','unit','u1','bid')`, [workspace],
    )).rejects.toThrow(/foreign key/i);
    await expect(pool.query(
      "INSERT INTO task_readiness_overrides(workspace_id,task_id,dimension,ready) VALUES($1,'missing-task','accounts',true)", [workspace],
    )).rejects.toThrow(/foreign key/i);
    await expect(pool.query("INSERT INTO identity_preferences(identity_id) VALUES($1)", [randomUUID()]))
      .rejects.toThrow(/foreign key/i);
    const identity = (await pool.query(
      "INSERT INTO auth_identities(provider,provider_subject,display_name) VALUES('internal_test',$1,'synthetic') RETURNING id",
      [`r014-${randomUUID()}`],
    )).rows[0].id;
    await pool.query("INSERT INTO identity_preferences(identity_id,preferences) VALUES($1,$2)", [identity, { theme: { mode: "bw" } }]);
    expect((await pool.query("SELECT preferences FROM identity_preferences WHERE identity_id=$1", [identity])).rows[0].preferences)
      .toEqual({ theme: { mode: "bw" } });
    const changeset = (await pool.query(
      `INSERT INTO changesets(workspace_id,media,account_id,initiator,credential_owner_user_id)
       VALUES($1,'KUAISHOU','r014-a1',$2,$2) RETURNING id`, [workspace, user],
    )).rows[0].id;
    await expect(pool.query("UPDATE changesets SET group_id=$2 WHERE id=$1", [changeset, randomUUID()]))
      .rejects.toThrow(/foreign key/i);
    await pool.query("DELETE FROM changesets WHERE id=$1", [changeset]);
    await pool.query("DELETE FROM identity_preferences WHERE identity_id=$1", [identity]);
    await pool.query("DELETE FROM auth_identities WHERE id=$1", [identity]);
  });

  it.each([
    ["a new table still holds rows", "user_watchlists still holds rows", async (): Promise<() => Promise<void>> => {
      await pool.query("INSERT INTO user_watchlists(workspace_id,user_id,items) VALUES($1,$2,'[]')", [workspace, user]);
      return async () => { await pool.query("DELETE FROM user_watchlists WHERE workspace_id=$1", [workspace]); };
    }],
    ["an account carries a manual pool override", "accounts carries manual pool_status overrides", async (): Promise<() => Promise<void>> => {
      await pool.query("UPDATE accounts SET pool_status_source='manual' WHERE workspace_id=$1 AND account_id='r014-a1'", [workspace]);
      return async () => { await pool.query("UPDATE accounts SET pool_status_source='system' WHERE workspace_id=$1", [workspace]); };
    }],
    ["an account carries a product binding", "accounts carries product bindings", async (): Promise<() => Promise<void>> => {
      await pool.query("UPDATE accounts SET product_name='AAC' WHERE workspace_id=$1 AND account_id='r014-a1'", [workspace]);
      return async () => { await pool.query("UPDATE accounts SET product_name=NULL WHERE workspace_id=$1", [workspace]); };
    }],
    ["a task carries a manual stage", "tasks carries manual or workflow stage sources", async (): Promise<() => Promise<void>> => {
      await pool.query("UPDATE tasks SET stage_source='manual' WHERE workspace_id=$1 AND task_id=$2", [workspace, task]);
      return async () => { await pool.query("UPDATE tasks SET stage_source='system' WHERE workspace_id=$1", [workspace]); };
    }],
    ["a changeset is linked to a group", "changesets are linked to changeset groups", async (): Promise<() => Promise<void>> => {
      const group = (await pool.query(
        "INSERT INTO changeset_groups(workspace_id,initiator) VALUES($1,$2) RETURNING id", [workspace, user],
      )).rows[0].id;
      const changeset = (await pool.query(
        `INSERT INTO changesets(workspace_id,media,account_id,initiator,credential_owner_user_id,group_id)
         VALUES($1,'KUAISHOU','r014-a1',$2,$2,$3) RETURNING id`, [workspace, user, group],
      )).rows[0].id;
      return async () => {
        await pool.query("DELETE FROM changesets WHERE id=$1", [changeset]);
        await pool.query("DELETE FROM changeset_groups WHERE id=$1", [group]);
      };
    }],
    ["a workflow run is linked to a task", "workflow_runs are linked to tasks", async (): Promise<() => Promise<void>> => {
      const run = (await pool.query(
        "INSERT INTO workflow_runs(workspace_id,version_id,task_id) VALUES($1,$2,$3) RETURNING id",
        [workspace, randomUUID(), task],
      )).rows[0].id;
      return async () => { await pool.query("DELETE FROM workflow_runs WHERE id=$1", [run]); };
    }],
    ["a report config was shared", "report_configs carries shared or versioned rows", async (): Promise<() => Promise<void>> => {
      const config = (await pool.query(
        "INSERT INTO report_configs(workspace_id,name,is_shared) VALUES($1,'synthetic',true) RETURNING id", [workspace],
      )).rows[0].id;
      return async () => { await pool.query("DELETE FROM report_configs WHERE id=$1", [config]); };
    }],
  ])("refuses to downgrade when %s, leaving the schema untouched", async (_label, message, arrange) => {
    const cleanup = await arrange();
    try {
      await expect(runMigrations({ databaseUrl, direction: "down", count: 1 })).rejects.toThrow(message);
      for (const table of NEW_TABLES) expect(await tableExists(table)).toBe(true);
      expect(await columnDefault("accounts", "pool_status")).toBe("'available'::text");
    } finally {
      await cleanup();
    }
  });

  it("replays down/up losslessly when nothing depends on the new schema", async () => {
    for (const table of NEW_TABLES) {
      expect((await pool.query(`SELECT count(*)::int AS n FROM ${table}`)).rows[0].n).toBe(0);
    }
    expect(await runMigrations({ databaseUrl, direction: "down", count: 1 })).toHaveLength(1);
    for (const table of NEW_TABLES) expect(await tableExists(table)).toBe(false);
    expect((await pool.query(
      `SELECT count(*)::int AS n FROM information_schema.columns
       WHERE table_schema='public' AND table_name='accounts' AND column_name LIKE 'pool_status%'`,
    )).rows[0].n).toBe(0);
    expect((await pool.query("SELECT count(*)::int AS n FROM accounts WHERE workspace_id=$1", [workspace])).rows[0].n).toBe(1);
    expect(await runMigrations({ databaseUrl, count: 1 })).toHaveLength(1);
    for (const table of NEW_TABLES) expect(await tableExists(table)).toBe(true);
    expect((await pool.query(
      "SELECT pool_status, pool_status_source FROM accounts WHERE workspace_id=$1 AND account_id='r014-a1'", [workspace],
    )).rows[0]).toEqual({ pool_status: "available", pool_status_source: "system" });
    expect((await pool.query("SELECT stage FROM tasks WHERE workspace_id=$1 AND task_id=$2", [workspace, task])).rows[0].stage).toBe("preparing");
  });
});
