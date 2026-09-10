import assert from "node:assert/strict"
import test from "node:test"

import { backendUnknownLineageEnvelope } from "./backend-contract-fixtures.ts"
import { BACKEND_DATA_QUERY_PATH, forwardDataQuery as rawForwardDataQuery, handleDataQueryRequest as rawHandleDataQueryRequest } from "./bff.ts"
import { MAX_UPSTREAM_BODY_BYTES } from "./bounded-response.ts"
import { canonicalTableEnvelope, canonicalTableRow } from "./canonical-query-fixtures.ts"

const request = { queryId: "account.summary", params: { date: "2026-08-24" } }
const authContext = { workspaceId: "00000000-0000-4000-8000-000000000024", userId: "user-demo", allowedAccounts: [{ media: "KUAISHOU", accountId: "account-demo-07" }] }
const SESSION_COOKIE = "personal-session-token-0000000000000001"
const SERVICE_TOKEN = "server-secret-000000000000000000000000"
// Existing query-boundary cases explicitly simulate the separate successful Session
// read so their corrupt/oversized responses still exercise DATA, not only auth.
function withPersonalSession(fetchImpl: typeof fetch | undefined) {
  return async (url: string, init?: RequestInit) => {
    if (url.endsWith("/api/v1/auth/session")) {
      const workspace = { id: authContext.workspaceId, name: "Synthetic personal", kind: "personal", role: "optimizer", readOnly: false, isDemo: false }
      const requestId = new Headers(init?.headers).get("x-request-id")
      return Response.json({ ok: true, data: { identity: { id: "00000000-0000-4000-8000-0000000000e1", provider: "internal_test", displayName: "Synthetic", mustChangePassword: false }, activeWorkspace: workspace, workspaces: [workspace] }, meta: { requestId } }, { headers: { "x-request-id": requestId! } })
    }
    return fetchImpl!(url, init)
  }
}
function forwardDataQuery(input: unknown, dependencies: Parameters<typeof rawForwardDataQuery>[1]) {
  return rawForwardDataQuery(input, { ...dependencies, fetchImpl: withPersonalSession(dependencies.fetchImpl as typeof fetch) })
}
function handleDataQueryRequest(input: Request, dependencies: Parameters<typeof rawHandleDataQueryRequest>[1]) {
  return rawHandleDataQueryRequest(input, { ...dependencies, fetchImpl: withPersonalSession(dependencies.fetchImpl as typeof fetch) })
}


test("direct forwarder requires a real session and never sends a fabricated token", async () => {
  for (const sessionCookie of [undefined, "", "old-token"]) {
    let calls = 0
    const result = await forwardDataQuery(request, {
      backendOrigin: "https://ka-data.internal.example", serviceToken: SERVICE_TOKEN,
      sessionCookie, requestId: () => "missing-forward-session",
      fetchImpl: async () => { calls += 1; return Response.json({}) },
    })
    assert.equal(calls, 0)
    assert.equal(result.status, 401)
    assert.equal(result.body.ok ? "" : result.body.error.code, "UNAUTHORIZED")
    assert.equal(result.requestId, "missing-forward-session")
  }
})

test("BFF forwards to fixed backend path and keeps service bearer server-side", async () => {
  let url = ""; let init: RequestInit | undefined
  const response = await forwardDataQuery(request, { environment: {}, backendOrigin: "https://ka-data.internal.example", serviceToken: SERVICE_TOKEN, sessionCookie: SESSION_COOKIE, requestId: () => "bff-forward-403", fetchImpl: async (input, requestInit) => {
    url = String(input); init = requestInit
    return Response.json({ ok: false, error: { code: "FORBIDDEN", message: "No scope", requestId: "bff-forward-403", retryable: false } }, { status: 403, headers: { "x-request-id": "bff-forward-403" } })
  } })
  assert.equal(url, `https://ka-data.internal.example${BACKEND_DATA_QUERY_PATH}`)
  assert.equal(new Headers(init?.headers).get("authorization"), `Bearer ${SERVICE_TOKEN}`)
  assert.equal(new Headers(init?.headers).get("cookie"), `ka_session=${SESSION_COOKIE}`)
  assert.equal(new Headers(init?.headers).has("x-ka-workspace-id"), false)
  assert.equal(new Headers(init?.headers).has("x-ka-user-id"), false)
  assert.equal(new Headers(init?.headers).has("x-ka-account-scope"), false)
  assert.equal(response.status, 403)
  assert.deepEqual(response.body, { ok: false, error: { code: "FORBIDDEN", message: "No scope", requestId: "bff-forward-403", retryable: false } })
})

