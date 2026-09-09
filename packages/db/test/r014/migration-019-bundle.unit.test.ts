import { readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
type Migration = { up: (pgm: { sql: (sql: string) => void }) => void; down: (pgm: { sql: (sql: string) => void }) => void };
function sqlFor(direction: "up" | "down"): string {
  const migration = require("../../migrations/019_contract_v1_4_kb.cjs") as Migration;
  const statements: string[] = [];
  migration[direction]({ sql: (sql) => { statements.push(sql); } });
  return statements.join("\n");
}
const normalize = (text: string) => text.replace(/--[^\n]*/g, "").replace(/\s+/g, " ").trim();

const contract = readFileSync(new URL("../../../contract/schema.sql", import.meta.url), "utf8");
// 019 = schema.sql 的 8.x 知识库整段。契约是唯一权威，逐句比对，不许手抄漂移。
const start = contract.indexOf("-- ── 8.x 知识库");
const FROZEN = normalize(contract.slice(start, contract.indexOf("-- ── 9.4 卡片中心", start)))
  .split(";").map((statement) => statement.trim()).filter(Boolean);

const NEW_TABLES = ["kb_documents", "kb_revisions", "kb_links", "kb_business_refs"];

describe("019 frozen DDL package (not PostgreSQL SQL execution)", () => {
  it("contains exactly one 019 and every frozen 8.x statement", () => {
    expect(readdirSync(new URL("../../migrations", import.meta.url)).filter((name) => name.startsWith("019_")))
      .toEqual(["019_contract_v1_4_kb.cjs"]);
    expect(FROZEN.length).toBe(5);
    for (const statement of FROZEN) expect(normalize(sqlFor("up"))).toContain(statement);
  });

  it("creates the four kb tables and nothing owned by another batch", () => {
    const sql = sqlFor("up");
    for (const table of NEW_TABLES) expect(sql).toContain(`CREATE TABLE ${table}`);
    // 8.x 之后紧接着的是 9.4 卡片中心，切片越界最容易把它带进来。
    expect(sql).not.toMatch(/CREATE TABLE (card_templates|card_instances|card_callbacks|settlement_lines)/);
  });

  it("carries the full-text index the search endpoint depends on", () => {
    expect(normalize(sqlFor("up")))
      .toContain("CREATE INDEX idx_kb_documents_fts ON kb_documents USING gin (to_tsvector('simple'");
  });

  it("adds no column to tables owned by earlier migrations", () => {
    expect(sqlFor("up")).not.toContain("ALTER TABLE");
  });

  it("never deletes or rewrites existing rows", () => {
    for (const direction of ["up", "down"] as const) {
      expect(sqlFor(direction)).not.toMatch(/DELETE FROM|TRUNCATE|UPDATE /);
    }
  });

  it("refuses a downgrade that would drop documents or their history", () => {
    const sql = sqlFor("down");
    for (const table of NEW_TABLES) {
      expect(sql).toContain(`${table} still holds rows; cannot downgrade losslessly`);
      // 闸必须挡在任何 DDL 之前，否则先 DROP 再报错等于白挡。
      expect(sql.indexOf(`${table} still holds rows`)).toBeLessThan(sql.indexOf("DROP TABLE"));
    }
    // kb_revisions/kb_links/kb_business_refs 都是 ON DELETE CASCADE 到 kb_documents，
    // DROP ... CASCADE 会连带删掉正文历史，绝不允许。
    expect(sql).not.toMatch(/DROP[^;]*CASCADE/);
  });

  it("drops children before the parent so no FK forces a cascade", () => {
    const down = normalize(sqlFor("down"));
    for (const child of ["kb_business_refs", "kb_links", "kb_revisions"]) {
      expect(down.indexOf(`DROP TABLE ${child}`)).toBeLessThan(down.indexOf("DROP TABLE kb_documents"));
    }
  });

  it("uses bounded stopped-worker migration transactions", () => {
    for (const direction of ["up", "down"] as const) {
      expect(sqlFor(direction)).toContain("SET LOCAL lock_timeout = '5s'");
      expect(sqlFor(direction)).toContain("SET LOCAL statement_timeout = '5min'");
    }
  });
});
