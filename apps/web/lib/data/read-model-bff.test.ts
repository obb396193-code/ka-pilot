import assert from "node:assert/strict"
import test from "node:test"

import { MAX_UPSTREAM_BODY_BYTES } from "./bounded-response.ts"
import { handleReadModelRequest } from "./read-model-bff.ts"

const authContext = { workspaceId: "00000000-0000-4000-8000-000000000024", userId: "buc-user-demo", allowedAccounts: [{ media: "KUAISHOU", accountId: "account-demo-07" }] }
const SERVICE_TOKEN = "server-secret-000000000000000000000000"
const enabledEnvironment = { NODE_ENV: "production", KA_READ_MODEL_DETAILS_ENABLED: "true", KA_DATA_BACKEND_ORIGIN: "https://ka-data.internal.example", KA_DATA_SERVICE_TOKEN: SERVICE_TOKEN }
const WORK_ITEM_ID = "00000000-0000-4000-8000-000000000701"
const OTHER_WORK_ITEM_ID = "00000000-0000-4000-8000-000000000799"
const CHANGESET_ID = "00000000-0000-4000-8000-000000000702"
const OTHER_CHANGESET_ID = "00000000-0000-4000-8000-000000000798"
const SESSION_COOKIE = "read-session-token-000000000000000000001"
const readRequest = () => new Request("http://localhost", { headers: { cookie: `ka_session=${SESSION_COOKIE}` } })
const readJson = (payload: unknown, requestId: string, status = 200) => Response.json(payload, { status, headers: { "x-request-id": requestId } })
const workItemResponse = (id = WORK_ITEM_ID, media = "KUAISHOU", accountId = "account-demo-07", workspaceId = authContext.workspaceId) => ({ ok: true, data: { kind: "work_item", workItem: { id, workspaceId, media, accountId, type: "diagnosis", taskId: null, ruleId: null, severity: "P1", title: "诊断", evidenceSnapshot: {}, diagnosis: {}, status: "open", ignoreReason: null, mutedUntil: null, assignee: null, creator: null, acceptanceCriteria: null, slaDue: null, rejectReason: null, t1Result: null, createdAt: "2026-08-24T01:00:00.000Z", resolvedAt: null } } })
const changeSetResponse = (id = CHANGESET_ID, media = "KUAISHOU", accountId = "account-demo-07", workspaceId = authContext.workspaceId) => ({ ok: true, data: { kind: "changeset", changeset: { id, workspaceId, media, accountId, workItemId: WORK_ITEM_ID, title: "预览", status: "draft", initiatorUserId: "00000000-0000-4000-8000-000000000024", executorIdentity: null, multicaIssueId: null, ttlExpireAt: "2026-08-24T02:00:00.000Z", reasonCode: null, simulation: null, createdAt: "2026-08-24T01:00:00.000Z", executedAt: null, items: [] } } })

test("changeset BFF carries typed values unchanged and fails closed on legacy text", async () => {
  for (const fromValue of [{ type: "number", value: 0 }, "legacy-text"]) {
    const base = changeSetResponse()
    const payload = { ...base, data: { ...base.data, changeset: { ...base.data.changeset, items: [{ id: 1, targetType: "unit", targetId: "synthetic", field: "bid", fromValue, toValue: { type: "boolean", value: false }, itemStatus: "pending", failReason: null }] } } }
    const result = await handleReadModelRequest("changesets", CHANGESET_ID, readRequest(), { environment: enabledEnvironment, approvedAuthContextResolver: async () => authContext, requestId: () => "typed-bff", fetchImpl: async () => readJson(payload, "typed-bff") })
    assert.equal(result.status, typeof fromValue === "string" ? 502 : 200)
    if (typeof fromValue !== "string") assert.deepEqual(result.body, payload)
  }
})

test("read-model BFF is explicitly unavailable until the backend detail contract is enabled", async () => {
  let called = false
  const result = await handleReadModelRequest("work-items", WORK_ITEM_ID, readRequest(), { environment: { NODE_ENV: "production" }, approvedAuthContextResolver: async () => authContext, fetchImpl: async () => { called = true; return Response.json({}) } })
  assert.equal(called, false)
  assert.equal(result.status, 503)
  assert.equal(result.body.ok ? "" : result.body.error.code, "SOURCE_UNAVAILABLE")
})

