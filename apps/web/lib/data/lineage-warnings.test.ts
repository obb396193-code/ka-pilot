import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

import { dataQueryResponseSchema } from "./contracts.ts"

/**
 * v1.9.33「缺数点名」的门禁。
 *
 * 这条锁的是一个**会把整页打死**的失败形态：`lineage.warnings` 原来只收 `string[]`，
 * 后端一旦发对象形告警，BFF 的 `dataQueryResponseSchema.safeParse` 就不过，
 * 返回 502「did not match the canonical contract」——**用户看到的是整页读取失败，
 * 而根因只是多了一条提示**。告警不该有这个权力。
 */

/** 那份前端过渡 fixture 带的 `meta` 是给页面用的；信封 schema 只允许 pivot2/hourly 带 meta，所以去掉。 */
function envelope(warnings: unknown[]): unknown {
  const raw = JSON.parse(readFileSync(new URL("../../../../packages/contract/fixtures/data-query/summary-v1922-filtered.json", import.meta.url), "utf8"))
  raw.data.source.lineage.warnings = warnings
  delete raw.meta
  return raw
}

const withWarnings = envelope

test("对象形告警不会让整条响应过不了 schema", () => {
  const parsed = dataQueryResponseSchema.safeParse(withWarnings([
    { code: "ACCOUNT_DAY_MISSING", media: "KUAISHOU", accountId: "acc-2", businessDate: "2026-09-10", fields: ["cost", "cashCost"] },
    { code: "BATCH_FAILED", media: "KUAISHOU", accountId: "acc-3", businessDate: "2026-09-09" },
  ]))
  assert.ok(parsed.success, `对象形告警被拒了：${parsed.success ? "" : JSON.stringify(parsed.error.issues)}`)
})

test("老的 string 告警照样收（不破坏在跑的后端）", () => {
  assert.ok(dataQueryResponseSchema.safeParse(withWarnings(["BUDGET_SOURCE_NOT_READY"])).success)
})

test("★后端加一个没见过的告警码，页面不许因此白掉", () => {
  // code 故意不做枚举就是为了这个：新告警码只该被原样显示，不该把响应判废。
  assert.ok(dataQueryResponseSchema.safeParse(withWarnings([{ code: "SOME_FUTURE_CODE", detail: "后端下个版本加的" }])).success)
})

test("告警必须有 code —— 没有 code 的对象没法显示，该在边界就挡住", () => {
  assert.equal(dataQueryResponseSchema.safeParse(withWarnings([{ media: "KUAISHOU" }])).success, false)
})
