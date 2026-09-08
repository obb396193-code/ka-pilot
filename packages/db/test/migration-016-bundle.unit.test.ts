import { readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const contract = readFileSync(new URL("../../contract/schema.sql", import.meta.url), "utf8");
const normalize = (text: string) => text.replace(/--[^\n]*/g, "").replace(/\s+/g, " ").trim();
const statements = (text: string) => normalize(text).split(";").map(s => s.trim()).filter(Boolean);
const start = contract.indexOf("-- v1.6 新增"), end = contract.indexOf("-- v1.7 新增");
if (start < 0 || end <= start) throw new Error("Frozen v1.6 boundary missing");
const frozen = statements(contract.slice(start, end));
function sqlFor(direction: "up" | "down"): string {
  const migration = require("../migration-drafts/016_contract_v1_6.cjs") as Record<typeof direction, (pgm: { sql: (s: string) => void }) => void>;
  const sql: string[] = []; migration[direction]({ sql: s => sql.push(s) }); return sql.join("\n");
}
const newTables = frozen.flatMap(s => /^CREATE TABLE (\w+)/.exec(s)?.[1] ?? []);
const newColumns = frozen.flatMap(s => { const m = /^ALTER TABLE (\w+) ADD COLUMN (\w+)/.exec(s); return m ? [{ table: m[1]!, column: m[2]! }] : []; });

describe("016 exact frozen material/settlement DDL", () => {
  it("keeps exactly one draft outside the runner until 014 base tables land", () => {
    expect(readdirSync(new URL("../migration-drafts", import.meta.url)).filter(n => n.startsWith("016_"))).toEqual(["016_contract_v1_6.cjs"]);
    expect(readdirSync(new URL("../migrations", import.meta.url)).filter(n => n.startsWith("016_"))).toEqual([]);
  });
  it("contains exactly all frozen statements in order, no alternate schema", () => {
    expect(newTables).toHaveLength(6); expect(newColumns).toHaveLength(40);
    expect(statements(sqlFor("up")).filter(s => !s.startsWith("SET LOCAL"))).toEqual(frozen);
  });
  it("reverses every created table and added column exactly once", () => {
    const down = sqlFor("down");
    for (const table of newTables) expect(down.match(new RegExp(`DROP TABLE ${table};`, "g"))).toHaveLength(1);
    for (const { table, column } of newColumns) expect(down.match(new RegExp(`ALTER TABLE ${table} DROP COLUMN ${column};`, "g"))).toHaveLength(1);
    expect(down).not.toMatch(/CASCADE|TRUNCATE|DELETE FROM|UPDATE /);
  });
  it("locks all affected tables before guards and checks every new field/table before drop", () => {
    const down = sqlFor("down"), firstDrop = down.indexOf("DROP TABLE");
    expect(down.indexOf("IN ACCESS EXCLUSIVE MODE")).toBeLessThan(down.indexOf("DO $$"));
    for (const table of newTables) expect(down.slice(0, firstDrop)).toContain(`EXISTS (SELECT 1 FROM ${table})`);
    for (const { table, column } of newColumns) expect(down.slice(0, firstDrop)).toMatch(new RegExp(`FROM ${table} WHERE ${column} IS (NOT NULL|DISTINCT FROM)`));
  });
  it("keeps bounded maintenance transactions and does not touch other batches", () => {
    for (const direction of ["up", "down"] as const) {
      expect(sqlFor(direction)).toContain("SET LOCAL lock_timeout = '5s'");
      expect(sqlFor(direction)).toContain("SET LOCAL statement_timeout = '5min'");
    }
    expect(sqlFor("up")).not.toMatch(/ALTER TABLE (accounts|tasks|work_items)|CREATE TABLE (team_sync|strategies|ad_entities)/);
  });
});
