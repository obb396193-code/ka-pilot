import assert from "node:assert/strict"
import test from "node:test"

import { handleReadModelRequest } from "./read-model-bff.ts"

const authContext = { workspaceId: "00000000-0000-4000-8000-000000000024", userId: "buc-user-demo", allowedAccounts: [{ media: "KUAISHOU", accountId: "account-demo-07" }] }
const SERVICE_TOKEN = "server-secret-000000000000000000000000"

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
    environment: { NODE_ENV: "production", KA_READ_MODEL_DETAILS_ENABLED: "true", KA_DATA_BACKEND_ORIGIN: "https://ka-data.internal.example", KA_DATA_SERVICE_TOKEN: SERVICE_TOKEN },
    approvedAuthContextResolver: async () => authContext,
    fetchImpl: async (input, requestInit) => { url = String(input); init = requestInit; return Response.json({ ok: false, error: { code: "SOURCE_UNAVAILABLE", message: "Not implemented", retryable: true, requestId: "upstream-read-1" } }, { status: 503 }) },
  })
  assert.equal(url, "https://ka-data.internal.example/api/v1/work-items/work-item-demo")
  assert.equal(init?.method, "GET")
  assert.equal(new Headers(init?.headers).get("x-ka-workspace-id"), authContext.workspaceId)
  assert.equal(result.status, 503)
  assert.equal(result.body.ok ? "" : result.body.error.requestId, "upstream-read-1")
})
