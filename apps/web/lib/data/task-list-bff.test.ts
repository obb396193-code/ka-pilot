import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

import { MAX_UPSTREAM_BODY_BYTES } from "./bounded-response.ts"
import { handleTaskListRequest } from "./task-list-bff.ts"
import { taskListResponseSchema } from "./task-list-contracts.ts"

const SERVICE_TOKEN = "task-list-server-secret-000000000000000"
const authContext = {
  workspaceId: "00000000-0000-4000-8000-000000000024",
  userId: "buc-user-demo",
  allowedAccounts: [{ media: "KUAISHOU", accountId: "account-demo-07" }],
}
const environment = {
  NODE_ENV: "production",
  KA_DATA_BACKEND_ORIGIN: "https://ka-data.internal.example",
  KA_DATA_SERVICE_TOKEN: SERVICE_TOKEN,
}

async function fixture(name: "ready" | "empty" | "partial" | "stale" | "errors"): Promise<unknown> {
  const url = new URL(`../../../../packages/contract/fixtures/task-list/${name}.json`, import.meta.url)
  return JSON.parse(await readFile(url, "utf8")) as unknown
}

test("frontend whole-response schema accepts the canonical task-list fixtures directly", async () => {
  for (const name of ["ready", "empty", "partial", "stale"] as const) {
    assert.equal(taskListResponseSchema.safeParse(await fixture(name)).success, true, name)
  }
  const errors = await fixture("errors") as Record<string, unknown>
  assert.deepEqual(Object.keys(errors).sort(), ["400", "401", "403", "500", "502", "503", "504"])
  for (const [status, body] of Object.entries(errors)) {
    assert.equal(taskListResponseSchema.safeParse(body).success, true, status)
  }
})

test("task BFF forwards only frozen query parameters and server-approved scope", async () => {
  const ready = await fixture("ready")
  let target = ""
  let init: RequestInit | undefined
  const request = new Request(
    "http://localhost/api/internal/tasks?page=2&pageSize=50&q=%E7%A7%8B%E5%AD%A3%20%E6%8B%89%E6%96%B0&status=active&ownerUserId=00000000-0000-4000-8000-000000000001&periodFrom=2026-08-01&periodTo=2026-08-31&hasOpenWorkItems=false",
    {
      headers: {
        authorization: "Bearer forged-browser-token",
        "x-ka-workspace-id": "00000000-0000-4000-8000-000000000099",
        "x-ka-user-id": "forged-user",
        "x-ka-account-scope": "forged-scope",
        "x-ka-source": "ka_data",
      },
    },
  )
  const result = await handleTaskListRequest(request, {
    environment,
    approvedAuthContextResolver: async () => authContext,
    requestId: () => "bff-task-list-001",
    fetchImpl: async (input, requestInit) => {
      target = input
      init = requestInit
      return Response.json(ready)
    },
  })

  const url = new URL(target)
  assert.equal(url.origin, "https://ka-data.internal.example")
  assert.equal(url.pathname, "/api/v1/tasks")
  assert.deepEqual(Object.fromEntries(url.searchParams), {
    page: "2",
    pageSize: "50",
    q: "秋季 拉新",
    status: "active",
    ownerUserId: "00000000-0000-4000-8000-000000000001",
    periodFrom: "2026-08-01",
    periodTo: "2026-08-31",
    hasOpenWorkItems: "false",
  })
  const headers = new Headers(init?.headers)
  assert.equal(init?.method, "GET")
  assert.equal(headers.get("authorization"), `Bearer ${SERVICE_TOKEN}`)
  assert.equal(headers.get("x-request-id"), "bff-task-list-001")
  assert.equal(headers.get("x-ka-workspace-id"), authContext.workspaceId)
  assert.equal(headers.get("x-ka-user-id"), authContext.userId)
  assert.deepEqual(
    JSON.parse(Buffer.from(headers.get("x-ka-account-scope") ?? "", "base64url").toString("utf8")),
    authContext.allowedAccounts,
  )
  assert.equal(headers.has("x-ka-source"), false)
  assert.equal(result.status, 200)
  assert.deepEqual(result.body, ready)
})

test("task BFF rejects unknown, duplicate, malformed, and inverted query parameters before upstream", async () => {
  const searches = [
    "workspaceId=00000000-0000-4000-8000-000000000024",
    "dataSource=ka_data",
    "page=1&page=2",
    "page=0",
    "pageSize=101",
    "ownerUserId=not-a-uuid",
    "periodFrom=2026-02-31",
    "periodFrom=2026-09-01&periodTo=2026-08-01",
    "hasOpenWorkItems=1",
  ]
  for (const search of searches) {
    let called = false
    const result = await handleTaskListRequest(
      new Request(`http://localhost/api/internal/tasks?${search}`),
      {
        environment,
        approvedAuthContextResolver: async () => authContext,
        requestId: () => "bff-task-invalid",
        fetchImpl: async () => {
          called = true
          return Response.json({})
        },
      },
    )
    assert.equal(called, false, search)
    assert.equal(result.status, 400, search)
    assert.equal(result.body.ok ? "" : result.body.error.code, "INVALID_REQUEST", search)
  }
})

