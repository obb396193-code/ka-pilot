import assert from "node:assert/strict"
import test from "node:test"

import { resolvePreset, shanghaiToday, windowPresetLabel, type DataWindow } from "./window-presets.ts"

/**
 * 窗口预设的推算规则（F8-19b P1 附录）。
 *
 * ★**所有预设以「数据日」为终点往前推，不是以今天**——今天的数还没跑完。
 * 这条写错的后果很隐蔽：页面照常出数，只是每个预设都少一天或多一天，
 * 而且只有对账时才会发现。
 */

const DATA_DATE = "2026-09-05"
const current: DataWindow = { preset: "custom", from: "2026-08-01", to: "2026-08-31" }

test("昨天 = 数据日当天（数据日就是「有数的最后一天」）", () => {
  assert.deepEqual(resolvePreset("yesterday", DATA_DATE, current), { preset: "yesterday", from: DATA_DATE, to: DATA_DATE })
})

test("★近 7 天 = 含数据日在内的 7 天，不是往前 7 天", () => {
  // 09-05 往前 6 天 = 08-30，加上 09-05 自己正好 7 天。写成 -7 就是 8 天。
  const w = resolvePreset("last_7d", DATA_DATE, current)
  assert.deepEqual(w, { preset: "last_7d", from: "2026-08-30", to: "2026-09-05" })
})

test("本月至今 = 当月 1 号到数据日", () => {
  assert.deepEqual(resolvePreset("month_to_date", DATA_DATE, current), { preset: "month_to_date", from: "2026-09-01", to: "2026-09-05" })
})

test("上月 = 上月 1 号到上月最后一天（不含本月任何一天）", () => {
  assert.deepEqual(resolvePreset("last_month", DATA_DATE, current), { preset: "last_month", from: "2026-08-01", to: "2026-08-31" })
})

test("跨年时上月要落到去年 12 月", () => {
  assert.deepEqual(resolvePreset("last_month", "2026-01-15", current), { preset: "last_month", from: "2025-12-01", to: "2025-12-31" })
})

test("★「今天」用真今天，不是数据日 —— 它问的就是「今天到现在跑了多少」", () => {
  // 业务日按上海：toISOString 是 UTC 日期，本机日期随机器时区——两个都会在某些钟点差一天
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date())
  const w = resolvePreset("today", DATA_DATE, current)
  assert.equal(w.from, today)
  assert.equal(w.to, today)
  assert.notEqual(w.from, DATA_DATE, "拿数据日当今天，这个预设就没意义了")
})

test("★「今天」按上海日期 —— 美西 9-13 晚 9 点，上海已是 9-14", () => {
  assert.equal(shanghaiToday(new Date("2026-09-13T21:00:00-07:00")), "2026-09-14")
  assert.equal(shanghaiToday(new Date("2026-09-13T08:59:00-07:00")), "2026-09-13")
})

test("★切到「自定义」保留现有区间 —— 不然点一下区间就被清空", () => {
  const w = resolvePreset("custom", DATA_DATE, { preset: "last_7d", from: "2026-08-30", to: "2026-09-05" })
  assert.deepEqual(w, { preset: "custom", from: "2026-08-30", to: "2026-09-05" })
})

test("每个预设都有中文标签 —— 缺一个页头就显 undefined", () => {
  for (const preset of ["today", "yesterday", "last_7d", "month_to_date", "last_month", "custom"] as const) {
    assert.equal(typeof windowPresetLabel[preset], "string")
    assert.ok(windowPresetLabel[preset].length > 0, preset)
  }
})
