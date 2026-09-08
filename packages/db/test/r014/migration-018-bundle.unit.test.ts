import { readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
type Migration = { up: (pgm: { sql: (sql: string) => void }) => void; down: (pgm: { sql: (sql: string) => void }) => void };
function sqlFor(direction: "up" | "down"): string {
  const migration = require("../../migrations/018_contract_v1_8.cjs") as Migration;
  const statements: string[] = [];
  migration[direction]({ sql: (sql) => { statements.push(sql); } });
  return statements.join("\n");
}
const normalize = (text: string) => text.replace(/--[^\n]*/g, "").replace(/\s+/g, " ").trim();

const contract = readFileSync(new URL("../../../contract/schema.sql", import.meta.url), "utf8");
// 018 = schema.sql 的 v1.8 段 + arch 并进来的 v1.9 段（文件尾）。契约是唯一权威，逐句比对。
const FROZEN = normalize(contract.slice(contract.indexOf("-- ===== v1.8（2026-09-07 arch")))
  .split(";").map((statement) => statement.trim()).filter(Boolean);

const NEW_TABLES = ["naming_rules", "account_name_parses", "pool_status_daily_snapshot"];

describe("018 frozen DDL package (not PostgreSQL SQL execution)", () => {
  it("contains exactly one 018 and every frozen v1.8 / v1.9 statement", () => {
    expect(readdirSync(new URL("../../migrations", import.meta.url)).filter((name) => name.startsWith("018_")))
      .toEqual(["018_contract_v1_8.cjs"]);
    expect(FROZEN.length).toBeGreaterThan(5);
    for (const statement of FROZEN) expect(normalize(sqlFor("up"))).toContain(statement);
  });

  it("creates the three new tables and nothing owned by another batch", () => {
    const sql = sqlFor("up");
    for (const table of NEW_TABLES) expect(sql).toContain(`CREATE TABLE ${table}`);
    expect(sql).not.toMatch(
      /CREATE TABLE (team_sync_runs|task_budget_history|changeset_reversals|execution_run_items|materials|strategies)/,
    );
  });

  it("adds the three columns v1.9 assigned to this migration, and no others", () => {
    const sql = normalize(sqlFor("up"));
    expect(sql).toContain("ALTER TABLE account_access_grants ADD COLUMN revoked_at TIMESTAMPTZ");
    expect(sql).toContain("ALTER TABLE account_access_grants ADD COLUMN revoked_by UUID");
    expect(sql).toContain("ALTER TABLE alert_rules ADD COLUMN bound_at TIMESTAMPTZ");
    // 015 已合 main，不许在这里回改它的列。
    expect(sql).not.toContain("ALTER TABLE accounts ADD COLUMN pool_status");
    expect(sql).not.toContain("ALTER TABLE tasks ADD COLUMN stage");
  });

  it("never deletes or rewrites existing rows", () => {
    for (const direction of ["up", "down"] as const) {
      expect(sqlFor(direction)).not.toMatch(/DELETE FROM|TRUNCATE|UPDATE /);
    }
  });

  it("refuses a downgrade that would drop revocation history or binding times", () => {
    const sql = sqlFor("down");
    for (const guard of [
      "account_access_grants carries revocation history; cannot downgrade losslessly",
      "alert_rules carries binding timestamps; cannot downgrade losslessly",
    ]) {
      expect(sql).toContain(guard);
      expect(sql.indexOf(guard)).toBeLessThan(sql.indexOf("ALTER TABLE"));
    }
    for (const table of NEW_TABLES) {
      expect(sql).toContain(`${table} still holds rows; cannot downgrade losslessly`);
      expect(sql.indexOf(`${table} still holds rows`)).toBeLessThan(sql.indexOf("DROP TABLE"));
    }
    expect(sql).not.toMatch(/DROP[^;]*CASCADE/);
  });

  it("reverses every table and column it creates", () => {
    const down = normalize(sqlFor("down"));
    for (const table of NEW_TABLES) expect(down).toContain(`DROP TABLE ${table}`);
    expect(down).toContain("ALTER TABLE alert_rules DROP COLUMN bound_at");
    expect(down).toContain("DROP COLUMN revoked_by, DROP COLUMN revoked_at");
  });

  it("uses bounded stopped-worker migration transactions", () => {
    for (const direction of ["up", "down"] as const) {
      expect(sqlFor(direction)).toContain("SET LOCAL lock_timeout = '5s'");
      expect(sqlFor(direction)).toContain("SET LOCAL statement_timeout = '5min'");
    }
  });
});
