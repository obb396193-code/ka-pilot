import assert from "node:assert/strict"
import test from "node:test"

import { getMockResponse } from "./mock-data.ts"

/**
 * 从 `data-view.test.ts` 迁过来的（审查附录点名「四条错位用例迁走」）。
 * 它们测的是mock provider 的行为，和数据视图的 URL 读写没关系——
 * 放错文件的后果不是跑不了，是**红的时候看错方向**。
 */

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
