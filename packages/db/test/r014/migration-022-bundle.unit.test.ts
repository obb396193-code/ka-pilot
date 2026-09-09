import { createRequire } from "node:module";
import { readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
type Migration = { up: (pgm: { sql: (sql: string) => void }) => void; down: (pgm: { sql: (sql: string) => void }) => void };
function sqlFor(direction: "up" | "down"): string {
  const migration = require("../../migrations/022_contract_v1_9_8_trgm.cjs") as Migration;
  const statements: string[] = [];
  migration[direction]({ sql: (sql) => { statements.push(sql); } });
  return statements.join("\n");
}

describe("022 trigram package (not PostgreSQL SQL execution)", () => {
  it("contains exactly one 022", () => {
    expect(readdirSync(new URL("../../migrations", import.meta.url)).filter((name) => name.startsWith("022_")))
      .toEqual(["022_contract_v1_9_8_trgm.cjs"]);
  });

  it("creates the extension and both trigram indexes", () => {
    const sql = sqlFor("up");
    expect(sql).toContain("CREATE EXTENSION IF NOT EXISTS pg_trgm");
    expect(sql).toContain("title gin_trgm_ops");
    expect(sql).toContain("content_text gin_trgm_ops");
  });

  it("survives a database where the extension cannot be installed", () => {
    const sql = sqlFor("up");
    // 装扩展要权限；装不上就不建索引，别让整批迁移失败卡住部署——搜索侧有 ILIKE 兜底。
    expect(sql).toContain("EXCEPTION WHEN insufficient_privilege");
    expect(sql).toContain("IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_trgm')");
  });

  it("does not touch 019's own objects or drop the shared extension on rollback", () => {
    expect(sqlFor("up")).not.toContain("CREATE TABLE");
    expect(sqlFor("up")).not.toContain("DROP");
    const down = sqlFor("down");
    // 扩展是共享的，回滚一个搜索索引不该顺手卸掉它。
    expect(down).not.toContain("DROP EXTENSION");
    expect(down).toContain("DROP INDEX IF EXISTS idx_kb_documents_title_trgm");
  });

  it("never deletes or rewrites rows", () => {
    for (const direction of ["up", "down"] as const) {
      expect(sqlFor(direction)).not.toMatch(/DELETE FROM|TRUNCATE|UPDATE /);
    }
  });

  it("uses bounded stopped-worker migration transactions", () => {
    for (const direction of ["up", "down"] as const) {
      expect(sqlFor(direction)).toContain("SET LOCAL lock_timeout = '5s'");
    }
  });
});
