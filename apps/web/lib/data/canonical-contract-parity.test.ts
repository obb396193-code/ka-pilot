import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"
import test from "node:test"

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
  "reconcile-pending": "594b52858dc6ccdad801c40976dd4a6a5f6bef2dcaff015088d19a7c27d1e641",
  "stable-error": "26b17489743d02d3ad1abe21998e05e083216c1ffa3dc153bb32d9511c4a3966",
} as const

for (const name of fixtureNames) {
  test(`frontend contract accepts the e2b0f1a ${name} fixture`, async () => {
    const path = new URL(`./fixtures/e2b0f1a/${name}.json`, import.meta.url)
    const raw = await readFile(path)
    assert.equal(createHash("sha256").update(raw).digest("hex"), fixtureSha256[name])
    assert.equal(dataQueryResponseSchema.safeParse(JSON.parse(raw.toString("utf8"))).success, true)
  })
}

test("frontend freezes all six e2b0f1a row schema versions", () => {
  assert.deepEqual(canonicalRowSchemaVersionByQueryId, {
    "account.summary": "account.summary/v1",
    "account.trend": "account.trend/v1",
    "account.table": "account.table/v1",
    "account.anomalies": "account.anomalies/v1",
    "account.detail": "account.detail/v1",
    "reconcile.account_daily": "reconcile.account_daily/v1",
  })
})

test("frontend mirrors the 9626545 real-calendar-date failure boundary", () => {
  const fixture = {
    workspaceId: "workspace-fixture", media: "KUAISHOU", accountId: "account-1", accountName: null, ownerUserId: null,
    ds: "2026-02-31", metrics: { cost: null, exposure: null, click: null, conversion: null, realConversion: null, cashCost: null, costSpace: null, wakeUv: null, potentialUv: null, budget: null, budgetUsageRate: null, deductionRate: null, mainAdCostProportion: null, assessmentPrice: null, ratios: { ctr: { value: null, state: "undefined" }, cvr: { value: null, state: "undefined" }, realCpa: { value: null, state: "undefined" }, cashCpa: { value: null, state: "undefined" }, gap: { value: null, state: "undefined" }, potentialRate: { value: null, state: "undefined" }, biConversionRate: { value: null, state: "undefined" } } },
    dataAnomaly: null, computedAt: null, tasks: [],
  }
  assert.equal(accountDailyRowSchema.safeParse(fixture).success, false)
})
