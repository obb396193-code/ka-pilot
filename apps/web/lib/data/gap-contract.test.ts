import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"
import { handleSemanticQueryRequest } from "./bff.ts"
import { dataQueryResponseSchema } from "./contracts.ts"
import { getMockResponse } from "./mock-data.ts"

async function syntheticGap() {
  const raw = JSON.parse(await readFile(new URL("../../../../packages/contract/fixtures/data-query/gap.json", import.meta.url), "utf8"))
  // Synthetic clock correction only, not a real data/active rule-set claim.
  raw.meta.dataAsOf = raw.data.source.lineage.dataAsOf
  raw.meta.requestId = "gap-web"
  return raw
}
test("Gap source-off mock is not a daily metric row", () => {
  const result = getMockResponse({ queryId: "account.gap", dataView: "platform", params: {} })
  assert.equal(result.ok, false)
  if (!result.ok) assert.equal(result.error.code, "SOURCE_UNAVAILABLE")
})
test("Gap version/grouping/unique rows/zero denominator reject malformed data", async () => {
  const raw = await syntheticGap()
  assert.equal(dataQueryResponseSchema.safeParse(raw).success, true)
  for (const version of [undefined, "", " x", "x\n", "x".repeat(257)])
    assert.equal(dataQueryResponseSchema.safeParse({ ...raw, meta: { ...raw.meta, ruleSetVersion: version } }).success, false)
  const zero = structuredClone(raw); zero.data.source.rows[0].realConversion.value = 0
  assert.equal(dataQueryResponseSchema.safeParse(zero).success, false)
  const wrongGroup = structuredClone(raw); wrongGroup.data.source.groupBy = "media"
  assert.equal(dataQueryResponseSchema.safeParse(wrongGroup).success, false)
  const unknown = structuredClone(raw)
  Object.assign(unknown.data.source.lineage, { dataAsOf: null, datasetVersion: null, timezone: null, dayCut: null, metadataAvailability: "unknown" })
  unknown.meta.dataAsOf = null
  assert.equal(dataQueryResponseSchema.safeParse(unknown).success, true)
})
test("Gap BFF correlates success/error requestId and propagates source-off", async () => {
  const raw = await syntheticGap()
  const workspace = { id: "00000000-0000-4000-8000-000000000001", name: "synthetic", kind: "personal", role: "optimizer", readOnly: false }
  for (const fault of ["none", "request-id", "source-off"] as const) {
    const result = await handleSemanticQueryRequest(new Request("https://web.example/api/internal/query", {
      method: "POST", headers: { "content-type": "application/json", cookie: "ka_session=synthetic-gap-cookie-00000000000000001" },
      body: JSON.stringify({ queryId: "account.gap", params: { date_from: "2026-09-01", date_to: "2026-09-05", media: "KUAISHOU", groupBy: "account" } }),
    }), { requestId: () => "gap-web", environment: { KA_DATA_BACKEND_ORIGIN: "https://backend.example", KA_DATA_SERVICE_TOKEN: "synthetic-service-token-0000000000000000" },
      fetchImpl: async (url) => {
        if (String(url).endsWith("/auth/session")) return Response.json({ ok: true, data: { identity: { displayName: "synthetic" }, activeWorkspace: workspace, workspaces: [workspace] }, meta: { requestId: "gap-web" } }, { headers: { "x-request-id": "gap-web" } })
        if (fault === "source-off") return Response.json({ ok: false, error: { code: "SOURCE_UNAVAILABLE", message: "Versioned Gap source is not configured", requestId: "gap-web", retryable: true } }, { status: 503, headers: { "x-request-id": "gap-web" } })
        return Response.json({ ...raw, meta: { ...raw.meta, requestId: fault === "none" ? "gap-web" : "wrong" } }, { headers: { "x-request-id": "gap-web" } })
      },
    })
    assert.equal(result.status, fault === "none" ? 200 : fault === "source-off" ? 503 : 502)
  }
})
