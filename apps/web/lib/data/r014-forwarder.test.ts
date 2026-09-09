import assert from "node:assert/strict"
import test from "node:test"

import { forwardToBackend } from "./r014/forwarder.ts"
import { meCountsSchema, accountPipelineSchema, POOL_STATUS_ORDER } from "./r014/schemas.ts"

// 文件名带 r014- 前缀放在 lib/data/ 下：apps/web 的测试脚本是
// `node --test lib/data/*.test.ts`，不含子目录（已在 Q-005 请 arch 裁）。
const SERVICE_TOKEN = "r014-forwarder-service-secret-00000000"
const SESSION_COOKIE = "r014-forwarder-session-000000000000001"
const environment = {
  NODE_ENV: "production",
  KA_DATA_BACKEND_ORIGIN: "https://ka-data.internal.example",
  KA_DATA_SERVICE_TOKEN: SERVICE_TOKEN,
}

const COUNTS = {
  workItems: { open: 12, p0: 1, p1: 3, opportunity: 2 },
  approvalsToApprove: 0, dispatchesReceived: 0, runsWaitingConfirmation: 1,
  notificationsUnread: 7, changesetsDraft: 2,
}

function req(url = "http://localhost/api/internal/me/counts", init: RequestInit = {}): Request {
  const headers = new Headers(init.headers)
  if (!headers.has("cookie")) headers.set("cookie", `ka_session=${SESSION_COOKIE}`)
  return new Request(url, { ...init, headers })
}

function ok(data: unknown, requestId: string, status = 200, header: string | null = requestId): Response {
  return Response.json({ ok: true, data, meta: { requestId } }, {
    status, headers: header === null ? undefined : { "x-request-id": header },
  })
}

test("forwarder carries the session and service token, and never lets the browser widen scope", async () => {
  let seen: { url: string; headers: Headers } | null = null
  const result = await forwardToBackend(req(), {
    path: "/api/v1/me/counts", method: "GET", dataSchema: meCountsSchema, environment,
    requestId: () => "req-1",
    fetchImpl: async (input, init) => {
      seen = { url: String(input), headers: new Headers(init?.headers) }
      return ok(COUNTS, "req-1")
    },
  })
  assert.equal(result.status, 200)
  const call = seen as unknown as { url: string; headers: Headers }
  assert.equal(new URL(call.url).pathname, "/api/v1/me/counts")
  assert.match(call.headers.get("cookie") ?? "", new RegExp(SESSION_COOKIE))
  assert.equal(new URL(call.url).searchParams.get("workspaceId"), null)
})

test("forwarder rejects any query parameter outside the route's allow-list, before reaching upstream", async () => {
  for (const search of ["?workspaceId=x", "?limit=5", "?q=a&q=b"]) {
    let called = false
    const result = await forwardToBackend(req(`http://localhost/api/internal/search${search}`), {
      path: "/api/v1/search", method: "GET", allowedQuery: ["q", "type"], environment,
      requestId: () => "req-2",
      fetchImpl: async () => { called = true; return ok({ items: [] }, "req-2") },
    })
    assert.equal(result.status, 400, search)
    assert.equal(called, false, `${search} must not reach upstream`)
  }
})

test("forwarder passes the allowed parameters through unchanged", async () => {
  let url = ""
  await forwardToBackend(req("http://localhost/api/internal/search?q=AAC&type=task"), {
    path: "/api/v1/search", method: "GET", allowedQuery: ["q", "type"],
    dataSchema: undefined, environment, requestId: () => "req-3",
    fetchImpl: async (input) => { url = String(input); return ok({ items: [] }, "req-3") },
  })
  const forwarded = new URL(url)
  assert.equal(forwarded.searchParams.get("q"), "AAC")
  assert.equal(forwarded.searchParams.get("type"), "task")
})

test("forwarder fails closed without a session and without a safe upstream", async () => {
  const noSession = await forwardToBackend(new Request("http://localhost/api/internal/me/counts"), {
    path: "/api/v1/me/counts", method: "GET", environment, requestId: () => "req-4",
    fetchImpl: async () => ok(COUNTS, "req-4"),
  })
  assert.equal(noSession.status, 401)
  const noConfig = await forwardToBackend(req(), {
    path: "/api/v1/me/counts", method: "GET", environment: { NODE_ENV: "production" },
    requestId: () => "req-5", fetchImpl: async () => ok(COUNTS, "req-5"),
  })
  assert.equal(noConfig.status, 503)
})

