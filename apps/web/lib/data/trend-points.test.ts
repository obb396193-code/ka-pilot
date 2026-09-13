import assert from "node:assert/strict"
import test from "node:test"

import { trendPoints, type TrendRow } from "./trend-points.ts"

const day = (ds: string, cost: number | null, conversion: number, cpa: number | null): TrendRow => ({
  ds,
  metrics: {
    cost: cost === null ? { value: null, availability: "missing" } : { value: cost, availability: "available" },
    conversion: { value: conversion, availability: "available" },
    ratios: { realCpa: cpa === null ? { value: null, state: "undefined" } : { value: cpa, state: "finite" } },
  },
})

test("★横轴按窗口铺满 —— 后端没返回的那天也要在轴上", () => {
  // 只画返回的行，09-02 和 09-04 会挨在一起、看着像连续的，缺的那天没人发现
  const points = trendPoints([day("2026-09-01", 100, 10, 10), day("2026-09-04", 100, 10, 10)], "2026-09-01", "2026-09-05")
  assert.deepEqual(points.map((p) => p.ds), ["2026-09-01", "2026-09-02", "2026-09-03", "2026-09-04", "2026-09-05"])
  assert.equal(points[1]!.cost, null, "没返回的那天是 null，线在这儿断开")
  assert.equal(points[2]!.cost, null)
})

test("缺数的天给 null 不补 0 —— 补 0 会让曲线掉到底，看着像真的没花钱", () => {
  const points = trendPoints([day("2026-09-01", null, 10, 10)], "2026-09-01", "2026-09-01")
  assert.equal(points[0]!.cost, null)
  assert.notEqual(points[0]!.cost, 0)
})

test("realCpa 是 undefined/infinite 时给 null，不画一个假的点", () => {
  const points = trendPoints([day("2026-09-01", 100, 0, null)], "2026-09-01", "2026-09-01")
  assert.equal(points[0]!.cpa, null)
})

test("窗口外的行不进轴", () => {
  const points = trendPoints([day("2026-08-30", 999, 99, 99)], "2026-09-01", "2026-09-02")
  assert.equal(points.length, 2)
  assert.ok(points.every((p) => p.cost === null))
})

test("跨月按 UTC 推进，不会跳天或算重", () => {
  const points = trendPoints([], "2026-08-30", "2026-09-02")
  assert.deepEqual(points.map((p) => p.ds), ["2026-08-30", "2026-08-31", "2026-09-01", "2026-09-02"])
})

test("窗口非法（起点晚于终点 / 为空）→ 空轴，不死循环", () => {
  assert.deepEqual(trendPoints([], "2026-09-05", "2026-09-01"), [])
  assert.deepEqual(trendPoints([], "", ""), [])
})

test("窗口异常长时封顶，别把页面卡死", () => {
  assert.equal(trendPoints([], "2020-01-01", "2030-01-01").length, 366)
})
