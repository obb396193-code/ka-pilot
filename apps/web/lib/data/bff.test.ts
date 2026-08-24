import assert from "node:assert/strict"
import test from "node:test"

import { BACKEND_DATA_QUERY_PATH, MAX_UPSTREAM_BODY_BYTES, forwardDataQuery } from "./bff.ts"

const request = { queryId: "account.summary", dataView: "platform", params: { date: "2026-08-24" } }

test("BFF forwards to fixed backend path and keeps service bearer server-side", async () => {
  let url = ""; let init: RequestInit | undefined
  const response = await forwardDataQuery(request, { backendOrigin: "https://ka-data.internal.example", serviceToken: "server-secret", fetchImpl: async (input, requestInit) => {
    url = String(input); init = requestInit
    return Response.json({ ok: false, error: { code: "FORBIDDEN", message: "No scope", requestId: "upstream-403", retryable: false } }, { status: 403 })
  } })
  assert.equal(url, `https://ka-data.internal.example${BACKEND_DATA_QUERY_PATH}`)
  assert.equal(new Headers(init?.headers).get("authorization"), "Bearer server-secret")
  assert.equal(response.status, 403)
  assert.deepEqual(response.body, { ok: false, error: { code: "FORBIDDEN", message: "No scope", requestId: "upstream-403", retryable: false } })
})

test("BFF rejects invalid query ids before upstream", async () => {
  let called = false
  const response = await forwardDataQuery({ ...request, queryId: "analysis" }, { backendOrigin: "https://ka-data.internal.example", serviceToken: "server-secret", fetchImpl: async () => { called = true; return Response.json({}) } })
  assert.equal(called, false); assert.equal(response.status, 400); assert.match(response.body.ok ? "" : response.body.error.requestId, /.+/)
})

test("BFF distinguishes upstream timeout and 16MB overflow", async () => {
  const timeout = await forwardDataQuery(request, { backendOrigin: "https://ka-data.internal.example", serviceToken: "server-secret", fetchImpl: async () => { throw new DOMException("Timeout", "AbortError") } })
  assert.equal(timeout.status, 504); assert.equal(timeout.body.ok ? "" : timeout.body.error.code, "UPSTREAM_TIMEOUT")
  const oversized = await forwardDataQuery(request, { backendOrigin: "https://ka-data.internal.example", serviceToken: "server-secret", fetchImpl: async () => new Response("{}", { headers: { "content-length": String(MAX_UPSTREAM_BODY_BYTES + 1) } }) })
  assert.equal(oversized.status, 502); assert.match(oversized.body.ok ? "" : oversized.body.error.message, /16\s?MB/i)
})
