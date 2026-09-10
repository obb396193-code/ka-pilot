import assert from "node:assert/strict"
import test from "node:test"

import { loginSession, logoutSession, readSession, readWorkspaces, switchWorkspace } from "./session-client.ts"

const PERSONAL_WORKSPACE_ID = "00000000-0000-4000-8000-000000000801"
const response = {
  ok: true as const,
  data: {
    identity: { id: "00000000-0000-4000-8000-0000000000e1", provider: "internal_test", displayName: "内测用户甲", mustChangePassword: false },
    activeWorkspace: { id: PERSONAL_WORKSPACE_ID, name: "我的工作台", kind: "personal" as const, role: "admin" as const, readOnly: false , isDemo: false},
    workspaces: [{ id: PERSONAL_WORKSPACE_ID, name: "我的工作台", kind: "personal" as const, role: "admin" as const, readOnly: false , isDemo: false}],
  },
  meta: { requestId: "session-client-001" },
}

test("session browser client uses only fixed same-origin paths and browser-managed credentials", async () => {
  const calls: { input: string; init?: RequestInit }[] = []
  const fetchImpl = async (input: string, init?: RequestInit) => {
    calls.push({ input, init })
    return Response.json(response)
  }
  await readSession(fetchImpl)
  await readWorkspaces(fetchImpl)
  await loginSession({ provider: "internal_test", username: "demo", password: "password" }, fetchImpl)
  await switchWorkspace({ workspaceId: PERSONAL_WORKSPACE_ID }, fetchImpl)
  await logoutSession(fetchImpl)

  assert.deepEqual(calls.map((call) => [call.input, call.init?.method]), [
    ["/api/internal/auth/session", "GET"],
    ["/api/internal/auth/workspaces", "GET"],
    ["/api/internal/auth/login", "POST"],
    ["/api/internal/auth/workspace", "POST"],
    ["/api/internal/auth/session", "DELETE"],
  ])
  for (const call of calls) {
    const headers = new Headers(call.init?.headers)
    assert.equal(call.init?.credentials, "same-origin")
    assert.equal(call.init?.cache, "no-store")
    assert.equal(headers.has("authorization"), false)
    assert.equal(headers.has("cookie"), false)
    assert.equal([...headers.keys()].some((name) => name.startsWith("x-ka-")), false)
  }
})
