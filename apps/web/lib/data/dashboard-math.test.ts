import assert from "node:assert/strict"
import test from "node:test"

import { aggregateDays, allocateBi } from "./dashboard-math.ts"

const available = (value: number) => ({ value, availability: "available" as const })
const missing = { value: null, availability: "missing" as const }
const cost = (value: number | null) => ({ metrics: { cost: value === null ? missing : available(value) } })

/**
 * 分摊的六个边界（审查员 D 点名要补的那组）。
 * 这些用例之所以重要：分摊算错**不会报任何错**，只会让每一行的「考核 BI 数」
 * 悄悄偏小，而那一列正是判达标用的。
 */

test("正常分摊：按消耗占比取整", () => {
  const bi = allocateBi({ parentBi: available(1000), siblings: [cost(600), cost(400)], childCost: 600 })
  assert.equal(bi, 600)
})

test("★分母是同级之和，不是父行消耗 —— 列表被截断时这两个不一样", () => {
  // 父行 1000，但只返回了两行共 800：分母取 800，两行加起来才等于父行的 BI 数。
  // 取 1000 的话每行都偏小，加起来也对不上父行。
  const siblings = [cost(500), cost(300)]
  const a = allocateBi({ parentBi: available(100), siblings, childCost: 500 })
  const b = allocateBi({ parentBi: available(100), siblings, childCost: 300 })
  assert.equal(a, 63)
  assert.equal(b, 38)
  assert.equal((a ?? 0) + (b ?? 0), 101) // 取整误差 ±1，但量级对得上
})

test("结果不完整时整列不分摊", () => {
  assert.equal(allocateBi({ parentBi: available(1000), siblings: [cost(600)], childCost: 600, incomplete: true }), null)
})

test("父行 BI 缺数 / 待到 时不分摊，不拿 0 顶", () => {
  assert.equal(allocateBi({ parentBi: missing, siblings: [cost(600)], childCost: 600 }), null)
  assert.equal(allocateBi({ parentBi: { value: null, availability: "pending" }, siblings: [cost(600)], childCost: 600 }), null)
  assert.equal(allocateBi({ parentBi: null, siblings: [cost(600)], childCost: 600 }), null)
})

test("★父行 BI = 0 要分摊出 0，不能当成「没有」", () => {
  // 用 falsy 判断的话 0 会被吃掉、退成 null，界面显「−」——
  // 但「一个 BI 都没回传」是实打实的事实，显「−」等于把它藏了
  assert.equal(allocateBi({ parentBi: available(0), siblings: [cost(600), cost(400)], childCost: 600 }), 0)
})

test("同级里有缺数的行 → 分母不可信，不分摊", () => {
  assert.equal(allocateBi({ parentBi: available(1000), siblings: [cost(600), cost(null)], childCost: 600 }), null)
})

test("同级消耗全是 0 → 不分摊（不能除以 0）", () => {
  assert.equal(allocateBi({ parentBi: available(1000), siblings: [cost(0), cost(0)], childCost: 0 }), null)
})

/** 按天汇总的口径 */

const day = (ds: string, c: number | null, cash: number, conv: number, real: number) => ({
  ds,
  metrics: {
    cost: c === null ? missing : available(c),
    cashCost: available(cash), conversion: available(conv), realConversion: available(real),
  },
})

test("窗口外的天不计入", () => {
  const result = aggregateDays([day("2026-09-01", 100, 80, 10, 8), day("2026-09-09", 999, 999, 99, 99)], "2026-09-01", "2026-09-05")
  assert.equal(result?.days, 1)
  assert.equal(result?.cost, 100)
})

test("窗口内一天都没有 → null，不拿全量顶上", () => {
  assert.equal(aggregateDays([day("2026-09-09", 100, 80, 10, 8)], "2026-09-01", "2026-09-05"), null)
})

test("★有一天缺数 → 那一项的和是 null，不把缺的当 0 加进去", () => {
  const result = aggregateDays([day("2026-09-01", 100, 80, 10, 8), day("2026-09-02", null, 80, 10, 8)], "2026-09-01", "2026-09-05")
  assert.equal(result?.cost, null, "消耗缺一天，和就不完整")
  assert.equal(result?.cashCost, 160, "没缺的项照常求和")
})

test("★比率用总和÷总和，不是对每天的比率取平均", () => {
  // 两天：第一天 1000/10=100，第二天 100/10=10。逐日平均是 55，总和÷总和是 55？
  // 不是——(1000+100)/(10+10)=55。换一组能区分的：
  // 第一天 1000/100=10，第二天 100/1=100。逐日平均 55，总和÷总和 = 1100/101 ≈ 10.9。
  const result = aggregateDays(
    [day("2026-09-01", 1000, 1000, 100, 100), day("2026-09-02", 100, 100, 1, 1)],
    "2026-09-01", "2026-09-05",
  )
  assert.ok(result)
  assert.ok(Math.abs(result.realCpa! - 1100 / 101) < 0.001, `应当是 1100/101≈10.89，实得 ${result.realCpa}`)
  assert.notEqual(Math.round(result.realCpa!), 55, "逐日取平均会被小消耗日拉偏到 55")
})

test("真实转化为 0 时比率是 null，不是 Infinity", () => {
  const result = aggregateDays([day("2026-09-01", 100, 80, 0, 0)], "2026-09-01", "2026-09-05")
  assert.equal(result?.realCpa, null)
})
