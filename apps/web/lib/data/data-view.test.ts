import assert from "node:assert/strict"
import test from "node:test"

import {
  buildDataViewHref,
  dataResponseSchema,
  metricValueSchema,
  readDataState,
  readDataViewMode,
} from "./data-view.ts"
import { getMockResponse } from "./mock-data.ts"
import { analysisRowSchema } from "./contracts.ts"

test("only accepts the three frozen data views", () => {
  assert.equal(readDataViewMode("ka_data"), "ka_data")
  assert.equal(readDataViewMode("platform"), "platform")
  assert.equal(readDataViewMode("reconcile"), "reconcile")
  assert.equal(readDataViewMode("invented"), "platform")
})

test("only accepts the seven required data states", () => {
  for (const state of [
    "loading",
    "empty",
    "error",
    "no-access",
    "partial",
    "stale",
    "success",
  ] as const) {
    assert.equal(readDataState(state), state)
  }

  assert.equal(readDataState("unknown"), "success")
})

test("preserves compatible filters when switching data view", () => {
  assert.equal(
    buildDataViewHref("/data", "reconcile", {
      account_id: "demo-account-07",
      start: "2026-08-18",
      end: "2026-08-24",
      media: "KUAISHOU",
      task_id: "aac-acquisition",
      product_id: "demo-product-01",
      state: "partial",
      ignored: "drop-me",
    }),
    "/data?data_view=reconcile&account_id=demo-account-07&start=2026-08-18&end=2026-08-24&media=KUAISHOU&task_id=aac-acquisition&product_id=demo-product-01&state=partial",
  )
})

test("rejects an API payload without visible lineage", () => {
  const result = dataResponseSchema.safeParse({
    state: "success",
    data: {},
  })

  assert.equal(result.success, false)
})

test("accepts reconcile only with two independent lineages", () => {
  const result = dataResponseSchema.safeParse({
    state: "success",
    lineage: {
      mode: "reconcile",
      kaData: lineage("ka_data"),
      platform: lineage("platform"),
      comparability: { comparable: true, reason: null },
    },
    data: {},
  })

  assert.equal(result.success, true)
})

function lineage(source: "ka_data" | "platform") {
  return {
    source,
    sourceLabel: source === "ka_data" ? "KA Data" : "自建平台",
    dataAsOf: "2026-08-24T09:30:00+08:00",
    datasetVersion: `${source}-demo-v1`,
    queryTemplateVersion: "account-table-v1",
    timezone: "Asia/Shanghai",
    dayCut: "00:00",
    coverage: "18/20 账户",
    truncated: false,
    partial: false,
    stale: false,
    warnings: [],
  }
}

test("MetricValue distinguishes missing from numeric zero", () => {
  assert.equal(metricValueSchema.parse({ value: 0, displayValue: "0", availability: "available" }).value, 0)
  assert.equal(metricValueSchema.parse({ value: null, displayValue: "−", availability: "missing" }).value, null)
  assert.equal(metricValueSchema.safeParse({ value: 0, displayValue: "0", availability: "missing" }).success, false)
})

test("mock reconcile keeps mode, dual source values and dual lineage aligned", () => {
  const response = getMockResponse({ queryId: "analysis", dataView: "reconcile" })
  assert.equal(response.data.mode, "reconcile")
  assert.equal(response.lineage.mode, "reconcile")
  assert.equal(response.data.rows[0].kaData.cpa.availability, "available")
  assert.equal(response.data.rows[0].platform.cpa.availability, "available")
  assert.notEqual(response.data.rows[0].kaData.cpa.value, response.data.rows[0].platform.cpa.value)
})

test("mock missing source value is null and never zero", () => {
  const response = getMockResponse({ queryId: "analysis", dataView: "platform" })
  const missing = response.data.rows[2].platform.spend
  assert.equal(missing.availability, "missing")
  assert.equal(missing.value, null)
  assert.equal(missing.displayValue, "−")
})

test("decision A keeps single-source views isolated and reconcile has no unified main value", () => {
  const ka = getMockResponse({ queryId: "analysis", dataView: "ka_data" })
  const platform = getMockResponse({ queryId: "analysis", dataView: "platform" })
  const reconcile = getMockResponse({ queryId: "analysis", dataView: "reconcile" })
  assert.equal(ka.data.rows[0].platform.cpa.availability, "missing")
  assert.equal(platform.data.rows[0].kaData.cpa.availability, "missing")
  assert.match(ka.lineage.mode === "single" ? ka.lineage.source.sourceLabel : "", /运营权威版/)
  assert.equal(Object.hasOwn(reconcile.data.rows[0], "unified"), false)
  assert.equal(analysisRowSchema.safeParse({ ...reconcile.data.rows[0], unified: { cpa: 42 } }).success, false)
})

test("keeps zero-denominator CPA unavailable instead of rendering zero", () => {
  const response = getMockResponse({
    queryId: "workbench",
    dataView: "ka_data",
    state: "success",
  })

  assert.equal(response.data.trend[2].realCpa, null)
  assert.match(response.data.anomalies[1].evidence, /真实 CPA −/)
  assert.doesNotMatch(JSON.stringify(response.data), /¥0\.00/)
})
