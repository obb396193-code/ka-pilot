import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { Pool, type PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runMigrations } from "../src/migrate.js";

const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl) throw new Error("Explicit dedicated TEST_DATABASE_URL required");
const url = new URL(databaseUrl);
if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) || url.port !== "55432" || !/^\/ka_[a-z0-9_]*_test$/.test(url.pathname))
  throw new Error("Dedicated local ka_*_test database required");
const require = createRequire(import.meta.url);
const migration = require("../migration-drafts/016_contract_v1_6.cjs") as Record<"up" | "down", (p: { sql: (s: string) => void }) => void>;
let down = "", up = ""; migration.down({ sql: s => { down += s; } }); migration.up({ sql: s => { up += s; } });
const contract = readFileSync(new URL("../../contract/schema.sql", import.meta.url), "utf8");
const start = contract.indexOf("-- v1.6 新增"), end = contract.indexOf("-- v1.7 新增");
if (start < 0 || end <= start) throw new Error("Missing frozen v1.6 block");
const columns = [...contract.slice(start, end).matchAll(/ALTER TABLE (\w+) ADD COLUMN (\w+) (\w+(?:\[\])?)/g)]
  .map(m => ({ table: m[1]!, column: m[2]!, type: m[3]! }));
const baseTables = ["materials", "material_analyses", "product_material_experiments", "material_briefs", "settlement_templates", "settlements", "settlement_lines"];
// These are exact frozen prerequisite DDL, NOT a fabricated installed 014.
// Transaction-local schema proves the draft SQL only. The runtime migration
// remains blocked until arch assigns/lands all of 014 in the real runner.
const baseDdl = contract.slice(contract.indexOf("-- v1.4 新增"), contract.indexOf("-- v1.5 新增"))
  .replace(/--[^\n]*/g, "").split(";").map(s => s.trim()).filter(s => baseTables.includes(/^CREATE TABLE (\w+)/.exec(s)?.[1] ?? ""));
if (baseDdl.length !== 7) throw new Error("Missing exact frozen prerequisite tables");

async function seed(client: PoolClient, ws: string, settlement: string): Promise<void> {
  await client.query("INSERT INTO workspaces(id,name) VALUES($1,'synthetic migration 016')", [ws]);
  await client.query("INSERT INTO materials(workspace_id,media,material_id,name) VALUES($1,'KUAISHOU','synthetic-material','legacy material')", [ws]);
  await client.query("INSERT INTO material_analyses(workspace_id,media,material_id,version) VALUES($1,'KUAISHOU','synthetic-material',1)", [ws]);
  await client.query("INSERT INTO product_material_experiments(workspace_id,product_id,media,material_id) VALUES($1,'synthetic-product','KUAISHOU','synthetic-material')", [ws]);
  await client.query("INSERT INTO material_briefs(workspace_id,media,source_material_id) VALUES($1,'KUAISHOU','synthetic-material')", [ws]);
  await client.query("INSERT INTO settlement_templates(workspace_id,version,fields) VALUES($1,'synthetic-v1','[]')", [ws]);
  await client.query("INSERT INTO settlements(id,workspace_id,period,template_version) VALUES($1,$2,'2001-01','synthetic-v1')", [settlement, ws]);
  await client.query("INSERT INTO settlement_lines(settlement_id,fields) VALUES($1,'{}')", [settlement]);
}

