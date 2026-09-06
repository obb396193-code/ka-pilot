import { readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
type Migration = { up: (pgm: { sql: (sql: string) => void }) => void; down: (pgm: { sql: (sql: string) => void }) => void };
function sqlFor(direction: "up" | "down"): string {
  const migration = require("../migrations/012_contract_v1_3.cjs") as Migration;
  const statements: string[] = [];
  migration[direction]({ sql: (sql) => { statements.push(sql); } });
  return statements.join("\n");
}
const normalize = (text: string) => text.replace(/--[^\n]*/g, "").replace(/\s+/g, " ").trim();

describe("012 frozen DDL package (not PostgreSQL SQL execution)", () => {
  it("contains exactly one 012 and every frozen v1.3 statement", () => {
    expect(readdirSync(new URL("../migrations", import.meta.url)).filter((name) => name.startsWith("012_")))
      .toEqual(["012_contract_v1_3.cjs"]);
    const contract = readFileSync(new URL("../../contract/schema.sql", import.meta.url), "utf8");
    const block = contract.slice(contract.indexOf("-- v1.3 新增"), contract.indexOf("-- v1.4 新增"));
    const statements = normalize(block).split(";").map((s) => s.trim()).filter(Boolean);
    expect(statements.length).toBeGreaterThan(25);
    for (const statement of statements) expect(normalize(sqlFor("up"))).toContain(statement);
  });
  it("also includes op and availability additions, without 014/015", () => {
    const sql = normalize(sqlFor("up"));
    expect(sql).toContain("ADD COLUMN op TEXT NOT NULL DEFAULT 'divide' CHECK (op IN ('multiply','divide'))");
    expect(sql).toContain("ADD COLUMN availability_policy TEXT NOT NULL DEFAULT 'suppress'");
    expect(sql).toContain("CHECK (availability_policy IN ('suppress','evaluate_available_only'))");
    expect(sql).toContain("ADD COLUMN data_freshness_max_hours INT");
    expect(sql).not.toMatch(/CREATE TABLE (task_budget_history|card_callbacks|exports)/);
  });
  it("rejects orphan session children before any DDL and never deletes history", () => {
    const sql = sqlFor("up");
    for (const name of ["agent_messages", "agent_context_items"]) {
      expect(sql).toContain(`${name} contains orphan sessions`);
      expect(sql.indexOf(`${name} contains orphan sessions`)).toBeLessThan(sql.indexOf("ALTER TABLE"));
    }
    expect(sql).not.toMatch(/DELETE FROM|TRUNCATE/);
  });
  it("does not guess business type or message sequence during migration", () => {
    const sql = normalize(sqlFor("up"));
    expect(sql).toContain("TYPE JSONB USING to_jsonb(from_value)");
    expect(sql).toContain("TYPE JSONB USING to_jsonb(to_value)");
    expect(sql).not.toContain("UPDATE agent_messages");
    expect(sql).not.toContain("DROP COLUMN idealab_ak_ref");
  });
  it("refuses lossy JSON/op downgrade before dropping anything", () => {
    const sql = sqlFor("down");
    expect(sql).toContain("changeset_items contains typed JSON values; cannot downgrade losslessly");
    expect(sql).toContain("channel_coefficients contains multiply values; cannot downgrade semantics");
    expect(sql.indexOf("cannot downgrade semantics")).toBeLessThan(sql.indexOf("DROP"));
    expect(normalize(sql)).toContain("TYPE TEXT USING (from_value #>> '{}')");
    expect(normalize(sql)).toContain("TYPE TEXT USING (to_value #>> '{}')");
  });
  it.each(["account_mutes", "agent_run_events", "model_provider_credentials", "provider_model_capabilities"])("reverses %s explicitly without CASCADE", (table) => {
    expect(sqlFor("up")).toContain(`CREATE TABLE ${table}`);
    expect(sqlFor("down")).toContain(`DROP TABLE ${table}`);
    expect(sqlFor("down")).not.toMatch(/DROP[^;]*CASCADE/);
  });
  it("uses bounded stopped-worker migration transactions", () => {
    for (const direction of ["up", "down"] as const) {
      expect(sqlFor(direction)).toContain("SET LOCAL lock_timeout = '5s'");
      expect(sqlFor(direction)).toContain("SET LOCAL statement_timeout = '5min'");
    }
  });
});
