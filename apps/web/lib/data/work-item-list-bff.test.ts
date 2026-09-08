import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"
import { handleWorkItemListRequest } from "./work-item-list-bff.ts"
import { workItemListResponseSchema } from "./work-item-list-contracts.ts"

const id = "bff-work-items-test"
const cookie = "ka_session=synthetic-work-session-000000000000000"
const environment = { KA_DATA_BACKEND_ORIGIN: "https://backend.example", KA_DATA_SERVICE_TOKEN: "synthetic-server-token-000000000000000" }
const deps = { environment, requestId: () => id }
function request(search = "", headers: HeadersInit = { cookie }) { return new Request(`http://localhost/api/internal/work-items${search}`, { headers }) }
async function fixture(name: string) { return JSON.parse(await readFile(new URL(`../../../../packages/contract/fixtures/work-item-list/${name}.json`, import.meta.url), "utf8")) }
function json(body: unknown, status = 200, header = id) { return Response.json(body, { status, headers: { "x-request-id": header } }) }
async function ready() { const body = await fixture("ready"); body.meta.requestId = id; return body }

for (const name of ["ready", "empty", "partial", "stale"]) test(`BFF preserves canonical ${name} envelope`, async () => {
  const body = await fixture(name); body.meta.requestId = id
  const result = await handleWorkItemListRequest(request(), { ...deps, fetchImpl: async () => json(body) })
  assert.equal(result.status, 200); assert.deepEqual(result.body, body)
  assert.equal(workItemListResponseSchema.safeParse(result.body).success, true)
})
test("frozen filters forwarded, only server token and session cookie may supply authority", async () => {
  const body = await ready(); body.data.page = 2; body.data.pageSize = 1; body.data.total = 2
  let calls = 0
  const result = await handleWorkItemListRequest(request("?page=2&pageSize=1&q=成本&type=diagnosis&severity=P1&status=dispatched&taskId=task%3A1&assigneeUserId=00000000-0000-4000-8000-000000000001", {
    cookie: `${cookie}; unrelated=private`, authorization: "Bearer forged", "x-ka-workspace-id": "forged", "x-ka-role": "admin", "x-request-id": "browser-id",
  }), { ...deps, fetchImpl: async (url, init) => {
    calls++; const target = new URL(url), headers = new Headers(init?.headers)
    assert.equal(target.origin, "https://backend.example"); assert.equal(target.pathname, "/api/v1/work-items")
    assert.equal(target.searchParams.get("q"), "成本"); assert.equal(target.searchParams.get("taskId"), "task:1")
    assert.equal(target.searchParams.get("status"), "dispatched")
    assert.equal(headers.get("authorization"), `Bearer ${environment.KA_DATA_SERVICE_TOKEN}`)
    assert.equal(headers.get("cookie"), cookie); assert.equal(headers.get("x-request-id"), id)
    assert.equal([...headers.keys()].some(k => k.startsWith("x-ka-")), false)
    assert.equal(init?.method, "GET"); assert.equal(init?.cache, "no-store"); assert.equal(init?.redirect, "error")
    return json(body)
  } })
  assert.equal(calls, 1); assert.equal(result.status, 200)
})
test("invalid query cannot reach backend", async () => {
  for (const query of ["?scope=all", "?dataSource=ka_data", "?workspaceId=other", "?page=1&page=2", "?page=0", "?page=01", "?page=1e3", "?page=9007199254740991", "?pageSize=101", "?status=not-a-status", "?assigneeUserId=wrong", "?type=unknown", "?taskId=", "?q=" + "x".repeat(101)]) {
    let calls = 0
    const result = await handleWorkItemListRequest(request(query), { ...deps, fetchImpl: async () => { calls++; return json({}) } })
    assert.equal(result.status, 400, query); assert.equal(calls, 0)
  }
})
test("missing, malformed and duplicate session are rejected, browser bearer does not substitute", async () => {
  const cases: HeadersInit[] = [{}, { authorization: "Bearer browser" }, { cookie: "ka_session=short" }, { cookie: `${cookie}; ${cookie}` }]
  for (const headers of cases) {
    let calls = 0
    const result = await handleWorkItemListRequest(request("", headers), { ...deps, fetchImpl: async () => { calls++; return json({}) } })
    assert.equal(result.status, 401); assert.equal(calls, 0)
  }
})
test("upstream stable errors retain their exact correlated shape and status", async () => {
  for (const [status, original] of Object.entries(await fixture("errors"))) {
    const body = structuredClone(original) as { error: { requestId: string } }; body.error.requestId = id
    const result = await handleWorkItemListRequest(request(), { ...deps, fetchImpl: async () => json(body, Number(status)) })
    assert.equal(result.status, Number(status)); assert.deepEqual(result.body, body)
  }
})
test("unknown config, transport and timeouts cannot leak exceptions", async () => {
  const unconfigured = await handleWorkItemListRequest(request(), { ...deps, environment: {}, fetchImpl: async () => { throw new Error("should not call") } })
  assert.equal(unconfigured.status, 503)
  for (const cause of [new DOMException("private", "TimeoutError"), new Error("private-secret-body")]) {
    const result = await handleWorkItemListRequest(request(), { ...deps, fetchImpl: async () => { throw cause } })
    assert.equal(result.status, cause instanceof DOMException ? 504 : 503)
    assert.equal(JSON.stringify(result.body).includes("private"), false)
  }
})
test("header/body correlation, bad schema and contradictory status fail closed", async () => {
  const body = await ready()
  for (const response of [() => json(body, 200, "other"), () => json({ ...body, meta: { ...body.meta, requestId: "other" } }),
    () => json({ ...body, private: "secret" }), () => json(body, 500), () => json({ ok: true }),
    () => new Response("not-json", { headers: { "x-request-id": id } })]) {
    const result = await handleWorkItemListRequest(request(), { ...deps, fetchImpl: async () => response() })
    assert.equal(result.status, 502); assert.equal(JSON.stringify(result.body).includes("secret"), false)
  }
})
test("JSON null is invalid evidence, not a transport truncation signal", async () => {
  const result = await handleWorkItemListRequest(request(), { ...deps, fetchImpl: async () => json(null) })
  assert.equal(result.status, 502)
  if (!result.body.ok) assert.equal(result.body.error.code, "UPSTREAM_INVALID_RESPONSE")
})
test("exact 16MiB is SOURCE_TRUNCATED, by declared size or actual streamed bytes", async () => {
  const limit = 16 * 1024 * 1024
  for (const response of [() => new Response("{}", { headers: { "x-request-id": id, "content-length": String(limit) } }),
    () => new Response(new Uint8Array(limit), { headers: { "x-request-id": id } })]) {
    const result = await handleWorkItemListRequest(request(), { ...deps, fetchImpl: async () => response() })
    assert.equal(result.status, 502); assert.equal(result.body.ok, false)
    if (!result.body.ok) assert.equal(result.body.error.code, "SOURCE_TRUNCATED")
  }
})
test("beyond-last-page empty is valid but wrong/nonempty-overflow pages are not", async () => {
  const body = await ready(); body.data.page = 2; body.data.items = []
  assert.equal((await handleWorkItemListRequest(request("?page=2"), { ...deps, fetchImpl: async () => json(body) })).status, 200)
  body.data.items = (await ready()).data.items
  assert.equal((await handleWorkItemListRequest(request("?page=2"), { ...deps, fetchImpl: async () => json(body) })).status, 502)
  assert.equal((await handleWorkItemListRequest(request(), { ...deps, fetchImpl: async () => json(body) })).status, 502)
})
test("non-GET never forwards and Next route wires the server-only handler", async () => {
  const result = await handleWorkItemListRequest(new Request("http://localhost/api/internal/work-items", { method: "POST", headers: { cookie } }), deps)
  assert.equal(result.status, 405)
  const source = await readFile(new URL("../../app/api/internal/work-items/route.ts", import.meta.url), "utf8")
  assert.match(source, /export async function GET/); assert.match(source, /work-item-list-server/)
  assert.doesNotMatch(source, /export.*(?:POST|PUT|PATCH|DELETE)/)
})
