import assert from "node:assert/strict"
import test from "node:test"

import {
  handleDecisionPolicy, handleExportDetail, handleMeView, handleMeViews, handleMeWatchlist,
  handleTaskBindings, handleTaskReadiness,
} from "./r014/handlers.ts"

// 文件名带 r014- 前缀放在 lib/data/ 下：apps/web 的测试脚本是
// `node --test lib/data/*.test.ts`，不含子目录（已在 Q-005 请 arch 裁）。
const environment = {
  NODE_ENV: "production",
  KA_DATA_BACKEND_ORIGIN: "https://ka-data.internal.example",
  KA_DATA_SERVICE_TOKEN: "r014-handlers-service-secret-000000000",
}
const COOKIE = "r014-handlers-session-0000000000000000001"

function req(url: string, method = "GET", body?: unknown): Request {
  return new Request(url, {
    method,
    headers: { cookie: `ka_session=${COOKIE}` },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
}

/** 记录转发出去的请求，并回一个相关性正确的空成功信封。 */
function spy(requestId: string, data: unknown = {}) {
  const seen: { url: string; method: string }[] = []
  const fetchImpl = async (input: string, init?: RequestInit) => {
    seen.push({ url: String(input), method: (init?.method ?? "GET").toUpperCase() })
    return Response.json({ ok: true, data, meta: { requestId } }, { headers: { "x-request-id": requestId } })
  }
  return { seen, fetchImpl }
}

test("path parameters are encoded, never concatenated raw into the upstream path", async () => {
  const { seen, fetchImpl } = spy("req-p1")
  // 任务 id 里带斜杠/问号时，直接拼字符串会改变上游路由；必须编码。
  await handleTaskBindings(req("http://localhost/api/internal/tasks/x/bindings"), "a/b?c=1", {
    environment, fetchImpl, requestId: () => "req-p1",
  })
  const url = new URL(seen[0]!.url)
  assert.equal(url.pathname, "/api/v1/tasks/a%2Fb%3Fc%3D1/bindings")
  assert.equal(url.search, "")
})

test("readiness forwards both path segments and uses PUT", async () => {
  const { seen, fetchImpl } = spy("req-p2", { dimension: "strategy", ready: true, note: null, markedBy: null, markedAt: null })
  const result = await handleTaskReadiness(
    req("http://localhost/api/internal/tasks/t/readiness/strategy", "PUT", { ready: true }),
    "task-1", "strategy", { environment, fetchImpl, requestId: () => "req-p2" },
  )
  assert.equal(result.status, 200)
  assert.equal(seen[0]!.method, "PUT")
  assert.equal(new URL(seen[0]!.url).pathname, "/api/v1/tasks/task-1/readiness/strategy")
})

test("method-sensitive handlers pick the upstream verb from the incoming request", async () => {
  for (const [method, expected] of [["GET", "GET"], ["PUT", "PUT"]] as const) {
    const { seen, fetchImpl } = spy("req-p3", {
      items: [], updatedAt: null,
    })
    await handleMeWatchlist(req("http://localhost/api/internal/me/watchlist", method, method === "PUT" ? { items: [] } : undefined), {
      environment, fetchImpl, requestId: () => "req-p3",
    })
    assert.equal(seen[0]!.method, expected)
  }
  const post = spy("req-p4", {
    id: "00000000-0000-4000-8000-000000001201", page: "accounts", name: "n",
    config: { version: "view/v1" }, isShared: false, updatedAt: "2026-09-05T09:15:00.000+08:00",
  })
  await handleMeViews(req("http://localhost/api/internal/me/views", "POST", { page: "accounts", name: "n", config: { version: "view/v1" } }), {
    environment, fetchImpl: post.fetchImpl, requestId: () => "req-p4",
  })
  assert.equal(post.seen[0]!.method, "POST")
})

test("only the declared query parameters survive the hop", async () => {
  const allowed = spy("req-p5", { items: [] })
  await handleMeViews(req("http://localhost/api/internal/me/views?page=accounts"), {
    environment, fetchImpl: allowed.fetchImpl, requestId: () => "req-p5",
  })
  assert.equal(new URL(allowed.seen[0]!.url).searchParams.get("page"), "accounts")

  const blocked = spy("req-p6", { items: [] })
  const result = await handleMeViews(req("http://localhost/api/internal/me/views?ownerUserId=someone-else"), {
    environment, fetchImpl: blocked.fetchImpl, requestId: () => "req-p6",
  })
  // 让浏览器指定 ownerUserId 等于允许它看别人的视图，必须在到达后端之前挡掉。
  assert.equal(result.status, 400)
  assert.equal(blocked.seen.length, 0)
})

test("a DELETE carries no body and still returns 204 unchanged", async () => {
  const seen: string[] = []
  const result = await handleMeView(req("http://localhost/api/internal/me/views/v1", "DELETE"), "v1", {
    environment,
    requestId: () => "req-p7",
    fetchImpl: async (input, init) => {
      seen.push((init?.method ?? "GET").toUpperCase())
      assert.equal(init?.body, undefined)
      return new Response(null, { status: 204, headers: { "x-request-id": "req-p7" } })
    },
  })
  assert.deepEqual(seen, ["DELETE"])
  assert.equal(result.status, 204)
  assert.equal(result.body, undefined)
})

test("an upstream payload that does not match the route schema is blocked as 502", async () => {
  const result = await handleDecisionPolicy(req("http://localhost/api/internal/settings/decision-policy"), {
    environment,
    requestId: () => "req-p8",
    // confidenceMin 超出 [0,1]：后端出了坏阈值，不能照单送到设置页上。
    fetchImpl: async () => Response.json(
      { ok: true, data: { policy: { confidenceMin: 5, historicalSuccessRateMin: 0.8, recentManualOpsWindowHours: 24, dailyCapCny: 1 }, updatedBy: null, updatedAt: null }, meta: { requestId: "req-p8" } },
      { headers: { "x-request-id": "req-p8" } },
    ),
  })
  assert.equal(result.status, 502)
})

test("an expired export link is relayed with the backend's own 410, not softened", async () => {
  const result = await handleExportDetail(req("http://localhost/api/internal/exports/e1"), "e1", {
    environment,
    requestId: () => "req-p9",
    fetchImpl: async () => Response.json(
      { ok: false, error: { code: "INVALID_REQUEST", message: "The exported file link has expired", retryable: false, requestId: "req-p9" } },
      { status: 410, headers: { "x-request-id": "req-p9" } },
    ),
  })
  assert.equal(result.status, 410)
  assert.equal((result.body as { ok: boolean }).ok, false)
})
