import assert from "node:assert/strict"
import test from "node:test"
import { handleSemanticQueryRequest } from "./bff.ts"
import { canonicalSummaryEnvelope, canonicalTableEnvelope, canonicalTrendEnvelope } from "./canonical-query-fixtures.ts"
import { semanticQueryRequestSchema } from "./semantic-query-request.ts"
import { readFileSync } from "node:fs"
import { MAX_UPSTREAM_BODY_BYTES } from "./bounded-response.ts"
import { MAX_BFF_REQUEST_BYTES } from "./internal-api-bff.ts"

const id = "semantic-bff-test"
const cookie = "ka_session=synthetic-session-00000000000000001"
const environment = { KA_DATA_BACKEND_ORIGIN: "https://backend.example", KA_DATA_SERVICE_TOKEN: "synthetic-service-token-0000000000000000" }
function session(kind: "personal" | "team") {
  const workspace = { id: "00000000-0000-4000-8000-000000000024", name: "Synthetic", kind, role: "admin", readOnly: kind === "team" }
  return { ok: true, data: { identity: { displayName: "Synthetic" }, activeWorkspace: workspace, workspaces: [workspace] }, meta: { requestId: id } }
}
function json(body: unknown, status = 200) { return Response.json(body, { status, headers: { "x-request-id": id } }) }
function incoming(body: unknown, url = "http://localhost/api/internal/query", method = "POST") {
  return new Request(url, { method, headers: { cookie, "x-ka-workspace-id": "forged" }, ...(method === "GET" || method === "HEAD" ? {} : { body: JSON.stringify(body) }) })
}

test("BFF syntax matches the exact shared Worker regression vectors", () => {
  const vectors = JSON.parse(readFileSync(new URL("../../../../packages/domain/test/fixtures/semantic-query-syntax.json", import.meta.url), "utf8")) as { input: unknown; expected: unknown }[]
  for (const { input, expected } of vectors) {
    const actual = semanticQueryRequestSchema.safeParse(input)
    if (expected === null) assert.equal(actual.success, false)
    else { assert.equal(actual.success, true); if (actual.success) assert.deepEqual(actual.data, expected) }
  }
})
for (const kind of ["personal", "team"] as const) {
  for (const query_type of ["summary", "trend", "table"] as const) {
    test(`${kind} ${query_type} uses one trusted canonical route without dropping filters`, async () => {
      // Team task windows are still rejected by the Registry. Only table or
      // personal windows include that selector in this successful transport case.
      const taskId = kind === "personal" || query_type === "table" ? "task-1" : undefined
      const params = { date_from: "2026-08-23", date_to: "2026-08-24", ...(taskId ? { taskId } : {}), media: "KUAISHOU", accountIds: ["account-1"] }
      const body = { query_type, date_from: params.date_from, date_to: params.date_to, filters: { ...(taskId ? { task_id: taskId } : {}), media: params.media, account_id: "account-1" } }
      const value = structuredClone(query_type === "summary" ? canonicalSummaryEnvelope : query_type === "trend" ? canonicalTrendEnvelope : canonicalTableEnvelope) as unknown as { data: { mode: string; source: { lineage: { source: string; workspaceKind: string }; rows: Record<string, unknown>[] } } }
      value.data.mode = kind === "team" ? "ka_data" : "platform"
      value.data.source.lineage.source = kind === "team" ? "ka_data" : "canonical"
      value.data.source.lineage.workspaceKind = kind
      if (query_type === "summary") (value.data.source.rows[0].assessment as Record<string, unknown>).priceSource = kind === "team" ? "ka_daily" : "history"
      const calls: string[] = []
      const result = await handleSemanticQueryRequest(incoming(body), { environment, requestId: () => id, fetchImpl: async (url, init) => {
        calls.push(url)
        const headers = new Headers(init?.headers)
        assert.equal(headers.get("cookie"), cookie)
        assert.equal(headers.get("authorization"), `Bearer ${environment.KA_DATA_SERVICE_TOKEN}`)
        assert.equal(headers.get("x-request-id"), id)
        assert.equal(headers.get("x-ka-workspace-id"), null)
        assert.equal(init?.redirect, "error")
        assert.equal(init?.cache, "no-store")
        if (url.endsWith("/auth/session")) return json(session(kind))
        assert.deepEqual(JSON.parse(String(init?.body)), { queryId: `account.${query_type}`, params })
        return json(value)
      } })
      assert.equal(result.status, 200)
      assert.deepEqual(calls, ["https://backend.example/api/v1/auth/session", "https://backend.example/api/v1/query"])
    })
  }
}

