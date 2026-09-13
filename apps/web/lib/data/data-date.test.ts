import assert from "node:assert/strict"
import test from "node:test"

import { localToday, readDataDate } from "./data-date.ts"

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

test("localToday 是本地日历日，不是 UTC —— 差一天会让「今天」这个预设错位", () => {
  const noon = new Date(2026, 8, 13, 12, 0, 0) // 本地 2026-09-13 中午
  assert.equal(localToday(noon), "2026-09-13")
  // 本地深夜：UTC 已经是次日，但「今天」对用户就是 09-13
  assert.equal(localToday(new Date(2026, 8, 13, 23, 30, 0)), "2026-09-13")
})

test("月/日补零", () => {
  assert.equal(localToday(new Date(2026, 0, 5)), "2026-01-05")
})
