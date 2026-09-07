import { readdirSync } from "node:fs";

import { runMigrations } from "../src/migrate.js";

// 迁移回放测试不能把 count 写死在「当前迁移头部」上：任何新批次落地（013 R-011、014 R-012、
// 015 R-014、016 R-015、017 R-016…）都会让头部位移，把所有 `count: N` 的窗口整体错位。
// 改成「回放到某个具名迁移为止」，窗口就与头部无关。
// 原实现由 be2 在 R-014 S1 提出（test/r014/migration-window.ts），arch 采纳并移到中性路径供三方共用。
function migrationNames(): string[] {
  return readdirSync(new URL("../migrations", import.meta.url))
    .filter((name) => name.endsWith(".cjs"))
    .sort();
}

/** 迁移总数（全量回放断言用，不写死数字）。 */
export function migrationCount(): number {
  return migrationNames().length;
}

/** 窗口宽度：从 `name` 这一号到当前头部（含两端）的迁移数。 */
export function windowSize(name: string): number {
  const names = migrationNames();
  const index = names.findIndex((candidate) => candidate.startsWith(name));
  if (index < 0) throw new Error(`unknown migration: ${name}`);
  return names.length - index;
}

/** 从头部回滚，直到 `name` 这一号也被回滚掉（含）。 */
export async function downThrough(databaseUrl: string, name: string): Promise<number> {
  return (await runMigrations({ databaseUrl, direction: "down", count: windowSize(name) })).length;
}

/** 与 downThrough 对称地升回头部。 */
export async function upThrough(databaseUrl: string, name: string): Promise<number> {
  return (await runMigrations({ databaseUrl, count: windowSize(name) })).length;
}
