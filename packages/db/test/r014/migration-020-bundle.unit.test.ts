import { readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
type Migration = { up: (pgm: { sql: (sql: string) => void }) => void; down: (pgm: { sql: (sql: string) => void }) => void };
function sqlFor(direction: "up" | "down"): string {
  const migration = require("../../migrations/020_contract_v1_9_3_passwords.cjs") as Migration;
  const statements: string[] = [];
  migration[direction]({ sql: (sql) => { statements.push(sql); } });
  return statements.join("\n");
}
const normalize = (text: string) => text.replace(/--[^\n]*/g, "").replace(/\s+/g, " ").trim();

const contract = readFileSync(new URL("../../../contract/schema.sql", import.meta.url), "utf8");
const start = contract.indexOf("-- v1.9.3（2026-09-09 arch 裁 be2 Q-021 ①");
const FROZEN = normalize(contract.slice(start, contract.indexOf("-- ═══ 业务对象 ═══", start)))
  .split(";").map((statement) => statement.trim()).filter(Boolean);

describe("020 frozen DDL package (not PostgreSQL SQL execution)", () => {
  it("contains exactly one 020 and the frozen v1.9.3 statement", () => {
    expect(readdirSync(new URL("../../migrations", import.meta.url)).filter((name) => name.startsWith("020_")))
      .toEqual(["020_contract_v1_9_3_passwords.cjs"]);
    expect(FROZEN).toHaveLength(1);
    for (const statement of FROZEN) expect(normalize(sqlFor("up"))).toContain(statement);
  });

  it("creates only the password table and touches no existing one", () => {
    const sql = sqlFor("up");
    expect(sql).toContain("CREATE TABLE identity_passwords");
    expect(sql).not.toContain("ALTER TABLE");
    // auth_identities 明写「不存密码/token」；密码落在自己的表里，不许回头往它上面加列。
    expect(sql).not.toMatch(/CREATE TABLE (auth_identities|auth_sessions|users)/);
  });

  it("never deletes or rewrites existing rows", () => {
    for (const direction of ["up", "down"] as const) {
      expect(sqlFor(direction)).not.toMatch(/DELETE FROM|TRUNCATE|UPDATE /);
    }
  });

  it("refuses a downgrade that would lock self-served users out", () => {
    const sql = sqlFor("down");
    expect(sql).toContain("identity_passwords still holds rows; cannot downgrade losslessly");
    expect(sql.indexOf("still holds rows")).toBeLessThan(sql.indexOf("DROP TABLE"));
    expect(sql).not.toMatch(/DROP[^;]*CASCADE/);
  });

  it("uses bounded stopped-worker migration transactions", () => {
    for (const direction of ["up", "down"] as const) {
      expect(sqlFor(direction)).toContain("SET LOCAL lock_timeout = '5s'");
      expect(sqlFor(direction)).toContain("SET LOCAL statement_timeout = '5min'");
    }
  });
});