test("production task BFF preserves unauthenticated and forbidden fail-closed states", async () => {
  let called = false
  const dependencies = {
    environment,
    requestId: () => "bff-task-auth",
    fetchImpl: async () => {
      called = true
      return Response.json({})
    },
  }
  const unauthenticated = await handleTaskListRequest(
    new Request("http://localhost/api/internal/tasks"),
    { ...dependencies, approvedAuthContextResolver: async () => null },
  )
  assert.equal(unauthenticated.status, 401)
  assert.equal(unauthenticated.body.ok ? "" : unauthenticated.body.error.code, "UNAUTHORIZED")

  const forbidden = await handleTaskListRequest(
    new Request("http://localhost/api/internal/tasks"),
    {
      ...dependencies,
      approvedAuthContextResolver: async () => ({
        status: "rejected",
        httpStatus: 403,
        reason: "MEMBERSHIP_INACTIVE",
      }),
    },
  )
  assert.equal(forbidden.status, 403)
  assert.equal(forbidden.body.ok ? "" : forbidden.body.error.code, "FORBIDDEN")
  assert.equal(called, false)
})

test("development scope works only for literal development with an explicit server fixture", async () => {
  const development = {
    ...environment,
    NODE_ENV: "development",
    KA_DATA_DEV_AUTH_CONTEXT_ENABLED: "true",
    KA_DATA_DEV_WORKSPACE_ID: authContext.workspaceId,
    KA_DATA_DEV_USER_ID: authContext.userId,
    KA_DATA_DEV_ACCOUNT_SCOPE_JSON: JSON.stringify(authContext.allowedAccounts),
  }
  let calls = 0
  const ready = await fixture("ready")
  const accepted = await handleTaskListRequest(new Request("http://localhost/api/internal/tasks"), {
    environment: development,
    approvedAuthContextResolver: async () => null,
    fetchImpl: async () => {
      calls += 1
      return Response.json(ready)
    },
  })
  assert.equal(accepted.status, 200)

  const rejected = await handleTaskListRequest(new Request("http://localhost/api/internal/tasks"), {
    environment: { ...development, NODE_ENV: "Development" },
    approvedAuthContextResolver: async () => null,
    fetchImpl: async () => {
      calls += 1
      return Response.json(ready)
    },
  })
  assert.equal(rejected.status, 401)
  assert.equal(calls, 1)
})

test("task BFF rejects declared and streamed bodies at the exact 16 MB boundary", async () => {
  const request = new Request("http://localhost/api/internal/tasks")
  const base = {
    environment,
    approvedAuthContextResolver: async () => authContext,
    requestId: () => "bff-task-boundary",
  }
  const declared = await handleTaskListRequest(request, {
    ...base,
    fetchImpl: async () => new Response("{}", { headers: { "content-length": String(MAX_UPSTREAM_BODY_BYTES) } }),
  })
  assert.equal(declared.status, 502)
  assert.match(declared.body.ok ? "" : declared.body.error.message, /16\s?MB/i)

  const streamed = await handleTaskListRequest(request, {
    ...base,
    fetchImpl: async () => new Response(new Uint8Array(MAX_UPSTREAM_BODY_BYTES)),
  })
  assert.equal(streamed.status, 502)
  assert.match(streamed.body.ok ? "" : streamed.body.error.message, /16\s?MB/i)
})

test("task BFF rejects unknown response fields and upstream status-envelope mismatches", async () => {
  const ready = await fixture("ready") as Record<string, unknown>
  const request = new Request("http://localhost/api/internal/tasks")
  const dependencies = {
    environment,
    approvedAuthContextResolver: async () => authContext,
    requestId: () => "bff-task-strict",
  }
  const extraField = await handleTaskListRequest(request, {
    ...dependencies,
    fetchImpl: async () => Response.json({ ...ready, browserDefault: true }),
  })
  assert.equal(extraField.status, 502)
  assert.equal(extraField.body.ok ? "" : extraField.body.error.code, "UPSTREAM_INVALID_RESPONSE")

  const wrongStatus = await handleTaskListRequest(request, {
    ...dependencies,
    fetchImpl: async () => Response.json(ready, { status: 503 }),
  })
  assert.equal(wrongStatus.status, 502)
})

test("task BFF preserves canonical upstream error status and requestId", async () => {
  const errors = await fixture("errors") as Record<string, unknown>
  for (const status of [400, 401, 403, 500, 502, 503, 504]) {
    const result = await handleTaskListRequest(new Request("http://localhost/api/internal/tasks"), {
      environment,
      approvedAuthContextResolver: async () => authContext,
      fetchImpl: async () => Response.json(errors[String(status)], { status }),
    })
    assert.equal(result.status, status)
    assert.deepEqual(result.body, errors[String(status)])
  }
})

test("task BFF separates upstream timeout from source unavailability", async () => {
  const request = new Request("http://localhost/api/internal/tasks")
  const base = {
    environment,
    approvedAuthContextResolver: async () => authContext,
    requestId: () => "bff-task-failure",
  }
  const timeout = await handleTaskListRequest(request, {
    ...base,
    fetchImpl: async () => { throw new DOMException("timed out", "TimeoutError") },
  })
  assert.equal(timeout.status, 504)
  assert.equal(timeout.body.ok ? "" : timeout.body.error.code, "UPSTREAM_TIMEOUT")

  const unavailable = await handleTaskListRequest(request, {
    ...base,
    fetchImpl: async () => { throw new Error("connection refused") },
  })
  assert.equal(unavailable.status, 503)
  assert.equal(unavailable.body.ok ? "" : unavailable.body.error.code, "SOURCE_UNAVAILABLE")
})
