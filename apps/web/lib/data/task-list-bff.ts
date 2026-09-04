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
  taskListRequestSchema,
  taskListResponseSchema,
  type TaskListErrorCode,
  type TaskListRequest,
  type TaskListResponse,
} from "./task-list-contracts.ts"

export const BACKEND_TASK_LIST_PATH = "/api/v1/tasks"
const ALLOWED_QUERY_PARAMETERS = new Set(["page", "pageSize", "q", "status", "ownerUserId", "periodFrom", "periodTo", "hasOpenWorkItems"])

type Dependencies = {
  environment: InternalApiEnvironment & Record<string, string | undefined>
  fetchImpl?: FetchLike
  requestId?: () => string
  /** Deprecated seam accepted only so old callers fail closed during migration. */
  approvedAuthContextResolver?: unknown
}
export type TaskListBffResult = { status: number; body: TaskListResponse; requestId: string }
class TaskListQueryError extends Error {}

function error(code: TaskListErrorCode, message: string, retryable: boolean, requestId: string): TaskListResponse {
  return taskListResponseSchema.parse({ ok: false, error: { code, message, retryable, requestId } })
}

function positiveInteger(value: string): number {
  if (!/^[1-9]\d*$/.test(value)) throw new TaskListQueryError()
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed)) throw new TaskListQueryError()
  return parsed
}

function booleanValue(value: string): boolean {
  if (value === "true") return true
  if (value === "false") return false
  throw new TaskListQueryError()
}

export function parseTaskListSearch(search: URLSearchParams): TaskListRequest {
  const raw: Record<string, unknown> = {}
  const seen = new Set<string>()
  for (const [key, value] of search) {
    if (!ALLOWED_QUERY_PARAMETERS.has(key) || seen.has(key)) throw new TaskListQueryError()
    seen.add(key)
    if (key === "page" || key === "pageSize") raw[key] = positiveInteger(value)
    else if (key === "hasOpenWorkItems") raw[key] = booleanValue(value)
    else raw[key] = value
  }
  const parsed = taskListRequestSchema.safeParse(raw)
  if (!parsed.success) throw new TaskListQueryError()
  return parsed.data
}

function upstreamUrl(origin: string, query: TaskListRequest): string {
  const url = new URL(BACKEND_TASK_LIST_PATH, `${origin}/`)
  const keys: (keyof TaskListRequest)[] = ["page", "pageSize", "q", "status", "ownerUserId", "periodFrom", "periodTo", "hasOpenWorkItems"]
  for (const key of keys) {
    const value = query[key]
    if (value !== undefined) url.searchParams.set(key, String(value))
  }
  return url.toString()
}

function expectedStatus(response: TaskListResponse): number {
  if (response.ok) return 200
  if (response.error.code === "UNAUTHORIZED") return 401
  if (response.error.code === "FORBIDDEN") return 403
  if (response.error.code === "UPSTREAM_INVALID_RESPONSE" || response.error.code === "SOURCE_TRUNCATED") return 502
  if (response.error.code === "SOURCE_UNAVAILABLE") return 503
  if (response.error.code === "UPSTREAM_TIMEOUT") return 504
  if (response.error.code === "INTERNAL_ERROR") return 500
  return 400
}

export async function handleTaskListRequest(request: Request, dependencies: Dependencies): Promise<TaskListBffResult> {
  const requestId = createRequestId(dependencies.requestId)
  let query: TaskListRequest
  try { query = parseTaskListSearch(new URL(request.url).searchParams) } catch {
    return { status: 400, body: error("INVALID_REQUEST", "Invalid task list request", false, requestId), requestId }
  }
  const session = resolveSessionCookie(request)
  if (session.status !== "valid") return { status: 401, body: error("UNAUTHORIZED", "A valid session cookie is required", false, requestId), requestId }
  const config = resolveInternalApiConfig(dependencies.environment)
  if (config === null) return { status: 503, body: error("INTERNAL_ERROR", "Task list upstream is not configured safely", false, requestId), requestId }

  try {
    const upstream = await (dependencies.fetchImpl ?? fetch)(upstreamUrl(config.origin, query), {
      method: "GET",
      headers: internalApiHeaders({ config, requestId, session }),
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    })
    if (!hasCorrelatedRequestId(upstream, requestId)) return { status: 502, body: error("UPSTREAM_INVALID_RESPONSE", "Task list response requestId did not match the BFF request", false, requestId), requestId }
    const payload = await readBoundedJson(upstream)
    if (payload === null) return { status: 502, body: error("UPSTREAM_INVALID_RESPONSE", "Task list response reached the 16 MB truncation boundary", false, requestId), requestId }
    const parsed = taskListResponseSchema.safeParse(payload)
    if (!parsed.success || bodyRequestId(payload) !== requestId || upstream.status !== expectedStatus(parsed.data)) {
      return { status: 502, body: error("UPSTREAM_INVALID_RESPONSE", "Task list response did not match the canonical contract", false, requestId), requestId }
    }
    return { status: upstream.status, body: parsed.data, requestId }
  } catch (cause) {
    const timeout = isTimeoutCause(cause)
    return {
      status: timeout ? 504 : 503,
      body: error(timeout ? "UPSTREAM_TIMEOUT" : "SOURCE_UNAVAILABLE", timeout ? "The task source timed out" : "The task source is unavailable", true, requestId),
      requestId,
    }
  }
}
