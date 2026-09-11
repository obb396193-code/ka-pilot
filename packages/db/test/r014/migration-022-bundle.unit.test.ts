import { createRequire } from "node:module";
import { readFileSync, readdirSync } from "node:fs";
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
    // 缺 contrib 控制文件的精简 PG 抛 0A000 feature_not_supported（内网实测整批迁移回滚），也要接住。
    expect(sql).toContain("OR feature_not_supported");
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

describe("023 demo-workspace marker (not PostgreSQL SQL execution)", () => {
  const require023 = createRequire(import.meta.url);
  const sql023 = (direction: "up" | "down"): string => {
    const migration = require023("../../migrations/023_contract_v1_9_6_demo.cjs") as Migration;
    const statements: string[] = [];
    migration[direction]({ sql: (sql) => { statements.push(sql); } });
    return statements.join("\n");
  };

  it("adds only the marker column, transcribed from schema.sql", () => {
    const contract = readFileSync(new URL("../../../contract/schema.sql", import.meta.url), "utf8");
    expect(contract).toContain("is_demo BOOLEAN NOT NULL DEFAULT false");
    expect(sql023("up")).toContain("ALTER TABLE workspaces ADD COLUMN is_demo BOOLEAN NOT NULL DEFAULT false");
    // v1.9.12 撤回了「放宽 kind 约束」那一版：不加 demo kind，就不该动这个约束。
    expect(sql023("up")).not.toContain("workspaces_kind_ck");
    expect(sql023("up")).not.toContain("CREATE TABLE");
  });

  it("refuses to drop the marker while a demo workspace still exists", () => {
    const down = sql023("down");
    // 丢了标记，演示空间就变成一个看起来是真数据的团队空间，访客会落进去。
    expect(down).toContain("demo workspaces still exist");
    expect(down.indexOf("still exist")).toBeLessThan(down.indexOf("DROP COLUMN"));
  });

  it("never deletes or rewrites rows", () => {
    for (const direction of ["up", "down"] as const) {
      expect(sql023(direction)).not.toMatch(/DELETE FROM|TRUNCATE|UPDATE /);
    }
  });
});
});