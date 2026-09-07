import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"
import { dataQueryResponseSchema } from "./contracts.ts"
import { canonicalQueryRowSchemaById, canonicalQueryRowsSchema, canonicalRowSchemaVersionByQueryId, ratioValueSchema } from "./canonical-query-rows.ts"
import { adaptAnalysis, adaptWorkbench } from "./adapters.ts"
import { getMockResponse } from "./mock-data.ts"

for (const name of ["ready-lineage", "unknown-lineage", "reconcile-pending", "stable-error"]) {
  test(`v2 consumes authoritative backend fixture ${name} without local copies`, async () => {
    const raw = await readFile(new URL(`../../../../packages/contract/fixtures/data-query/${name}.json`, import.meta.url), "utf8")
    assert.equal(dataQueryResponseSchema.safeParse(JSON.parse(raw)).success, true)
  })
}

// Pivot uses its own frozen cell fixtures and parity suite; the legacy summary mock has no pivot producer.
for (const queryId of (Object.keys(canonicalQueryRowSchemaById) as (keyof typeof canonicalQueryRowSchemaById)[]).filter(id => id !== "account.pivot2")) {
  for (const side of ["ka_data", "platform"] as const) {
    test(`${queryId}/${side} is strict canonical and distinguishes zero/missing/error`, async () => {
      const baseline = getMockResponse({ queryId: queryId === "account.dimension" ? "account.summary" : queryId, dataView: side, params: {} })
      if (queryId === "account.dimension" && baseline.ok && baseline.data.mode !== "reconcile") {
        const fixture = JSON.parse(await readFile(new URL("../../../../packages/contract/fixtures/data-query/dimension-v3-account.json", import.meta.url), "utf8"))
        baseline.data.source = { ...baseline.data.source, queryId, dimension: "account", rowSchemaVersion: "account.dimension/v3",
          rows: fixture.data.source.rows.map((row: { assessment: { priceSource: string; price: { effectiveDate: string | null } | null } }) => {
            row.assessment.priceSource = side === "ka_data" ? "ka_daily" : "history"
            if (side === "ka_data" && row.assessment.price) row.assessment.price.effectiveDate = null
            return row
          }), returnedRowCount: fixture.data.source.rows.length }
      }
      const result = dataQueryResponseSchema.parse(baseline)
      assert.ok(result.ok && result.data.mode !== "reconcile")
      const source = result.data.source
      const version = queryId === "account.summary" || queryId === "account.trend" || queryId === "account.dimension" ? "v3" : "v2"
      assert.equal(source.rowSchemaVersion, `${queryId}/${version}`)
      const row = structuredClone(source.rows[0])
      const metrics = row.metrics as Record<string, unknown>
      for (const value of [{ value: 0, availability: "available" }, { value: null, availability: "missing" }, { value: null, availability: "error" }]) {
        metrics.cost = value
        assert.equal(canonicalQueryRowSchemaById[queryId].safeParse(row).success, true)
      }
      for (const value of [0, null, { value: null, availability: "available" }, { value: 1, availability: "error" }, { value: 2, availability: "stale" }, { value: "0", availability: "available" }, { value: Infinity, availability: "available" }]) {
        metrics.cost = value
        assert.equal(canonicalQueryRowSchemaById[queryId].safeParse(row).success, false)
      }
      const legacy = structuredClone(result)
      if (legacy.ok && legacy.data.mode !== "reconcile") legacy.data.source.rowSchemaVersion = `${queryId}/v1`
      assert.equal(dataQueryResponseSchema.safeParse(legacy).success, false)
      assert.equal(canonicalRowSchemaVersionByQueryId[queryId], `${queryId}/${version}`)
    })
  }
}

test("v2 analysis preserves error and real zero instead of silently treating them as missing", () => {
  const response = getMockResponse({ queryId: "account.table", dataView: "platform", params: {} })
  assert.ok(response.ok && response.data.mode !== "reconcile")
  const metrics = response.data.source.rows[0].metrics as Record<string, unknown>
  metrics.cost = { value: null, availability: "error" }
  metrics.realConversion = { value: 0, availability: "available" }
  metrics.assessmentPrice = { value: null, availability: "missing" }
  const row = adaptAnalysis(response, "platform", true).data.rows[0]
  assert.equal(row.platform.spend.availability, "error")
  assert.equal(row.platform.spend.displayValue, "取数失败")
  assert.equal(row.platform.conversions.value, 0)
  assert.equal(row.platform.conversions.availability, "available")
  assert.equal(row.assessmentCpa.availability, "missing")
})

test("server-selected team source is consumed even when the old caller asked for platform", () => {
  const request = { dataView: "ka_data" as const, params: {} }
  const responses = {
    summary: getMockResponse({ ...request, queryId: "account.summary" }),
    trend: getMockResponse({ ...request, queryId: "account.trend" }),
    anomalies: getMockResponse({ ...request, queryId: "account.anomalies" }),
  }
  const adapted = adaptWorkbench(responses, "platform", true)
  assert.equal(adapted.state, "ready")
  assert.ok(adapted.data.metrics.length > 0)
  assert.ok(adapted.data.anomalies.length > 0)
})

test("ratios retain finite/infinite/undefined without allowing contradictory values", () => {
  for (const ratio of [{ value: 0, state: "finite" }, { value: null, state: "infinite" }, { value: null, state: "undefined" }]) {
    assert.equal(ratioValueSchema.safeParse(ratio).success, true)
  }
  for (const ratio of [{ value: null, state: "finite" }, { value: 0, state: "infinite" }, { value: 2, state: "undefined" }]) {
    assert.equal(ratioValueSchema.safeParse(ratio).success, false)
  }
  assert.equal(canonicalQueryRowsSchema("account.table").safeParse([]).success, true)
})

test("lineage requires explicit valid workspaceKind, not a default personal value", () => {
  const response = getMockResponse({ queryId: "account.summary", dataView: "platform", params: {} })
  assert.ok(response.ok && response.data.mode !== "reconcile")
  const lineage = response.data.source.lineage as Record<string, unknown>
  for (const value of [undefined, null, "shared", "admin"]) {
    lineage.workspaceKind = value
    assert.equal(dataQueryResponseSchema.safeParse(response).success, false)
  }
})
