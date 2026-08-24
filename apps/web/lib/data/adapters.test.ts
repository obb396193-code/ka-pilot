import assert from "node:assert/strict"
import test from "node:test"

import { adaptAccountDetail, adaptAnalysis, adaptWorkbench } from "./adapters.ts"
import { dataQueryResponseSchema } from "./contracts.ts"
import { getMockResponse } from "./mock-data.ts"
import { platformAnomaliesEnvelope, platformSummaryEnvelope, platformTableEnvelope, platformTableRow, platformTrendEnvelope } from "./platform-canonical-fixtures.ts"

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

test("workbench consumes the strict Platform MetricSummary and trend shapes", () => {
  const adapted = adaptWorkbench({
    summary: dataQueryResponseSchema.parse(platformSummaryEnvelope),
    trend: dataQueryResponseSchema.parse(platformTrendEnvelope),
    anomalies: dataQueryResponseSchema.parse(platformAnomaliesEnvelope),
  }, "platform", false)

  assert.match(adapted.data.metrics.find((item) => item.key === "spend")?.value ?? "", /270/)
  assert.match(adapted.data.metrics.find((item) => item.key === "cpa")?.value ?? "", /11\.74/)
  assert.equal(adapted.data.trend[0].spend, 250)
  assert.equal(adapted.data.trend[0].realCpa, 12.5)
})

test("analysis and account detail consume the strict Platform camelCase table row", () => {
  const response = dataQueryResponseSchema.parse(platformTableEnvelope)
  const analysis = adaptAnalysis(response, "platform", false)
  const detail = adaptAccountDetail(response, "platform", false, "account-demo-07")

  assert.equal(analysis.data.rows[0].accountId, "account-demo-07")
  assert.equal(analysis.data.rows[0].platform.spend.value, 120)
  assert.equal(analysis.data.rows[0].platform.cpa.value, 15)
  assert.equal(detail.data.accountName, "脱敏账户 07")
  assert.match(detail.data.metrics.find((item) => item.key === "cpa")?.value ?? "", /15/)
})

test("analysis keeps same account id on different media as separate identities", () => {
  const response = dataQueryResponseSchema.parse({
    ...platformTableEnvelope,
    data: {
      ...platformTableEnvelope.data,
      source: {
        ...platformTableEnvelope.data.source,
        rows: [platformTableRow, { ...platformTableRow, media: "TENCENT", accountName: "脱敏账户 07 · 腾讯" }],
        returnedRowCount: 2,
        wholeResultTotal: { value: 2, availability: "available" },
      },
    },
  })
  const adapted = adaptAnalysis(response, "platform", false)

  assert.equal(adapted.data.rows.length, 2)
  assert.deepEqual(adapted.data.rows.map((row) => `${row.media}:${row.accountId}`).sort(), ["KUAISHOU:account-demo-07", "TENCENT:account-demo-07"])
})

test("a mixed valid and invalid canonical batch fails as a whole with requestId", () => {
  const response = dataQueryResponseSchema.parse({
    ...platformTableEnvelope,
    data: {
      ...platformTableEnvelope.data,
      source: {
        ...platformTableEnvelope.data.source,
        rows: [platformTableRow, { ...platformTableRow, workspaceId: "not-a-uuid" }],
        returnedRowCount: 2,
        wholeResultTotal: { value: 2, availability: "available" },
      },
    },
  })
  const adapted = adaptAnalysis(response, "platform", false)

  assert.equal(adapted.state, "error")
  assert.equal(adapted.data.rows.length, 0)
  assert.equal(adapted.error?.code, "UPSTREAM_INVALID_RESPONSE")
  assert.match(adapted.error?.requestId ?? "", /.+/)
})
