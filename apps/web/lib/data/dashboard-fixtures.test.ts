import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

import { accountSummaryRowSchema, dimensionWindowRowSchema } from "./canonical-query-rows.ts"

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
  // v1.9.27 三项都在，且 biCashCost 是 MetricValue（有 availability）不是 RatioValue（有 state）
  assert.equal(row.assessment.biConv?.availability, "available")
  assert.equal(row.assessment.biCashCost?.availability, "available")
  assert.ok("availability" in (row.assessment.biCashCost ?? {}), "biCashCost 必须是 MetricValue")
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
  for (const name of ["dimension-optimizer.json", "dimension-resource-position.json"]) {
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
