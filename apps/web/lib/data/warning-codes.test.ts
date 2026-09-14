import assert from "node:assert/strict"
import test from "node:test"

import { warningKnown, warningText } from "./warning-codes.ts"

test("★三个小时查询告警码都有人话（A4）", () => {
  // 这三个是 `platform-hourly-query.ts:83` 实际会发出来的字符串码。
  // 少一个，盯盘页就会把它当陌生码原样显示——不算错，但用户看不懂。
  for (const code of ["HOURLY_DAY_TIMEZONE_UNKNOWN", "CASH_COEFFICIENT_MISSING", "HOURLY_COVERAGE_INCOMPLETE"]) {
    assert.ok(warningKnown(code), `${code} 应当有人话`)
    assert.notEqual(warningText(code), code, `${code} 不该原样显示`)
  }
})

test("★归属按最早记录推定（A6）", () => {
  assert.ok(warningKnown("LABEL_BASIS_EARLIEST_KNOWN"))
  assert.match(warningText("LABEL_BASIS_EARLIEST_KNOWN"), /归属按最早记录推定/)
})

test("★认不出来的码原样显示，不吞", () => {
  // 后端加了新告警而页面装作什么都没发生，比显示一个看不懂的码坏得多。
  assert.equal(warningText("SOMETHING_NEW_FROM_BACKEND"), "SOMETHING_NEW_FROM_BACKEND")
  assert.equal(warningKnown("SOMETHING_NEW_FROM_BACKEND"), false)
  // 空串也照原样返回，绝不返回空把那一条渲染成一个空标签
  assert.equal(warningText(""), "")
})

test("同族码按前缀兜底：后端加 HOURLY_COVERAGE_PARTIAL 页面不至于哑", () => {
  assert.ok(warningKnown("HOURLY_COVERAGE_PARTIAL"))
  assert.match(warningText("HOURLY_COVERAGE_PARTIAL"), /没采到/)
})
