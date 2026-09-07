import {
  bodyRequestId, createRequestId, hasCorrelatedRequestId, internalApiHeaders, isTimeoutCause,
  resolveInternalApiConfig, resolveSessionCookie,
  type FetchLike, type InternalApiEnvironment,
} from "./internal-api-bff.ts"
import { readBoundedResponseBody } from "./bounded-response.ts"
import { workItemListRequestSchema, workItemListResponseSchema,
  type WorkItemListRequest, type WorkItemListResponse } from "./work-item-list-contracts.ts"

const path = "/api/v1/work-items"
const allowed = new Set(["page", "pageSize", "q", "status", "severity", "type", "assigneeUserId", "taskId"])
type ErrorCode = Extract<WorkItemListResponse, { ok: false }>["error"]["code"]
type Dependencies = { environment: InternalApiEnvironment; fetchImpl?: FetchLike; requestId?: () => string }
type Result = { status: number; body: WorkItemListResponse; requestId: string }
function fail(status: number, code: ErrorCode, message: string, requestId: string, retryable = false): Result {
  return { status, body: { ok: false, error: { code, message, retryable, requestId } }, requestId }
}
function parse(search: URLSearchParams): WorkItemListRequest {
  const raw: Record<string, unknown> = {}, seen = new Set<string>()
  for (const [key, value] of search) {
    if (!allowed.has(key) || seen.has(key)) throw new Error("Invalid work item list query")
    seen.add(key)
    if (key === "page" || key === "pageSize") {
      if (!/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(Number(value))) throw new Error("Invalid page")
      raw[key] = Number(value)
    } else raw[key] = value
  }
  const parsed = workItemListRequestSchema.parse(raw)
  if (!Number.isSafeInteger((parsed.page - 1) * parsed.pageSize)) throw new Error("Invalid page offset")
  return parsed
}
function statusFor(body: WorkItemListResponse): number {
  if (body.ok) return 200
  switch (body.error.code) {
    case "UNAUTHORIZED": return 401
    case "FORBIDDEN": return 403
    case "UPSTREAM_INVALID_RESPONSE": case "SOURCE_TRUNCATED": return 502
    case "SOURCE_UNAVAILABLE": return 503
    case "UPSTREAM_TIMEOUT": return 504
    case "INTERNAL_ERROR": return 500
    default: return 400
  }
}
function pageMatches(body: WorkItemListResponse, query: WorkItemListRequest): boolean {
  if (!body.ok) return true
  const { page, pageSize, total, items } = body.data
  if (page !== query.page || pageSize !== query.pageSize || items.length > pageSize || items.length > total) return false
  if (new Set(items.map(item => item.workItemId)).size !== items.length) return false
  const offset = (page - 1) * pageSize
  if (!Number.isSafeInteger(offset)) return false
  if (items.length > 0 && offset + items.length > total) return false
  return !(items.length === 0 && offset < total)
}
export async function handleWorkItemListRequest(request: Request, dependencies: Dependencies): Promise<Result> {
  const requestId = createRequestId(dependencies.requestId)
  if (request.method !== "GET") return fail(405, "INVALID_REQUEST", "Only GET is supported", requestId)
  let query: WorkItemListRequest
  try { query = parse(new URL(request.url).searchParams) }
  catch { return fail(400, "INVALID_REQUEST", "Invalid work item list request", requestId) }
  const session = resolveSessionCookie(request)
  if (session.status !== "valid") return fail(401, "UNAUTHORIZED", "A valid session cookie is required", requestId)
  const config = resolveInternalApiConfig(dependencies.environment)
  if (!config) return fail(503, "INTERNAL_ERROR", "Work item list upstream is not configured safely", requestId)
  const url = new URL(path, config.origin)
  for (const [key, value] of Object.entries(query)) if (value !== undefined) url.searchParams.set(key, String(value))
  try {
    const response = await (dependencies.fetchImpl ?? fetch)(url.toString(), { method: "GET",
      headers: internalApiHeaders({ config, requestId, session }), redirect: "error", cache: "no-store", signal: AbortSignal.timeout(10_000) })
    if (!hasCorrelatedRequestId(response, requestId)) return fail(502, "UPSTREAM_INVALID_RESPONSE", "Work item list requestId did not match", requestId)
    const bytes = await readBoundedResponseBody(response)
    if (bytes === null) return fail(502, "SOURCE_TRUNCATED", "Work item list reached the 16 MB response boundary", requestId)
    let payload: unknown
    try { payload = JSON.parse(new TextDecoder().decode(bytes)) }
    catch { return fail(502, "UPSTREAM_INVALID_RESPONSE", "Work item list did not return valid JSON", requestId) }
    const parsed = workItemListResponseSchema.safeParse(payload)
    if (!parsed.success || bodyRequestId(payload) !== requestId || response.status !== statusFor(parsed.data) || !pageMatches(parsed.data, query)) {
      return fail(502, "UPSTREAM_INVALID_RESPONSE", "Work item list did not match the canonical contract", requestId)
    }
    return { status: response.status, body: parsed.data, requestId }
  } catch (cause) {
    return isTimeoutCause(cause) ? fail(504, "UPSTREAM_TIMEOUT", "Work item list timed out", requestId, true)
      : fail(503, "SOURCE_UNAVAILABLE", "Work item list source is unavailable", requestId, true)
  }
}
