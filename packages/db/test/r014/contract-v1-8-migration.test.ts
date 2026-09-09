import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { runMigrations } from "../../src/migrate.js";
import { windowSize } from "../migration-window.js";

// Synthetic data only. Execute on the explicitly selected isolated test database (ka_be2_r014_test).
const databaseUrl = process.env.TEST_DATABASE_URL ?? "postgres://ka:ka@127.0.0.1:55432/ka_be2_r014_test";
const MIGRATION_REPLAY_TIMEOUT_MS = 30_000;

const NEW_TABLES = ["naming_rules", "account_name_parses", "pool_status_daily_snapshot"] as const;

describe("contract v1.8 / v1.9 migration 018 (real PostgreSQL)", () => {
  const pool = new Pool({ connectionString: databaseUrl });
  let workspace = "";
  let identity = "";

  const tableExists = async (name: string): Promise<boolean> =>
    (await pool.query("SELECT to_regclass($1) AS name", [`public.${name}`])).rows[0].name !== null;
  const columnCount = async (table: string, column: string): Promise<number> =>
    (await pool.query(
      `SELECT count(*)::int AS n FROM information_schema.columns
       WHERE table_schema='public' AND table_name=$1 AND column_name=$2`, [table, column],
    )).rows[0].n;

  beforeAll(async () => {
    await runMigrations({ databaseUrl });
    workspace = (await pool.query("INSERT INTO workspaces(name) VALUES($1) RETURNING id", [`r017-${randomUUID()}`])).rows[0].id;
    identity = (await pool.query(
      "INSERT INTO auth_identities(provider,provider_subject,display_name) VALUES('internal_test',$1,'synthetic') RETURNING id",
      [`r017-${randomUUID()}`],
    )).rows[0].id;
    await pool.query("INSERT INTO accounts(workspace_id,media,account_id) VALUES($1,'KUAISHOU','r017-a1')", [workspace]);
  });

  afterAll(async () => {
    for (const table of [...NEW_TABLES, "account_access_grants", "workspace_memberships", "users", "accounts", "alert_rules"]) {
      await pool.query(`DELETE FROM ${table} WHERE workspace_id=$1`, [workspace]);
    }
    await pool.query("DELETE FROM workspaces WHERE id=$1", [workspace]);
    await pool.query("DELETE FROM auth_identities WHERE id=$1", [identity]);
    await pool.end();
  });

  it("creates the three tables and the three columns v1.9 assigned here", async () => {
    for (const table of NEW_TABLES) expect(await tableExists(table)).toBe(true);
    expect(await columnCount("account_access_grants", "revoked_at")).toBe(1);
    expect(await columnCount("account_access_grants", "revoked_by")).toBe(1);
    expect(await columnCount("alert_rules", "bound_at")).toBe(1);
  });

  it("keeps a naming rule versioned per media and rejects a duplicate version", async () => {
    const insert = (media: string, version: number) => pool.query(
      `INSERT INTO naming_rules(workspace_id,media,version,segments,effective_from)
       VALUES($1,$2,$3,'[]'::jsonb,'2026-09-01')`, [workspace, media, version],
    );
    await insert("KUAISHOU", 1);
    // 同一渠道同版本号只能有一份；换渠道可以各有第 1 版。
    await expect(insert("KUAISHOU", 1)).rejects.toThrow(/duplicate key/i);
    await insert("TENCENT", 1);
    await insert("KUAISHOU", 2);
    expect((await pool.query(
      "SELECT count(*)::int AS n FROM naming_rules WHERE workspace_id=$1", [workspace],
    )).rows[0].n).toBe(3);
    expect((await pool.query(
      "SELECT separators FROM naming_rules WHERE workspace_id=$1 AND media='TENCENT'", [workspace],
    )).rows[0].separators).toEqual(["-"]);
  });

  it("ties a parse to a real account and cascades when the account goes away", async () => {
    await expect(pool.query(
      `INSERT INTO account_name_parses(workspace_id,media,account_id,account_name,rule_version,status)
       VALUES($1,'KUAISHOU','no-such-account','x',1,'parsed')`, [workspace],
    )).rejects.toThrow(/foreign key/i);
    await pool.query(
      `INSERT INTO account_name_parses(workspace_id,media,account_id,account_name,rule_version,status,task_ids)
       VALUES($1,'KUAISHOU','r017-a1','AAC拉新_快手_01',1,'parsed',ARRAY['task-1','task-2'])`, [workspace],
    );
    const row = (await pool.query(
      "SELECT status, task_ids, segments, override FROM account_name_parses WHERE workspace_id=$1", [workspace],
    )).rows[0];
    expect(row).toMatchObject({ status: "parsed", task_ids: ["task-1", "task-2"], segments: {}, override: null });
  });

  it("stores one pool-status row per account per day, so deltaVsYesterday finally has a source", async () => {
    for (const [ds, status] of [["2026-09-04", "assigned"], ["2026-09-05", "in_delivery"]] as const) {
      await pool.query(
        "INSERT INTO pool_status_daily_snapshot(workspace_id,media,account_id,ds,pool_status) VALUES($1,'KUAISHOU','r017-a1',$2,$3)",
        [workspace, ds, status],
      );
    }
    await expect(pool.query(
      "INSERT INTO pool_status_daily_snapshot(workspace_id,media,account_id,ds,pool_status) VALUES($1,'KUAISHOU','r017-a1','2026-09-05','paused')",
      [workspace],
    )).rejects.toThrow(/duplicate key/i);
    expect((await pool.query(
      "SELECT count(*)::int AS n FROM pool_status_daily_snapshot WHERE workspace_id=$1", [workspace],
    )).rows[0].n).toBe(2);
  });

  it("refuses to downgrade while revocation history exists", async () => {
    const userId = (await pool.query(
      "INSERT INTO users(workspace_id,name,role) VALUES($1,'synthetic','optimizer') RETURNING id", [workspace],
    )).rows[0].id;
    await pool.query(
      "INSERT INTO workspace_memberships(workspace_id,identity_id,user_id,role,is_active) VALUES($1,$2,$3,'optimizer',true)",
      [workspace, identity, userId],
    );
    await pool.query(
      `INSERT INTO account_access_grants(workspace_id,identity_id,media,account_id,access_level,revoked_at)
       VALUES($1,$2,'KUAISHOU','r017-a1','read',now())`, [workspace, identity],
    );
    await expect(runMigrations({ databaseUrl, direction: "down", count: windowSize("018") }))
      .rejects.toThrow(/revocation history/);
    // 拒绝之后 schema 必须原封不动。
    expect(await columnCount("alert_rules", "bound_at")).toBe(1);
    // 清理顺序按外键反向来：grant → membership → user，否则 users 删不掉。
    await pool.query("DELETE FROM account_access_grants WHERE workspace_id=$1", [workspace]);
    await pool.query("DELETE FROM workspace_memberships WHERE workspace_id=$1", [workspace]);
    await pool.query("DELETE FROM users WHERE workspace_id=$1", [workspace]);
  });

  it("replays down/up once nothing depends on the new schema", { timeout: MIGRATION_REPLAY_TIMEOUT_MS }, async () => {
    for (const table of NEW_TABLES) {
      await pool.query(`DELETE FROM ${table} WHERE workspace_id=$1`, [workspace]);
    }
    // 条数跟着窗口走，不写死：019 落地后「回滚到 018 之前」本来就会多带一条，
    // 写死 1 会在下一条迁移合进来时假红（Q-002 同类）。
    const window = windowSize("018");
    expect(await runMigrations({ databaseUrl, direction: "down", count: window })).toHaveLength(window);
    for (const table of NEW_TABLES) expect(await tableExists(table)).toBe(false);
    expect(await columnCount("account_access_grants", "revoked_at")).toBe(0);
    // 015 的列不受影响：018 回滚不许把上一批的东西一起带走。
    expect(await columnCount("accounts", "pool_status")).toBe(1);
    expect(await runMigrations({ databaseUrl, count: window })).toHaveLength(window);
    for (const table of NEW_TABLES) expect(await tableExists(table)).toBe(true);
    expect(await columnCount("alert_rules", "bound_at")).toBe(1);
  });
});
