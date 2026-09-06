import assert from "node:assert/strict"
import test from "node:test"
import { readFileSync } from "node:fs"
import { readChangeValueSchema, formatChangeValue } from "./change-value.ts"
import { changeSetDetailResponseSchema } from "./contracts.ts"
import { adaptChangeSetPreview } from "./adapters.ts"

test("shared typed value decoder accepts arch fixture values and preserves false/zero/json", () => {
  const fixture = JSON.parse(readFileSync(new URL("../../../../packages/contract/fixtures/changesets/detail.json", import.meta.url), "utf8"))
  for (const item of fixture.data.items) { assert.equal(readChangeValueSchema.safeParse(item.fromValue).success, true); assert.equal(readChangeValueSchema.safeParse(item.toValue).success, true) }
  assert.equal(formatChangeValue({ type: "boolean", value: false }), "false")
  assert.equal(formatChangeValue({ type: "number", value: 0 }), "0")
  assert.equal(formatChangeValue({ type: "json", value: null }), "null")
  assert.equal(formatChangeValue({ type: "string", value: "001" }), "001")
  assert.equal(formatChangeValue({ type: "number", value: 1, media_default: true }), "1（媒体默认）")
})

test("detail decoder and preview accept typed values but reject old text and malformed types", () => {
  const row = { id: "00000000-0000-4000-8000-000000000001", workspaceId: "00000000-0000-4000-8000-000000000002", media: "KUAISHOU", accountId: "synthetic", workItemId: null, title: null, status: "draft", initiatorUserId: "00000000-0000-4000-8000-000000000003", executorIdentity: null, multicaIssueId: null, ttlExpireAt: "2026-09-07T00:00:00Z", reasonCode: null, simulation: null, createdAt: "2026-09-06T00:00:00Z", executedAt: null,
    items: [{ id: 1, targetType: "unit", targetId: "synthetic-unit", field: "bid", fromValue: { type: "number", value: 0 }, toValue: { type: "boolean", value: false }, itemStatus: "pending", failReason: null }] }
  const response = { ok: true, data: { kind: "changeset", changeset: row } }
  assert.equal(changeSetDetailResponseSchema.safeParse(response).success, true)
  assert.deepEqual(adaptChangeSetPreview(changeSetDetailResponseSchema.parse(response))?.items[0], { field: "bid", from: "0", to: "false", reason: "只读变更预览" })
  for (const fromValue of ["0", null, { type: "number", value: "0" }, { type: "number", value: NaN }]) {
    assert.equal(changeSetDetailResponseSchema.safeParse({ ...response, data: { ...response.data, changeset: { ...row, items: [{ ...row.items[0], fromValue }] } } }).success, false)
  }
})
