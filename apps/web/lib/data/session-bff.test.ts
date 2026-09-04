import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

import { MAX_UPSTREAM_BODY_BYTES } from "./bounded-response.ts"
import { handleSessionRequest } from "./session-bff.ts"
import {
  sessionErrorResponseSchema,
  sessionHttpResponseSchema,
  type SessionHttpResponse,
} from "./session-contracts.ts"

const SERVICE_TOKEN = "server-secret-000000000000000000000000"
const environment = {
  NODE_ENV: "production",
  KA_DATA_BACKEND_ORIGIN: "https://data-api.internal.example",
  KA_DATA_SERVICE_TOKEN: SERVICE_TOKEN,
}
const SESSION_TOKEN = "session-token-00000000000000000000000000000001"
const NEXT_TOKEN = "session-token-00000000000000000000000000000002"
const PERSONAL_WORKSPACE_ID = "00000000-0000-4000-8000-000000000801"
const TEAM_WORKSPACE_ID = "00000000-0000-4000-8000-000000000802"

async function canonicalFixture(name: "personal" | "team" | "logout" | "errors"): Promise<unknown> {
  const path = new URL(`../../../../packages/contract/fixtures/session-http/${name}.json`, import.meta.url)
  return JSON.parse(await readFile(path, "utf8")) as unknown
}

function correlate(payload: unknown, requestId: string): SessionHttpResponse {
  const copy = structuredClone(payload) as Record<string, unknown>
  const container = copy.ok === true ? copy.meta : copy.error
  assert.equal(typeof container, "object")
  ;(container as Record<string, unknown>).requestId = requestId
  return sessionHttpResponseSchema.parse(copy)
}

function upstream(
  payload: SessionHttpResponse,
  requestId: string,
  options: { status?: number; setCookie?: string; headerRequestId?: string | null } = {},
): Response {
  const headers = new Headers({ "content-type": "application/json" })
  if (options.headerRequestId !== null) {
    headers.set("x-request-id", options.headerRequestId ?? requestId)
  }
  if (options.setCookie !== undefined) headers.set("set-cookie", options.setCookie)
  return new Response(JSON.stringify(payload), { status: options.status ?? (payload.ok ? 200 : 401), headers })
}

function activeCookie(token = NEXT_TOKEN): string {
  return `ka_session=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=28800`
}

function clearedCookie(): string {
  return "ka_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0"
}

test("frontend session mirror accepts every canonical fixture", async () => {
  for (const name of ["personal", "team", "logout"] as const) {
    assert.equal(sessionHttpResponseSchema.safeParse(await canonicalFixture(name)).success, true, name)
  }
  const errors = await canonicalFixture("errors") as Record<string, unknown>
  for (const [status, body] of Object.entries(errors)) {
    assert.equal(sessionErrorResponseSchema.safeParse(body).success, true, status)
  }
})

test("login forwards only fixed server headers and relays a validated HttpOnly cookie", async () => {
  const requestId = "bff-login-001"
  const personal = correlate(await canonicalFixture("personal"), requestId)
  let url = ""
  let init: RequestInit | undefined
  const result = await handleSessionRequest("login", new Request("http://localhost/api/internal/auth/login", {
    method: "POST",
    headers: {
      cookie: `ka_session=${SESSION_TOKEN}`,
      "content-type": "application/json",
      "x-ka-workspace-id": TEAM_WORKSPACE_ID,
      "x-ka-user-id": "browser-forged",
      "x-ka-account-scope": "all",
      authorization: "Bearer browser-forged",
    },
    body: JSON.stringify({ provider: "internal_test", username: "demo.user", password: "fixture-password" }),
  }), {
    environment,
    requestId: () => requestId,
    fetchImpl: async (input, requestInit) => {
      url = String(input)
      init = requestInit
      return upstream(personal, requestId, { setCookie: activeCookie() })
    },
  })

  assert.equal(result.status, 200)
  assert.equal(result.setCookie, activeCookie())
  assert.equal(url, "https://data-api.internal.example/api/v1/auth/login")
  const headers = new Headers(init?.headers)
  assert.equal(headers.get("authorization"), `Bearer ${SERVICE_TOKEN}`)
  assert.equal(headers.get("x-request-id"), requestId)
  assert.equal(headers.has("cookie"), false)
  assert.equal([...headers.keys()].some((name) => name.startsWith("x-ka-")), false)
})

