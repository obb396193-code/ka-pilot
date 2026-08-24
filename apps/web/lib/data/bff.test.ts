import assert from "node:assert/strict"
import test from "node:test"

import { backendUnknownLineageEnvelope } from "./backend-contract-fixtures.ts"
import { BACKEND_DATA_QUERY_PATH, MAX_UPSTREAM_BODY_BYTES, forwardDataQuery, handleDataQueryRequest } from "./bff.ts"

const request = { queryId: "account.summary", dataView: "platform", params: { date: "2026-08-24" } }
const authContext = { workspaceId: "00000000-0000-4000-8000-000000000007", userId: "user-demo", allowedAccounts: [{ media: "KUAISHOU", accountId: "account-demo-07" }] }

test("BFF forwards to fixed backend path and keeps service bearer server-side", async () => {
  let url = ""; let init: RequestInit | undefined
  const response = await forwardDataQuery(request, { backendOrigin: "https://ka-data.internal.example", serviceToken: "server-secret", authContext, fetchImpl: async (input, requestInit) => {
    url = String(input); init = requestInit
    return Response.json({ ok: false, error: { code: "FORBIDDEN", message: "No scope", requestId: "upstream-403", retryable: false } }, { status: 403 })
  } })
  assert.equal(url, `https://ka-data.internal.example${BACKEND_DATA_QUERY_PATH}`)
  assert.equal(new Headers(init?.headers).get("authorization"), "Bearer server-secret")
  assert.equal(new Headers(init?.headers).get("x-ka-workspace-id"), "00000000-0000-4000-8000-000000000007")
  assert.equal(new Headers(init?.headers).get("x-ka-user-id"), "user-demo")
  assert.deepEqual(JSON.parse(Buffer.from(new Headers(init?.headers).get("x-ka-account-scope") ?? "", "base64url").toString("utf8")), authContext.allowedAccounts)
  assert.equal(response.status, 403)
  assert.deepEqual(response.body, { ok: false, error: { code: "FORBIDDEN", message: "No scope", requestId: "upstream-403", retryable: false } })
})

test("BFF rejects invalid query ids before upstream", async () => {
  let called = false
  const response = await forwardDataQuery({ ...request, queryId: "analysis" }, { backendOrigin: "https://ka-data.internal.example", serviceToken: "server-secret", authContext, fetchImpl: async () => { called = true; return Response.json({}) } })
  assert.equal(called, false); assert.equal(response.status, 400); assert.match(response.body.ok ? "" : response.body.error.requestId, /.+/)
})

test("BFF distinguishes upstream timeout and 16MB overflow", async () => {
  const timeout = await forwardDataQuery(request, { backendOrigin: "https://ka-data.internal.example", serviceToken: "server-secret", authContext, fetchImpl: async () => { throw new DOMException("Timeout", "AbortError") } })
  assert.equal(timeout.status, 504); assert.equal(timeout.body.ok ? "" : timeout.body.error.code, "UPSTREAM_TIMEOUT")
  const oversized = await forwardDataQuery(request, { backendOrigin: "https://ka-data.internal.example", serviceToken: "server-secret", authContext, fetchImpl: async () => new Response("{}", { headers: { "content-length": String(MAX_UPSTREAM_BODY_BYTES + 1) } }) })
  assert.equal(oversized.status, 502); assert.match(oversized.body.ok ? "" : oversized.body.error.message, /16\s?MB/i)
})

test("production fails closed when an approved server auth context is missing", async () => {
  let called = false
  const incoming = new Request("http://localhost/api/internal/data-query", {
    method: "POST",
    headers: { "content-type": "application/json", "x-ka-workspace-id": "browser-forged" },
    body: JSON.stringify(request),
  })
  const response = await handleDataQueryRequest(incoming, {
    environment: { NODE_ENV: "production", KA_DATA_BACKEND_ORIGIN: "https://ka-data.internal.example", KA_DATA_SERVICE_TOKEN: "server-secret" },
    approvedAuthContextResolver: async () => null,
    fetchImpl: async () => { called = true; return Response.json({}) },
  })

  assert.equal(called, false)
  assert.equal(response.status, 403)
  assert.equal(response.body.ok ? "" : response.body.error.code, "FORBIDDEN")
})

test("development uses explicit server-only scope and ignores forged browser permission headers", async () => {
  let upstreamHeaders = new Headers()
  const incoming = new Request("http://localhost/api/internal/data-query", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: "Bearer browser-token",
      "x-ka-workspace-id": "browser-workspace",
      "x-ka-user-id": "browser-user",
      "x-ka-account-scope": Buffer.from(JSON.stringify([{ media: "KUAISHOU", accountId: "browser-account" }])).toString("base64url"),
    },
    body: JSON.stringify(request),
  })
  const response = await handleDataQueryRequest(incoming, {
    environment: {
      NODE_ENV: "development",
      KA_DATA_BACKEND_ORIGIN: "https://ka-data.internal.example",
      KA_DATA_SERVICE_TOKEN: "server-secret",
      KA_DATA_DEV_AUTH_CONTEXT_ENABLED: "true",
      KA_DATA_DEV_WORKSPACE_ID: "00000000-0000-4000-8000-000000000024",
      KA_DATA_DEV_USER_ID: "dev-user",
      KA_DATA_DEV_ACCOUNT_SCOPE_JSON: JSON.stringify([{ media: "KUAISHOU", accountId: "dev-account-07" }]),
    },
    approvedAuthContextResolver: async () => null,
    fetchImpl: async (_input, init) => {
      upstreamHeaders = new Headers(init?.headers)
      return Response.json(backendUnknownLineageEnvelope)
    },
  })

  assert.equal(response.status, 200)
  assert.equal(upstreamHeaders.get("authorization"), "Bearer server-secret")
  assert.equal(upstreamHeaders.get("x-ka-workspace-id"), "00000000-0000-4000-8000-000000000024")
  assert.equal(upstreamHeaders.get("x-ka-user-id"), "dev-user")
  assert.deepEqual(JSON.parse(Buffer.from(upstreamHeaders.get("x-ka-account-scope") ?? "", "base64url").toString("utf8")), [{ media: "KUAISHOU", accountId: "dev-account-07" }])
})

test("development rejects a non-UUID workspace before contacting the backend", async () => {
  let called = false
  const incoming = new Request("http://localhost/api/internal/data-query", { method: "POST", body: JSON.stringify(request) })
  const response = await handleDataQueryRequest(incoming, {
    environment: {
      NODE_ENV: "development",
      KA_DATA_BACKEND_ORIGIN: "https://ka-data.internal.example",
      KA_DATA_SERVICE_TOKEN: "server-secret",
      KA_DATA_DEV_AUTH_CONTEXT_ENABLED: "true",
      KA_DATA_DEV_WORKSPACE_ID: "not-a-postgres-uuid",
      KA_DATA_DEV_USER_ID: "dev-user",
      KA_DATA_DEV_ACCOUNT_SCOPE_JSON: JSON.stringify([{ media: "KUAISHOU", accountId: "dev-account-07" }]),
    },
    approvedAuthContextResolver: async () => null,
    fetchImpl: async () => { called = true; return Response.json({}) },
  })

  assert.equal(called, false)
  assert.equal(response.status, 403)
})