describe("unregistered 016 draft SQL real PostgreSQL (not full migration-chain verification)", () => {
  const pool = new Pool({ connectionString: databaseUrl, max: 3, connectionTimeoutMillis: 3000 });
  beforeAll(async () => { await runMigrations({ databaseUrl }); }, 30000);
  afterAll(async () => { await pool.end(); });
  async function isolated(work: (client: PoolClient, ws: string, settlement: string) => Promise<void>, install = true) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN"); const ws = randomUUID(), settlement = randomUUID();
      const schema = `p149_${randomUUID().replaceAll("-", "")}`;
      await client.query(`CREATE SCHEMA "${schema}"`);
      await client.query(`SET LOCAL search_path="${schema}",public`);
      await client.query(baseDdl.join(";\n") + ";");
      if (install) await client.query(up);
      await seed(client, ws, settlement); await work(client, ws, settlement);
    } finally { await client.query("ROLLBACK"); client.release(); }
  }
  async function refusesDown(client: PoolClient) {
    await client.query("SAVEPOINT downgrade");
    await expect(client.query(down)).rejects.toMatchObject({ code: "P0001" });
    await client.query("ROLLBACK TO SAVEPOINT downgrade");
    expect((await client.query("SELECT to_regclass('workspace_flags')::text AS name")).rows[0].name).toBe("workspace_flags");
  }
  it("executes draft up/down/up over exact prerequisite DDL, preserving legacy defaults", async () => {
    await isolated(async (client, ws) => {
      for (let cycle = 0; cycle < 2; cycle++) {
        await client.query(up);
        expect((await client.query("SELECT name,source_status,tags,duration_ms FROM materials WHERE workspace_id=$1", [ws])).rows)
          .toEqual([{ name: "legacy material", source_status: "unknown", tags: [], duration_ms: null }]);
        expect((await client.query("SELECT currency_code,name,checks FROM settlement_templates WHERE workspace_id=$1", [ws])).rows)
          .toEqual([{ currency_code: "CNY", name: null, checks: null }]);
        expect((await client.query("SELECT data_basis,data_cutoff_at,preview_status FROM settlements WHERE workspace_id=$1", [ws])).rows)
          .toEqual([{ data_basis: "offline_settlement", data_cutoff_at: null, preview_status: null }]);
        if (cycle === 0) await client.query(down);
      }
    }, false);
  }, 30000);
  it.each(columns)("refuses lossy downgrade for $table.$column", async ({ table, column, type }) => {
    await isolated(async (client, ws, settlement) => {
      const value = type === "UUID" ? randomUUID() : type === "INT" ? 7 : type === "JSONB" ? { synthetic: true }
        : type === "TEXT[]" ? ["synthetic"] : type === "DATE" ? "2001-01-01" : type === "TIMESTAMPTZ" ? "2001-01-01T00:00:00Z" : "synthetic-nondefault";
      const where = table === "settlement_lines" ? "settlement_id" : "workspace_id", id = table === "settlement_lines" ? settlement : ws;
      await client.query(`UPDATE ${table} SET ${column}=$1 WHERE ${where}=$2`, [value, id]);
      const before = (await client.query(`SELECT ${column} FROM ${table} WHERE ${where}=$1`, [id])).rows;
      await refusesDown(client);
      expect((await client.query(`SELECT ${column} FROM ${table} WHERE ${where}=$1`, [id])).rows).toEqual(before);
    });
  });
  it.each([
    ["material_replication_lineages", "INSERT INTO material_replication_lineages(workspace_id,media,source_material_id,derived_material_id,method) VALUES($1,'KUAISHOU','source','derived','mixed')"],
    ["material_experiment_policies", "INSERT INTO material_experiment_policies(workspace_id,policy_version,policy) VALUES($1,'synthetic','{}')"],
    ["workspace_flags", "INSERT INTO workspace_flags(workspace_id) VALUES($1)"],
    ["account_tests", "INSERT INTO account_tests(workspace_id,media,account_id,purpose,started_at) VALUES($1,'KUAISHOU','synthetic-account','synthetic','2001-01-01')"],
    ["account_replications", "INSERT INTO account_replications(workspace_id,source_media,source_account_id,target_media,target_account_id,include) VALUES($1,'KUAISHOU','source','KUAISHOU','target','{}')"],
    ["settlement_corrections", "INSERT INTO settlement_corrections(settlement_id,row_key,field_key,reason,corrected_by) VALUES($1,'row','field','synthetic','00000000-0000-4000-8000-000000000001')"],
  ])("preserves %s rows on refused downgrade", async (table, insert) => {
    await isolated(async (client, ws, settlement) => {
      await client.query("INSERT INTO accounts(workspace_id,media,account_id) VALUES($1,'KUAISHOU','synthetic-account')", [ws]);
      await client.query(insert!, [table === "settlement_corrections" ? settlement : ws]);
      await refusesDown(client);
      expect((await client.query(`SELECT count(*)::int AS count FROM ${table} WHERE ${table === "settlement_corrections" ? "settlement_id" : "workspace_id"}=$1`, [table === "settlement_corrections" ? settlement : ws])).rows[0].count).toBe(1);
    });
  });
  it("uses the full account tuple and permits identical IDs across media/workspaces", async () => {
    await isolated(async (client, ws) => {
      const other = randomUUID(); await client.query("INSERT INTO workspaces(id,name) VALUES($1,'synthetic other')", [other]);
      await client.query("INSERT INTO accounts(workspace_id,media,account_id) VALUES($1,'KUAISHOU','same'),($1,'TENCENT','same'),($2,'KUAISHOU','same')", [ws, other]);
      await client.query("INSERT INTO account_tests(workspace_id,media,account_id,purpose,started_at) VALUES($1,'KUAISHOU','same','synthetic','2001-01-01'),($1,'TENCENT','same','synthetic','2001-01-01'),($2,'KUAISHOU','same','synthetic','2001-01-01')", [ws, other]);
      expect((await client.query("SELECT count(*)::int AS count FROM account_tests WHERE workspace_id=ANY($1::uuid[])", [[ws, other]])).rows[0].count).toBe(3);
      await client.query("SAVEPOINT orphan");
      await expect(client.query("INSERT INTO account_tests(workspace_id,media,account_id,purpose,started_at) VALUES($1,'TOUTIAO','same','orphan','2001-01-01')", [ws])).rejects.toMatchObject({ code: "23503" });
      await client.query("ROLLBACK TO SAVEPOINT orphan");
    });
  });
  it("constrains lineage method and derived identity without conflating media/workspaces", async () => {
    await isolated(async (client, ws) => {
      const other = randomUUID();
      const insert = "INSERT INTO material_replication_lineages(workspace_id,media,source_material_id,derived_material_id,method) VALUES($1,$2,'source','same',$3)";
      await client.query(insert, [ws, "KUAISHOU", "mixed"]); await client.query(insert, [ws, "TENCENT", "mixed"]); await client.query(insert, [other, "KUAISHOU", "mixed"]);
      await client.query("SAVEPOINT duplicate");
      await expect(client.query(insert, [ws, "KUAISHOU", "mixed"])).rejects.toMatchObject({ code: "23505" });
      await client.query("ROLLBACK TO SAVEPOINT duplicate");
      await client.query("SAVEPOINT method");
      await expect(client.query(insert, [ws, "OTHER", "invalid"])).rejects.toMatchObject({ code: "23514" });
      await client.query("ROLLBACK TO SAVEPOINT method");
    });
  });
});
