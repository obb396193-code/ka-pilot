import assert from "node:assert/strict"
import test from "node:test"

import { dataQueryRequestSchema, dataQueryResponseSchema, metricValueSchema } from "./contracts.ts"
import { buildDataViewHref, readDataState, readDataViewMode } from "./data-view.ts"
import { getMockResponse } from "./mock-data.ts"

test("only the three frozen data views and complete UI states are accepted", () => {
  for (const view of ["ka_data", "platform", "reconcile"] as const) assert.equal(readDataViewMode(view), view)
  assert.equal(readDataViewMode("invented"), "platform")
  for (const state of ["loading", "ready", "empty", "error", "unavailable", "truncated", "partial", "stale"] as const) assert.equal(readDataState(state), state)
  assert.equal(readDataState("unknown"), "ready")
})

test("only the six backend query ids are canonical", () => {
  for (const queryId of ["account.summary", "account.trend", "account.table", "account.anomalies", "account.detail", "reconcile.account_daily"] as const) {
    assert.equal(dataQueryRequestSchema.parse({ queryId, dataView: queryId.startsWith("reconcile") ? "reconcile" : "platform", params: { date: "2026-08-24" } }).queryId, queryId)
  }
  for (const legacy of ["workbench", "analysis", "accountDetail", "findingDetail", "changeSetPreview"]) assert.equal(dataQueryRequestSchema.safeParse({ queryId: legacy, dataView: "platform", params: {} }).success, false)
  assert.equal(dataQueryRequestSchema.safeParse({ queryId: "account.table", dataView: "platform", params: {}, sql: "select 1" }).success, false)
})

test("preserves compatible filters when switching data view", () => {
  assert.equal(buildDataViewHref("/data", "reconcile", { account_id: "demo-account-07", start: "2026-08-18", end: "2026-08-24", media: "KUAISHOU", task_id: "aac-acquisition", product_id: "demo-product-01", state: "partial", ignored: "drop-me" }), "/data?data_view=reconcile&account_id=demo-account-07&start=2026-08-18&end=2026-08-24&media=KUAISHOU&task_id=aac-acquisition&product_id=demo-product-01&state=partial")
})

test("canonical errors preserve code, message, requestId and retryable", () => {
  const parsed = dataQueryResponseSchema.parse({ ok: false, error: { code: "UPSTREAM_TIMEOUT", message: "Timed out", requestId: "req-timeout-1", retryable: true } })
  assert.deepEqual(parsed, { ok: false, error: { code: "UPSTREAM_TIMEOUT", message: "Timed out", requestId: "req-timeout-1", retryable: true } })
})

test("MetricValue distinguishes missing and denominator zero from numeric zero", () => {
  assert.equal(metricValueSchema.parse({ value: 0, availability: "available" }).value, 0)
  assert.equal(metricValueSchema.parse({ value: null, availability: "missing" }).value, null)
  assert.equal(metricValueSchema.parse({ value: null, availability: "denominator_zero" }).value, null)
  assert.equal(metricValueSchema.safeParse({ value: 0, availability: "missing" }).success, false)
})

test("mock mode follows selected view and never invents reconcile deltas when unavailable", () => {
  const ka = getMockResponse({ queryId: "account.table", dataView: "ka_data", params: { date: "2026-08-24" } })
  const platform = getMockResponse({ queryId: "account.table", dataView: "platform", params: { date: "2026-08-24" } })
  const unavailable = getMockResponse({ queryId: "reconcile.account_daily", dataView: "reconcile", params: { date: "2026-08-24" }, mockState: "unavailable" })
  assert.equal(ka.ok && ka.data.mode, "ka_data")
  assert.equal(platform.ok && platform.data.mode, "platform")
  assert.equal(unavailable.ok && unavailable.data.mode, "reconcile")
  if (unavailable.ok && unavailable.data.mode === "reconcile") { assert.equal(unavailable.data.comparison.status, "unavailable"); assert.equal(unavailable.data.comparison.rows.length, 0) }
})

test("mock account reconciliation uses shared key and missing is never zero", () => {
  const response = getMockResponse({ queryId: "reconcile.account_daily", dataView: "reconcile", params: { date: "2026-08-24" } })
  assert.equal(response.ok, true)
  if (response.ok && response.data.mode === "reconcile") {
    const row = response.data.comparison.rows.find((item) => item.key.account_id === "demo-account-18")
    assert.ok(row)
    assert.equal(row.metrics.cpa.platform.availability, "missing")
    assert.equal(row.metrics.cpa.platform.value, null)
    assert.equal(row.metrics.cpa.delta.availability, "missing")
    assert.doesNotMatch(JSON.stringify(response), /账户待映射|账户映射|mappingStatus|unified/)
  }
})
