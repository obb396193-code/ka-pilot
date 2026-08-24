import assert from "node:assert/strict"
import test from "node:test"

import { backendUnknownLineageEnvelope } from "./backend-contract-fixtures.ts"
import { dataQueryResponseSchema } from "./contracts.ts"

test("frontend accepts the backend unknown-lineage envelope from de31f3a", () => {
  const parsed = dataQueryResponseSchema.parse(backendUnknownLineageEnvelope)

  assert.equal(parsed.ok, true)
  if (parsed.ok && parsed.data.mode !== "reconcile") {
    assert.equal(parsed.data.source.lineage.dataAsOf, null)
    assert.equal(parsed.data.source.lineage.metadataAvailability, "unknown")
  }
})

test("unknown lineage rejects fabricated source metadata", () => {
  const invalid = JSON.parse(JSON.stringify(backendUnknownLineageEnvelope)) as {
    data: { source: { lineage: { dataAsOf: string | null } } }
  }
  invalid.data.source.lineage.dataAsOf = "2026-08-24T08:00:00.000Z"

  assert.throws(() => dataQueryResponseSchema.parse(invalid), /unknown lineage/i)
})
