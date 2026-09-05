import {
  bodyRequestId,
  createRequestId,
  hasCorrelatedRequestId,
  internalApiHeaders,
  isTimeoutCause,
  readBoundedJson,
  readBoundedRequestJson,
  resolveInternalApiConfig,
  resolveSessionCookie,
  type FetchLike,
  type InternalApiEnvironment,
} from "./internal-api-bff.ts"
import {
  dataQueryRequestSchema,
  dataQueryResponseSchema,
  type DataQueryResponse,
  type StableDataQueryError,
} from "./contracts.ts"

export const BACKEND_DATA_QUERY_PATH = "/api/v1/data/query"

type Dependencies = {
  environment: InternalApiEnvironment & Record<string, string | undefined>
  fetchImpl?: FetchLike
  requestId?: () => string
  /** Deprecated seam accepted only so old callers fail closed during migration. */
  approvedAuthContextResolver?: unknown
}

type ForwardDependencies = Omit<Dependencies, "environment"> & {
  environment?: InternalApiEnvironment & Record<string, string | undefined>
  backendOrigin: string
  serviceToken?: string
  sessionCookie?: string
  /** Legacy test-only scope guard; production routes never provide it. */
  authContext?: { workspaceId: string; allowedAccounts: { media: string; accountId: string }[] }
}

export type BffResult = { status: number; body: DataQueryResponse; requestId: string }

function error(code: StableDataQueryError["code"], message: string, retryable: boolean, requestId: string): DataQueryResponse {
  return { ok: false, error: { code, message, retryable, requestId } }
}

function expectedStatus(response: DataQueryResponse): number {
  if (response.ok) return 200
  const code = response.error.code
  if (code === "UNAUTHORIZED") return 401
  if (code === "FORBIDDEN") return 403
  if (code === "QUERY_NOT_ALLOWED") return 404
  if (code === "VIEW_UNSUPPORTED") return 422
  if (code === "SOURCE_UNAVAILABLE" || code === "UPSTREAM_TIMEOUT") return 503
  if (code === "SOURCE_TRUNCATED" || code === "UPSTREAM_INVALID_RESPONSE") return 502
  if (code === "INTERNAL_ERROR") return 500
  return 400
}

export async function handleDataQueryRequest(request: Request, dependencies: Dependencies): Promise<BffResult> {
  const requestId = createRequestId(dependencies.requestId)
  const input = await readBoundedRequestJson(request)
  const parsed = dataQueryRequestSchema.safeParse(input)
  if (!parsed.success) return { status: 400, body: error("INVALID_REQUEST", "Invalid canonical data query request", false, requestId), requestId }

  const session = resolveSessionCookie(request)
  if (session.status !== "valid") return { status: 401, body: error("UNAUTHORIZED", "A valid session cookie is required", false, requestId), requestId }

  const config = resolveInternalApiConfig(dependencies.environment)
  if (config === null) return { status: 503, body: error("INTERNAL_ERROR", "Data query upstream is not configured safely", false, requestId), requestId }

  // Ordinary pages are platform-only. Browser input cannot grant diagnostic access.
  const upstreamRequest = { ...parsed.data, dataView: "platform" as const }
  try {
    const upstream = await (dependencies.fetchImpl ?? fetch)(`${config.origin}${BACKEND_DATA_QUERY_PATH}`, {
      method: "POST",
      headers: internalApiHeaders({ config, requestId, session, json: true }),
      body: JSON.stringify(upstreamRequest),
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    })
    if (!hasCorrelatedRequestId(upstream, requestId)) return { status: 502, body: error("UPSTREAM_INVALID_RESPONSE", "Data query response requestId did not match the BFF request", false, requestId), requestId }
    const payload = await readBoundedJson(upstream)
    if (payload === null) return { status: 502, body: error("UPSTREAM_INVALID_RESPONSE", "Data query response reached the 16 MB truncation boundary", false, requestId), requestId }
    const envelope = dataQueryResponseSchema.safeParse(payload)
    if (!envelope.success) return { status: 502, body: error("UPSTREAM_INVALID_RESPONSE", "Data query response did not match the canonical contract", false, requestId), requestId }
    if (!envelope.data.ok && bodyRequestId(envelope.data) !== requestId) return { status: 502, body: error("UPSTREAM_INVALID_RESPONSE", "Data query error requestId did not match the BFF request", false, requestId), requestId }
    if (upstream.status !== expectedStatus(envelope.data)) return { status: 502, body: error("UPSTREAM_INVALID_RESPONSE", "Data query status did not match the canonical contract", false, requestId), requestId }
    if (envelope.data.ok) {
      if (envelope.data.data.mode !== "platform") return { status: 502, body: error("UPSTREAM_INVALID_RESPONSE", "Ordinary data query returned a non-platform view", false, requestId), requestId }
      if (envelope.data.data.source.queryId !== upstreamRequest.queryId) return { status: 502, body: error("UPSTREAM_INVALID_RESPONSE", "Data query response queryId did not match the request", false, requestId), requestId }
    }
    return { status: upstream.status, body: envelope.data, requestId }
  } catch (cause) {
    const timeout = isTimeoutCause(cause)
    return {
      status: timeout ? 504 : 503,
      body: error(timeout ? "UPSTREAM_TIMEOUT" : "SOURCE_UNAVAILABLE", timeout ? "Data query timed out" : "Data query source is unavailable", true, requestId),
      requestId,
    }
  }
}

export async function forwardDataQuery(input: unknown, dependencies: ForwardDependencies): Promise<BffResult> {
  const request = new Request("http://localhost/api/internal/data-query", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(dependencies.sessionCookie === undefined ? {} : { cookie: `ka_session=${dependencies.sessionCookie}` }),
    },
    body: JSON.stringify(input),
  })
  const response = await handleDataQueryRequest(request, {
    environment: {
      ...dependencies.environment,
      KA_DATA_BACKEND_ORIGIN: dependencies.backendOrigin,
      KA_DATA_SERVICE_TOKEN: dependencies.serviceToken,
    },
    fetchImpl: dependencies.fetchImpl,
    requestId: dependencies.requestId,
  })
  if (response.body.ok && dependencies.authContext) {
    const source = response.body.data.mode === "reconcile" ? [] : response.body.data.source.rows
    const allowed = new Set(dependencies.authContext.allowedAccounts.map((item) => `${item.media}\u0000${item.accountId}`))
    const escaped = source.some((row) => "workspaceId" in row && (
      row.workspaceId !== dependencies.authContext?.workspaceId ||
      typeof row.media !== "string" ||
      typeof row.accountId !== "string" ||
      !allowed.has(`${row.media}\u0000${row.accountId}`)
    ))
    if (escaped) return { status: 502, body: error("UPSTREAM_INVALID_RESPONSE", "Legacy scoped caller received a row outside its approved scope", false, response.requestId), requestId: response.requestId }
  }
  return response
}
