import assert from "node:assert/strict"
import test from "node:test"
import { handleDataQueryRequest } from "./bff.ts"
import { canonicalSummaryEnvelope, canonicalTableEnvelope } from "./canonical-query-fixtures.ts"
import { MAX_UPSTREAM_BODY_BYTES } from "./bounded-response.ts"

const id = "bff-session-route"
const workspaceId = "00000000-0000-4000-8000-000000000024"
const cookie = "ka_session=synthetic-session-00000000000000001"
const environment = { KA_DATA_BACKEND_ORIGIN: "https://backend.example", KA_DATA_SERVICE_TOKEN: "synthetic-service-token-0000000000000000" }
const ordinary = { queryId: "account.summary", params: {} }
function incoming(body: unknown = ordinary) {
  return new Request("http://localhost/api/internal/data-query", { method: "POST", headers: { cookie, "x-ka-workspace-kind": "team", "x-ka-workspace-id": "forged", "x-ka-role": "admin" }, body: JSON.stringify(body) })
}
function session(kind: "personal" | "team") {
  const workspace = { id: workspaceId, name: "Synthetic workspace", kind, role: "admin", readOnly: kind === "team" , isDemo: false}
  return { ok: true, data: { identity: { id: "00000000-0000-4000-8000-0000000000e1", provider: "internal_test", displayName: "Synthetic", mustChangePassword: false }, activeWorkspace: workspace, workspaces: [workspace] }, meta: { requestId: id } }
}
function json(body: unknown, status = 200) { return Response.json(body, { status, headers: { "x-request-id": id } }) }
function success(kind: "personal" | "team", table = false) {
  const value = structuredClone(table ? canonicalTableEnvelope : canonicalSummaryEnvelope) as unknown as { ok: true; data: { mode: string; source: { lineage: { source: string; workspaceKind: string }; rows: Record<string, unknown>[] } } }
  value.data.mode = kind === "team" ? "ka_data" : "platform"
  value.data.source.lineage.workspaceKind = kind
  value.data.source.lineage.source = kind === "team" ? "ka_data" : "canonical"
  if (!table) for (const row of value.data.source.rows) (row.assessment as Record<string, unknown>).priceSource = kind === "team" ? "ka_daily" : "history"
  return value
}

for (const kind of ["personal", "team"] as const) {
  test(`BFF uses trusted ${kind} session, never browser scope or dataView`, async () => {
    const calls: string[] = []
    const result = await handleDataQueryRequest(incoming(), { environment, requestId: () => id, fetchImpl: async (url, init) => {
      calls.push(url)
      const headers = new Headers(init?.headers)
      assert.equal(headers.get("authorization"), `Bearer ${environment.KA_DATA_SERVICE_TOKEN}`)
      assert.equal(headers.get("cookie"), cookie)
      assert.equal(headers.get("x-request-id"), id)
      assert.equal([...headers.keys()].some((key) => key.startsWith("x-ka-")), false)
      assert.equal(init?.cache, "no-store")
      if (url.endsWith("/auth/session")) { assert.equal(init?.method, "GET"); return json(session(kind)) }
      assert.equal(init?.method, "POST")
      assert.deepEqual(JSON.parse(String(init?.body)), ordinary)
      return json(success(kind))
    } })
    assert.equal(result.status, 200)
    assert.deepEqual(calls, ["https://backend.example/api/v1/auth/session", "https://backend.example/api/v1/data/query"])
  })
}

test("ordinary BFF rejects browser source, entitlement, identity and diagnostic query before any fetch", async () => {
  for (const body of [{ ...ordinary, dataView: "platform" }, { ...ordinary, data_view: "ka_data" }, { ...ordinary, workspaceKind: "team" }, { ...ordinary, entitlement: true }, { queryId: "reconcile.account_daily", params: {} }]) {
    let calls = 0
    const result = await handleDataQueryRequest(incoming(body), { environment, fetchImpl: async () => { calls++; return json({}) } })
    assert.equal(result.status, 400)
    assert.equal(calls, 0)
  }
})

for (const [code, status] of [["UNAUTHORIZED", 401], ["FORBIDDEN", 403], ["SOURCE_UNAVAILABLE", 503], ["UPSTREAM_TIMEOUT", 504]] as const) {
  test(`current Session ${code} stops before querying business data`, async () => {
    let calls = 0
    const result = await handleDataQueryRequest(incoming(), { environment, requestId: () => id, fetchImpl: async (url) => {
      calls++; assert.ok(url.endsWith("/auth/session"))
      return json({ ok: false, error: { code, message: "Session unavailable", retryable: false, requestId: id } }, status)
    } })
    assert.equal(result.status, status)
    assert.equal(calls, 1)
  })
}