test("enabled read-model BFF uses only the fixed GET endpoint and server-side scope", async () => {
  let url = ""; let init: RequestInit | undefined
  const result = await handleReadModelRequest("work-items", WORK_ITEM_ID, readRequest(), {
    environment: enabledEnvironment,
    approvedAuthContextResolver: async () => authContext,
    requestId: () => "upstream-read-1",
    fetchImpl: async (input, requestInit) => { url = String(input); init = requestInit; return readJson({ ok: false, error: { code: "SOURCE_UNAVAILABLE", message: "Not implemented", retryable: true, requestId: "upstream-read-1" } }, "upstream-read-1", 503) },
  })
  assert.equal(url, `https://ka-data.internal.example/api/v1/work-items/${WORK_ITEM_ID}`)
  assert.equal(init?.method, "GET")
  assert.equal(new Headers(init?.headers).get("cookie"), `ka_session=${SESSION_COOKIE}`)
  assert.equal(new Headers(init?.headers).has("x-ka-workspace-id"), false)
  assert.equal(result.status, 503)
  assert.equal(result.body.ok ? "" : result.body.error.requestId, "upstream-read-1")
})

test("changeset read-model uses the fixed GET path and never exposes a write method", async () => {
  let url = ""; let method = ""
  const result = await handleReadModelRequest("changesets", CHANGESET_ID, readRequest(), {
    environment: enabledEnvironment,
    approvedAuthContextResolver: async () => authContext,
    requestId: () => "changeset-read",
    fetchImpl: async (input, init) => {
      url = String(input); method = init?.method ?? ""
      return readJson({ ok: false, error: { code: "SOURCE_UNAVAILABLE", message: "Not implemented", retryable: true, requestId: "changeset-read" } }, "changeset-read", 503)
    },
  })
  assert.equal(url, `https://ka-data.internal.example/api/v1/changesets/${CHANGESET_ID}`)
  assert.equal(method, "GET")
  assert.equal(result.status, 503)
})

test("read-model rejects an invalid id before contacting upstream", async () => {
  let called = false
  const result = await handleReadModelRequest("work-items", "../forged", readRequest(), { environment: enabledEnvironment, approvedAuthContextResolver: async () => authContext, fetchImpl: async () => { called = true; return Response.json({}) } })
  assert.equal(called, false)
  assert.equal(result.status, 400)
  assert.equal(result.body.ok ? "" : result.body.error.code, "INVALID_REQUEST")
})

test("read-model fails closed for null auth and a short service token", async () => {
  let called = false
  const missingAuth = await handleReadModelRequest("work-items", WORK_ITEM_ID, new Request("http://localhost"), { environment: enabledEnvironment, approvedAuthContextResolver: async () => null, fetchImpl: async () => { called = true; return Response.json({}) } })
  assert.equal(missingAuth.status, 401)
  const shortToken = await handleReadModelRequest("work-items", WORK_ITEM_ID, readRequest(), { environment: { ...enabledEnvironment, KA_DATA_SERVICE_TOKEN: "short" }, approvedAuthContextResolver: async () => authContext, fetchImpl: async () => { called = true; return Response.json({}) } })
  assert.equal(shortToken.status, 503)
  assert.equal(called, false)
})

test("read-model fails closed at the exact 16MB declared and streamed boundary", async () => {
  const declared = await handleReadModelRequest("work-items", WORK_ITEM_ID, readRequest(), { environment: enabledEnvironment, approvedAuthContextResolver: async () => authContext, requestId: () => "read-boundary", fetchImpl: async () => new Response("{}", { headers: { "content-length": String(MAX_UPSTREAM_BODY_BYTES), "x-request-id": "read-boundary" } }) })
  assert.equal(declared.status, 502)
  assert.match(declared.body.ok ? "" : declared.body.error.message, /16\s?MB/i)
  const streamed = await handleReadModelRequest("work-items", WORK_ITEM_ID, readRequest(), { environment: enabledEnvironment, approvedAuthContextResolver: async () => authContext, requestId: () => "read-boundary", fetchImpl: async () => new Response(new Uint8Array(MAX_UPSTREAM_BODY_BYTES), { headers: { "x-request-id": "read-boundary" } }) })
  assert.equal(streamed.status, 502)
  assert.match(streamed.body.ok ? "" : streamed.body.error.message, /16\s?MB/i)
})

