// Synthetic-only migration probes on an explicitly selected isolated local DB.
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runMigrations } from "../src/migrate.js";
import { windowSize } from "./migration-window.js";

const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl) throw new Error("Explicit TEST_DATABASE_URL required");
const target = new URL(databaseUrl);
if (!["127.0.0.1", "localhost"].includes(target.hostname) || target.port !== "55432" || !/^\/ka_[a-z0-9_]+_test$/.test(target.pathname))
  throw new Error("Isolated local database required");

describe("P194 deployed budget/audit migrations", () => {
  const pool = new Pool({ connectionString: databaseUrl, max: 2 });
  const a = randomUUID(), b = randomUUID();
  beforeAll(async () => {
    await runMigrations({ databaseUrl });
    await pool.query("INSERT INTO workspaces(id,name) VALUES($1,'Synthetic budget A'),($2,'Synthetic budget B')", [a, b]);
    await pool.query("INSERT INTO tasks(workspace_id,task_id) VALUES($1,'same'),($2,'same'),($1,'only-a')", [a, b]);
  }, 30000);
  afterAll(async () => {
    try {
      // No CREATE fake production tables. If a replay failed, restore through the real runner.
      await runMigrations({ databaseUrl });
      for (const table of ["task_budget_history", "channel_coefficients", "tasks"])
        await pool.query(`DELETE FROM ${table} WHERE workspace_id=ANY($1::uuid[])`, [[a, b]]);
      await pool.query("DELETE FROM workspaces WHERE id=ANY($1::uuid[])", [[a, b]]);
    } finally { await pool.end(); }
  }, 30000);

  it("runner installs the real budget table and both audit columns", async () => {
    const { rows } = await pool.query("SELECT name FROM pgmigrations WHERE name LIKE '028_%' OR name LIKE '029_%' ORDER BY name");
    expect(rows.map(row => row.name)).toEqual(["028_task_budget_history", "029_channel_coefficient_audit"]);
    const columns = (await pool.query(`SELECT table_name,column_name,column_default FROM information_schema.columns
      WHERE table_schema='public' AND ((table_name='task_budget_history' AND column_name IN ('daily_cap','created_at'))
        OR (table_name='channel_coefficients' AND column_name IN ('created_at','evidence_url')))
      ORDER BY table_name,column_name`)).rows;
    expect(columns.map(row => [row.table_name, row.column_name])).toEqual([
      ["channel_coefficients", "created_at"], ["channel_coefficients", "evidence_url"],
      ["task_budget_history", "created_at"], ["task_budget_history", "daily_cap"],
    ]);
    expect(columns.filter(row => row.column_name === "created_at").every(row => row.column_default === "now()")).toBe(true);
    expect(await runMigrations({ databaseUrl })).toEqual([]);
  });

  it("uses the workspace-task FK and accepts same task id in separate spaces", async () => {
    try {
      await pool.query(`INSERT INTO task_budget_history(workspace_id,task_id,daily_cap,effective_date)
        VALUES($1,'same',100,'2026-09-13'),($2,'same',200,'2026-09-13')`, [a, b]);
      expect((await pool.query("SELECT daily_cap::text AS value FROM task_budget_history WHERE workspace_id=ANY($1::uuid[]) ORDER BY daily_cap", [[a, b]])).rows)
        .toEqual([{ value: "100" }, { value: "200" }]);
      await expect(pool.query(`INSERT INTO task_budget_history(workspace_id,task_id,daily_cap,effective_date)
        VALUES($1,'only-a',300,'2026-09-13')`, [b])).rejects.toMatchObject({ code: "23503" });
      // v1.9.44 allows multiple revisions with the same effective date.
      await pool.query(`INSERT INTO task_budget_history(workspace_id,task_id,daily_cap,effective_date)
        VALUES($1,'same',300,'2026-09-13')`, [a]);
      expect((await pool.query("SELECT daily_cap::text AS value FROM task_budget_history WHERE workspace_id=$1 ORDER BY id", [a])).rows)
        .toEqual([{ value: "100" }, { value: "300" }]);
    } finally { await pool.query("DELETE FROM task_budget_history WHERE workspace_id=ANY($1::uuid[])", [[a, b]]); }
  });

  it.each(["-1", "NaN", "Infinity", "-Infinity"])("rejects invalid cap %s", async amount => {
    await expect(pool.query(`INSERT INTO task_budget_history(workspace_id,task_id,daily_cap,effective_date)
      VALUES($1,'same',$2,'2026-09-13')`, [a, amount])).rejects.toMatchObject({ code: "23514" });
  });

  it("budget lossless-down refuses nonempty table and leaves all migrations applied", async () => {
    await pool.query(`INSERT INTO task_budget_history(workspace_id,task_id,daily_cap,effective_date)
      VALUES($1,'same',0,'2026-09-13')`, [a]);
    try {
      await expect(runMigrations({ databaseUrl, direction: "down", count: windowSize("028") })).rejects.toThrow(/task_budget_history.*cannot downgrade losslessly/);
      expect((await pool.query("SELECT daily_cap::text AS value FROM task_budget_history WHERE workspace_id=$1", [a])).rows).toEqual([{ value: "0" }]);
      expect((await pool.query("SELECT count(*)::int AS n FROM pgmigrations WHERE name LIKE '029_%'")).rows[0].n).toBe(1);
    } finally { await pool.query("DELETE FROM task_budget_history WHERE workspace_id=$1", [a]); }
  }, 30000);

  it("preserves legacy unknown audit times, defaults only new writes and refuses metadata loss", async () => {
    const width = windowSize("028");
    expect(await runMigrations({ databaseUrl, direction: "down", count: width })).toHaveLength(width);
    const legacy = (await pool.query(`INSERT INTO channel_coefficients(workspace_id,media,coefficient,effective_date,op)
      VALUES($1,'KUAISHOU',0.8,'2026-09-01','multiply') RETURNING id`, [a])).rows[0].id;
    let fresh: string | undefined;
    try {
      expect(await runMigrations({ databaseUrl, count: width })).toHaveLength(width);
      expect((await pool.query("SELECT created_at,evidence_url,coefficient::text,op FROM channel_coefficients WHERE id=$1", [legacy])).rows[0])
        .toEqual({ created_at: null, evidence_url: null, coefficient: "0.8", op: "multiply" });
      fresh = (await pool.query(`INSERT INTO channel_coefficients(workspace_id,media,coefficient,effective_date,op)
        VALUES($1,'TENCENT',1.1,'2026-09-02','divide') RETURNING id`, [a])).rows[0].id;
      expect((await pool.query("SELECT created_at FROM channel_coefficients WHERE id=$1", [fresh])).rows[0].created_at).toBeInstanceOf(Date);
      await expect(runMigrations({ databaseUrl, direction: "down", count: windowSize("029") })).rejects.toThrow(/channel_coefficients.*cannot downgrade losslessly/);
      await pool.query("UPDATE channel_coefficients SET created_at=NULL,evidence_url='https://example.invalid/synthetic' WHERE id=$1", [fresh]);
      await expect(runMigrations({ databaseUrl, direction: "down", count: windowSize("029") })).rejects.toThrow(/channel_coefficients.*cannot downgrade losslessly/);
      expect((await pool.query("SELECT evidence_url FROM channel_coefficients WHERE id=$1", [fresh])).rows[0].evidence_url).toBe("https://example.invalid/synthetic");
      await pool.query("DELETE FROM channel_coefficients WHERE id=$1", [fresh]); fresh = undefined;
      expect(await runMigrations({ databaseUrl, direction: "down", count: width })).toHaveLength(width);
      expect((await pool.query("SELECT coefficient::text,op FROM channel_coefficients WHERE id=$1", [legacy])).rows[0]).toEqual({ coefficient: "0.8", op: "multiply" });
      expect(await runMigrations({ databaseUrl, count: width })).toHaveLength(width);
    } finally {
      await runMigrations({ databaseUrl });
      await pool.query("DELETE FROM channel_coefficients WHERE id=ANY($1::bigint[])", [[legacy, ...(fresh ? [fresh] : [])]]);
    }
  }, 30000);
});
