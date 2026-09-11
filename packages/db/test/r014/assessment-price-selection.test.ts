import { readFileSync, readdirSync, statSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * 绊线：「取当前生效考核价」这条判定只准有一处实现。
 *
 * v1.9.28 加了 `op='revoke'` 作废段之后，每一个「`effective_date <= D` 取最近一条」的读点
 * 都必须同时排掉已作废的段。这条判定原来抄在六个文件里；漏改一处，那一处就会拿**已经作废的价**
 * 继续算达标、算超成本——而且算出来的数看着完全正常，不报错、不告警。
 * 授权谓词那次是同一个根因（同一段 SQL 抄多份，迟早漂掉），这里直接用形状挡住。
 *
 * 挡法：`assessment_price_history` 的**选价**查询必须调 `assessment-price-selection.ts` 的 helper。
 * 只列历史（要显示作废行）与写入不算选价，列在豁免名单里并写明理由。
 */
const SRC = new URL("../../src/", import.meta.url);
const DEFINITION = "assessment-price-selection.ts";

/** 明确不选价的用法：读全量历史给人看、写入、以及只数条数。 */
const EXEMPT: { file: string; why: string }[] = [
  { file: "task-repository.ts", why: "listAssessmentPriceHistory 要把作废行一起列出来（历史弹层显示作废标记）" },
  { file: "r014/task-timeline-repository.ts", why: "时间线列的是「改价这件事」本身，作废也是一次事件" },
  { file: "r014/task-detail-repository.ts", why: "historyCount 数的是改过几次，含作废行" },
  { file: "r014/assessment-price-repository.ts", why: "写入路径（INSERT）与按生效日定位待作废段" },
];

function sources(directory: URL): URL[] {
  const found: URL[] = [];
  for (const name of readdirSync(directory)) {
    const child = new URL(name, directory);
    if (statSync(child).isDirectory()) { found.push(...sources(new URL(`${name}/`, directory))); continue; }
    if (name.endsWith(".ts") && name !== DEFINITION) found.push(child);
  }
  return found;
}

describe("the effective assessment price is decided in exactly one place", () => {
  it("routes every price lookup through the shared helper", () => {
    const offenders: string[] = [];
    let lookups = 0;
    for (const file of sources(SRC)) {
      const relative = file.pathname.split("/src/")[1]!;
      const source = readFileSync(file, "utf8");
      if (!source.includes("assessment_price_history")) continue;
      lookups += 1;
      const usesHelper = source.includes("assessmentPriceEffectiveSql")
        || source.includes("assessmentPriceNotRevokedSql");
      const exempt = EXEMPT.some((entry) => entry.file === relative);
      if (!usesHelper && !exempt) offenders.push(relative);
      // 豁免的文件如果自己写了日期上界，那它其实在选价，豁免理由就不成立了。
      if (exempt && !usesHelper && /effective_date\s*<=/.test(source)) {
        offenders.push(`${relative}（豁免但仍在按生效日选价）`);
      }
    }
    expect(offenders).toEqual([]);
    // 扫不到东西时这条测试会变成永远绿：碰这张表的文件至少有六个（六个读点 + 写入）。
    expect(lookups).toBeGreaterThan(5);
  });

  it("keeps the revoke rule itself in the shared file", () => {
    const helper = readFileSync(new URL(DEFINITION, SRC), "utf8");
    expect(helper).toContain("op = 'set'");
    expect(helper).toContain("revoked.op = 'revoke'");
    // 作废比的是生效日：revoke 行作废的是同一生效日的整段。
    expect(helper).toContain("revoked.effective_date = ");
    // 每个别名都带表前缀——不带前缀会在 EXISTS 子查询里自比自，谓词退化成恒真。
    expect(helper).not.toMatch(/WHERE\s+workspace_id/);
  });
});
