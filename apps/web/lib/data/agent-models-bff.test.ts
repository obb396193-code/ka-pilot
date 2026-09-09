import assert from "node:assert/strict"
import { test } from "node:test"
import { handleAgentModelsRequest } from "./agent-models-bff.ts"

const requestId = "synthetic-model-bff", cookie = `ka_session=${"s".repeat(40)}`
const environment = { KA_DATA_BACKEND_ORIGIN: "http://127.0.0.1:3102", KA_DATA_SERVICE_TOKEN: "synthetic-server-only-token-long-enough" }
const payload = { ok: true, data: { items: [{ id: "model-a", provider: "synthetic", label: "model-a", default: false, status: "verified" }] }, meta: { requestId } }
function request(method = "GET", query = "", headers = { cookie }) { return new Request(`http://web.test/api/internal/agent/models${query}`, { method, headers }) }
test("model BFF passes only server credentials/session and strict canonical response", async () => {
  let called = 0
  const r = await handleAgentModelsRequest(request("GET", "", { cookie, authorization: "attacker", "x-ka-workspace-id": "forged" } as { cookie: string }), {
    environment, requestId: () => requestId, fetchImpl: async (url, init) => {
      called++; assert.equal(url, "http://127.0.0.1:3102/api/v1/agent/models")
      const headers = new Headers(init?.headers)
      assert.equal(headers.get("authorization"), `Bearer ${environment.KA_DATA_SERVICE_TOKEN}`)
      assert.equal(headers.get("cookie"), cookie); assert.equal(headers.get("x-ka-workspace-id"), null)
      assert.equal(init?.redirect, "error"); assert.equal(init?.cache, "no-store")
      return Response.json(payload, { headers: { "x-request-id": requestId } })
    },
  })
  assert.equal(called, 1); assert.equal(r.status, 200); assert.deepEqual(r.body, payload)
})
test("invalid methods/query/auth/config never call upstream", async () => {
  for (const [req, env, status] of [
    [request("POST"), environment, 405], [request("GET", "?scope=*"), environment, 400],
    [request("GET", "", { cookie: "" }), environment, 401], [request(), {}, 503],
  ] as const) {
    const r = await handleAgentModelsRequest(req, { environment: env, requestId: () => requestId, fetchImpl: async () => { throw new Error("must not call") } })
    assert.equal(r.status, status)
  }
})
test("strict parity rejects requestId/status/private-field drift", async () => {
  for (const [value, status, header] of [[{ ...payload, data: { ...payload.data, secret: "hidden" } }, 200, requestId],
    [payload, 201, requestId], [payload, 200, "other"], [{ ...payload, meta: { requestId: "other" } }, 200, requestId]] as const) {
    const r = await handleAgentModelsRequest(request(), { environment, requestId: () => requestId, fetchImpl: async () => Response.json(value, { status, headers: { "x-request-id": header } }) })
    assert.equal(r.status, 502); assert.equal(r.body.ok, false); assert.ok(!JSON.stringify(r.body).includes("hidden"))
  }
})
test("exact16MiB and streamed overflow reject without parsing", async () => {
  for (const response of [new Response("{}", { headers: { "x-request-id": requestId, "content-length": String(16 * 1024 * 1024) } }),
    new Response(new ReadableStream({ start(c) { c.enqueue(new Uint8Array(16 * 1024 * 1024)); c.close() } }), { headers: { "x-request-id": requestId } })]) {
    const r = await handleAgentModelsRequest(request(), { environment, requestId: () => requestId, fetchImpl: async () => response })
    assert.equal(r.status, 502); assert.ok(!r.body.ok && r.body.error.code === "SOURCE_TRUNCATED")
  }
})
test("propagates safe canonical source errors and sanitizes transport errors", async () => {
  for (const [code, status] of [["UNAUTHORIZED", 401], ["FORBIDDEN", 403], ["SOURCE_UNAVAILABLE", 503], ["UPSTREAM_TIMEOUT", 504], ["INTERNAL_ERROR", 500]] as const) {
    const body = { ok: false, error: { code, message: "Safe message", requestId, retryable: false } }
    assert.equal((await handleAgentModelsRequest(request(), { environment, requestId: () => requestId, fetchImpl: async () => Response.json(body, { status, headers: { "x-request-id": requestId } }) })).status, status)
  }
  for (const [error, status] of [[new Error("synthetic secret"), 503], [new DOMException("synthetic secret", "TimeoutError"), 504]] as const) {
    const r = await handleAgentModelsRequest(request(), { environment, requestId: () => requestId, fetchImpl: async () => { throw error } })
    assert.equal(r.status, status); assert.ok(!JSON.stringify(r.body).includes("synthetic secret"))
  }
})
