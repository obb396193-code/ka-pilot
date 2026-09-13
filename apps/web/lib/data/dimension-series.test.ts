import assert from "node:assert/strict"
import test from "node:test"

import { dimensionSeries } from "./dimension-series.ts"

const row = (label: string | null, value: number | null) => ({
  label,
  metrics: { cost: value === null ? { value: null, availability: "missing" as const } : { value, availability: "available" as const } },
})

test("★缺数的项不计入，但要单独数出来", () => {
  // 少了几项占比就全错，而图上完全看不出——所以必须能在标题里说「N 项缺数未计入」
  const { data, missing } = dimensionSeries([row("A", 100), row("B", null), row("C", null)])
  assert.equal(data.length, 1)
  assert.equal(missing, 2)
})

test("0 消耗剔除 —— 画出来是根看不见的柱", () => {
  const { data, missing } = dimensionSeries([row("A", 100), row("B", 0)])
  assert.deepEqual(data.map((item) => item.name), ["A"])
  assert.equal(missing, 0, "0 不是缺数，别混在一起数")
})

test("按消耗降序 —— 不排序等于让人自己找最大的那块", () => {
  const { data } = dimensionSeries([row("小", 10), row("大", 100), row("中", 50)])
  assert.deepEqual(data.map((item) => item.name), ["大", "中", "小"])
})

test("全是缺数 → 空数据 + 缺数计数，页面据此显空态", () => {
  const { data, missing } = dimensionSeries([row("A", null), row("B", null)])
  assert.equal(data.length, 0)
  assert.equal(missing, 2)
})

test("没有 label 的行显「未标注」，不显 null", () => {
  const { data } = dimensionSeries([row(null, 100)])
  assert.equal(data[0]!.name, "未标注")
})