test("session and workspace switch forward one normalized ka_session and no browser scope", async () => {
  const personalRequestId = "bff-session-001"
  const personal = correlate(await canonicalFixture("personal"), personalRequestId)
  let sessionHeaders = new Headers()
  const current = await handleSessionRequest("session", new Request("http://localhost/api/internal/auth/session", {
    headers: {
      cookie: `analytics=ignored; ka_session=${SESSION_TOKEN}; preference=ignored`,
      "x-ka-workspace-id": TEAM_WORKSPACE_ID,
      "x-ka-account-scope": "all",
    },
  }), {
    environment,
    requestId: () => personalRequestId,
    fetchImpl: async (_input, init) => {
      sessionHeaders = new Headers(init?.headers)
      return upstream(personal, personalRequestId)
    },
  })
  assert.equal(current.status, 200)
  assert.equal(sessionHeaders.get("cookie"), `ka_session=${SESSION_TOKEN}`)
  assert.equal([...sessionHeaders.keys()].some((name) => name.startsWith("x-ka-")), false)

  const switchRequestId = "bff-switch-001"
  const team = correlate(await canonicalFixture("team"), switchRequestId)
  let switchBody = ""
  const switched = await handleSessionRequest("workspace", new Request("http://localhost/api/internal/auth/workspace", {
    method: "POST",
    headers: { cookie: `ka_session=${SESSION_TOKEN}`, "content-type": "application/json" },
    body: JSON.stringify({ workspaceId: TEAM_WORKSPACE_ID }),
  }), {
    environment,
    requestId: () => switchRequestId,
    fetchImpl: async (_input, init) => {
      switchBody = String(init?.body)
      return upstream(team, switchRequestId, { setCookie: activeCookie(NEXT_TOKEN) })
    },
  })
  assert.equal(switched.status, 200)
  assert.deepEqual(JSON.parse(switchBody), { workspaceId: TEAM_WORKSPACE_ID })
  assert.equal(switched.setCookie, activeCookie(NEXT_TOKEN))
  assert.equal(
    switched.body.ok && "activeWorkspace" in switched.body.data
      ? switched.body.data.activeWorkspace.kind
      : null,
    "team",
  )
})

test("logout is idempotent without a cookie and relays only a clearing cookie", async () => {
  const requestId = "bff-logout-001"
  const logout = correlate(await canonicalFixture("logout"), requestId)
  let headers = new Headers()
  const result = await handleSessionRequest("session", new Request("http://localhost/api/internal/auth/session", {
    method: "DELETE",
  }), {
    environment,
    requestId: () => requestId,
    fetchImpl: async (_input, init) => {
      headers = new Headers(init?.headers)
      return upstream(logout, requestId, { setCookie: clearedCookie() })
    },
  })
  assert.equal(result.status, 200)
  assert.equal(headers.has("cookie"), false)
  assert.equal(result.setCookie, clearedCookie())
})

test("missing and duplicate cookies fail closed before an authenticated upstream read", async () => {
  let calls = 0
  for (const cookie of [undefined, `ka_session=${SESSION_TOKEN}; ka_session=${NEXT_TOKEN}`]) {
    const headers = cookie === undefined ? undefined : { cookie }
    const result = await handleSessionRequest("session", new Request("http://localhost/api/internal/auth/session", { headers }), {
      environment,
      fetchImpl: async () => {
        calls += 1
        return Response.json({})
      },
    })
    assert.equal(result.status, 401)
    assert.equal(result.body.ok ? "" : result.body.error.code, "UNAUTHORIZED")
  }
  assert.equal(calls, 0)
})

test("an old structurally valid token is forwarded and the correlated upstream 401 is preserved", async () => {
  const requestId = "bff-old-token-001"
  const errors = await canonicalFixture("errors") as Record<string, unknown>
  const unauthorized = correlate(errors["401"], requestId)
  let cookie = ""
  const result = await handleSessionRequest("session", new Request("http://localhost/api/internal/auth/session", {
    headers: { cookie: `ka_session=${SESSION_TOKEN}` },
  }), {
    environment,
    requestId: () => requestId,
    fetchImpl: async (_input, init) => {
      cookie = new Headers(init?.headers).get("cookie") ?? ""
      return upstream(unauthorized, requestId, { status: 401 })
    },
  })
  assert.equal(cookie, `ka_session=${SESSION_TOKEN}`)
  assert.equal(result.status, 401)
  assert.equal(result.body.ok ? "" : result.body.error.requestId, requestId)
})

