import assert from "node:assert/strict"
import { test } from "node:test"
import { handleAdminMembersRequest } from "./admin-members-bff.ts"
const requestId = "synthetic-members-bff", cookie = `ka_session=${"s".repeat(40)}`, identity = "33333333-3333-4333-8333-333333333333"
const environment = { KA_DATA_BACKEND_ORIGIN: "http://127.0.0.1:3102", KA_DATA_SERVICE_TOKEN: "synthetic-server-only-token-long-enough" }
const meta = { requestId, dataAsOf: null, businessDate: "2026-09-08", workspaceKind: "personal", selectedSource: "platform" }
function req(method = "GET", query = "", headers: Record<string, string> = { cookie }) { return new Request(`http://web.test/api/internal/admin/members${query}`, { method, headers }) }
test("both members and grants BFF preserve canonical envelope and forward only server auth", async () => {
  for (const id of [undefined, identity]) {
    const data = id ? { identityId: id, items: [] } : { items: [] }
    const result = await handleAdminMembersRequest(req("GET", "", { cookie, "x-ka-workspace-id": "forged", authorization: "attacker" }), {
      environment, requestId: () => requestId, fetchImpl: async (url, init) => {
        assert.equal(url, `http://127.0.0.1:3102/api/v1/admin/members${id ? `/${id}/grants` : ""}`)
        const h = new Headers(init?.headers); assert.equal(h.get("authorization"), `Bearer ${environment.KA_DATA_SERVICE_TOKEN}`); assert.equal(h.get("cookie"), cookie); assert.equal(h.get("x-ka-workspace-id"), null)
        return Response.json({ ok: true, data, meta }, { headers: { "x-request-id": requestId } })
      },
    }, id)
    assert.equal(result.status, 200); assert.deepEqual(result.body, { ok: true, data, meta })
  }
})
test("invalid input never reaches backend", async () => {
  for (const [request, id, env, status] of [[req("POST"), undefined, environment, 405], [req("GET", "?scope=*"), undefined, environment, 400], [req(), "../x", environment, 400], [req("GET", "", {}), undefined, environment, 401], [req(), undefined, {}, 503]] as const) {
    assert.equal((await handleAdminMembersRequest(request, { environment: env, requestId: () => requestId, fetchImpl: async () => { throw new Error("must not call") } }, id)).status, status)
  }
})
test("wrong target/status/requestId/private fields fail closed", async () => {
  for (const [data, status, header] of [[{ identityId: "44444444-4444-4444-8444-444444444444", items: [] }, 200, requestId], [{ identityId: identity, items: [], secret: "hidden" }, 200, requestId], [{ identityId: identity, items: [] }, 201, requestId], [{ identityId: identity, items: [] }, 200, "other"]] as const) {
    const r = await handleAdminMembersRequest(req(), { environment, requestId: () => requestId, fetchImpl: async () => Response.json({ ok: true, data, meta }, { status, headers: { "x-request-id": header } }) }, identity)
    assert.equal(r.status, 502); assert.ok(!JSON.stringify(r.body).includes("hidden"))
  }
})
test("byte boundary and transport errors stay safe", async () => {
  for (const response of [new Response("{}", { headers: { "x-request-id": requestId, "content-length": String(16 * 1024 * 1024) } }), new Response(new ReadableStream({ start(c) { c.enqueue(new Uint8Array(16 * 1024 * 1024)); c.close() } }), { headers: { "x-request-id": requestId } })])
    assert.equal((await handleAdminMembersRequest(req(), { environment, requestId: () => requestId, fetchImpl: async () => response })).status, 502)
  for (const [error, status] of [[new Error("SQL secret"), 503], [new DOMException("secret", "TimeoutError"), 504]] as const) {
    const r = await handleAdminMembersRequest(req(), { environment, requestId: () => requestId, fetchImpl: async () => { throw error } }); assert.equal(r.status, status); assert.ok(!JSON.stringify(r.body).includes("secret"))
  }
})
test("preserves all typed errors, not raw upstream body", async () => {
  for (const [code, status] of [["INVALID_REQUEST", 400], ["UNAUTHORIZED", 401], ["FORBIDDEN", 403], ["NOT_FOUND", 404], ["UPSTREAM_INVALID_RESPONSE", 502], ["SOURCE_TRUNCATED", 502], ["SOURCE_UNAVAILABLE", 503], ["UPSTREAM_TIMEOUT", 504], ["INTERNAL_ERROR", 500]] as const) {
    const r = await handleAdminMembersRequest(req(), { environment, requestId: () => requestId, fetchImpl: async () => Response.json({ ok: false, error: { code, message: "safe", requestId, retryable: false } }, { status, headers: { "x-request-id": requestId } }) }); assert.equal(r.status, status)
  }
})
