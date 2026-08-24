import assert from "node:assert/strict"
import test from "node:test"

import { MAX_UPSTREAM_BODY_BYTES } from "./bounded-response.ts"
import { handleReadModelRequest } from "./read-model-bff.ts"

const authContext = { workspaceId: "00000000-0000-4000-8000-000000000024", userId: "buc-user-demo", allowedAccounts: [{ media: "KUAISHOU", accountId: "account-demo-07" }] }
const SERVICE_TOKEN = "server-secret-000000000000000000000000"
const enabledEnvironment = { NODE_ENV: "production", KA_READ_MODEL_DETAILS_ENABLED: "true", KA_DATA_BACKEND_ORIGIN: "https://ka-data.internal.example", KA_DATA_SERVICE_TOKEN: SERVICE_TOKEN }
const workItemResponse = (findingId = "work-item-demo", media: string | null = "KUAISHOU", accountId = "account-demo-07") => ({ ok: true, data: { findingId, media, accountId, accountName: "脱敏账户", title: "诊断", severity: "warning", deterministicConclusion: "只读结论", evidence: [], aiInterpretation: null, aiConfidence: null, changeSetId: null } })

test("read-model BFF is explicitly unavailable until the backend detail contract is enabled", async () => {
  let called = false
  const result = await handleReadModelRequest("work-items", "work-item-demo", { environment: { NODE_ENV: "production" }, approvedAuthContextResolver: async () => authContext, fetchImpl: async () => { called = true; return Response.json({}) } })
  assert.equal(called, false)
  assert.equal(result.status, 503)
  assert.equal(result.body.ok ? "" : result.body.error.code, "SOURCE_UNAVAILABLE")
})

test("enabled read-model BFF uses only the fixed GET endpoint and server-side scope", async () => {
  let url = ""; let init: RequestInit | undefined
  const result = await handleReadModelRequest("work-items", "work-item-demo", {
    environment: enabledEnvironment,
    approvedAuthContextResolver: async () => authContext,
    fetchImpl: async (input, requestInit) => { url = String(input); init = requestInit; return Response.json({ ok: false, error: { code: "SOURCE_UNAVAILABLE", message: "Not implemented", retryable: true, requestId: "upstream-read-1" } }, { status: 503 }) },
  })
  assert.equal(url, "https://ka-data.internal.example/api/v1/work-items/work-item-demo")
  assert.equal(init?.method, "GET")
  assert.equal(new Headers(init?.headers).get("x-ka-workspace-id"), authContext.workspaceId)
  assert.equal(result.status, 503)
  assert.equal(result.body.ok ? "" : result.body.error.requestId, "upstream-read-1")
})

test("changeset read-model uses the fixed GET path and never exposes a write method", async () => {
  let url = ""; let method = ""
  const result = await handleReadModelRequest("changesets", "changeset-demo", {
    environment: enabledEnvironment,
    approvedAuthContextResolver: async () => authContext,
    fetchImpl: async (input, init) => {
      url = String(input); method = init?.method ?? ""
      return Response.json({ ok: false, error: { code: "SOURCE_UNAVAILABLE", message: "Not implemented", retryable: true, requestId: "changeset-read" } }, { status: 503 })
    },
  })
  assert.equal(url, "https://ka-data.internal.example/api/v1/changesets/changeset-demo")
  assert.equal(method, "GET")
  assert.equal(result.status, 503)
})

test("read-model rejects an invalid id before contacting upstream", async () => {
  let called = false
  const result = await handleReadModelRequest("work-items", "../forged", { environment: enabledEnvironment, approvedAuthContextResolver: async () => authContext, fetchImpl: async () => { called = true; return Response.json({}) } })
  assert.equal(called, false)
  assert.equal(result.status, 400)
  assert.equal(result.body.ok ? "" : result.body.error.code, "INVALID_REQUEST")
})

