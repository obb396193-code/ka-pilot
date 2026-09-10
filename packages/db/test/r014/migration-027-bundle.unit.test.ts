import { readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
type Migration = { up: (pgm: { sql: (sql: string) => void }) => void; down: (pgm: { sql: (sql: string) => void }) => void };
function sqlFor(direction: "up" | "down"): string {
  const migration = require("../../migrations/027_contract_v1_9_28_task_manage.cjs") as Migration;
  const statements: string[] = [];
  migration[direction]({ sql: (sql) => { statements.push(sql); } });
  return statements.join("\n");
}

const contract = readFileSync(new URL("../../../contract/schema.sql", import.meta.url), "utf8");
function tableBody(name: string): string {
  const start = contract.indexOf(`CREATE TABLE ${name} (`);
  expect(start, `schema.sql 里找不到 ${name}`).toBeGreaterThan(-1);
  return contract.slice(start, contract.indexOf("\n);", start));
}

describe("027 task-manage package (not PostgreSQL SQL execution)", () => {
  it("contains exactly one 027 and does not squat on the number announced to Codex", () => {
    const migrations = readdirSync(new URL("../../migrations", import.meta.url));
    expect(migrations.filter((name) => name.startsWith("027_")))
      .toEqual(["027_contract_v1_9_28_task_manage.cjs"]);
    // 026 是 v1.9.25 公告给 Codex 的 dispatches；他那支还没合，占它会撞车。
    expect(migrations.filter((name) => name.startsWith("026_"))).toEqual([]);
  });

  it("adds exactly the columns the contract declares", () => {
    const sql = sqlFor("up");
    // 迁移与 schema.sql 必须说同一件事：契约是权威，迁移只是把它落到库里。
    for (const column of ["aliases TEXT[]", "monitor_url TEXT", "product_name TEXT"]) {
      expect(sql, column).toContain(`ADD COLUMN ${column}`);
      expect(tableBody("tasks"), column).toContain(column.split(" ")[0]!);
    }
    expect(sql).toContain("ADD COLUMN op TEXT NOT NULL DEFAULT 'set'");
    expect(tableBody("assessment_price_history")).toContain("op TEXT NOT NULL DEFAULT 'set'");
    // paused 只是 status 这个 TEXT 列的一个新取值，DDL 层没有枚举可改——但契约里得写着。
    expect(tableBody("tasks")).toContain("paused");
  });

  it("constrains op to the two values the price rule knows", () => {
    // 没有 CHECK 的话，写错一个值（'revoked'/'REVOKE'）会被当成普通 set 行，
    // 于是「已作废」的价悄悄继续生效——错在写入，报在算钱。
    expect(sqlFor("up")).toContain("CHECK (op IN ('set','revoke'))");
  });

  it("creates no table and rewrites no row", () => {
    for (const direction of ["up", "down"] as const) {
      expect(sqlFor(direction)).not.toContain("CREATE TABLE");
      expect(sqlFor(direction)).not.toMatch(/DELETE FROM|TRUNCATE|UPDATE /);
    }
  });

  it("refuses a downgrade that would silently revive revoked prices", () => {
    const down = sqlFor("down");
    for (const guard of [
      "tasks still carry v1.9.28 fields",
      "assessment_price_history still holds revoke rows",
      "tasks still hold paused status",
    ]) {
      expect(down).toContain(guard);
      expect(down.indexOf(guard), guard).toBeLessThan(down.indexOf("DROP COLUMN"));
    }
    expect(down).not.toMatch(/DROP[^;]*CASCADE/);
  });

  it("uses bounded stopped-worker migration transactions", () => {
    for (const direction of ["up", "down"] as const) {
      expect(sqlFor(direction)).toContain("SET LOCAL lock_timeout = '5s'");
      expect(sqlFor(direction)).toContain("SET LOCAL statement_timeout = '5min'");
    }
  });
});