test("semantic BFF rejects source/identity/SQL/mixed syntax before fetch", async () => {
  for (const body of [{ query_type: "summary", dataView: "ka_data" }, { query_type: "summary", workspaceKind: "team" },
    { query_type: "summary", filters: { sql: "SELECT 1" } }, { query_type: "summary", queryId: "account.summary" },
    { queryId: "reconcile.account_daily", params: {} }, { query_type: "unregistered" }]) {
    let calls = 0
    const result = await handleSemanticQueryRequest(incoming(body), { environment, requestId: () => id, fetchImpl: async () => { calls++; return json({}) } })
    assert.equal(result.status, 400); assert.equal(calls, 0)
  }
})

test("semantic BFF rejects query-string injection and all non-POST methods", async () => {
  for (const method of ["GET", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"]) {
    const result = await handleSemanticQueryRequest(incoming({}, undefined, method), { environment, requestId: () => id })
    assert.equal(result.status, 405); assert.equal(result.requestId, id)
  }
  assert.equal((await handleSemanticQueryRequest(incoming({}, "http://localhost/api/internal/query?dataView=ka_data"), { environment })).status, 400)
})

test("canonical requests remain unchanged and use the new fixed backend path", async () => {
  const body = { queryId: "account.summary", params: { date: "2026-08-24", compare: "dod" } }
  const result = await handleSemanticQueryRequest(incoming(body), { environment, requestId: () => id, fetchImpl: async (url, init) => {
    if (url.endsWith("/auth/session")) return json(session("personal"))
    assert.equal(url, "https://backend.example/api/v1/query")
    assert.deepEqual(JSON.parse(String(init?.body)), body)
    return json(canonicalSummaryEnvelope)
  } })
  assert.equal(result.status, 200)
})

for (const [code, status] of [["INVALID_REQUEST", 400], ["UNAUTHORIZED", 401], ["FORBIDDEN", 403], ["QUERY_NOT_ALLOWED", 404],
  ["VIEW_UNSUPPORTED", 422], ["DIMENSION_UNSUPPORTED", 422], ["SOURCE_TRUNCATED", 502], ["UPSTREAM_INVALID_RESPONSE", 502],
  ["SOURCE_UNAVAILABLE", 503], ["UPSTREAM_TIMEOUT", 503], ["INTERNAL_ERROR", 500]] as const) {
  test(`semantic BFF preserves canonical ${code} errors`, async () => {
    const error = { ok: false, error: { code, message: "Synthetic failure", requestId: id, retryable: false } }
    const result = await handleSemanticQueryRequest(incoming({ query_type: "table", date: "2026-08-24" }), {
      environment, requestId: () => id, fetchImpl: async (url) => url.endsWith("/auth/session") ? json(session("personal")) : json(error, status),
    })
    assert.equal(result.status, status); assert.deepEqual(result.body, error)
  })
}

test("unsupported team task window keeps selector and returns 422 instead of fallback", async () => {
  const paths: string[] = []
  const result = await handleSemanticQueryRequest(incoming({ query_type: "summary", date: "2026-08-24", filters: { task_id: "task-1" } }), {
    environment, requestId: () => id, fetchImpl: async (url, init) => {
      paths.push(url)
      if (url.endsWith("/auth/session")) return json(session("team"))
      assert.equal(JSON.parse(String(init?.body)).params.taskId, "task-1")
      return json({ ok: false, error: { code: "VIEW_UNSUPPORTED", message: "Task window unavailable", requestId: id, retryable: false } }, 422)
    },
  })
  assert.equal(result.status, 422); assert.equal(paths.length, 2)
})

test("bad data response identity/status/schema and exact byte boundary fail closed", async () => {
  const wrongQuery = structuredClone(canonicalTrendEnvelope)
  const badWorkspaceKind = structuredClone(canonicalSummaryEnvelope) as unknown as { data: { source: { lineage: { workspaceKind: string } } } }
  badWorkspaceKind.data.source.lineage.workspaceKind = "team"
  for (const response of [
    () => json(wrongQuery), () => json(badWorkspaceKind), () => json(canonicalSummaryEnvelope, 500), () => json({ ok: true }),
    () => new Response("{}", { headers: { "x-request-id": "wrong" } }),
    () => json({ ok: false, error: { code: "FORBIDDEN", message: "Denied", retryable: false, requestId: "wrong" } }, 403),
    () => new Response("{}", { headers: { "x-request-id": id, "content-length": String(MAX_UPSTREAM_BODY_BYTES) } }),
    () => new Response(new Uint8Array(MAX_UPSTREAM_BODY_BYTES), { headers: { "x-request-id": id } }),
  ]) {
    const result = await handleSemanticQueryRequest(incoming({ query_type: "summary" }), { environment, requestId: () => id,
      fetchImpl: async (url) => url.endsWith("/auth/session") ? json(session("personal")) : response() })
    assert.equal(result.status, 502)
  }
})

test("missing cookie/config and revoked session cannot reach business data", async () => {
  let calls = 0
  const fetchImpl = async () => { calls++; return json({ ok: false, error: { code: "UNAUTHORIZED", message: "Invalid session", retryable: false, requestId: id } }, 401) }
  const body = { query_type: "summary" }
  assert.equal((await handleSemanticQueryRequest(new Request("http://localhost/api/internal/query", { method: "POST", body: JSON.stringify(body) }), { environment, fetchImpl })).status, 401)
  assert.equal((await handleSemanticQueryRequest(incoming(body), { environment: {}, fetchImpl })).status, 503)
  assert.equal(calls, 0)
  assert.equal((await handleSemanticQueryRequest(incoming(body), { environment, fetchImpl, requestId: () => id })).status, 401)
  assert.equal(calls, 1)
})

test("network and timeout failures do not leak their cause", async () => {
  for (const [failure, status] of [[new Error("private-network-detail"), 503], [new DOMException("slow", "TimeoutError"), 504]] as const) {
    const result = await handleSemanticQueryRequest(incoming({ query_type: "summary" }), { environment, requestId: () => id,
      fetchImpl: async (url) => { if (url.endsWith("/auth/session")) return json(session("personal")); throw failure } })
    assert.equal(result.status, status); assert.doesNotMatch(JSON.stringify(result.body), /private-network-detail/)
  }
})

test("oversized request streams are cancelled at the budget instead of fully buffered", async () => {
  let cancelled = false, pulls = 0, calls = 0
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) { pulls++; controller.enqueue(new Uint8Array(MAX_BFF_REQUEST_BYTES / 2)); if (pulls === 6) controller.close() },
    cancel() { cancelled = true },
  }, { highWaterMark: 0 })
  const request = new Request("http://localhost/api/internal/query", { method: "POST", headers: { cookie }, body: stream, duplex: "half" } as RequestInit)
  const result = await handleSemanticQueryRequest(request, { environment, requestId: () => id, fetchImpl: async () => { calls++; return json({}) } })
  assert.equal(result.status, 400); assert.equal(calls, 0)
  assert.equal(cancelled, true); assert.equal(pulls, 3)
})

test("exact request budget remains accepted and broken stream is a controlled error", async () => {
  const payload = JSON.stringify({ query_type: "summary" })
  const request = new Request("http://localhost/api/internal/query", { method: "POST", headers: { cookie }, body: payload + " ".repeat(MAX_BFF_REQUEST_BYTES - payload.length) })
  assert.equal((await handleSemanticQueryRequest(request, { environment: {} })).status, 503)
  const failed = new ReadableStream({ start(controller) { controller.error(new Error("private-body-failure")) } })
  const result = await handleSemanticQueryRequest(new Request("http://localhost/api/internal/query", {
    method: "POST", headers: { cookie }, body: failed, duplex: "half",
  } as RequestInit), { environment })
  assert.equal(result.status, 400); assert.doesNotMatch(JSON.stringify(result.body), /private-body-failure/)
})
