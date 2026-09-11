import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

import { accountSummaryRowSchema, dimensionWindowRowSchema } from "./canonical-query-rows.ts"
import { biCostText, mv, normalizeBiCost } from "../fixtures/contract.ts"

/**
 * F8-19b ⑰：过渡 fixture 的门禁。
 *
 * 这四份是后端 fixture 到位前 fe 自写的（`lib/data/fixtures/v1922/`）。原来它们靠
 * `as unknown as Fixture<…>` 进代码——**断言不校验任何东西**，于是压着十几处不合 schema 的字段
 * 谁也不知道；等真接口一上，页面拿到的形状和写死的假设对不上，就是又一次线上崩。
 *
 * 这里用**真正的 zod schema** 逐行 parse。后端把真 fixture 导出后，这个文件连同那四份一起删。
 */
function load(name: string): unknown {
  return JSON.parse(readFileSync(new URL(`./fixtures/v1922/${name}`, import.meta.url), "utf8"))
}
function rowsOf(payload: unknown): unknown[] {
  return ((payload as { data: { source: { rows: unknown[] } } }).data.source.rows)
}

test("summary 过渡 fixture 逐字段过 canonical schema", () => {
  const row = accountSummaryRowSchema.parse(rowsOf(load("summary.json"))[0])
  // v1.9.27 三项都在。biCashCost 的形状 v1.9.32 改判成 RatioValue，
  // be2 Q-041 ③ 切换前后端还发 MetricValue 形，所以 schema 两形都收——这里只断言「能收」，
  // 归一后的取值由 normalizeBiCost 的用例管。③ 落地后这里收窄成 state。
  assert.equal(row.assessment.biConv?.availability, "available")
  assert.ok(row.assessment.biCashCost, "biCashCost 必须在")
  assert.equal(normalizeBiCost(row.assessment.biCashCost).known, true)
  // 激励花费是独立字段，不是 costSpace
  assert.equal(row.metrics.incentiveCost?.availability, "available")
  assert.notEqual(row.metrics.incentiveCost?.value, row.metrics.costSpace.value)
})

test("summary 的 overCost 与考核价自洽：现金 − BI×价", () => {
  const row = accountSummaryRowSchema.parse(rowsOf(load("summary.json"))[0])
  const cash = row.metrics.cashCost.value
  const bi = row.assessment.biConv?.value
  const price = row.assessment.price?.value
  const over = row.assessment.overCost?.value
  assert.ok(cash !== null && bi != null && price != null && over != null)
  // 允许分位误差，但不能是随手编的数
  assert.ok(Math.abs(over - (cash - bi * price)) < 0.01, `overCost 对不上：${over} vs ${cash - bi * price}`)
})

test("环比走后端 compare.deltas，不再自造 previous", () => {
  const raw = rowsOf(load("summary.json"))[0] as Record<string, unknown>
  assert.equal(raw.previous, undefined, "previous 是前端自造的，已废除")
  const row = accountSummaryRowSchema.parse(raw)
  assert.equal(row.compare?.mode, "prev_window")
  assert.equal(row.compare?.deltas.cost.state, "finite")
})

test("两份维度 fixture 的每一行都过 dimension schema", () => {
  for (const name of ["dimension-optimizer.json", "dimension-resource-position.json", "dimension-biz.json"]) {
    for (const row of rowsOf(load(name))) dimensionWindowRowSchema.parse(row)
  }
})

test("钻取树的每一行都过 dimension schema；下级不自带考核 BI 数（留给前端分摊）", () => {
  const byParent = (load("drill.json") as { data: { byParent: Record<string, unknown[]> } }).data.byParent
  let checked = 0
  for (const rows of Object.values(byParent)) {
    for (const row of rows) {
      const parsed = dimensionWindowRowSchema.parse(row)
      assert.equal(parsed.assessment.biConv, undefined, "下钻层不该自带 biConv——那会绕过分摊口径")
      checked += 1
    }
  }
  assert.ok(checked > 20, `钻取树行数太少（${checked}），fixture 可能没生成全`)
})

test("账户层的 key 是 <MEDIA>:<accountId> —— 账户链接靠它判，不靠层级深度", () => {
  const byParent = (load("drill.json") as { data: { byParent: Record<string, { key: string }[]> } }).data.byParent
  const accountKeys = Object.values(byParent).flat().map((row) => row.key).filter((key) => key.includes(":"))
  assert.ok(accountKeys.length > 0)
  for (const key of accountKeys) assert.match(key, /^[A-Z0-9_]{1,32}:[A-Za-z0-9_-]{1,128}$/)
})

test("任务大类顶层行与 summary 同源：消耗之和 = summary 的账面花费", () => {
  // ★审查 ③ 点名的坑：把契约里那份 personal 的 biz 行挂在 team summary 下，
  // 分摊的分母就整个错了。这条把「同源」钉死。
  const summary = accountSummaryRowSchema.parse(rowsOf(load("summary.json"))[0])
  const total = rowsOf(load("dimension-biz.json"))
    .map((row) => dimensionWindowRowSchema.parse(row))
    .reduce((sum, row) => sum + (row.metrics.cost.value ?? 0), 0)
  assert.equal(Math.round(total), Math.round(summary.metrics.cost.value ?? -1))
})

test("biCashCost 两形都认（v1.9.32 过渡），且 ∞ 不能显成「−」", () => {
  // 老形（MetricValue）：be2 Q-041 ③ 切换前后端还这么发
  assert.deepEqual(normalizeBiCost({ value: 12.5, availability: "available" }), { known: true, infinite: false, value: 12.5 })
  // 新形（RatioValue）
  assert.deepEqual(normalizeBiCost({ value: 12.5, state: "finite" }), { known: true, infinite: false, value: 12.5 })
  // ★花了现金但零 BI 回传：最该被看见的一档，不能和「没数」混成同一个「−」
  assert.equal(biCostText({ value: null, state: "infinite" }), "∞ · 无 BI 回传")
  // 后端没给：按考核 BI 数是「还没到」还是「没有」分别显
  assert.equal(biCostText(undefined, { value: null, availability: "pending" }), "待到")
  assert.equal(biCostText(undefined, { value: null, availability: "missing" }), "−")
  assert.equal(biCostText({ value: null, state: "undefined" }, { value: null, availability: "pending" }), "待到")
})

test("pending 显「待到」不显「−」：还没到 ≠ 没有", () => {
  assert.equal(mv({ value: null, availability: "pending" }), "待到")
  assert.equal(mv({ value: null, availability: "missing" }), "−")
  assert.equal(mv({ value: 0, availability: "available" }), "0", "真实的 0 要显 0")
})
