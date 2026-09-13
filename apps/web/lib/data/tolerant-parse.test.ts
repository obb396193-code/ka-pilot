import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

import { dataQueryResponseSchema } from "./contracts.ts"
import { parseTolerant } from "./tolerant-parse.ts"

/**
 * F8-28 的第二条路：`data/query` 不经 `forwarder.ts`，得单独兜。
 * 用 arch 抓的真响应当输入（`fixtures/real-backend/`，不许手改）。
 */

function realResponse(): Record<string, unknown> {
  const raw = JSON.parse(readFileSync(new URL("./fixtures/real-backend/summary-partial.json", import.meta.url), "utf8"))
  delete raw.meta // 信封 schema 只允许 pivot2/hourly 带 meta
  return raw
}

test("★真响应多一个镜像里没有的字段 → 放行，并把字段名报出来", () => {
  const payload = realResponse()
  ;(payload.data as { source: Record<string, unknown> }).source.brandNewFieldFromBe2 = 1
  const result = parseTolerant(dataQueryResponseSchema, payload, "test")
  assert.equal(result.ok, true, "后端按契约加个字段，不该让用户看到整页读取失败")
  assert.ok(result.ok && result.extraKeys.includes("brandNewFieldFromBe2"), "要把多出来的字段名报出来，好提醒补镜像")
})

test("原样的真响应当然过，且不报多余字段", () => {
  const result = parseTolerant(dataQueryResponseSchema, realResponse(), "test")
  assert.equal(result.ok, true)
  assert.deepEqual(result.ok ? result.extraKeys : null, [])
})

test("★缺必填字段仍然判废 —— 别把「宽松」理解成「什么都放过」", () => {
  const payload = realResponse()
  delete (payload.data as { source: Record<string, unknown> }).source.queryId
  assert.equal(parseTolerant(dataQueryResponseSchema, payload, "test").ok, false)
})

test("★类型不对仍然判废", () => {
  const payload = realResponse()
  ;(payload.data as { source: Record<string, unknown> }).source.returnedRowCount = "三行"
  assert.equal(parseTolerant(dataQueryResponseSchema, payload, "test").ok, false)
})

test("整个响应不是这个形状（比如后端返了个 HTML 错误页）→ 判废", () => {
  assert.equal(parseTolerant(dataQueryResponseSchema, { nonsense: true }, "test").ok, false)
  assert.equal(parseTolerant(dataQueryResponseSchema, "<!doctype html>", "test").ok, false)
})
