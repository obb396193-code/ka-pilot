// Reuse the standalone canonical Domain schema, not a copied browser DTO.
import { adminCalendarResponseSchema, type AdminCalendarResponse } from "../../../../packages/domain/src/admin-calendar.ts"
import { bodyRequestId, createRequestId, hasCorrelatedRequestId, internalApiHeaders, isTimeoutCause,
  resolveInternalApiConfig, resolveSessionCookie, type FetchLike, type InternalApiEnvironment } from "./internal-api-bff.ts"
import { readBoundedResponseBody } from "./bounded-response.ts"

type ErrorCode = Extract<AdminCalendarResponse, { ok: false }>["error"]["code"]
type Result = { status: number; body: AdminCalendarResponse; requestId: string }
const statuses: Record<ErrorCode, number> = { INVALID_REQUEST: 400, UNAUTHORIZED: 401, FORBIDDEN: 403,
  SOURCE_UNAVAILABLE: 503, SOURCE_TRUNCATED: 502, UPSTREAM_INVALID_RESPONSE: 502, UPSTREAM_TIMEOUT: 504, INTERNAL_ERROR: 500 }
function fail(status: number, code: ErrorCode, requestId: string): Result {
  return { status, requestId, body: { ok: false, error: { code, message: "Calendar request could not be completed", retryable: false, requestId } } }
}
export async function handleAdminCalendarRequest(request: Request, dependencies: {
  environment: InternalApiEnvironment; fetchImpl?: FetchLike; requestId?: () => string
}): Promise<Result> {
  const requestId = createRequestId(dependencies.requestId)
  if (request.method !== "GET") return fail(405, "INVALID_REQUEST", requestId)
  if ([...new URL(request.url).searchParams].length !== 0) return fail(400, "INVALID_REQUEST", requestId)
  const session = resolveSessionCookie(request)
  if (session.status !== "valid") return fail(401, "UNAUTHORIZED", requestId)
  const config = resolveInternalApiConfig(dependencies.environment)
  if (!config) return fail(503, "SOURCE_UNAVAILABLE", requestId)
  try {
    const response = await (dependencies.fetchImpl ?? fetch)(new URL("/api/v1/admin/calendar", config.origin).toString(), {
      method: "GET", headers: internalApiHeaders({ config, requestId, session }),
      redirect: "error", cache: "no-store", signal: AbortSignal.timeout(10_000),
    })
    if (!hasCorrelatedRequestId(response, requestId)) return fail(502, "UPSTREAM_INVALID_RESPONSE", requestId)
    const bytes = await readBoundedResponseBody(response)
    if (bytes === null) return fail(502, "SOURCE_TRUNCATED", requestId)
    let payload: unknown
    try { payload = JSON.parse(new TextDecoder().decode(bytes)) }
    catch { return fail(502, "UPSTREAM_INVALID_RESPONSE", requestId) }
    const parsed = adminCalendarResponseSchema.safeParse(payload)
    if (!parsed.success || bodyRequestId(payload) !== requestId || response.status !== (parsed.data.ok ? 200 : statuses[parsed.data.error.code]))
      return fail(502, "UPSTREAM_INVALID_RESPONSE", requestId)
    return { status: response.status, body: parsed.data, requestId }
  } catch (error) {
    return isTimeoutCause(error) ? fail(504, "UPSTREAM_TIMEOUT", requestId) : fail(503, "SOURCE_UNAVAILABLE", requestId)
  }
}