test("BFF rejects invalid query ids before upstream", async () => {
  let called = false
  const response = await forwardDataQuery({ ...request, queryId: "analysis" }, { environment: {}, backendOrigin: "https://ka-data.internal.example", serviceToken: SERVICE_TOKEN, sessionCookie: SESSION_COOKIE, fetchImpl: async () => { called = true; return Response.json({}) } })
  assert.equal(called, false); assert.equal(response.status, 400); assert.match(response.body.ok ? "" : response.body.error.requestId, /.+/)
})

test("BFF distinguishes upstream timeout and fails closed at the exact 16MB boundary", async () => {
  const timeout = await forwardDataQuery(request, { environment: {}, backendOrigin: "https://ka-data.internal.example", serviceToken: SERVICE_TOKEN, sessionCookie: SESSION_COOKIE, fetchImpl: async () => { throw new DOMException("Timeout", "AbortError") } })
  assert.equal(timeout.status, 504); assert.equal(timeout.body.ok ? "" : timeout.body.error.code, "UPSTREAM_TIMEOUT")
  const declaredBoundary = await forwardDataQuery(request, { environment: {}, backendOrigin: "https://ka-data.internal.example", serviceToken: SERVICE_TOKEN, sessionCookie: SESSION_COOKIE, requestId: () => "bff-boundary", fetchImpl: async () => new Response("{}", { headers: { "content-length": String(MAX_UPSTREAM_BODY_BYTES), "x-request-id": "bff-boundary" } }) })
  assert.equal(declaredBoundary.status, 502); assert.match(declaredBoundary.body.ok ? "" : declaredBoundary.body.error.message, /16\s?MB/i)
  const streamedBoundary = await forwardDataQuery(request, { environment: {}, backendOrigin: "https://ka-data.internal.example", serviceToken: SERVICE_TOKEN, sessionCookie: SESSION_COOKIE, requestId: () => "bff-boundary", fetchImpl: async () => new Response(new Uint8Array(MAX_UPSTREAM_BODY_BYTES), { headers: { "x-request-id": "bff-boundary" } }) })
  assert.equal(streamedBoundary.status, 502); assert.match(streamedBoundary.body.ok ? "" : streamedBoundary.body.error.message, /16\s?MB/i)
})

test("production fails closed when the session cookie is missing", async () => {
  let called = false
  const incoming = new Request("http://localhost/api/internal/data-query", {
    method: "POST",
    headers: { "content-type": "application/json", "x-ka-workspace-id": "browser-forged" },
    body: JSON.stringify(request),
  })
  const response = await handleDataQueryRequest(incoming, {
    environment: { NODE_ENV: "production", KA_DATA_BACKEND_ORIGIN: "https://ka-data.internal.example", KA_DATA_SERVICE_TOKEN: SERVICE_TOKEN },
    fetchImpl: async () => { called = true; return Response.json({}) },
  })

  assert.equal(called, false)
  assert.equal(response.status, 401)
  assert.equal(response.body.ok ? "" : response.body.error.code, "UNAUTHORIZED")
})

