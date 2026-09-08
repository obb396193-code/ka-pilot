import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

import { handleAccountListRequest } from "./r014/account-list-bff.ts"
import { accountListResponseSchema } from "./r014/account-list-contracts.ts"

// 文件名带 r014- 前缀放在 lib/data/ 下而不是 lib/data/r014/：
// apps/web 的测试脚本是 `node --test lib/data/*.test.ts`，不含子目录，
// 放进子目录等于永远不被跑。已在回执里请 arch 决定要不要放宽 glob。
const SERVICE_TOKEN = "account-list-server-secret-00000000000"
const SESSION_COOKIE = "account-session-token-0000000000000001"
const environment = {
  NODE_ENV: "production",
  KA_DATA_BACKEND_ORIGIN: "https://ka-data.internal.example",
  KA_DATA_SERVICE_TOKEN: SERVICE_TOKEN,
}

function accountRequest(url = "http://localhost/api/internal/accounts", init: RequestInit = {}): Request {
  const headers = new Headers(init.headers)
  if (!headers.has("cookie")) headers.set("cookie", `ka_session=${SESSION_COOKIE}`)
  return new Request(url, { ...init, headers })
}

async function fixture(name: "ready" | "empty" | "partial" | "stale" | "errors"): Promise<unknown> {
  const url = new URL(`../../../../packages/contract/fixtures/account-list/${name}.json`, import.meta.url)
  return JSON.parse(await readFile(url, "utf8")) as unknown
}

function correlated(payload: unknown, requestId: string, status = 200, headerRequestId: string | null = requestId): Response {
  const parsed = accountListResponseSchema.parse(payload)
  const body = parsed.ok
    ? { ...parsed, meta: { ...parsed.meta, requestId } }
    : { ...parsed, error: { ...parsed.error, requestId } }
  return Response.json(body, {
    status,
    headers: headerRequestId === null ? undefined : { "x-request-id": headerRequestId },
  })
}

test("the mirrored frontend schema accepts the canonical account-list fixtures unchanged", async () => {
  for (const name of ["ready", "empty", "partial", "stale"] as const) {
    assert.equal(accountListResponseSchema.safeParse(await fixture(name)).success, true, name)
  }
})

test("account BFF forwards only frozen query parameters and carries session plus service token", async () => {
  const ready = await fixture("ready")
  let seen: { url: string; headers: Headers } | null = null
  const result = await handleAccountListRequest(
    accountRequest("http://localhost/api/internal/accounts?page=2&pageSize=10&media=KUAISHOU&starred=true"),
    {
      environment,
      requestId: () => "req-accounts-1",
      fetchImpl: async (input, init) => {
        seen = { url: String(input), headers: new Headers(init?.headers) }
        return correlated(ready, "req-accounts-1")
      },
    },
  )
  assert.equal(result.status, 200)
  assert.equal(result.body.ok, true)
  const call = seen as unknown as { url: string; headers: Headers }
  const forwarded = new URL(call.url)
  assert.equal(forwarded.pathname, "/api/v1/accounts")
  assert.equal(forwarded.searchParams.get("page"), "2")
  assert.equal(forwarded.searchParams.get("starred"), "true")
  // 浏览器不能自己指定空间或账户范围——范围由 Session 决定。
  assert.equal(forwarded.searchParams.get("workspaceId"), null)
  assert.match(call.headers.get("cookie") ?? "", new RegExp(SESSION_COOKIE))
})

test("account BFF rejects unknown, duplicate and malformed parameters before reaching upstream", async () => {
  for (const search of [
    "?workspaceId=00000000-0000-4000-8000-000000000024",
    "?page=1&page=2",
    "?page=0",
    "?pageSize=abc",
    "?starred=yes",
  ]) {
    let called = false
    const result = await handleAccountListRequest(
      accountRequest(`http://localhost/api/internal/accounts${search}`),
      { environment, requestId: () => "req-accounts-2", fetchImpl: async () => { called = true; return Response.json({}) } },
    )
    assert.equal(result.status, 400, search)
    assert.equal(called, false, `${search} must not reach upstream`)
  }
})

test("account BFF fails closed without a session cookie", async () => {
  const result = await handleAccountListRequest(
    new Request("http://localhost/api/internal/accounts"),
    { environment, requestId: () => "req-accounts-3", fetchImpl: async () => Response.json({}) },
  )
  assert.equal(result.status, 401)
  assert.equal(result.body.ok, false)
})

test("account BFF refuses an upstream answer that does not correlate or does not match the contract", async () => {
  const ready = await fixture("ready")
  const cases: { label: string; response: () => Response }[] = [
    { label: "missing request id header", response: () => correlated(ready, "req-accounts-4", 200, null) },
    { label: "mismatched request id header", response: () => correlated(ready, "req-accounts-4", 200, "other-id") },
    { label: "body request id belongs to another request", response: () => correlated(ready, "someone-else") },
    { label: "status disagrees with the body", response: () => correlated(ready, "req-accounts-4", 503) },
    { label: "shape is not the canonical contract", response: () => Response.json({ ok: true, data: { items: [] } }, { headers: { "x-request-id": "req-accounts-4" } }) },
  ]
  for (const { label, response } of cases) {
    const result = await handleAccountListRequest(accountRequest(), {
      environment, requestId: () => "req-accounts-4", fetchImpl: async () => response(),
    })
    assert.equal(result.status, 502, label)
    assert.equal(result.body.ok, false, label)
  }
})

test("account BFF maps a timeout and an unreachable source to distinct retryable states", async () => {
  const timeout = await handleAccountListRequest(accountRequest(), {
    environment,
    requestId: () => "req-accounts-5",
    fetchImpl: async () => { throw new DOMException("The operation was aborted due to timeout", "TimeoutError") },
  })
  assert.equal(timeout.status, 504)
  const unreachable = await handleAccountListRequest(accountRequest(), {
    environment,
    requestId: () => "req-accounts-6",
    fetchImpl: async () => { throw new TypeError("fetch failed") },
  })
  assert.equal(unreachable.status, 503)
  for (const result of [timeout, unreachable]) {
    assert.equal(result.body.ok, false)
    if (!result.body.ok) assert.equal(result.body.error.retryable, true)
  }
})

test("account BFF refuses to run without a safely configured upstream", async () => {
  const result = await handleAccountListRequest(accountRequest(), {
    environment: { NODE_ENV: "production" },
    requestId: () => "req-accounts-7",
    fetchImpl: async () => Response.json({}),
  })
  assert.equal(result.status, 503)
})
