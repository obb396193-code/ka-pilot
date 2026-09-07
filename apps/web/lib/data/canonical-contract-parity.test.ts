import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"
import test from "node:test"

import { canonicalTableRow } from "./canonical-query-fixtures.ts"
import { accountDailyRowSchema, canonicalRowSchemaVersionByQueryId } from "./canonical-query-rows.ts"
import { dataQueryResponseSchema } from "./contracts.ts"

const fixtureNames = [
  "ready-lineage",
  "unknown-lineage",
  "reconcile-pending",
  "stable-error",
] as const

const fixtureSha256 = {
  "ready-lineage": "0b3f107ecaa3a5d5bbb1cf9d727455e44797a3bd0876c561b7503c7f24ad4457",
  "unknown-lineage": "b9bd0502fbc020e567d3825d28f54bb55be23f650a9027b259f3a727af8a9a71",
  "reconcile-pending": "838872dc600d22f168b6bff6f5c080dfab945b60ddb2840a81dc540901748763",
  "stable-error": "26b17489743d02d3ad1abe21998e05e083216c1ffa3dc153bb32d9511c4a3966",
} as const

for (const name of fixtureNames) {
  test(`frontend retains immutable e2b0f1a ${name} as a legacy rejection boundary`, async () => {
    const path = new URL(`./fixtures/e2b0f1a/${name}.json`, import.meta.url)
    const raw = await readFile(path)
    assert.equal(createHash("sha256").update(raw).digest("hex"), fixtureSha256[name])
    assert.equal(dataQueryResponseSchema.safeParse(JSON.parse(raw.toString("utf8"))).success, name === "stable-error")
  })
}

test("frontend freezes v3 windows and v2 daily rows without dual version compatibility", () => {
  assert.deepEqual(canonicalRowSchemaVersionByQueryId, {
    "account.dimension": "account.dimension/v3",
    "account.summary": "account.summary/v3",
    "account.trend": "account.trend/v3",
    "account.table": "account.table/v2",
    "account.anomalies": "account.anomalies/v2",
    "account.detail": "account.detail/v2",
    "reconcile.account_daily": "reconcile.account_daily/v2",
  })
})

test("frontend mirrors the 9626545 real-calendar-date failure boundary", () => {
  const fixture = { ...canonicalTableRow, ds: "2026-02-31" }
  assert.equal(accountDailyRowSchema.safeParse(canonicalTableRow).success, true)
  assert.equal(accountDailyRowSchema.safeParse(fixture).success, false)
})

test("frontend mirrors backend reconcile semantic refinements", async () => {
  const raw = await readFile(new URL("../../../../packages/contract/fixtures/data-query/reconcile-pending.json", import.meta.url), "utf8")
  const invalid = JSON.parse(raw)
  const missing = { value: null, availability: "missing" }
  const available = { value: 1, availability: "available" }
  invalid.data.comparison = { status: "ready", rows: [{ key: {}, metrics: { cost: { kaData: missing, platform: available, delta: available, deltaRate: available, comparable: true } } }] }
  assert.equal(dataQueryResponseSchema.safeParse(invalid).success, false)
})

test("frontend rejects request ids outside the backend log-safe boundary", () => {
  assert.equal(dataQueryResponseSchema.safeParse({ ok: false, error: { code: "INTERNAL_ERROR", message: "x", retryable: false, requestId: "contains a space" } }).success, false)
  assert.equal(dataQueryResponseSchema.safeParse({ ok: false, error: { code: "INTERNAL_ERROR", message: "x", retryable: false, requestId: `a${"x".repeat(128)}` } }).success, false)
})
