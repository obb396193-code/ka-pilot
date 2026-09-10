import { readFileSync, readdirSync, statSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * 绊线：`accountScopeClause` 的列表达式必须**带表前缀**。
 *
 * 起因是一处实测出来的越权：`accountScopeClause("$5","$6","media","account_id")` 里，
 * 不带前缀的 `media` 在 PG 的名字解析下**先命中子查询自己那一层**
 * （`jsonb_to_recordset(...) AS scoped(media text, account_id text)`），
 * 于是条件变成 `scoped.media = scoped.media` —— 恒真。闸看着装了，其实没装：
 * 任何有一条授权的成员都能列出全空间的行。这种退化不报错、不报警，只能靠形状挡。
 *
 * 挡法：调用点的第 3、4 个参数要么是带 `.` 的限定名（`parse.media`），
 * 要么是别的调用点传进来的变量名（`alias` 这类）——写死的裸列名一律拒。
 */
const SRC = new URL("../../src/", import.meta.url);
/** 谓词自己的定义处：形参不是列表达式，跳过。 */
const DEFINITION = "workspace-authority.ts";

function sources(directory: URL): URL[] {
  const found: URL[] = [];
  for (const name of readdirSync(directory)) {
    const child = new URL(name, directory);
    if (statSync(child).isDirectory()) { found.push(...sources(new URL(`${name}/`, directory))); continue; }
    if (name.endsWith(".ts") && name !== DEFINITION) found.push(child);
  }
  return found;
}

const CALL = /accountScopeClause\(\s*([^,]+),\s*([^,]+),\s*([^,]+),\s*([^)]+)\)/g;

describe("account scope predicates compare against the row, not against themselves", () => {
  it("qualifies every media/account expression handed to accountScopeClause", () => {
    const offenders: string[] = [];
    let calls = 0;
    for (const file of sources(SRC)) {
      const source = readFileSync(file, "utf8");
      for (const match of source.matchAll(CALL)) {
        calls += 1;
        for (const argument of [match[3]!, match[4]!]) {
          const expression = argument.trim();
          const isLiteral = expression.startsWith('"') || expression.startsWith("'");
          // 字面量必须带表前缀；非字面量是上游传进来的别名变量，由调用它的那层负责。
          if (isLiteral && !expression.includes(".")) {
            offenders.push(`${file.pathname.split("/src/")[1]}: ${expression}`);
          }
        }
      }
    }
    // 扫不到调用点时这条测试会变成永远绿，所以先守住「确实扫到了」。
    expect(calls).toBeGreaterThan(10);
    expect(offenders).toEqual([]);
  });

  /**
   * 第二条：授权 tuple 判定**只准有一处实现**。
   *
   * 上面那条只管调用点传了什么；手抄一份同形 SQL 的人根本不经过调用点，绊线就扫不到他。
   * 任务详情原来抄了六份、日报抄了一份——每一份都可能各自漂成恒真，而且抄件出事没人会知道。
   * 所以直接禁掉这个形状：`EXISTS` + `jsonb_to_recordset(... media/account_id ...)` 的写法
   * 只能出现在 `workspace-authority.ts` 里。要新的判定就往那里加函数，别就地抄。
   */
  it("keeps the tuple gate itself in exactly one file", () => {
    const handwritten: string[] = [];
    for (const file of sources(SRC)) {
      const source = readFileSync(file, "utf8");
      for (const match of source.matchAll(/SELECT 1\s+FROM jsonb_to_recordset/g)) {
        handwritten.push(`${file.pathname.split("/src/")[1]}: ${match[0]}`);
      }
    }
    expect(handwritten).toEqual([]);
    // 定义处必须还在——扫描目录写错会让这条空转。
    expect(readFileSync(new URL(`r014/${DEFINITION}`, SRC), "utf8"))
      .toContain("SELECT 1 FROM jsonb_to_recordset");
  });
});