test("session-cookie BFF ignores forged browser permission headers and follows a personal Session", async () => {
  let upstreamHeaders = new Headers()
  const incoming = new Request("http://localhost/api/internal/data-query", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      cookie: `ka_session=${SESSION_COOKIE}`,
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
      KA_DATA_SERVICE_TOKEN: SERVICE_TOKEN,
    },
    requestId: () => "bff-browser-forgery",
    fetchImpl: async (_input, init) => {
      upstreamHeaders = new Headers(init?.headers)
      assert.deepEqual(JSON.parse(String(init?.body)), request)
      return Response.json({
        ...backendUnknownLineageEnvelope,
        data: {
          ...backendUnknownLineageEnvelope.data,
          mode: "platform",
          source: {
            ...backendUnknownLineageEnvelope.data.source,
            lineage: {
              ...backendUnknownLineageEnvelope.data.source.lineage,
              source: "canonical",
              workspaceKind: "personal",
            },
          },
        },
      }, { headers: { "x-request-id": "bff-browser-forgery" } })
    },
  })

  assert.equal(response.status, 200)
  assert.equal(upstreamHeaders.get("authorization"), `Bearer ${SERVICE_TOKEN}`)
  assert.equal(upstreamHeaders.get("cookie"), `ka_session=${SESSION_COOKIE}`)
  assert.equal(upstreamHeaders.has("x-ka-workspace-id"), false)
  assert.equal(upstreamHeaders.has("x-ka-user-id"), false)
  assert.equal(upstreamHeaders.has("x-ka-account-scope"), false)
})

test("BFF rejects a malformed old session token before contacting the backend", async () => {
  let called = false
  const incoming = new Request("http://localhost/api/internal/data-query", { method: "POST", headers: { cookie: "ka_session=old-token" }, body: JSON.stringify(request) })
  const response = await handleDataQueryRequest(incoming, {
    environment: {
      NODE_ENV: "development",
      KA_DATA_BACKEND_ORIGIN: "https://ka-data.internal.example",
      KA_DATA_SERVICE_TOKEN: SERVICE_TOKEN,
    },
    fetchImpl: async () => { called = true; return Response.json({}) },
  })

  assert.equal(called, false)
  assert.equal(response.status, 401)
})

test("dev fake scope fails closed outside literal development", async () => {
  for (const nodeEnv of [undefined, "test", "staging"]) {
    let called = false
    const incoming = new Request("http://localhost/api/internal/data-query", { method: "POST", body: JSON.stringify(request) })
    const response = await handleDataQueryRequest(incoming, {
      environment: {
        NODE_ENV: nodeEnv,
        KA_DATA_BACKEND_ORIGIN: "https://ka-data.internal.example",
        KA_DATA_SERVICE_TOKEN: SERVICE_TOKEN,
        KA_DATA_DEV_AUTH_CONTEXT_ENABLED: "true",
        KA_DATA_DEV_WORKSPACE_ID: "00000000-0000-4000-8000-000000000024",
        KA_DATA_DEV_USER_ID: "dev-user",
        KA_DATA_DEV_ACCOUNT_SCOPE_JSON: JSON.stringify([{ media: "KUAISHOU", accountId: "dev-account-07" }]),
      },
      approvedAuthContextResolver: async () => null,
      fetchImpl: async () => { called = true; return Response.json({}) },
    })
    assert.equal(called, false, `upstream called for NODE_ENV=${String(nodeEnv)}`)
    assert.equal(response.status, 401)
  }
})

test("BFF rejects service tokens shorter than the backend 32-character minimum", async () => {
  let called = false
  const response = await forwardDataQuery(request, { environment: {}, backendOrigin: "https://ka-data.internal.example", serviceToken: "too-short", sessionCookie: SESSION_COOKIE, fetchImpl: async () => { called = true; return Response.json({}) } })
  assert.equal(called, false)
  assert.equal(response.status, 503)
  assert.match(response.body.ok ? "" : response.body.error.message, /configured safely/i)
})

test("BFF rejects an entire Platform batch when one row drifts from the strict shape", async () => {
  const invalidEnvelope = {
    ...canonicalTableEnvelope,
    data: {
      ...canonicalTableEnvelope.data,
      source: {
        ...canonicalTableEnvelope.data.source,
        rows: [canonicalTableRow, { ...canonicalTableRow, metrics: { ...canonicalTableRow.metrics, sourceSpecificCost: 99 } }],
        returnedRowCount: 2,
        wholeResultTotal: { value: 2, availability: "available" },
      },
    },
  }
  const response = await forwardDataQuery({ queryId: "account.table", params: { date: "2026-08-24" } }, {
    environment: {},
    backendOrigin: "https://ka-data.internal.example",
    serviceToken: SERVICE_TOKEN,
    sessionCookie: SESSION_COOKIE,
    requestId: () => "bff-contract-drift",
    fetchImpl: async () => Response.json(invalidEnvelope, { headers: { "x-request-id": "bff-contract-drift" } }),
  })

  assert.equal(response.status, 502)
  assert.equal(response.body.ok ? "" : response.body.error.code, "UPSTREAM_INVALID_RESPONSE")
  assert.equal(response.body.ok ? "" : response.body.error.requestId, "bff-contract-drift")
})

