import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * R-014 的 SQL 里有不少模板插值（列清单、可见性谓词、参数序号）。**只要有一处插的是
 * 请求数据，就是注入**，而这条不变量目前只靠写代码时自觉。这里立一道绊线：
 * 插值表达式必须落在下面这份「已人工核过、只含占位符与代码常量」的名单里，
 * 新增一种就会红——逼着加的人先解释清楚它插的是什么。
 */
const ALLOWED: RegExp[] = [
  /^[A-Z][A-Z0-9_]*$/,                                   // 模块常量：SELECT_COLUMNS / VISIBLE / SCOPED_METRIC …
  /^(accountScopeClause|workItemScopeClause)\(/,          // 授权谓词 helper：入参全是字面量（调用点已核）
  /^params\.length(\s*\+\s*\d+)?$/,                       // 参数序号
  /^conditions\.join\("\s*AND\s*"\)$/,                    // 条件片段，值一律走 $N
  /^where$/, /^kindClause$/, /^scoreColumn$/, /^metricColumns$/, // 本文件内拼的片段，均只含 $N 与列名
  // 时间线里两个源各自的授权谓词：装的是 accountScopeClause 的返回值（只含 $N 与列名），
  // 调用点传的是字面量列名，下面第二条用例会逐个验。
  /^allowedChangeset$/, /^allowedExternal$/,
  /^visible\.sql$/, /^mediaIndex$/,                       // 可见性子句与它的参数序号
  /^SELECT_COLUMNS\.replace\(/,                           // 去表别名，纯字符串变换
  /^hasBoundAt \? ", bound_at" : ""$/,                    // 列存在与否的二选一，两边都是字面量
];

/**
 * `workspace-authority.ts` 里那几处插的是**函数形参**（kindParam / listParam / alias …）。
 * 它们安全的前提不在定义处，而在「每个调用点传的都是字面量」——所以下面单独验这个前提，
 * 不靠把名字加进白名单蒙混过去。
 */
const HELPER_DEFINITION_SLOTS = new Set([
  "kindParam", "listParam", "alias", "mediaExpression", "accountExpression",
]);

const SQL_TEMPLATE = /`([^`]*?(?:SELECT|INSERT|UPDATE|DELETE)[^`]*?)`/gs;

function scan(directory: URL): { file: string; expression: string }[] {
  const found: { file: string; expression: string }[] = [];
  for (const name of readdirSync(directory)) {
    if (!name.endsWith(".ts")) continue;
    const source = readFileSync(new URL(name, directory), "utf8");
    for (const template of source.matchAll(SQL_TEMPLATE)) {
      for (const slot of template[1]!.matchAll(/\$\{([^}]+)\}/g)) {
        found.push({ file: name, expression: slot[1]!.trim() });
      }
    }
  }
  return found;
}

describe("no request data is ever concatenated into R-014 SQL", () => {
  it("only interpolates reviewed, value-free expressions", () => {
    const slots = [
      ...scan(new URL("../../src/r014/", import.meta.url)),
      ...scan(new URL("../../../../apps/worker/src/r014/", import.meta.url)),
    ];
    // 名单是白名单，不是黑名单：新写法默认不通过。
    const unreviewed = slots.filter((slot) =>
      !ALLOWED.some((pattern) => pattern.test(slot.expression))
      && !(slot.file === "workspace-authority.ts" && HELPER_DEFINITION_SLOTS.has(slot.expression)));
    expect(unreviewed.map((slot) => `${slot.file}: \${${slot.expression}}`)).toEqual([]);
    // 顺带守住「确实扫到了东西」——正则写错会让这条测试空转变成永远绿。
    expect(slots.length).toBeGreaterThan(30);
  });

  it("passes only string literals into the scope-clause helpers", () => {
    const callSites: string[] = [];
    for (const directory of ["../../src/r014/", "../../../../apps/worker/src/r014/"]) {
      const base = new URL(directory, import.meta.url);
      for (const name of readdirSync(base)) {
        if (!name.endsWith(".ts") || name === "workspace-authority.ts") continue;
        const source = readFileSync(new URL(name, base), "utf8");
        for (const call of source.matchAll(/(?:accountScopeClause|workItemScopeClause)\(([^)]*)\)/g)) {
          callSites.push(`${name}: ${call[1]!.trim()}`);
        }
      }
    }
    expect(callSites.length, "helper 一个调用点都没扫到，说明扫描写坏了").toBeGreaterThan(0);
    for (const site of callSites) {
      const args = site.slice(site.indexOf(":") + 1).split(",").map((argument) => argument.trim());
      for (const argument of args) {
        // 只允许 "$3" / "work_items" / "metric.media" 这类**字面量**；
        // 一旦有人把变量传进来，这条就红——那正是注入的入口。
        expect(/^"[^"]*"$/.test(argument), `${site} 里的 ${argument} 不是字面量`).toBe(true);
      }
    }
  });
});
