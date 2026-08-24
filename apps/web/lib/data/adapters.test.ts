import assert from "node:assert/strict"
import test from "node:test"

import { adaptAnalysis } from "./adapters.ts"
import { getMockResponse } from "./mock-data.ts"

test("adapter never calculates CPA when the backend row omits it", () => {
  const response = getMockResponse({ queryId: "account.table", dataView: "platform", params: { date: "2026-08-24" } })
  assert.equal(response.ok, true)
  if (response.ok && response.data.mode === "platform") {
    delete response.data.source.rows[0].cpa
    delete response.data.source.rows[0].cpa_display
  }
  const adapted = adaptAnalysis(response, "platform", true)
  assert.equal(adapted.data.rows[0].platform.cpa.availability, "missing")
  assert.equal(adapted.data.rows[0].platform.cpa.value, null)
  assert.doesNotMatch(adapted.data.rows[0].platform.cpa.displayValue, /0/)
})

test("reconciliation_engine_pending disables comparison and exposes no fake delta", () => {
  const response = getMockResponse({ queryId: "reconcile.account_daily", dataView: "reconcile", params: { date: "2026-08-24" } })
  assert.equal(response.ok, true)
  if (response.ok && response.data.mode === "reconcile") {
    response.data.comparison = { status: "unavailable", reason: "reconciliation_engine_pending", rows: [] }
  }
  const adapted = adaptAnalysis(response, "reconcile", true)
  assert.equal(adapted.state, "unavailable")
  assert.ok(adapted.data.rows.length > 0)
  assert.equal(adapted.data.rows[0].comparison.delta.availability, "missing")
  assert.equal(adapted.data.rows[0].comparison.deltaRate.availability, "missing")
})

test("adapter preserves stable error fields for troubleshooting", () => {
  const adapted = adaptAnalysis({ ok: false, error: { code: "FORBIDDEN", message: "No account scope", requestId: "req-403", retryable: false } }, "platform", false)
  assert.equal(adapted.state, "forbidden")
  assert.deepEqual(adapted.error, { code: "FORBIDDEN", message: "No account scope", requestId: "req-403", retryable: false })
})
