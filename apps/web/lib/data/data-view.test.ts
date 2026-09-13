import assert from "node:assert/strict"
import test from "node:test"

import { dataQueryRequestSchema, dataQueryResponseSchema, metricValueSchema } from "./contracts.ts"
import { buildDataViewHref, readDataState, readDataViewMode, shanghaiBusinessDate } from "./data-view.ts"
import { getMockResponse } from "./mock-data.ts"

test("only the three frozen data views and complete UI states are accepted", () => {
  for (const view of ["ka_data", "platform", "reconcile"] as const) assert.equal(readDataViewMode(view), view)
  assert.equal(readDataViewMode("invented"), "platform")
  for (const state of ["loading", "ready", "empty", "error", "unavailable", "truncated", "partial", "stale"] as const) assert.equal(readDataState(state), state)
  assert.equal(readDataState("unknown"), "ready")
})

test("ordinary requests allow five frozen ids and exclude the admin diagnostic query", () => {
  for (const queryId of ["account.summary", "account.trend", "account.table", "account.anomalies", "account.detail"] as const) {
    assert.equal(dataQueryRequestSchema.parse({ queryId, params: { date: "2026-08-24" } }).queryId, queryId)
  }
  for (const legacy of ["workbench", "analysis", "accountDetail", "findingDetail", "changeSetPreview", "reconcile.account_daily"]) assert.equal(dataQueryRequestSchema.safeParse({ queryId: legacy, params: {} }).success, false)
  assert.equal(dataQueryRequestSchema.safeParse({ queryId: "account.table", params: {}, sql: "select 1" }).success, false)
  assert.equal(dataQueryRequestSchema.safeParse({ queryId: "account.table", dataView: "platform", params: {} }).success, false)
})

test("preserves compatible filters when switching data view", () => {
  assert.equal(buildDataViewHref("/data", "reconcile", { account_id: "demo-account-07", start: "2026-08-18", end: "2026-08-24", media: "KUAISHOU", task_id: "aac-acquisition", product_id: "demo-product-01", state: "partial", ignored: "drop-me" }), "/data?data_view=reconcile&account_id=demo-account-07&start=2026-08-18&end=2026-08-24&media=KUAISHOU&task_id=aac-acquisition&product_id=demo-product-01&state=partial")
})

test("defaults to the Shanghai business date with a 03:00 cutoff", () => {
  assert.equal(shanghaiBusinessDate(new Date("2026-08-24T18:59:59.000Z")), "2026-08-24")
  assert.equal(shanghaiBusinessDate(new Date("2026-08-24T19:00:00.000Z")), "2026-08-25")
  assert.equal(shanghaiBusinessDate(new Date("2026-12-31T20:00:00.000Z")), "2027-01-01")
})

/**
 * 补 URL 那两个读写函数的覆盖（审查附录）。
 * 它们决定「刷新页面 / 把链接发给同事」时看到的是不是同一屏——
 * 写错了不会报错，只会让分享出去的链接落到别的视图或别的状态上。
 */

test("★readDataState：认识的状态原样返回，不认识的一律回落 ready", () => {
  for (const state of ["loading", "ready", "empty", "error", "unavailable", "truncated", "partial", "stale", "unauthorized", "forbidden", "timeout", "too-large"]) {
    assert.equal(readDataState(state), state)
  }
  // URL 是用户能手改的：塞个乱七八糟的值不能让页面进未定义状态
  for (const junk of ["", "READY", "loadin", "'; drop table", undefined]) {
    assert.equal(readDataState(junk as never), "ready", String(junk))
  }
})

test("readDataViewMode 同理，回落到自建平台版", () => {
  assert.equal(readDataViewMode("ka_data"), "ka_data")
  assert.equal(readDataViewMode("reconcile"), "reconcile")
  assert.equal(readDataViewMode("nonsense"), "platform")
  assert.equal(readDataViewMode(undefined), "platform")
})

test("★同一个 query 参数出现多次时取第一个 —— 不能拼成 'a,b' 送进 schema", () => {
  // `?state=empty&state=error` 在 Next 里是数组。取首值是明确的选择，
  // 不取的话数组会被 schema 判非法、静默回落，用户以为筛了其实没筛。
  assert.equal(readDataState(["empty", "error"]), "empty")
  assert.equal(readDataViewMode(["reconcile", "ka_data"]), "reconcile")
})

test("★buildDataViewHref 只带兼容的筛选键，空串丢掉", () => {
  const href = buildDataViewHref("/data", "ka_data", { media: "KUAISHOU", account_id: "", not_a_filter: "x" })
  const url = new URL(href, "http://x")
  assert.equal(url.searchParams.get("data_view"), "ka_data")
  assert.equal(url.searchParams.get("media"), "KUAISHOU")
  assert.equal(url.searchParams.has("account_id"), false, "空串不该占一个参数位")
  assert.equal(url.searchParams.has("not_a_filter"), false, "白名单外的键不许带过去")
})

test("buildDataViewHref 的数组参数同样取首值", () => {
  const url = new URL(buildDataViewHref("/data", "platform", { media: ["KUAISHOU", "TENCENT"] }), "http://x")
  assert.equal(url.searchParams.get("media"), "KUAISHOU")
})
