import {
  bodyRequestId,
  createRequestId,
  hasCorrelatedRequestId,
  internalApiHeaders,
  isTimeoutCause,
  readBoundedJson,
  resolveInternalApiConfig,
  resolveSessionCookie,
  type FetchLike,
  type InternalApiEnvironment,
} from "./internal-api-bff.ts"
import {
  changeSetDetailResponseSchema,
  workItemDetailResponseSchema,
  type ChangeSetDetailResponse,
  type StableDataQueryError,
  type WorkItemDetailResponse,
} from "./contracts.ts"

export type ReadModelKind = "work-items" | "changesets"
type ReadModelResponse = WorkItemDetailResponse | ChangeSetDetailResponse
type ReadErrorCode = StableDataQueryError["code"] | "NOT_FOUND"
type Environment = InternalApiEnvironment & { KA_READ_MODEL_DETAILS_ENABLED?: string }
type Dependencies = {
  environment: Environment & Record<string, string | undefined>
  fetchImpl?: FetchLike
  requestId?: () => string
  /** Deprecated seam accepted only so old callers fail closed during migration. */
  approvedAuthContextResolver?: unknown
}
export type ReadModelBffResult = { status: number; body: ReadModelResponse; requestId: string }

function error(code: ReadErrorCode, message: string, retryable: boolean, requestId: string): ReadModelResponse {
  return { ok: false, error: { code, message, retryable, requestId } } as ReadModelResponse
}

function validId(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)
}

function expectedStatus(response: ReadModelResponse): number {
  if (response.ok) return 200
  if (response.error.code === "UNAUTHORIZED") return 401
  if (response.error.code === "FORBIDDEN") return 403
  if (response.error.code === "NOT_FOUND") return 404
  if (response.error.code === "SOURCE_TRUNCATED" || response.error.code === "UPSTREAM_INVALID_RESPONSE") return 502
  if (response.error.code === "SOURCE_UNAVAILABLE" || response.error.code === "UPSTREAM_TIMEOUT") return 503
  if (response.error.code === "INTERNAL_ERROR") return 500
  return 400
}

type LegacyScope = { workspaceId: string; allowedAccounts: { media: string; accountId: string }[] }

async function legacyScope(dependencies: Dependencies): Promise<LegacyScope | null> {
  if (typeof dependencies.approvedAuthContextResolver !== "function") return null
  try {
    const value = await (dependencies.approvedAuthContextResolver as () => Promise<unknown>)()
    if (typeof value !== "object" || value === null || !("workspaceId" in value) || !("allowedAccounts" in value)) return null
    return value as LegacyScope
  } catch {
    return null
  }
}

export async function handleReadModelRequest(
  kind: ReadModelKind,
  id: string,
  request: Request,
  dependencies: Dependencies,
): Promise<ReadModelBffResult> {
  const requestId = createRequestId(dependencies.requestId)
  if (dependencies.environment.KA_READ_MODEL_DETAILS_ENABLED !== "true") return { status: 503, body: error("SOURCE_UNAVAILABLE", "Read-only detail API is not integrated yet", true, requestId), requestId }
  if (!validId(id)) return { status: 400, body: error("INVALID_REQUEST", "Invalid read-model request", false, requestId), requestId }
  const session = resolveSessionCookie(request)
  if (session.status !== "valid") return { status: 401, body: error("UNAUTHORIZED", "A valid session cookie is required", false, requestId), requestId }
  const config = resolveInternalApiConfig(dependencies.environment)
  if (config === null) return { status: 503, body: error("INTERNAL_ERROR", "Read-model upstream is not configured safely", false, requestId), requestId }

  try {
    const upstream = await (dependencies.fetchImpl ?? fetch)(`${config.origin}/api/v1/${kind}/${id}`, {
      method: "GET",
      headers: internalApiHeaders({ config, requestId, session }),
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    })
    if (!hasCorrelatedRequestId(upstream, requestId)) return { status: 502, body: error("UPSTREAM_INVALID_RESPONSE", "Read-only detail response requestId did not match the BFF request", false, requestId), requestId }
    const payload = await readBoundedJson(upstream)
    if (payload === null) return { status: 502, body: error("UPSTREAM_INVALID_RESPONSE", "Read-only detail response reached the 16 MB truncation boundary", false, requestId), requestId }
    const parsed = (kind === "work-items" ? workItemDetailResponseSchema : changeSetDetailResponseSchema).safeParse(payload)
    if (!parsed.success) return { status: 502, body: error("UPSTREAM_INVALID_RESPONSE", "Read-only detail response did not match the canonical contract", false, requestId), requestId }
    const response = parsed.data as ReadModelResponse
    if (!response.ok && bodyRequestId(response) !== requestId) return { status: 502, body: error("UPSTREAM_INVALID_RESPONSE", "Read-only detail error requestId did not match the BFF request", false, requestId), requestId }
    if (upstream.status !== expectedStatus(response)) return { status: 502, body: error("UPSTREAM_INVALID_RESPONSE", "Read-only detail status did not match the canonical contract", false, requestId), requestId }
    if (response.ok) {
      const record = response.data.kind === "work_item" ? response.data.workItem : response.data.changeset
      if (record.id !== id) return { status: 502, body: error("UPSTREAM_INVALID_RESPONSE", "Read-only detail identity did not match the path", false, requestId), requestId }
      const scope = await legacyScope(dependencies)
      if (scope && record.workspaceId !== scope.workspaceId) return { status: 502, body: error("UPSTREAM_INVALID_RESPONSE", "Read-only detail identity did not match the legacy caller scope", false, requestId), requestId }
      if (scope && record.media !== null && record.accountId !== null && !scope.allowedAccounts.some((item) => item.media === record.media && item.accountId === record.accountId)) {
        return { status: 403, body: error("FORBIDDEN", "Read-only detail is outside the legacy caller scope", false, requestId), requestId }
      }
    }
    return { status: upstream.status, body: response, requestId }
  } catch (cause) {
    const timeout = isTimeoutCause(cause)
    return {
      status: timeout ? 504 : 503,
      body: error(timeout ? "UPSTREAM_TIMEOUT" : "SOURCE_UNAVAILABLE", timeout ? "Read-only detail query timed out" : "Read-only detail source is unavailable", true, requestId),
      requestId,
    }
  }
}
