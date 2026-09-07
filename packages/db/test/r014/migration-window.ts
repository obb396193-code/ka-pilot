import { readdirSync } from "node:fs";

import { runMigrations } from "../../src/migrate.js";

// 迁移回放测试不该把 count 写死在"当前迁移头部"上：任何一个新批次（015 R-014、013/014 R-011/R-012…）
// 落地都会让头部位移，把所有 `count: N` 的窗口整体错位。改成"回放到某个具名迁移为止"，
// 窗口就与头部无关。放在 test/r014/ 是 be2 的所有权边界；arch 批准后可移到 test/ 供两边共用。
function migrationNames(): string[] {
  return readdirSync(new URL("../../migrations", import.meta.url))
    .filter((name) => name.endsWith(".cjs"))
    .sort();
}

function countThrough(name: string): number {
  const names = migrationNames();
  const index = names.findIndex((candidate) => candidate.startsWith(name));
  if (index < 0) throw new Error(`unknown migration: ${name}`);
  return names.length - index;
}

/** 从当前头部回滚，直到 `name` 这一号也被回滚掉（含）。返回实际回滚的迁移数。 */
export async function downThrough(databaseUrl: string, name: string): Promise<number> {
  const count = countThrough(name);
  const applied = await runMigrations({ databaseUrl, direction: "down", count });
  return applied.length;
}

/** 与 downThrough 对称地升回头部。返回实际执行的迁移数。 */
export async function upThrough(databaseUrl: string, name: string): Promise<number> {
  const count = countThrough(name);
  const applied = await runMigrations({ databaseUrl, count });
  return applied.length;
}

/** 窗口宽度（= 从 `name` 到头部的迁移数），供断言 toHaveLength 使用。 */
export const windowSize = countThrough;
