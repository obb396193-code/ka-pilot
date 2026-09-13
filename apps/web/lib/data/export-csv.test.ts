import assert from "node:assert/strict"
import test from "node:test"

import { csvName, toCsv } from "./export-csv.ts"

/** 导出最容易在这几处坏，而且都是「本机看不出来、别人打开才发现」的那种。 */

test("含逗号 / 引号 / 换行的字段要按 RFC 4180 转义", () => {
  const csv = toCsv(["名称", "备注"], [["A,B", 'he said "hi"'], ["换\n行", null]])
  assert.match(csv, /"A,B"/)
  assert.match(csv, /"he said ""hi"""/)
  assert.match(csv, /"换\n行"/)
})

test("空值导出成空字段，不导成 'null' 或 'undefined'", () => {
  // 导出成字符串 "null" 的表，收表的人会当成一个叫 null 的值
  const csv = toCsv(["a", "b"], [[null, undefined]])
  assert.equal(csv.split("\r\n")[1], ",")
})

test("行分隔用 CRLF（Excel 认这个）", () => {
  assert.equal(toCsv(["a"], [["1"], ["2"]]), "a\r\n1\r\n2")
})

test("文件名带窗口，别一堆「导出.csv」认不出来", () => {
  assert.equal(csvName("大盘", { from: "2026-09-01", to: "2026-09-05" }, "优化师"), "大盘-2026-09-01_2026-09-05-优化师")
  assert.equal(csvName("大盘", { from: "2026-09-01", to: "2026-09-05" }), "大盘-2026-09-01_2026-09-05")
})