test("work-item response identity must match the path id", async () => {
  const result = await handleReadModelRequest("work-items", WORK_ITEM_ID, readRequest(), { environment: enabledEnvironment, approvedAuthContextResolver: async () => authContext, requestId: () => "work-item-id-mismatch", fetchImpl: async () => readJson(workItemResponse(OTHER_WORK_ITEM_ID), "work-item-id-mismatch") })
  assert.equal(result.status, 502)
  assert.equal(result.body.ok ? "" : result.body.error.requestId, "work-item-id-mismatch")
})

test("work-item response account and media must belong to approved scope", async () => {
  const result = await handleReadModelRequest("work-items", WORK_ITEM_ID, readRequest(), { environment: enabledEnvironment, approvedAuthContextResolver: async () => authContext, requestId: () => "work-item-team-row", fetchImpl: async () => readJson(workItemResponse(WORK_ITEM_ID, "TENCENT", "account-demo-07"), "work-item-team-row") })
  assert.equal(result.status, 403)
  assert.equal(result.body.ok ? "" : result.body.error.code, "FORBIDDEN")
})

test("work-item response workspace must match the approved auth context", async () => {
  const result = await handleReadModelRequest("work-items", WORK_ITEM_ID, readRequest(), { environment: enabledEnvironment, approvedAuthContextResolver: async () => authContext, requestId: () => "work-item-other-workspace", fetchImpl: async () => readJson(workItemResponse(WORK_ITEM_ID, "KUAISHOU", "account-demo-07", "00000000-0000-4000-8000-000000000099"), "work-item-other-workspace") })
  assert.equal(result.status, 502)
  assert.match(result.body.ok ? "" : result.body.error.message, /identity/i)
})

test("work-item success passes only when identity and approved scope both match", async () => {
  const result = await handleReadModelRequest("work-items", WORK_ITEM_ID, readRequest(), { environment: enabledEnvironment, approvedAuthContextResolver: async () => authContext, requestId: () => "work-item-success", fetchImpl: async () => readJson(workItemResponse(), "work-item-success") })
  assert.equal(result.status, 200)
  assert.equal(result.body.ok, true)
})

test("changeset success passes only when identity and approved scope match", async () => {
  const result = await handleReadModelRequest("changesets", CHANGESET_ID, readRequest(), {
    environment: enabledEnvironment,
    approvedAuthContextResolver: async () => authContext,
    requestId: () => "changeset-success",
    fetchImpl: async () => readJson(changeSetResponse(), "changeset-success"),
  })
  assert.equal(result.status, 200)
  assert.equal(result.body.ok, true)
})

test("changeset response identity must match the path id before scope proof", async () => {
  const result = await handleReadModelRequest("changesets", CHANGESET_ID, readRequest(), {
    environment: enabledEnvironment,
    approvedAuthContextResolver: async () => authContext,
    requestId: () => "changeset-id-mismatch",
    fetchImpl: async () => readJson(changeSetResponse(OTHER_CHANGESET_ID), "changeset-id-mismatch"),
  })
  assert.equal(result.status, 502)
  assert.match(result.body.ok ? "" : result.body.error.message, /identity/i)
})

test("changeset response media-account tuple must belong to approved scope", async () => {
  const result = await handleReadModelRequest("changesets", CHANGESET_ID, readRequest(), {
    environment: enabledEnvironment,
    approvedAuthContextResolver: async () => authContext,
    requestId: () => "changeset-team-row",
    fetchImpl: async () => readJson(changeSetResponse(CHANGESET_ID, "TENCENT"), "changeset-team-row"),
  })
  assert.equal(result.status, 403)
  assert.equal(result.body.ok ? "" : result.body.error.code, "FORBIDDEN")
})
