import type { StableDataQueryError } from "./contracts.ts"
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
  validatedSessionSetCookie,
  type FetchLike,
  type InternalApiEnvironment,
  type InternalBffResult,
  type SessionCookieResolution,
} from "./internal-api-bff.ts"
import {
  internalTestLoginRequestSchema,
  logoutSuccessResponseSchema,
  sessionErrorResponseSchema,
  sessionHttpResponseSchema,
  sessionSuccessResponseSchema,
  workspaceSwitchRequestSchema,
  type SessionHttpResponse,
} from "./session-contracts.ts"

export type SessionRouteKind = "login" | "session" | "workspaces" | "workspace"

type Dependencies = {
  environment: InternalApiEnvironment
  fetchImpl?: FetchLike
  requestId?: () => string
}

const PATHS: Record<SessionRouteKind, string> = {
  login: "/api/v1/auth/login",
  session: "/api/v1/auth/session",
  workspaces: "/api/v1/auth/workspaces",
  workspace: "/api/v1/auth/workspace",
}

function error(
  status: number,
  code: StableDataQueryError["code"],
  message: string,
  retryable: boolean,
  requestId: string,
): InternalBffResult<SessionHttpResponse> {
  return {
    status,
    requestId,
    body: sessionErrorResponseSchema.parse({
      ok: false,
      error: { code, message, retryable, requestId },
    }),
  }
}

function allowedMethod(kind: SessionRouteKind, method: string): boolean {
  if (kind === "login" || kind === "workspace") return method === "POST"
  if (kind === "workspaces") return method === "GET"
  return method === "GET" || method === "DELETE"
}

function expectedStatus(response: SessionHttpResponse): number {
  if (response.ok) return 200
  if (response.error.code === "UNAUTHORIZED") return 401
  if (response.error.code === "FORBIDDEN") return 403
  if (response.error.code === "SOURCE_TRUNCATED" || response.error.code === "UPSTREAM_INVALID_RESPONSE") return 502
  if (response.error.code === "SOURCE_UNAVAILABLE") return 503
  if (response.error.code === "UPSTREAM_TIMEOUT") return 504
  if (response.error.code === "INTERNAL_ERROR") return 500
  return 400
}

function requiresSession(kind: SessionRouteKind, method: string): boolean {
  return kind === "workspace" || kind === "workspaces" || (kind === "session" && method === "GET")
}

function cookieExpectation(
  kind: SessionRouteKind,
  method: string,
  response: SessionHttpResponse,
): "absent" | "active" | "cleared" {
  if (!response.ok) return "absent"
  if (kind === "login" || kind === "workspace") return "active"
  if (kind === "session" && method === "DELETE") return "cleared"
  return "absent"
}

async function parsedBody(kind: SessionRouteKind, method: string, request: Request): Promise<unknown> {
  if (method !== "POST") return undefined
  const body = await readBoundedRequestJson(request)
  if (body === null || body === undefined) return null
  const schema = kind === "login" ? internalTestLoginRequestSchema : workspaceSwitchRequestSchema
  const parsed = schema.safeParse(body)
  return parsed.success ? parsed.data : null
}

function requestSession(kind: SessionRouteKind, request: Request): SessionCookieResolution | undefined {
  return kind === "login" ? undefined : resolveSessionCookie(request)
}

export async function handleSessionRequest(
  kind: SessionRouteKind,
  request: Request,
  dependencies: Dependencies,
): Promise<InternalBffResult<SessionHttpResponse>> {
  const requestId = createRequestId(dependencies.requestId)
  const method = request.method.toUpperCase()
  if (!allowedMethod(kind, method)) {
    return error(405, "INVALID_REQUEST", "Method is not allowed", false, requestId)
  }
  if ([...new URL(request.url).searchParams].length > 0) {
    return error(400, "INVALID_REQUEST", "Invalid auth request", false, requestId)
  }
  const body = await parsedBody(kind, method, request)
  if (method === "POST" && body === null) {
    return error(400, "INVALID_REQUEST", "Invalid auth request", false, requestId)
  }
  const session = requestSession(kind, request)
  if (session?.status === "invalid" || (requiresSession(kind, method) && session?.status !== "valid")) {
    return error(401, "UNAUTHORIZED", "Authentication is required", false, requestId)
  }
  const config = resolveInternalApiConfig(dependencies.environment)
  if (config === null) {
    return error(503, "INTERNAL_ERROR", "Session upstream is not configured safely", false, requestId)
  }

  try {
    const upstream = await (dependencies.fetchImpl ?? fetch)(`${config.origin}${PATHS[kind]}`, {
      method,
      headers: internalApiHeaders({ config, requestId, session, json: method === "POST" }),
      ...(method === "POST" ? { body: JSON.stringify(body) } : {}),
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    })
    if (!hasCorrelatedRequestId(upstream, requestId)) {
      return error(502, "UPSTREAM_INVALID_RESPONSE", "Session response requestId did not match the BFF request", false, requestId)
    }
    const payload = await readBoundedJson(upstream)
    if (payload === null) {
      return error(502, "UPSTREAM_INVALID_RESPONSE", "Session response reached the 16 MB truncation boundary", false, requestId)
    }
    const parsed = sessionHttpResponseSchema.safeParse(payload)
    if (!parsed.success || bodyRequestId(parsed.success ? parsed.data : null) !== requestId) {
      return error(502, "UPSTREAM_INVALID_RESPONSE", "Session response did not match the canonical contract", false, requestId)
    }
    const response = parsed.data
    if (upstream.status !== expectedStatus(response)) {
      return error(502, "UPSTREAM_INVALID_RESPONSE", "Session response status did not match the canonical contract", false, requestId)
    }
    if (response.ok) {
      const expectedSchema = kind === "session" && method === "DELETE"
        ? logoutSuccessResponseSchema
        : sessionSuccessResponseSchema
      if (!expectedSchema.safeParse(response).success) {
        return error(502, "UPSTREAM_INVALID_RESPONSE", "Session response kind did not match the request", false, requestId)
      }
    }
    const expectation = cookieExpectation(kind, method, response)
    const setCookie = validatedSessionSetCookie(upstream, expectation)
    if (setCookie === null) {
      return error(502, "UPSTREAM_INVALID_RESPONSE", "Session cookie did not match the security contract", false, requestId)
    }
    return {
      status: upstream.status,
      body: response,
      requestId,
      ...(setCookie === "" ? {} : { setCookie }),
    }
  } catch (cause) {
    const timeout = isTimeoutCause(cause)
    return error(
      timeout ? 504 : 503,
      timeout ? "UPSTREAM_TIMEOUT" : "SOURCE_UNAVAILABLE",
      timeout ? "The session service timed out" : "The session service is unavailable",
      true,
      requestId,
    )
  }
}