test("read-model fails closed for null auth and a short service token", async () => {
  let called = false
  const missingAuth = await handleReadModelRequest("work-items", "work-item-demo", { environment: enabledEnvironment, approvedAuthContextResolver: async () => null, fetchImpl: async () => { called = true; return Response.json({}) } })
  assert.equal(missingAuth.status, 403)
  const shortToken = await handleReadModelRequest("work-items", "work-item-demo", { environment: { ...enabledEnvironment, KA_DATA_SERVICE_TOKEN: "short" }, approvedAuthContextResolver: async () => authContext, fetchImpl: async () => { called = true; return Response.json({}) } })
  assert.equal(shortToken.status, 503)
  assert.equal(called, false)
})

test("read-model fails closed at the exact 16MB declared and streamed boundary", async () => {
  const declared = await handleReadModelRequest("work-items", "work-item-demo", { environment: enabledEnvironment, approvedAuthContextResolver: async () => authContext, fetchImpl: async () => new Response("{}", { headers: { "content-length": String(MAX_UPSTREAM_BODY_BYTES) } }) })
  assert.equal(declared.status, 502)
  assert.match(declared.body.ok ? "" : declared.body.error.message, /16\s?MB/i)
  const streamed = await handleReadModelRequest("work-items", "work-item-demo", { environment: enabledEnvironment, approvedAuthContextResolver: async () => authContext, fetchImpl: async () => new Response(new Uint8Array(MAX_UPSTREAM_BODY_BYTES)) })
  assert.equal(streamed.status, 502)
  assert.match(streamed.body.ok ? "" : streamed.body.error.message, /16\s?MB/i)
})

test("work-item response identity must match the path id", async () => {
  const result = await handleReadModelRequest("work-items", "work-item-demo", { environment: enabledEnvironment, approvedAuthContextResolver: async () => authContext, requestId: () => "work-item-id-mismatch", fetchImpl: async () => Response.json(workItemResponse("other-work-item")) })
  assert.equal(result.status, 502)
  assert.equal(result.body.ok ? "" : result.body.error.requestId, "work-item-id-mismatch")
})

test("work-item response account and media must belong to approved scope", async () => {
  const result = await handleReadModelRequest("work-items", "work-item-demo", { environment: enabledEnvironment, approvedAuthContextResolver: async () => authContext, fetchImpl: async () => Response.json(workItemResponse("work-item-demo", "TENCENT", "account-demo-07")) })
  assert.equal(result.status, 403)
  assert.equal(result.body.ok ? "" : result.body.error.code, "FORBIDDEN")
})

test("work-item success passes only when identity and approved scope both match", async () => {
  const result = await handleReadModelRequest("work-items", "work-item-demo", { environment: enabledEnvironment, approvedAuthContextResolver: async () => authContext, fetchImpl: async () => Response.json(workItemResponse()) })
  assert.equal(result.status, 200)
  assert.equal(result.body.ok, true)
})

test("changeset success remains fail-closed because the candidate contract lacks media identity", async () => {
  const result = await handleReadModelRequest("changesets", "changeset-demo", {
    environment: enabledEnvironment,
    approvedAuthContextResolver: async () => authContext,
    fetchImpl: async () => Response.json({ ok: true, data: { changeSetId: "changeset-demo", accountId: "account-demo-07", accountName: "脱敏账户", status: "preview_only", expiresAt: "2026-08-24T10:00:00+08:00", items: [], riskChecks: [], executionEndpointConfigured: false } }),
  })
  assert.equal(result.status, 502)
  assert.match(result.body.ok ? "" : result.body.error.message, /media identity/i)
})

test("changeset response identity must match the path id before scope proof", async () => {
  const result = await handleReadModelRequest("changesets", "changeset-demo", {
    environment: enabledEnvironment,
    approvedAuthContextResolver: async () => authContext,
    fetchImpl: async () => Response.json({ ok: true, data: { changeSetId: "other-changeset", accountId: "account-demo-07", accountName: "脱敏账户", status: "preview_only", expiresAt: "2026-08-24T10:00:00+08:00", items: [], riskChecks: [], executionEndpointConfigured: false } }),
  })
  assert.equal(result.status, 502)
  assert.match(result.body.ok ? "" : result.body.error.message, /identity/i)
})
