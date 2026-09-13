import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"
import { handleSettingsChangeLogRequest } from "./settings-change-log-bff.ts"

const fixture = JSON.parse(readFileSync(new URL("../../../../packages/contract/fixtures/settings/change-log-v1944.json", import.meta.url), "utf8"))
const requestId = fixture.meta.requestId as string
const cookie = `ka_session=${"s".repeat(40)}`
const environment = { KA_DATA_BACKEND_ORIGIN: "http://127.0.0.1:3102", KA_DATA_SERVICE_TOKEN: "synthetic-server-only-token-long-enough" }
const request = (query = "", method = "GET", headers: HeadersInit = { cookie }) => new Request(`http://web.test/api/internal/settings/change-log${query}`, { method, headers })
const response = (body: unknown = fixture, status = 200, headers: HeadersInit = { "x-request-id": requestId }) => Response.json(body, { status, headers })

test("actual PG→HTTP fixture survives BFF unchanged; only server credentials and session are forwarded", async () => {
  let calls = 0
  const r = await handleSettingsChangeLogRequest(request("?kinds=assessment_price,daily_budget_cap,channel_coefficient&task_id=allowed", "GET", {
    cookie, authorization: "forged", "x-ka-workspace-id": "forged", "x-ka-account-scope": "*", "x-request-id": "forged",
  }), { environment, requestId: () => requestId, fetchImpl: async (url, init) => {
    calls++
    const u = new URL(url)
    assert.equal(u.origin + u.pathname, "http://127.0.0.1:3102/api/v1/settings/change-log")
    assert.equal(u.searchParams.get("task_id"), "allowed")
    assert.equal(u.searchParams.get("kinds"), "assessment_price,daily_budget_cap,channel_coefficient")
    const h = new Headers(init?.headers)
    assert.equal(h.get("authorization"), `Bearer ${environment.KA_DATA_SERVICE_TOKEN}`)
    assert.equal(h.get("cookie"), cookie)
    assert.equal(h.get("x-ka-workspace-id"), null); assert.equal(h.get("x-ka-account-scope"), null)
    assert.equal(h.get("x-request-id"), requestId)
    assert.equal(init?.method, "GET"); assert.equal(init?.cache, "no-store"); assert.equal(init?.redirect, "error")
    // Keep the captured body intact; field filtering belongs to the real backend.
    return response()
  } })
  assert.equal(calls, 1); assert.equal(r.status, 200); assert.deepEqual(r.body, fixture)
})

test("duplicate, unknown, empty and invalid filters fail before any upstream request", async () => {
  for (const query of ["?scope=*", "?workspaceKind=team", "?dataSource=ka_data", "?task_id=a&task_id=b", "?kinds=unknown", "?kinds=assessment_price,assessment_price", "?media=", "?media=bad", "?cursor="]) {
    let calls = 0
    const r = await handleSettingsChangeLogRequest(request(query), { environment, requestId: () => requestId, fetchImpl: async () => { calls++; return response() } })
    assert.equal(r.status, 400, query); assert.equal(calls, 0)
  }
})

test("missing/ambiguous session, disabled config and writes never call upstream", async () => {
  for (const [req, env, status] of [
    [request("", "POST"), environment, 405], [request("", "PATCH"), environment, 405],
    [request("", "GET", {}), environment, 401], [request("", "GET", { cookie: `${cookie};${cookie}` }), environment, 401],
    [request(), {}, 503],
  ] as const) {
    let calls = 0
    const r = await handleSettingsChangeLogRequest(req, { environment: env, fetchImpl: async () => { calls++; return response() } })
    assert.equal(r.status, status); assert.equal(calls, 0)
  }
})

test("cursor and media use validated URL parameters, never path interpolation", async () => {
  const cursor = "a+/=="
  const r = await handleSettingsChangeLogRequest(request(`?media=KUAISHOU&cursor=${encodeURIComponent(cursor)}`), {
    environment, requestId: () => requestId, fetchImpl: async url => {
      assert.equal(new URL(url).searchParams.get("cursor"), cursor)
      assert.equal(new URL(url).searchParams.get("media"), "KUAISHOU")
      return response({ ...fixture, data: { items: [], nextCursor: null } })
    },
  })
  assert.equal(r.status, 200)
})

