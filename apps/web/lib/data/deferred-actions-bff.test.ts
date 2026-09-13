import assert from "node:assert/strict"
import test from "node:test"
import { handleStopAccountTest, handlePromoteAutonomy, handleReplicateMaterial, handleMaterialDelivery,
  handleImpactEstimate, handleMonthlyDecision, handleSearchAction } from "./deferred-actions-bff.ts"

const environment = { NODE_ENV: "production", KA_DATA_BACKEND_ORIGIN: "https://ka-data.internal.example",
  KA_DATA_SERVICE_TOKEN: "synthetic-deferred-service-token-long-enough" }
const requestId = "synthetic-deferred-bff"
const cookie = "ka_session=synthetic-deferred-cookie-with-at-least-32-characters"
const cases = [
  { method: "POST", path: "/api/v1/accounts/KUAISHOU/a%2Fb/tests/t%3F1/stop", call: (r: Request, d: Parameters<typeof handleMaterialDelivery>[1]) => handleStopAccountTest(r, "KUAISHOU", "a/b", "t?1", d) },
  { method: "POST", path: "/api/v1/rules/r%2F1/autonomy/promote", call: (r: Request, d: Parameters<typeof handleMaterialDelivery>[1]) => handlePromoteAutonomy(r, "r/1", d) },
  { method: "POST", path: "/api/v1/materials/m%3F1/replicate", call: (r: Request, d: Parameters<typeof handleMaterialDelivery>[1]) => handleReplicateMaterial(r, "m?1", d) },
  { method: "POST", path: "/api/v1/materials/deliveries", call: handleMaterialDelivery },
  { method: "PUT", path: "/api/v1/reports/ai-impact/estimates", call: handleImpactEstimate },
  { method: "POST", path: "/api/v1/reports/monthly-exec/decisions", call: handleMonthlyDecision },
  { method: "POST", path: "/api/v1/search/actions", call: handleSearchAction },
]
const req = (method: string, query = "", withCookie = true) => new Request(`http://localhost/api/internal/unused${query}`, {
  method, headers: { ...(withCookie ? { cookie } : {}), "x-ka-workspace-id": "forged", "x-ka-account-scope": "all" }, body: "{}",
})
for (const c of cases) test(`${c.method} ${c.path} forwards canonical 501 without browser scope`, async () => {
  const result = await c.call(req(c.method), { environment, requestId: () => requestId, fetchImpl: async (url, init) => {
    assert.equal(new URL(String(url)).pathname, c.path); assert.equal(init?.method, c.method)
    const headers = new Headers(init?.headers)
    assert.equal(headers.get("authorization"), `Bearer ${environment.KA_DATA_SERVICE_TOKEN}`)
    assert.equal(headers.get("cookie"), cookie)
    assert.equal(headers.get("x-ka-workspace-id"), null); assert.equal(headers.get("x-ka-account-scope"), null)
    return Response.json({ ok: false, error: { code: "NOT_IMPLEMENTED", message: "This capability is not part of the first release", requestId, retryable: false } },
      { status: 501, headers: { "x-request-id": requestId } })
  } })
  assert.equal(result.status, 501); assert.equal(result.requestId, requestId)
})
test("missing session and unsupported query never reach upstream", async () => {
  const deps = { environment, requestId: () => requestId, fetchImpl: async () => { assert.fail("unexpected fetch") } }
  assert.equal((await handleMaterialDelivery(req("POST", "", false), deps)).status, 401)
  assert.equal((await handleMaterialDelivery(req("POST", "?scope=all"), deps)).status, 400)
})
test("unexpected success and malformed/uncorrelated errors fail closed", async () => {
  for (const status of [200, 201, 204]) {
    const response = status === 204 ? new Response(null, { status, headers: { "x-request-id": requestId } }) :
      Response.json({ ok: true, data: { executed: true }, meta: { requestId } }, { status, headers: { "x-request-id": requestId } })
    const result = await handleMaterialDelivery(req("POST"), { environment, requestId: () => requestId, fetchImpl: async () => response })
    assert.equal(result.status, 502); assert.equal(JSON.stringify(result.body).includes("executed"), false)
  }
  for (const response of [Response.json({ token: "private" }, { status: 501, headers: { "x-request-id": requestId } }),
    Response.json({ ok: false, error: { code: "NOT_IMPLEMENTED", message: "hidden", requestId: "wrong", retryable: false } }, { status: 501, headers: { "x-request-id": "wrong" } })]) {
    const result = await handleMaterialDelivery(req("POST"), { environment, requestId: () => requestId, fetchImpl: async () => response })
    assert.equal(result.status, 502); assert.equal(JSON.stringify(result.body).includes("private"), false)
  }
})
test("exact response byte boundary and timeout retain fail-closed envelopes", async () => {
  for (const length of [16 * 1024 * 1024, 16 * 1024 * 1024 + 1]) {
    const response = Response.json({ ok: false, error: { code: "NOT_IMPLEMENTED", message: "Deferred", requestId, retryable: false } },
      { status: 501, headers: { "x-request-id": requestId, "content-length": String(length) } })
    assert.equal((await handleMaterialDelivery(req("POST"), { environment, requestId: () => requestId, fetchImpl: async () => response })).status, 502)
  }
  const result = await handleMaterialDelivery(req("POST"), { environment, requestId: () => requestId,
    fetchImpl: async () => { throw new DOMException("synthetic private timeout", "TimeoutError") } })
  assert.equal(result.status, 504)
  assert.equal(JSON.stringify(result.body).includes("private"), false)
})
