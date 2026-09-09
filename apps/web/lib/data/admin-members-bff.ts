import { adminMembersResponseSchema, adminMemberGrantsResponseSchema } from "../../../../packages/domain/src/admin-members.ts"
import { bodyRequestId, createRequestId, hasCorrelatedRequestId, internalApiHeaders, isTimeoutCause,
  resolveInternalApiConfig, resolveSessionCookie, type FetchLike, type InternalApiEnvironment } from "./internal-api-bff.ts"
import { readBoundedResponseBody } from "./bounded-response.ts"
import { isRetryableErrorCode } from "./contracts.ts"
const statuses = { INVALID_REQUEST: 400, UNAUTHORIZED: 401, FORBIDDEN: 403, NOT_FOUND: 404,
  SOURCE_UNAVAILABLE: 503, SOURCE_TRUNCATED: 502, UPSTREAM_INVALID_RESPONSE: 502, UPSTREAM_TIMEOUT: 504, INTERNAL_ERROR: 500 }
function fail(status: number, code: keyof typeof statuses, requestId: string) {
  return { status, requestId, body: { ok: false as const, error: { code, message: "Member request could not be completed", retryable: isRetryableErrorCode(code), requestId } } }
}
export async function handleAdminMembersRequest(request: Request, dependencies: {
  environment: InternalApiEnvironment; fetchImpl?: FetchLike; requestId?: () => string
}, identityId?: string) {
  const requestId = createRequestId(dependencies.requestId)
  if (request.method !== "GET") return fail(405, "INVALID_REQUEST", requestId)
  if ([...new URL(request.url).searchParams].length !== 0 || (identityId !== undefined && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(identityId))) return fail(400, "INVALID_REQUEST", requestId)
  const session = resolveSessionCookie(request)
  if (session.status !== "valid") return fail(401, "UNAUTHORIZED", requestId)
  const config = resolveInternalApiConfig(dependencies.environment)
  if (!config) return fail(503, "SOURCE_UNAVAILABLE", requestId)
  try {
    const path = `/api/v1/admin/members${identityId ? `/${identityId.toLowerCase()}/grants` : ""}`
    const response = await (dependencies.fetchImpl ?? fetch)(new URL(path, config.origin).toString(), {
      method: "GET", headers: internalApiHeaders({ config, requestId, session }), redirect: "error", cache: "no-store", signal: AbortSignal.timeout(10_000),
    })
    if (!hasCorrelatedRequestId(response, requestId)) return fail(502, "UPSTREAM_INVALID_RESPONSE", requestId)
    const bytes = await readBoundedResponseBody(response)
    if (bytes === null) return fail(502, "SOURCE_TRUNCATED", requestId)
    let payload: unknown
    try { payload = JSON.parse(new TextDecoder().decode(bytes)) } catch { return fail(502, "UPSTREAM_INVALID_RESPONSE", requestId) }
    const schema = identityId === undefined ? adminMembersResponseSchema : adminMemberGrantsResponseSchema
    const parsed = schema.safeParse(payload)
    if (!parsed.success || bodyRequestId(payload) !== requestId || response.status !== (parsed.data.ok ? 200 : statuses[parsed.data.error.code])) return fail(502, "UPSTREAM_INVALID_RESPONSE", requestId)
    if (parsed.data.ok && identityId !== undefined && (!("identityId" in parsed.data.data) || parsed.data.data.identityId !== identityId.toLowerCase())) return fail(502, "UPSTREAM_INVALID_RESPONSE", requestId)
    return { status: response.status, body: parsed.data, requestId }
  } catch (e) { return isTimeoutCause(e) ? fail(504, "UPSTREAM_TIMEOUT", requestId) : fail(503, "SOURCE_UNAVAILABLE", requestId) }
}