test("rejects success shape/status/requestId drift and unsolicited session rotation", async () => {
  for (const upstream of [
    response({ ...fixture, data: { ...fixture.data, secret: "synthetic-secret" } }),
    response({ ...fixture, data: { ...fixture.data, items: [{ ...fixture.data.items[0], newValue: "invalid" }] } }),
    response({ ...fixture, meta: { requestId: "other" } }), response(fixture, 201),
    response(fixture, 200, { "x-request-id": "other" }), response(fixture, 200, {}),
    response(fixture, 200, { "x-request-id": requestId, "set-cookie": cookie }),
  ]) {
    const r = await handleSettingsChangeLogRequest(request(), { environment, requestId: () => requestId, fetchImpl: async () => upstream })
    assert.equal(r.status, 502); assert.ok(!JSON.stringify(r.body).includes("synthetic-secret"))
  }
})

test("stable errors keep correlation/status/code but never reflect upstream diagnostic text", async () => {
  for (const [code, status] of [["INVALID_REQUEST", 400], ["UNAUTHORIZED", 401], ["FORBIDDEN", 403], ["SOURCE_UNAVAILABLE", 503], ["SOURCE_TRUNCATED", 502], ["UPSTREAM_INVALID_RESPONSE", 502], ["UPSTREAM_TIMEOUT", 504], ["INTERNAL_ERROR", 500]] as const) {
    const r = await handleSettingsChangeLogRequest(request(), { environment, requestId: () => requestId,
      fetchImpl: async () => response({ ok: false, error: { code, message: "synthetic-private-diagnostic", retryable: false, requestId } }, status) })
    assert.equal(r.status, status); assert.ok(!r.body.ok && r.body.error.code === code)
    assert.ok(!JSON.stringify(r.body).includes("synthetic-private-diagnostic"))
  }
})

test("malformed error, unsupported code and status mismatch become safe 502", async () => {
  for (const [code, status, extra] of [["FORBIDDEN", 500, {}], ["RATE_LIMITED", 429, {}], ["FORBIDDEN", 403, { sql: "synthetic-secret" }]] as const) {
    const r = await handleSettingsChangeLogRequest(request(), { environment, requestId: () => requestId,
      fetchImpl: async () => response({ ok: false, error: { code, message: "synthetic-secret", retryable: false, requestId, ...extra } }, status) })
    assert.equal(r.status, 502); assert.ok(!JSON.stringify(r.body).includes("synthetic-secret"))
  }
})

test("returned kind/task/media cannot contradict the submitted filter", async () => {
  for (const query of ["?kinds=assessment_price", "?task_id=another-task", "?media=TENCENT"]) {
    const r = await handleSettingsChangeLogRequest(request(query), { environment, requestId: () => requestId, fetchImpl: async () => response() })
    assert.equal(r.status, 502)
  }
})

test("exact 16MiB declared or streamed response is truncated, not accepted", async () => {
  for (const upstream of [new Response("{}", { headers: { "x-request-id": requestId, "content-length": String(16 * 1024 * 1024) } }),
    new Response(new Uint8Array(16 * 1024 * 1024), { headers: { "x-request-id": requestId } })]) {
    const r = await handleSettingsChangeLogRequest(request(), { environment, requestId: () => requestId, fetchImpl: async () => upstream })
    assert.equal(r.status, 502); assert.ok(!r.body.ok && r.body.error.code === "SOURCE_TRUNCATED")
  }
})

test("invalid JSON and UTF8 are invalid response; transport and timeout are distinct", async () => {
  for (const upstream of [new Response("not-json", { headers: { "x-request-id": requestId } }), new Response(new Uint8Array([255]), { headers: { "x-request-id": requestId } })]) {
    const r = await handleSettingsChangeLogRequest(request(), { environment, requestId: () => requestId, fetchImpl: async () => upstream })
    assert.equal(r.status, 502)
  }
  for (const [cause, status] of [[new Error("synthetic-secret"), 503], [new DOMException("synthetic-secret", "TimeoutError"), 504]] as const) {
    const r = await handleSettingsChangeLogRequest(request(), { environment, requestId: () => requestId, fetchImpl: async () => { throw cause } })
    assert.equal(r.status, status); assert.ok(!JSON.stringify(r.body).includes("synthetic-secret"))
  }
})