test("forwarder refuses an upstream answer that does not correlate or does not match the schema", async () => {
  const cases: { label: string; response: () => Response }[] = [
    { label: "no request id header", response: () => ok(COUNTS, "req-6", 200, null) },
    { label: "header belongs to another request", response: () => ok(COUNTS, "req-6", 200, "other") },
    { label: "body request id belongs to another request", response: () => ok(COUNTS, "someone-else") },
    { label: "success body carried a non-200 status", response: () => ok(COUNTS, "req-6", 503) },
    { label: "data does not match the schema", response: () => ok({ workItems: { open: 1 } }, "req-6") },
  ]
  for (const { label, response } of cases) {
    const result = await forwardToBackend(req(), {
      path: "/api/v1/me/counts", method: "GET", dataSchema: meCountsSchema, environment,
      requestId: () => "req-6", fetchImpl: async () => response(),
    })
    assert.equal(result.status, 502, label)
  }
})

test("forwarder blocks a pipeline whose nine states came back out of order", async () => {
  const stages = POOL_STATUS_ORDER.map((poolStatus) => ({
    poolStatus, count: 0, deltaVsYesterday: { value: null, availability: "missing" as const },
  }))
  const good = await forwardToBackend(req("http://localhost/api/internal/accounts/pipeline"), {
    path: "/api/v1/accounts/pipeline", method: "GET", dataSchema: accountPipelineSchema, environment,
    requestId: () => "req-7",
    fetchImpl: async () => ok({ stages, asOf: "2026-09-05T09:15:00.000+08:00" }, "req-7"),
  })
  assert.equal(good.status, 200)
  const shuffled = await forwardToBackend(req("http://localhost/api/internal/accounts/pipeline"), {
    path: "/api/v1/accounts/pipeline", method: "GET", dataSchema: accountPipelineSchema, environment,
    requestId: () => "req-8",
    fetchImpl: async () => ok({ stages: [...stages].reverse(), asOf: "2026-09-05T09:15:00.000+08:00" }, "req-8"),
  })
  assert.equal(shuffled.status, 502)
})

test("forwarder passes a 204 through without inventing a body", async () => {
  const result = await forwardToBackend(req("http://localhost/api/internal/me/views/x", { method: "DELETE" }), {
    path: "/api/v1/me/views/x", method: "DELETE", environment, requestId: () => "req-9",
    fetchImpl: async () => new Response(null, { status: 204, headers: { "x-request-id": "req-9" } }),
  })
  assert.equal(result.status, 204)
  assert.equal(result.body, undefined)
})

test("forwarder maps a timeout and an unreachable upstream to distinct retryable states", async () => {
  const timeout = await forwardToBackend(req(), {
    path: "/api/v1/me/counts", method: "GET", environment, requestId: () => "req-10",
    fetchImpl: async () => { throw new DOMException("aborted due to timeout", "TimeoutError") },
  })
  assert.equal(timeout.status, 504)
  const down = await forwardToBackend(req(), {
    path: "/api/v1/me/counts", method: "GET", environment, requestId: () => "req-11",
    fetchImpl: async () => { throw new TypeError("fetch failed") },
  })
  assert.equal(down.status, 503)
})

test("forwarder relays an upstream error envelope with its own status, unchanged", async () => {
  const result = await forwardToBackend(req(), {
    path: "/api/v1/me/counts", method: "GET", dataSchema: meCountsSchema, environment,
    requestId: () => "req-12",
    fetchImpl: async () => Response.json(
      { ok: false, error: { code: "FORBIDDEN", message: "no", retryable: false, requestId: "req-12" } },
      { status: 403, headers: { "x-request-id": "req-12" } },
    ),
  })
  assert.equal(result.status, 403)
  assert.equal((result.body as { ok: boolean }).ok, false)
})

test("passes the backend's 404/409/429 through instead of calling them contract violations", async () => {
  // 后端 r014 用的是 NOT_FOUND / CONFLICT / RATE_LIMITED 这几个码（kb 单读、账户交接、
  // 任务详情、改密限速都在返）。BFF 原来只认那 11 个稳定码，于是把它们全翻成
  // 502「上游不合契约」——用户看到的是「上游坏了」，而不是「这篇文档不存在」。
  for (const [code, status, retryable] of [
    ["NOT_FOUND", 404, false], ["CONFLICT", 409, false], ["RATE_LIMITED", 429, true],
  ] as const) {
    const result = await forwardToBackend(req(), {
      path: "/api/v1/me/counts", method: "GET", dataSchema: meCountsSchema, environment,
      requestId: () => "req-err",
      fetchImpl: async () => Response.json(
        { ok: false, error: { code, message: "后端的原话", retryable, requestId: "req-err" } },
        { status, headers: { "x-request-id": "req-err" } },
      ),
    })
    assert.equal(result.status, status)
    assert.equal((result.body as { error: { code: string; message: string } }).error.code, code)
    assert.equal((result.body as { error: { message: string } }).error.message, "后端的原话")
  }
})