test("session overflow, invalid shape and requestId mismatch fail closed before data", async () => {
  for (const response of [() => json({ ok: true }), () => json({ ...session("personal"), meta: { requestId: "wrong" } }), () => new Response("{}", { headers: { "x-request-id": id, "content-length": String(MAX_UPSTREAM_BODY_BYTES) } })]) {
    let calls = 0
    const result = await handleDataQueryRequest(incoming(), { environment, requestId: () => id, fetchImpl: async () => { calls++; return response() } })
    assert.equal(result.status, 502); assert.equal(calls, 1)
  }
})

test("mode, lineage kind/source and workspace cannot contradict current Session", async () => {
  for (const mutate of [
    (value: ReturnType<typeof success>) => { value.data.mode = "ka_data" },
    (value: ReturnType<typeof success>) => { value.data.source.lineage.workspaceKind = "team" },
    (value: ReturnType<typeof success>) => { value.data.source.lineage.source = "ka_data" },
    (value: ReturnType<typeof success>) => { value.data.source.rows[0].workspaceId = "00000000-0000-4000-8000-000000000099" },
  ]) {
    const value = success("personal", true); mutate(value)
    const result = await handleDataQueryRequest(incoming({ queryId: "account.table", params: {} }), { environment, requestId: () => id, fetchImpl: async (url) => json(url.endsWith("/auth/session") ? session("personal") : value) })
    assert.equal(result.status, 502)
  }
})

test("KA-disabled team errors do not trigger a platform fallback", async () => {
  const calls: string[] = []
  const result = await handleDataQueryRequest(incoming(), { environment, requestId: () => id, fetchImpl: async (url) => {
    calls.push(url)
    return url.endsWith("/auth/session") ? json(session("team")) : json({ ok: false, error: { code: "SOURCE_UNAVAILABLE", message: "Disabled", requestId: id, retryable: false } }, 503)
  } })
  assert.equal(result.status, 503); assert.equal(calls.length, 2)
})

test("each request rechecks Session: switched token selects team and old/logout tokens never query", async () => {
  let active = "personal-token-000000000000000000001"
  let kind: "personal" | "team" = "personal"
  let dataCalls = 0
  const fetchImpl = async (url: string, init?: RequestInit) => {
    const accepted = new Headers(init?.headers).get("cookie") === `ka_session=${active}`
    if (!accepted) return json({ ok: false, error: { code: "UNAUTHORIZED", message: "Invalid session", retryable: false, requestId: id } }, 401)
    if (url.endsWith("/auth/session")) return json(session(kind))
    dataCalls++; return json(success(kind))
  }
  async function query(token: string) {
    return handleDataQueryRequest(new Request("http://localhost/api/internal/data-query", { method: "POST", headers: { cookie: `ka_session=${token}` }, body: JSON.stringify(ordinary) }), { environment, requestId: () => id, fetchImpl })
  }
  assert.equal((await query(active)).status, 200)
  const old = active
  active = "team-token-00000000000000000000001"; kind = "team"
  assert.equal((await query(old)).status, 401)
  const team = await query(active)
  assert.ok(team.body.ok && team.body.data.mode === "ka_data")
  const loggedOut = active; active = "revoked"
  assert.equal((await query(loggedOut)).status, 401)
  assert.equal(dataCalls, 2)
})

test("network failure and timeout during Session resolution do not query data", async () => {
  for (const [cause, expected] of [[new Error("private upstream detail"), 503], [new DOMException("slow", "TimeoutError"), 504]] as const) {
    let calls = 0
    const response = await handleDataQueryRequest(incoming(), { environment, requestId: () => id, fetchImpl: async () => { calls++; throw cause } })
    assert.equal(response.status, expected)
    assert.equal(calls, 1)
    assert.doesNotMatch(JSON.stringify(response.body), /private upstream detail/)
  }
})

test("method and query-string injection fail before Session fetch", async () => {
  for (const request of [new Request("http://localhost/api/internal/data-query"), new Request("http://localhost/api/internal/data-query?dataView=ka_data", { method: "POST", body: JSON.stringify(ordinary) })]) {
    let calls = 0
    const response = await handleDataQueryRequest(request, { environment, fetchImpl: async () => { calls++; return json({}) } })
    assert.equal(response.status, request.method === "GET" ? 405 : 400)
    assert.equal(calls, 0)
  }
})
