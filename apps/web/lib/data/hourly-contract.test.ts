import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"
import { handleSemanticQueryRequest } from "./bff.ts"
import { dataQueryResponseSchema } from "./contracts.ts"
import { getMockResponse } from "./mock-data.ts"
import { MAX_UPSTREAM_BODY_BYTES } from "./bounded-response.ts"

async function syntheticEnvelope() {
  const raw = JSON.parse(await readFile(new URL("../../../../packages/contract/fixtures/data-query/hourly.json", import.meta.url), "utf8"))
  // Reuse the frozen row, not the fixture's contradictory total/time envelope.
  const source = raw.data.source
  source.rows = [source.rows[0]]; source.returnedRowCount = 1
  source.wholeResultTotal = { value: 1, availability: "available" }; source.warnings = []
  Object.assign(source.lineage, { partial: false, coverage: { complete: true, requestedObjects: 1, returnedObjects: 1 },
    window: { from: "2026-09-05", to: "2026-09-05", preset: "custom" }, dataAsOf: source.rows[0].lastSyncAt })
  raw.meta = { requestId: "hourly-web", businessDate: "2026-09-05", workspaceKind: "personal", selectedSource: "platform", dataAsOf: source.lineage.dataAsOf }
  return raw
}

test("hourly mock honestly reports unavailable, never daily metrics", () => {
  assert.deepEqual(getMockResponse({ queryId: "account.hourly", dataView: "platform", params: {} }).ok, false)
})

test("hourly full envelope binds date/source/time metadata and rejects fixture contradictions", async () => {
  const good = await syntheticEnvelope()
  assert.equal(dataQueryResponseSchema.safeParse(good).success, true)
  for (const meta of [undefined, { ...good.meta, dataAsOf: null }, { ...good.meta, businessDate: "2026-02-31" }, { ...good.meta, workspaceKind: "team" }])
    assert.equal(dataQueryResponseSchema.safeParse({ ...good, meta }).success, false)
  const original = JSON.parse(await readFile(new URL("../../../../packages/contract/fixtures/data-query/hourly.json", import.meta.url), "utf8"))
  assert.equal(dataQueryResponseSchema.safeParse(original).success, false)
})

test("hourly BFF keeps body requestId correlated and exact16MiB fail-closed", async () => {
  const good = await syntheticEnvelope()
  const workspace = { id: "00000000-0000-4000-8000-000000000001", name: "synthetic", kind: "personal", role: "optimizer", readOnly: false, isDemo: false }
  for (const fault of ["none", "body-request-id", "exact-size"] as const) {
    const payload = structuredClone(good)
    if (fault === "body-request-id") payload.meta.requestId = "wrong-request"
    const result = await handleSemanticQueryRequest(new Request("https://web.example/api/internal/query", {
      method: "POST", headers: { "content-type": "application/json", cookie: "ka_session=synthetic-hourly-cookie-0000000000000001" },
      body: JSON.stringify({ queryId: "account.hourly", params: { date: "2026-09-05", media: "KUAISHOU" } }),
    }), { requestId: () => "hourly-web", environment: { KA_DATA_BACKEND_ORIGIN: "https://backend.example", KA_DATA_SERVICE_TOKEN: "synthetic-service-token-0000000000000000" },
      fetchImpl: async (url) => {
        if (String(url).endsWith("/auth/session")) return Response.json({ ok: true, data: { identity: { id: "00000000-0000-4000-8000-0000000000e1", provider: "internal_test", displayName: "synthetic", mustChangePassword: false }, activeWorkspace: workspace, workspaces: [workspace] }, meta: { requestId: "hourly-web" } }, { headers: { "x-request-id": "hourly-web" } })
        return Response.json(payload, { headers: { "x-request-id": "hourly-web", ...(fault === "exact-size" ? { "content-length": String(MAX_UPSTREAM_BODY_BYTES) } : {}) } })
      },
    })
    assert.equal(result.status, fault === "none" ? 200 : 502)
    if (!result.body.ok) assert.equal(result.body.error.code, "UPSTREAM_INVALID_RESPONSE")
  }
})