test("Q-030 handlers hit the right backend path and method for every newly exposed endpoint", async () => {
  const {
    handleKbDocuments, handleKbDocument, handleKbBacklinks, handleKbSearch, handleKbByObject,
    handleAccountTransfer, handleTransferAll, handleAuthPassword, handleDailyReport,
  } = await import("./r014/handlers.ts")

  const seen: { url: string; method: string }[] = []
  const spy = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    seen.push({ url: String(input), method: (init?.method ?? "GET").toUpperCase() })
    // 只验路由拼装，不验响应形状；给一个必定过不了 dataSchema 的空体即可。
    return Response.json({ ok: true, data: {}, meta: { requestId: "req-path" } },
      { headers: { "x-request-id": "req-path" } })
  }
  const deps = { environment, requestId: () => "req-path", fetchImpl: spy }
  const DOC = "00000000-0000-4000-8000-0000000000aa"
  const USER = "00000000-0000-4000-8000-0000000000bb"

  await handleKbDocuments(req("http://localhost/api/internal/kb/documents?q=x&page=2"), deps)
  await handleKbDocuments(req("http://localhost/api/internal/kb/documents", { method: "POST", body: "{}" }), deps)
  await handleKbDocument(req(`http://localhost/api/internal/kb/documents/${DOC}`), DOC, deps)
  await handleKbDocument(req(`http://localhost/api/internal/kb/documents/${DOC}`, { method: "DELETE" }), DOC, deps)
  await handleKbBacklinks(req(`http://localhost/api/internal/kb/documents/${DOC}/backlinks`), DOC, deps)
  await handleKbSearch(req("http://localhost/api/internal/kb/search?q=开户"), deps)
  await handleKbByObject(req("http://localhost/api/internal/kb/by-object/task/1803240580"), "task", "1803240580", deps)
  await handleAccountTransfer(req("http://localhost/api/internal/accounts/transfer", { method: "POST", body: "{}" }), deps)
  await handleTransferAll(req(`http://localhost/api/internal/users/${USER}/transfer-all`, { method: "POST", body: "{}" }), USER, deps)
  await handleAuthPassword(req("http://localhost/api/internal/auth/password", { method: "POST", body: "{}" }), deps)
  await handleDailyReport(req("http://localhost/api/internal/reports/daily?date=2026-09-05"), deps)

  const paths = seen.map((call) => `${call.method} ${new URL(call.url).pathname}${new URL(call.url).search}`)
  assert.deepEqual(paths, [
    "GET /api/v1/kb/documents?q=x&page=2",
    "POST /api/v1/kb/documents",
    `GET /api/v1/kb/documents/${DOC}`,
    `DELETE /api/v1/kb/documents/${DOC}`,
    `GET /api/v1/kb/documents/${DOC}/backlinks`,
    "GET /api/v1/kb/search?q=%E5%BC%80%E6%88%B7",
    "GET /api/v1/kb/by-object/task/1803240580",
    "POST /api/v1/accounts/transfer",
    `POST /api/v1/users/${USER}/transfer-all`,
    "POST /api/v1/auth/password",
    "GET /api/v1/reports/daily?date=2026-09-05",
  ])
})

test("the three passthroughs the coverage tripwire found also hit the right paths", async () => {
  const { handleAccountPoolStatus, handleAdminAccountNamesConfirm, handleAdminAccountNamesReparse } =
    await import("./r014/handlers.ts")
  const seen: string[] = []
  const spy = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    seen.push(`${(init?.method ?? "GET").toUpperCase()} ${new URL(String(input)).pathname}`)
    return Response.json({ ok: true, data: {}, meta: { requestId: "req-gap" } },
      { headers: { "x-request-id": "req-gap" } })
  }
  const deps = { environment, requestId: () => "req-gap", fetchImpl: spy }

  await handleAccountPoolStatus(
    req("http://localhost/x", { method: "PATCH", body: "{}" }), "KUAISHOU", "account-1", deps)
  await handleAccountPoolStatus(req("http://localhost/x", { method: "DELETE" }), "KUAISHOU", "account-1", deps)
  await handleAdminAccountNamesConfirm(req("http://localhost/x", { method: "POST", body: "{}" }), deps)
  await handleAdminAccountNamesReparse(req("http://localhost/x", { method: "POST", body: "{}" }), deps)

  assert.deepEqual(seen, [
    "PATCH /api/v1/accounts/KUAISHOU/account-1/pool-status",
    "DELETE /api/v1/accounts/KUAISHOU/account-1/pool-status",
    "POST /api/v1/admin/account-names/confirm",
    "POST /api/v1/admin/account-names/reparse",
  ])
})

test("Q-030 refuses a query parameter the backend never declared", async () => {
  const { handleKbSearch } = await import("./r014/handlers.ts")
  const result = await handleKbSearch(
    req("http://localhost/api/internal/kb/search?q=x&evil=1"),
    { environment, requestId: () => "req-q", fetchImpl: async () => { throw new Error("不该打到后端") } },
  )
  // 白名单之外的参数在 BFF 就挡掉：否则浏览器侧随手加个参数就绕过后端入参校验。
  assert.equal(result.status, 400)
})
