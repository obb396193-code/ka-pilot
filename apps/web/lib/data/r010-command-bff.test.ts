import assert from "node:assert/strict"
import test from "node:test"
import { readFileSync } from "node:fs"
import { handleR010CommandRequest } from "./r010-command-bff.ts"

const origin = "https://web.example", cookie = "ka_session=synthetic-session-longer-than-thirty-two", id = "r010-bff-test"
const environment = { KA_DATA_BACKEND_ORIGIN: "https://backend.example", KA_DATA_SERVICE_TOKEN: "synthetic-service-token-longer-than-thirty-two" }
const deps = { environment, requestId: () => id }
const uuid = "00000000-0000-4000-8000-000000000001"
const mute = "/api/internal/accounts/KUAISHOU/acc-1/mute", ignore = `/api/internal/work-items/${uuid}/ignore`, dryRun = `/api/internal/changesets/${uuid}/dry-run`
const data = { mutedUntil: "2026-09-09T03:00:00+08:00", scope: "notifications_and_p1p2" }
const success = { ok: true, data, meta: { requestId: id } }
function error(code: string, requestId = id) { return { ok: false, error: { code, message: "upstream-secret-do-not-reflect", retryable: false, requestId } } }
function json(body: unknown, status = 200, requestId = id) { return Response.json(body, { status, headers: { "x-request-id": requestId } }) }
function request(options: { path?: string; method?: string; raw?: string; headers?: HeadersInit } = {}) {
  const headers = new Headers({ origin, cookie, "content-type": "application/json", "sec-fetch-site": "same-origin" })
  new Headers(options.headers).forEach((v, k) => headers.set(k, v))
  return new Request(origin + (options.path ?? mute), { method: options.method ?? "POST", headers,
    ...((options.method ?? "POST") === "GET" ? {} : { body: options.raw ?? '{"days":1,"reason_chip":"synthetic"}' }) })
}
for (const [path, body] of [[mute, { days: 1, reason_chip: "synthetic" }], [ignore, { mute_days: 3 }]] as const) {
  test(`forwards only server authority and frozen payload ${path}`, async () => {
    let calls = 0
    const result = await handleR010CommandRequest(request({ path, raw: JSON.stringify(body), headers: {
      cookie: cookie + "; extra=secret", authorization: "Bearer forged", "x-ka-account-scope": "*", "x-ka-workspace-id": "other" } }), {
      ...deps, fetchImpl: async (url, init) => {
        calls++; assert.equal(url, environment.KA_DATA_BACKEND_ORIGIN + path.replace("/api/internal/", "/api/v1/"))
        const headers = new Headers(init?.headers)
        assert.equal(headers.get("authorization"), "Bearer " + environment.KA_DATA_SERVICE_TOKEN)
        assert.equal(headers.get("cookie"), cookie); assert.equal(headers.get("x-request-id"), id)
        assert.equal([...headers.keys()].some(k => k.startsWith("x-ka-")), false)
        assert.deepEqual(JSON.parse(init?.body as string), body); assert.equal(init?.redirect, "error"); assert.equal(init?.cache, "no-store")
        return json(success)
      },
    })
    assert.equal(calls, 1); assert.equal(result.status, 200); assert.deepEqual(result.body, success)
  })
}
test("dry-run and plain ignore preserve honest 503, never reflect raw upstream messages", async () => {
  for (const path of [dryRun, ignore]) {
    const result = await handleR010CommandRequest(request({ path, raw: "{}" }), { ...deps, fetchImpl: async () => json(error("SOURCE_UNAVAILABLE"), 503) })
    assert.equal(result.status, 503); assert.equal(result.body.error?.code, "SOURCE_UNAVAILABLE")
    assert.equal(JSON.stringify(result).includes("upstream-secret"), false)
  }
})
test("rejects cross-site, missing/null/non-origin Origin and non-json before fetch", async () => {
  for (const headers of [{ origin: "https://attacker.example" }, { origin: "null" }, { origin: "" }, { origin: origin + "/path" },
    { "sec-fetch-site": "same-site" }, { "sec-fetch-site": "cross-site" }, { "content-type": "text/plain" }] as Record<string, string>[]) {
    let calls = 0
    const result = await handleR010CommandRequest(request({ headers }), { ...deps, fetchImpl: async () => { calls++; return json(success) } })
    assert.equal(result.status, headers["content-type"] ? 400 : 403); assert.equal(calls, 0)
  }
})
test("JSON null upstream is invalid response, not truncated; stable known errors preserve status only", async () => {
  const invalid = await handleR010CommandRequest(request(), { ...deps, fetchImpl: async () => json(null) })
  assert.equal(invalid.body.error?.code, "UPSTREAM_INVALID_RESPONSE")
  for (const [code, status] of [["UNAUTHORIZED", 401], ["FORBIDDEN", 403], ["NOT_FOUND", 404], ["INVALID_STATE", 409],
    ["FROM_VALUE_CHANGED", 409], ["UPSTREAM_TIMEOUT", 504], ["INTERNAL_ERROR", 500]] as const) {
    const result = await handleR010CommandRequest(request(), { ...deps, fetchImpl: async () => json(error(code), status) })
    assert.equal(result.status, status); assert.equal(result.body.error?.code, code)
    assert.equal(JSON.stringify(result).includes("upstream-secret"), false)
  }
  const mismatch = await handleR010CommandRequest(request(), { ...deps, fetchImpl: async () => json(error("FORBIDDEN"), 404) })
  assert.equal(mismatch.body.error?.code, "UPSTREAM_INVALID_RESPONSE")
})
test("missing Origin is rejected; no fetch metadata is allowed only with explicit same Origin", async () => {
  const missing = request(); missing.headers.delete("origin")
  let calls = 0
  const fetchImpl = async () => { calls++; return json(success) }
  assert.equal((await handleR010CommandRequest(missing, { ...deps, fetchImpl })).status, 403)
  assert.equal(calls, 0)
  const approved = request(); approved.headers.delete("sec-fetch-site")
  assert.equal((await handleR010CommandRequest(approved, { ...deps, fetchImpl })).status, 200)
  assert.equal(calls, 1)
})
test("invalid server config cannot use browser credentials or origin as fallback", async () => {
  for (const environment of [{}, { ...deps.environment, KA_DATA_BACKEND_ORIGIN: "https://backend.example/path" },
    { ...deps.environment, KA_DATA_SERVICE_TOKEN: "short" }]) {
    let calls = 0
    const result = await handleR010CommandRequest(request(), { ...deps, environment, fetchImpl: async () => { calls++; return json(success) } })
    assert.equal(result.status, 503); assert.equal(calls, 0)
  }
})
test("requires unique valid cookie, does not accept browser bearer as session", async () => {
  for (const value of ["", "ka_session=short", cookie + "; " + cookie]) {
    let calls = 0; const result = await handleR010CommandRequest(request({ headers: { cookie: value } }), {
      ...deps, fetchImpl: async () => { calls++; return json(success) },
    }); assert.equal(result.status, 401); assert.equal(calls, 0)
  }
})
test("strict method/path/query/body boundaries", async () => {
  for (const [options, status] of [
    [{ method: "GET" }, 405], [{ path: mute + "?scope=*" }, 400], [{ path: mute.replace("acc-1", "%2F") }, 400],
    [{ path: mute.replace("KUAISHOU", "%ZZ") }, 400], [{ path: ignore.replace(uuid, "not-uuid") }, 400],
    [{ raw: "null" }, 400], [{ raw: "[1]" }, 400], [{ raw: "{" }, 400], [{ raw: '{"days":2,"reason_chip":"s"}' }, 400],
    [{ raw: '{"days":1,"reason_chip":"s","scope":"*"}' }, 400], [{ path: dryRun, raw: '{"observed":40}' }, 400],
    [{ path: dryRun.replace("dry-run", "execute"), raw: "{}" }, 404],
  ] as const) {
    let calls = 0; const result = await handleR010CommandRequest(request(options), { ...deps, fetchImpl: async () => { calls++; return json(success) } })
    assert.equal(result.status, status, JSON.stringify(options)); assert.equal(calls, 0)
  }
})
test("UTF8 actual request limit returns413; exact limit parses but does not skip schema", async () => {
  for (const raw of ['"' + "合".repeat(400000) + '"', " ".repeat(1024 * 1024 - 2) + "{}", " ".repeat(1024 * 1024) + "{}"] ) {
    let calls = 0; const result = await handleR010CommandRequest(request({ raw }), { ...deps, fetchImpl: async () => { calls++; return json(success) } })
    assert.equal(result.status, Buffer.byteLength(raw) > 1024 * 1024 ? 413 : 400); assert.equal(calls, 0)
  }
})
test("declared oversize is rejected before reading/fetch; invalid requestId safely regenerated", async () => {
  let calls = 0
  const over = await handleR010CommandRequest(request({ headers: { "content-length": String(1024 * 1024 + 1) } }), {
    ...deps, fetchImpl: async () => { calls++; return json(success) },
  })
  assert.equal(over.status, 413); assert.equal(calls, 0)
  const rejected = await handleR010CommandRequest(request({ method: "GET" }), { ...deps, requestId: () => "bad\r\nlog" })
  assert.match(rejected.requestId, /^[A-Za-z0-9._:-]+$/); assert.equal(JSON.stringify(rejected).includes("bad"), false)
})
test("bad status, shape, requestId, cookie and fake successful dry-run are rejected", async () => {
  for (const [path, response] of [
    [mute, json(success, 201)], [mute, json(success, 200, "wrong")], [mute, json({ ...success, meta: { requestId: "wrong" } })],
    [mute, json({ ...success, data: { ...data, secret: "no" } })], [mute, json(error("FORBIDDEN"), 200)],
    [mute, new Response(null, { status: 204, headers: { "x-request-id": id } })],
    [mute, new Response(JSON.stringify(success), { headers: { "x-request-id": id, "set-cookie": "unexpected=secret" } })],
    [dryRun, json({ ok: true, data: { status: "success", hash: "old" }, meta: { requestId: id } })],
    [ignore, json(success)],
  ] as const) {
    const result = await handleR010CommandRequest(request({ path, raw: path === mute ? undefined : "{}" }), { ...deps, fetchImpl: async () => response })
    assert.equal(result.status, 502); assert.equal(result.body.error?.code, "UPSTREAM_INVALID_RESPONSE")
  }
})
test("exact16MiB declared and streamed bodies are truncated, not parsed", async () => {
  for (const response of [new Response("{}", { headers: { "x-request-id": id, "content-length": String(16 * 1024 * 1024) } }),
    new Response(new Uint8Array(16 * 1024 * 1024), { headers: { "x-request-id": id } })]) {
    const result = await handleR010CommandRequest(request(), { ...deps, fetchImpl: async () => response })
    assert.equal(result.status, 502); assert.equal(result.body.error?.code, "SOURCE_TRUNCATED")
  }
})
test("timeout/network errors are stable and never retried", async () => {
  for (const cause of [new DOMException("private", "TimeoutError"), new Error("private")]) {
    let calls = 0; const result = await handleR010CommandRequest(request(), { ...deps, fetchImpl: async () => { calls++; throw cause } })
    assert.equal(result.status, cause instanceof DOMException ? 504 : 503); assert.equal(calls, 1); assert.equal(JSON.stringify(result).includes("private"), false)
  }
})

