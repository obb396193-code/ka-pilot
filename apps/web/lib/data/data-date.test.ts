import assert from "node:assert/strict"
import test from "node:test"

import { readDataDate, shanghaiToday } from "./data-date.ts"

/**
 * 数据日写错不会报错，只会让每个窗口预设都落在错误的区间上——对账时才发现。
 */

test("优先用后端明说的 dataAsOf，截到日期", () => {
  assert.equal(readDataDate({ dataAsOf: "2026-09-05T08:00:00.000+08:00", window: { to: "2026-09-04" } }), "2026-09-05")
})

test("★dataAsOf 为 null 时回落窗口末日 —— 联调库那份就是 null", () => {
  // 这一档不是凭空加的：真响应里 dataAsOf 就是 null，但窗口末日一定有，
  // 而它就是「有数的最后一天」
  assert.equal(readDataDate({ dataAsOf: null, window: { to: "2026-09-05" } }), "2026-09-05")
})

test("两个都没有 → null，由调用方回落今天并标「数据日未知」", () => {
  assert.equal(readDataDate({ dataAsOf: null }), null)
  assert.equal(readDataDate({}), null)
  assert.equal(readDataDate(null), null)
  assert.equal(readDataDate(undefined), null)
})

test("★「今天」按上海日取，不按浏览器本地时区", () => {
  // 业务日是上海日。浏览器可能在任何时区、内网服务器也不一定在东八区——
  // 用本地时区会差一天，而差一天的窗口看不出异常，只有对账时才发现。
  // 美西 09-13 17:00 = 上海 09-14 08:00
  assert.equal(shanghaiToday(new Date("2026-09-14T00:00:00Z")), "2026-09-14")
  // 上海 09-14 07:59 仍是 14 号；UTC 那一刻是 13 号 23:59
  assert.equal(shanghaiToday(new Date("2026-09-13T23:59:00Z")), "2026-09-14")
  assert.equal(shanghaiToday(new Date("2026-09-13T15:59:00Z")), "2026-09-13")
})

test("月/日补零", () => {
  assert.equal(shanghaiToday(new Date("2026-01-05T04:00:00Z")), "2026-01-05")
})