test("BFF rejects a valid UUID row from a different workspace", async () => {
  const crossedEnvelope = {
    ...canonicalTableEnvelope,
    data: {
      ...canonicalTableEnvelope.data,
      source: {
        ...canonicalTableEnvelope.data.source,
        rows: [{ ...canonicalTableRow, workspaceId: "00000000-0000-4000-8000-000000000099" }],
      },
    },
  }
  const response = await forwardDataQuery({ queryId: "account.table", params: { date: "2026-08-24" } }, {
    backendOrigin: "https://ka-data.internal.example",
    serviceToken: SERVICE_TOKEN,
    authContext,
    sessionCookie: SESSION_COOKIE,
    requestId: () => "bff-cross-workspace",
    fetchImpl: async () => Response.json(crossedEnvelope, { headers: { "x-request-id": "bff-cross-workspace" } }),
  })
  assert.equal(response.status, 502)
  assert.equal(response.body.ok ? "" : response.body.error.requestId, "bff-cross-workspace")
})

test("BFF rejects same-workspace rows outside the approved media-account tuple", async () => {
  for (const row of [
    { ...canonicalTableRow, media: "TENCENT" },
    { ...canonicalTableRow, accountId: "outside-account" },
  ]) {
    const escapedEnvelope = { ...canonicalTableEnvelope, data: { ...canonicalTableEnvelope.data, source: { ...canonicalTableEnvelope.data.source, rows: [row] } } }
    const response = await forwardDataQuery({ queryId: "account.table", params: { date: "2026-08-24" } }, { backendOrigin: "https://ka-data.internal.example", serviceToken: SERVICE_TOKEN, sessionCookie: SESSION_COOKIE, authContext, requestId: () => "bff-cross-tuple", fetchImpl: async () => Response.json(escapedEnvelope, { headers: { "x-request-id": "bff-cross-tuple" } }) })
    assert.equal(response.status, 502)
    assert.equal(response.body.ok ? "" : response.body.error.code, "UPSTREAM_INVALID_RESPONSE")
  }
})

test("BFF rejects a response queryId that does not match the request", async () => {
  const mismatched = { ...canonicalTableEnvelope, data: { ...canonicalTableEnvelope.data, source: { ...canonicalTableEnvelope.data.source, queryId: "account.detail", rowSchemaVersion: "account.detail/v2" } } }
  const response = await forwardDataQuery({ queryId: "account.table", params: { date: "2026-08-24" } }, { backendOrigin: "https://ka-data.internal.example", serviceToken: SERVICE_TOKEN, sessionCookie: SESSION_COOKIE, authContext, requestId: () => "bff-query-mismatch", fetchImpl: async () => Response.json(mismatched, { headers: { "x-request-id": "bff-query-mismatch" } }) })
  assert.equal(response.status, 502)
  assert.equal(response.body.ok ? "" : response.body.error.requestId, "bff-query-mismatch")
})

test("BFF rejects a rowSchemaVersion that drifts from the canonical query id", async () => {
  const mismatched = { ...canonicalTableEnvelope, data: { ...canonicalTableEnvelope.data, source: { ...canonicalTableEnvelope.data.source, rowSchemaVersion: "account.table/v1" } } }
  const response = await forwardDataQuery({ queryId: "account.table", params: { date: "2026-08-24" } }, { backendOrigin: "https://ka-data.internal.example", serviceToken: SERVICE_TOKEN, sessionCookie: SESSION_COOKIE, authContext, requestId: () => "bff-version-mismatch", fetchImpl: async () => Response.json(mismatched, { headers: { "x-request-id": "bff-version-mismatch" } }) })
  assert.equal(response.status, 502)
  assert.equal(response.body.ok ? "" : response.body.error.requestId, "bff-version-mismatch")
})