function observedFixture() {
  const fixture = JSON.parse(readFileSync(new URL("../../../../packages/contract/fixtures/changesets/dry-run-ok.json", import.meta.url), "utf8"))
  delete fixture.meta._note // Documentation only; actual upstream _note is rejected below.
  fixture.meta.requestId = id; fixture.data.changesetId = uuid
  return fixture
}
test("dry-run preserves the canonical three-value response and only forwards approved credentials", async () => {
  const fixture = observedFixture()
  const result = await handleR010CommandRequest(request({ path: dryRun, raw: "{}", headers: {
    "x-ka-account-scope": "*", authorization: "Bearer forged" } }), { ...deps, fetchImpl: async (url, init) => {
    assert.equal(url, environment.KA_DATA_BACKEND_ORIGIN + dryRun.replace("/api/internal/", "/api/v1/"))
    const headers = new Headers(init?.headers)
    assert.equal(headers.get("authorization"), "Bearer " + environment.KA_DATA_SERVICE_TOKEN)
    assert.equal(headers.get("cookie"), cookie); assert.equal(headers.get("x-ka-account-scope"), null)
    assert.equal(init?.body, "{}"); assert.equal(init?.redirect, "error")
    return json(fixture)
  } })
  assert.equal(result.status, 200); assert.deepEqual(result.body, fixture)
})
test("dry-run preserves unknown dataAsOf rather than substituting the current clock", async () => {
  const fixture = observedFixture(); fixture.meta.dataAsOf = null
  const result = await handleR010CommandRequest(request({ path: dryRun, raw: "{}" }), { ...deps, fetchImpl: async () => json(fixture) })
  assert.equal(result.status, 200); assert.deepEqual(result.body, fixture)
})
test("dry-run rejects wrong object, malformed evidence, extras, lineage and correlation without changing values", async () => {
  for (const mutate of [
    (f: ReturnType<typeof observedFixture>) => { f.data.changesetId = "00000000-0000-4000-8000-000000000099" },
    (f: ReturnType<typeof observedFixture>) => { delete f.data.items[0].observed },
    (f: ReturnType<typeof observedFixture>) => { f.data.items[0].observed.value = "40" },
    (f: ReturnType<typeof observedFixture>) => { f.data.items[1].verdict = "ok"; f.data.items[1].reason = null },
    (f: ReturnType<typeof observedFixture>) => { f.data.summary.total = 1 },
    (f: ReturnType<typeof observedFixture>) => { f.data.confirmAllowed = true; f.data.confirmBlockedReason = null },
    (f: ReturnType<typeof observedFixture>) => { f.meta.requestId = "another-request" },
    (f: ReturnType<typeof observedFixture>) => { f.meta.dataAsOf = "2027-01-01T00:00:00Z" },
    (f: ReturnType<typeof observedFixture>) => { f.meta.businessDate = "2026-02-31" },
    (f: ReturnType<typeof observedFixture>) => { f.meta._note = "unexpected-secret" },
    (f: ReturnType<typeof observedFixture>) => { f.data.items[0].token = "unexpected-secret" },
  ]) {
    const fixture = observedFixture(); mutate(fixture)
    const result = await handleR010CommandRequest(request({ path: dryRun, raw: "{}" }), { ...deps, fetchImpl: async () => json(fixture) })
    assert.equal(result.status, 502); assert.equal(result.body.error?.code, "UPSTREAM_INVALID_RESPONSE")
    assert.equal(JSON.stringify(result).includes("unexpected-secret"), false)
  }
})
test("dry-run exact16MiB is fail-closed even when padded JSON would otherwise be valid", async () => {
  const fixture = JSON.stringify(observedFixture()), padding = " ".repeat(16 * 1024 * 1024 - Buffer.byteLength(fixture))
  for (const response of [new Response(fixture + padding, { headers: { "x-request-id": id } }),
    new Response(fixture, { headers: { "x-request-id": id, "content-length": String(16 * 1024 * 1024) } })]) {
    const result = await handleR010CommandRequest(request({ path: dryRun, raw: "{}" }), { ...deps, fetchImpl: async () => response })
    assert.equal(result.status, 502); assert.equal(result.body.error?.code, "SOURCE_TRUNCATED")
  }
})
