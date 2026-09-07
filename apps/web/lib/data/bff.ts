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
import { handleSessionRequest } from "./session-bff.ts"
import { sessionSuccessResponseSchema } from "./session-contracts.ts"
import { semanticQueryRequestSchema } from "./semantic-query-request.ts"

export const BACKEND_DATA_QUERY_PATH = "/api/v1/data/query"
export const BACKEND_SEMANTIC_QUERY_PATH = "/api/v1/query"

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
  if (code === "VIEW_UNSUPPORTED" || code === "DIMENSION_UNSUPPORTED") return 422
  if (code === "SOURCE_UNAVAILABLE" || code === "UPSTREAM_TIMEOUT") return 503
  if (code === "SOURCE_TRUNCATED" || code === "UPSTREAM_INVALID_RESPONSE") return 502
  if (code === "INTERNAL_ERROR") return 500
  return 400
}

export async function handleDataQueryRequest(request: Request, dependencies: Dependencies): Promise<BffResult> {
  return handleQueryRequest(request, dependencies, "canonical")
}

export async function handleSemanticQueryRequest(request: Request, dependencies: Dependencies): Promise<BffResult> {
  return handleQueryRequest(request, dependencies, "semantic")
}

async function handleQueryRequest(request: Request, dependencies: Dependencies, syntax: "canonical" | "semantic"): Promise<BffResult> {
  const requestId = createRequestId(dependencies.requestId)
  if (request.method !== "POST") return { status: 405, body: error("INVALID_REQUEST", "Method is not allowed", false, requestId), requestId }
  if ([...new URL(request.url).searchParams].length) return { status: 400, body: error("INVALID_REQUEST", "Invalid data query parameters", false, requestId), requestId }
  const input = await readBoundedRequestJson(request)
  const parsed = (syntax === "semantic" ? semanticQueryRequestSchema : dataQueryRequestSchema).safeParse(input)
  if (!parsed.success) return { status: 400, body: error("INVALID_REQUEST", "Invalid canonical data query request", false, requestId), requestId }

  const session = resolveSessionCookie(request)
  if (session.status !== "valid") return { status: 401, body: error("UNAUTHORIZED", "A valid session cookie is required", false, requestId), requestId }

  const config = resolveInternalApiConfig(dependencies.environment)
  if (config === null) return { status: 503, body: error("INTERNAL_ERROR", "Data query upstream is not configured safely", false, requestId), requestId }

  // Resolve afresh with the same backend-issued cookie. No browser identity headers,
  // cached workspace, inferred role or local default can select a data source.
  const startedAt = Date.now()
  const current = await handleSessionRequest("session", new Request("http://localhost/api/internal/auth/session", {
    headers: { cookie: session.header },
  }), { environment: dependencies.environment, fetchImpl: dependencies.fetchImpl, requestId: () => requestId })
  if (!current.body.ok) return { status: current.status, body: current.body, requestId }
  const sessionView = sessionSuccessResponseSchema.safeParse(current.body)
  if (!sessionView.success) return { status: 502, body: error("UPSTREAM_INVALID_RESPONSE", "Session view did not match the canonical contract", false, requestId), requestId }
  const workspace = sessionView.data.data.activeWorkspace
  const expectedMode = workspace.kind === "personal" ? "platform" : "ka_data"
  const upstreamRequest = parsed.data
  try {
    const path = syntax === "semantic" ? BACKEND_SEMANTIC_QUERY_PATH : BACKEND_DATA_QUERY_PATH
    const upstream = await (dependencies.fetchImpl ?? fetch)(`${config.origin}${path}`, {
      method: "POST",
      headers: internalApiHeaders({ config, requestId, session, json: true }),
      body: JSON.stringify(upstreamRequest),
      redirect: "error",
      cache: "no-store",
      // Session + query share the original 10s budget (browser budget is 12s).
      signal: AbortSignal.timeout(Math.max(1, 10_000 - (Date.now() - startedAt))),
    })
    if (!hasCorrelatedRequestId(upstream, requestId)) return { status: 502, body: error("UPSTREAM_INVALID_RESPONSE", "Data query response requestId did not match the BFF request", false, requestId), requestId }
    const payload = await readBoundedJson(upstream)
    if (payload === null) return { status: 502, body: error("UPSTREAM_INVALID_RESPONSE", "Data query response reached the 16 MB truncation boundary", false, requestId), requestId }
    const envelope = dataQueryResponseSchema.safeParse(payload)
    if (!envelope.success) return { status: 502, body: error("UPSTREAM_INVALID_RESPONSE", "Data query response did not match the canonical contract", false, requestId), requestId }
    if (!envelope.data.ok && bodyRequestId(envelope.data) !== requestId) return { status: 502, body: error("UPSTREAM_INVALID_RESPONSE", "Data query error requestId did not match the BFF request", false, requestId), requestId }
    if (upstream.status !== expectedStatus(envelope.data)) return { status: 502, body: error("UPSTREAM_INVALID_RESPONSE", "Data query status did not match the canonical contract", false, requestId), requestId }
    if (envelope.data.ok) {
      const result = envelope.data.data
      if (result.mode === "reconcile" || result.mode !== expectedMode) return { status: 502, body: error("UPSTREAM_INVALID_RESPONSE", "Data query mode did not match the current Session", false, requestId), requestId }
      const source = result.source
      const wrongSource = expectedMode === "ka_data" ? source.lineage.source !== "ka_data" : source.lineage.source === "ka_data"
      if (source.lineage.workspaceKind !== workspace.kind || wrongSource || source.rows.some((row) => "workspaceId" in row && row.workspaceId !== workspace.id)) {
        return { status: 502, body: error("UPSTREAM_INVALID_RESPONSE", "Data query source identity did not match the current Session", false, requestId), requestId }
      }
      if (source.queryId !== upstreamRequest.queryId) return { status: 502, body: error("UPSTREAM_INVALID_RESPONSE", "Data query response queryId did not match the request", false, requestId), requestId }
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
