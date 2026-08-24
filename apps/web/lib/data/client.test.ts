import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

import { createDataClient, INTERNAL_DATA_QUERY_PATH } from "./client.ts"

test("internal client uses only the fixed same-origin BFF path", async () => {
  let requested = ""
  const client = createDataClient({
    mode: "internal_api",
    fetchImpl: async (input) => {
      requested = String(input)
      return new Response(JSON.stringify({ state: "error", lineage: null, data: null }), { status: 500 })
    },
  })
  await assert.rejects(client.query({ queryId: "analysis", dataView: "platform", params: {} }))
  assert.equal(requested, INTERNAL_DATA_QUERY_PATH)
  assert.equal(requested.startsWith("http"), false)
})

test("client rejects arbitrary endpoint and shared bearer configuration", () => {
  assert.throws(() => createDataClient({ mode: "internal_api", endpoint: "https://evil.example/query" } as never))
  assert.throws(() => createDataClient({ mode: "internal_api", token: "shared-secret" } as never))
})

test("internal request contains no authorization header or mock state", async () => {
  let init: RequestInit | undefined
  const client = createDataClient({
    mode: "internal_api",
    fetchImpl: async (_input, requestInit) => {
      init = requestInit
      return new Response("{}", { status: 500 })
    },
  })
  await assert.rejects(client.query({ queryId: "analysis", dataView: "ka_data", state: "stale", params: { account_id: "demo" } }))
  assert.equal(new Headers(init?.headers).has("authorization"), false)
  assert.deepEqual(JSON.parse(String(init?.body)), { queryId: "analysis", dataView: "ka_data", params: { account_id: "demo" } })
})

test("web data client source does not reference shared token environment variables", () => {
  const source = readFileSync(new URL("./client.ts", import.meta.url), "utf8")
  const envExample = readFileSync(new URL("../../.env.example", import.meta.url), "utf8")
  assert.doesNotMatch(source, /KA_DATA_API_TOKEN|NEXT_PUBLIC_.*TOKEN/)
  assert.doesNotMatch(envExample, /^KA_DATA_API_(?:URL|TOKEN)=/m)
})
