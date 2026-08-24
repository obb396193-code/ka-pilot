import { randomUUID } from "node:crypto"

import { internalServiceTokenSchema, resolveServerAuthContext, type ApprovedAuthContextResolver, type DataQueryServerEnvironment, type ServerAuthContext } from "./auth-context.ts"
import { readBoundedResponseBody } from "./bounded-response.ts"
import { changeSetDetailResponseSchema, stableDataQueryErrorSchema, workItemDetailResponseSchema, type ChangeSetDetailResponse, type StableDataQueryError, type WorkItemDetailResponse } from "./contracts.ts"

export type ReadModelKind = "work-items" | "changesets"
type ReadModelResponse = WorkItemDetailResponse | ChangeSetDetailResponse
type FetchLike = (input: string, init?: RequestInit) => Promise<Response>
type Environment = DataQueryServerEnvironment & { KA_READ_MODEL_DETAILS_ENABLED?: string }
type Dependencies = { environment: Environment; approvedAuthContextResolver: ApprovedAuthContextResolver; fetchImpl?: FetchLike; requestId?: () => string }
export type ReadModelBffResult = { status: number; body: ReadModelResponse }

function error(code: StableDataQueryError["code"], message: string, retryable: boolean, requestId: string): ReadModelResponse {
  return { ok: false, error: stableDataQueryErrorSchema.parse({ code, message, retryable, requestId }) }
}

function endpoint(originValue: string, kind: ReadModelKind, id: string): string | null {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(id)) return null
  try {
    const origin = new URL(originValue)
    if (!["https:", "http:"].includes(origin.protocol) || origin.username || origin.password || origin.search || origin.hash || (origin.pathname !== "/" && origin.pathname !== "")) return null
    return `${origin.origin}/api/v1/${kind}/${id}`
  } catch { return null }
}

function headers(auth: ServerAuthContext, token: string, requestId: string): Headers {
  return new Headers({
    accept: "application/json",
    authorization: `Bearer ${token}`,
    "x-request-id": requestId,
    "x-ka-workspace-id": auth.workspaceId,
    "x-ka-user-id": auth.userId,
    "x-ka-account-scope": Buffer.from(JSON.stringify(auth.allowedAccounts)).toString("base64url"),
  })
}

function workItemBelongsToScope(response: WorkItemDetailResponse, id: string, auth: ServerAuthContext): "valid" | "identity_mismatch" | "scope_mismatch" {
  if (!response.ok) return "valid"
  if (response.data.findingId !== id) return "identity_mismatch"
  if (response.data.media === null || !auth.allowedAccounts.some((account) => account.media === response.data.media && account.accountId === response.data.accountId)) return "scope_mismatch"
  return "valid"
}

function changeSetIdentity(response: ChangeSetDetailResponse, id: string): "valid" | "identity_mismatch" | "scope_unprovable" {
  if (!response.ok) return "valid"
  if (response.data.changeSetId !== id) return "identity_mismatch"
  // The candidate response has accountId but no media/workspace tuple. Keep the gate off
  // until the backend GET contract exposes enough identity to prove approved scope.
  return "scope_unprovable"
}

export async function handleReadModelRequest(kind: ReadModelKind, id: string, dependencies: Dependencies): Promise<ReadModelBffResult> {
  const requestId = (dependencies.requestId ?? randomUUID)()
  if (dependencies.environment.KA_READ_MODEL_DETAILS_ENABLED !== "true") return { status: 503, body: error("SOURCE_UNAVAILABLE", "Read-only detail API is not integrated yet", true, requestId) }
  const target = endpoint(dependencies.environment.KA_DATA_BACKEND_ORIGIN ?? "", kind, id)
  if (target === null) return { status: 400, body: error("INVALID_REQUEST", "Invalid read-model request", false, requestId) }
  const auth = await resolveServerAuthContext({ environment: dependencies.environment, approvedAuthContextResolver: dependencies.approvedAuthContextResolver })
  if (auth === null) return { status: 403, body: error("FORBIDDEN", "Approved server-side account scope is unavailable", false, requestId) }
  const token = internalServiceTokenSchema.safeParse(dependencies.environment.KA_DATA_SERVICE_TOKEN?.trim())
  if (!token.success) return { status: 503, body: error("INTERNAL_ERROR", "Data query service credential must contain at least 32 characters", false, requestId) }
  try {
    const upstream = await (dependencies.fetchImpl ?? fetch)(target, { method: "GET", headers: headers(auth, token.data, requestId), redirect: "error", cache: "no-store", signal: AbortSignal.timeout(10_000) })
    const bytes = await readBoundedResponseBody(upstream)
    if (bytes === null) return { status: 502, body: error("UPSTREAM_INVALID_RESPONSE", "Read-only detail response reached the 16 MB truncation boundary", false, requestId) }
    let payload: unknown
    try { payload = JSON.parse(new TextDecoder().decode(bytes)) } catch { return { status: 502, body: error("UPSTREAM_INVALID_RESPONSE", "Read-only detail source returned a non-JSON response", false, requestId) } }
    const parsed = (kind === "work-items" ? workItemDetailResponseSchema : changeSetDetailResponseSchema).safeParse(payload)
    if (!parsed.success) return { status: 502, body: error("UPSTREAM_INVALID_RESPONSE", "Read-only detail response did not match the candidate contract", false, requestId) }
    if (kind === "work-items") {
      const scope = workItemBelongsToScope(parsed.data as WorkItemDetailResponse, id, auth)
      if (scope === "identity_mismatch") return { status: 502, body: error("UPSTREAM_INVALID_RESPONSE", "Work-item response identity did not match the path", false, requestId) }
      if (scope === "scope_mismatch") return { status: 403, body: error("FORBIDDEN", "Work-item response is outside the approved account scope", false, requestId) }
    } else {
      const identity = changeSetIdentity(parsed.data as ChangeSetDetailResponse, id)
      if (identity === "identity_mismatch") return { status: 502, body: error("UPSTREAM_INVALID_RESPONSE", "Change-set response identity did not match the path", false, requestId) }
      if (identity === "scope_unprovable") return { status: 502, body: error("UPSTREAM_INVALID_RESPONSE", "Change-set response does not expose the media identity required for scope proof", false, requestId) }
    }
    return { status: upstream.status, body: parsed.data }
  } catch (cause) {
    const timeout = cause instanceof DOMException && cause.name === "AbortError"
    return { status: timeout ? 504 : 502, body: error(timeout ? "UPSTREAM_TIMEOUT" : "SOURCE_UNAVAILABLE", timeout ? "Read-only detail query timed out" : "Read-only detail source is unavailable", true, requestId) }
  }
}
