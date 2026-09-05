import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

import { createDataClient, INTERNAL_DATA_QUERY_PATH } from "./client.ts"
import { readInternalModel } from "./read-model-client.ts"

const backendError = {
  ok: false as const,
  error: { code: "FORBIDDEN" as const, message: "Requested account is not authorized", requestId: "req-forbidden-001", retryable: false },
}

test("internal client posts only canonical requests to the fixed same-origin BFF", async () => {
  let requested = ""
  let init: RequestInit | undefined
  const client = createDataClient({ mode: "internal_api", fetchImpl: async (input, requestInit) => {
    requested = String(input); init = requestInit
    return Response.json(backendError, { status: 403 })
  } })
  const response = await client.query({ queryId: "account.table", dataView: "platform", params: { date: "2026-08-24", page: 1, pageSize: 50 }, mockState: "truncated" })
  assert.equal(requested, INTERNAL_DATA_QUERY_PATH)
  assert.equal(requested.startsWith("http"), false)
  assert.equal(new Headers(init?.headers).has("authorization"), false)
  assert.deepEqual(JSON.parse(String(init?.body)), { queryId: "account.table", params: { date: "2026-08-24", page: 1, pageSize: 50 } })
  assert.deepEqual(response, backendError)
})

test("client rejects arbitrary endpoint and shared bearer configuration", () => {
  assert.throws(() => createDataClient({ mode: "internal_api", endpoint: "https://evil.example/query" } as never))
  assert.throws(() => createDataClient({ mode: "internal_api", token: "shared-secret" } as never))
})

test("mock mode requires an explicit local-only enable switch", () => {
  assert.throws(() => createDataClient({ mode: "mock" }), /explicitly enabled/i)
  assert.doesNotThrow(() => createDataClient({ mode: "mock", allowMock: true }))
})

test("browser client source cannot reference service credentials", () => {
  const source = readFileSync(new URL("./client.ts", import.meta.url), "utf8")
  assert.doesNotMatch(source, /SERVICE_TOKEN|authorization\s*:/i)
  assert.doesNotMatch(source, /NEXT_PUBLIC_.*TOKEN/i)
})

test("read-model browser client uses a fixed same-origin GET without permission headers", async () => {
  const workItemId = "00000000-0000-4000-8000-000000000701"
  let requested = ""; let init: RequestInit | undefined
  const response = await readInternalModel("work-items", workItemId, async (input, requestInit) => {
    requested = String(input); init = requestInit
    return Response.json({ ok: false, error: { code: "SOURCE_UNAVAILABLE", message: "Not integrated", retryable: true, requestId: "read-client-1" } }, { status: 503 })
  })
  const headers = new Headers(init?.headers)
  assert.equal(requested, `/api/internal/work-items/${workItemId}`)
  assert.equal(init?.method, "GET")
  assert.equal(headers.has("authorization"), false)
  assert.equal(headers.has("x-ka-workspace-id"), false)
  assert.equal(response.ok ? "" : response.error.requestId, "read-client-1")
})
