import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { PARTIAL_COLUMN_BY_FIELD } from "../src/data/canonical-query-rows.js";

/**
 * 绊线：SQL 侧「哪些列做部分合计」与响应侧「哪些字段能标 partial」必须是同一份名单。
 *
 * v1.9.40 的部分合计是两处配合的：`packages/db` 的 `METRIC_AGGREGATE_SQL` 为每个可加列
 * 多发一列 `<col>_complete`，`canonical-query-rows` 再按 `partial: string[]` 把对应字段
 * 标成 `availability:"partial"`。两边各存一份列名，**加一列时漏掉一边不会报错**：
 * `partialAware` 的 `?? field` 兜底会拿 camelCase 去名单里找 snake_case，一个也找不到，
 * 于是那一列永远显示成完整合计——用半个窗口的数冒充整窗，正是老板拍板 B 要消灭的那种错。
 *
 * 挡法：从 SQL 文本里把 `AS <col>_complete` 全抠出来，与映射表的取值集合逐字对齐。
 */
const SQL = readFileSync(new URL("../../../packages/db/src/semantic-query-metrics.ts", import.meta.url), "utf8");

describe("partial column parity between the SQL aggregate and the canonicalizer", () => {
  it("covers exactly the columns the aggregate marks completeness for", () => {
    const declared = SQL.match(/const SUM_COLUMNS = \[([^\]]*)\]/s);
    expect(declared, "SUM_COLUMNS 不再是一个字面量数组，这条绊线要跟着改").not.toBeNull();
    const sqlColumns = [...declared![1]!.matchAll(/"([a-z_]+)"/g)].map((match) => match[1]!);
    expect(sqlColumns.length).toBeGreaterThan(0);
    // 这份常量确实被用来发完整性标记，不是一个没人读的清单。
    expect(SQL).toMatch(/SUM_COLUMNS\.map\([^)]*\)[\s\S]*_complete/);
    expect([...new Set(Object.values(PARTIAL_COLUMN_BY_FIELD))].sort()).toEqual([...sqlColumns].sort());
  });

  it("maps every field name to a distinct column", () => {
    const columns = Object.values(PARTIAL_COLUMN_BY_FIELD);
    expect(new Set(columns).size, "两个字段映到同一列，其中一个永远标不上").toBe(columns.length);
  });
});
