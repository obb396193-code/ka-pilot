import {
  sessionHttpResponseSchema,
  type LoginRequest,
  type SessionHttpResponse,
  type WorkspaceSwitchRequest,
} from "./session-contracts.ts"

export const WORKSPACE_SESSION_CHANGED_EVENT = "ka:workspace-session-changed"

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>

async function requestSession(path: string, init: RequestInit, fetchImpl: FetchLike): Promise<SessionHttpResponse> {
  const response = await fetchImpl(path, { ...init, cache: "no-store", credentials: "same-origin" })
  return sessionHttpResponseSchema.parse(await response.json())
}

export function readSession(fetchImpl: FetchLike = fetch): Promise<SessionHttpResponse> {
  return requestSession("/api/internal/auth/session", { method: "GET" }, fetchImpl)
}

export function readWorkspaces(fetchImpl: FetchLike = fetch): Promise<SessionHttpResponse> {
  return requestSession("/api/internal/auth/workspaces", { method: "GET" }, fetchImpl)
}

export function loginSession(input: LoginRequest, fetchImpl: FetchLike = fetch): Promise<SessionHttpResponse> {
  return requestSession("/api/internal/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  }, fetchImpl)
}

export async function switchWorkspace(input: WorkspaceSwitchRequest, fetchImpl: FetchLike = fetch): Promise<SessionHttpResponse> {
  const response = await requestSession("/api/internal/auth/workspace", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  }, fetchImpl)
  if (response.ok && "activeWorkspace" in response.data && typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(WORKSPACE_SESSION_CHANGED_EVENT, {
      detail: { workspaceId: response.data.activeWorkspace.id },
    }))
  }
  return response
}

export async function logoutSession(fetchImpl: FetchLike = fetch): Promise<SessionHttpResponse> {
  const response = await requestSession("/api/internal/auth/session", { method: "DELETE" }, fetchImpl)
  if (response.ok && typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(WORKSPACE_SESSION_CHANGED_EVENT, { detail: { workspaceId: null } }))
  }
  return response
}