test("requestId, status, response kind and Set-Cookie mismatches become local 502", async () => {
  const requestId = "bff-session-invalid-001"
  const personal = correlate(await canonicalFixture("personal"), requestId)
  const request = () => new Request("http://localhost/api/internal/auth/session", {
    headers: { cookie: `ka_session=${SESSION_TOKEN}` },
  })
  const scenarios = [
    upstream(personal, requestId, { headerRequestId: null }),
    upstream(personal, requestId, { headerRequestId: "other-request-id" }),
    upstream(correlate(await canonicalFixture("personal"), "other-request-id"), requestId),
    upstream(personal, requestId, { status: 403 }),
    upstream(personal, requestId, { setCookie: activeCookie() }),
  ]
  for (const response of scenarios) {
    const result = await handleSessionRequest("session", request(), {
      environment,
      requestId: () => requestId,
      fetchImpl: async () => response.clone(),
    })
    assert.equal(result.status, 502)
    assert.equal(result.body.ok ? "" : result.body.error.code, "UPSTREAM_INVALID_RESPONSE")
    assert.equal(result.body.ok ? "" : result.body.error.requestId, requestId)
  }
})

test("active session cookies require Path, HttpOnly, Secure, SameSite=Lax and a positive Max-Age", async () => {
  const requestId = "bff-cookie-policy-001"
  const personal = correlate(await canonicalFixture("personal"), requestId)
  const invalidCookies = [
    `ka_session=${NEXT_TOKEN}; Path=/; Secure; SameSite=Lax; Max-Age=28800`,
    `ka_session=${NEXT_TOKEN}; Path=/; HttpOnly; SameSite=Lax; Max-Age=28800`,
    `ka_session=${NEXT_TOKEN}; Path=/; HttpOnly; Secure; SameSite=None; Max-Age=28800`,
    `ka_session=${NEXT_TOKEN}; Path=/; HttpOnly; Secure; SameSite=Lax; Domain=example.com; Max-Age=28800`,
    `ka_session=${NEXT_TOKEN}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`,
  ]
  for (const setCookie of invalidCookies) {
    const result = await handleSessionRequest("login", new Request("http://localhost/api/internal/auth/login", {
      method: "POST",
      body: JSON.stringify({ provider: "internal_test", username: "demo", password: "password" }),
    }), {
      environment,
      requestId: () => requestId,
      fetchImpl: async () => upstream(personal, requestId, { setCookie }),
    })
    assert.equal(result.status, 502, setCookie)
    assert.equal(result.setCookie, undefined)
  }
})

test("session BFF rejects declared and streamed responses at the exact 16 MB boundary", async () => {
  const request = new Request("http://localhost/api/internal/auth/session", {
    headers: { cookie: `ka_session=${SESSION_TOKEN}` },
  })
  const base = { environment, requestId: () => "bff-session-boundary" }
  const declared = await handleSessionRequest("session", request, {
    ...base,
    fetchImpl: async () => new Response("{}", {
      headers: {
        "content-length": String(MAX_UPSTREAM_BODY_BYTES),
        "x-request-id": "bff-session-boundary",
      },
    }),
  })
  assert.equal(declared.status, 502)

  const streamed = await handleSessionRequest("session", request, {
    ...base,
    fetchImpl: async () => new Response(new Uint8Array(MAX_UPSTREAM_BODY_BYTES), {
      headers: { "x-request-id": "bff-session-boundary" },
    }),
  })
  assert.equal(streamed.status, 502)
})

test("invalid auth bodies and queries fail before contacting upstream", async () => {
  let calls = 0
  const requests = [
    ["login", new Request("http://localhost/api/internal/auth/login", { method: "POST", body: "{}" })],
    ["workspace", new Request("http://localhost/api/internal/auth/workspace?scope=all", {
      method: "POST",
      headers: { cookie: `ka_session=${SESSION_TOKEN}` },
      body: JSON.stringify({ workspaceId: PERSONAL_WORKSPACE_ID }),
    })],
  ] as const
  for (const [kind, request] of requests) {
    const result = await handleSessionRequest(kind, request, {
      environment,
      fetchImpl: async () => {
        calls += 1
        return Response.json({})
      },
    })
    assert.equal(result.status, 400)
  }
  assert.equal(calls, 0)
})
