import { randomUUID } from "node:crypto"

import {
  internalServiceTokenSchema,
  resolveServerAuthResolution,
  type ApprovedAuthContextResolver,
  type DataQueryServerEnvironment,
  type ServerAuthContext,
} from "./auth-context.ts"
import { readBoundedResponseBody } from "./bounded-response.ts"
import {
  taskListRequestSchema,
  taskListResponseSchema,
  type TaskListErrorCode,
  type TaskListRequest,
  type TaskListResponse,
} from "./task-list-contracts.ts"

export const BACKEND_TASK_LIST_PATH = "/api/v1/tasks"

const ALLOWED_QUERY_PARAMETERS = new Set([
  "page",
  "pageSize",
  "q",
  "status",
  "ownerUserId",
  "periodFrom",
  "periodTo",
  "hasOpenWorkItems",
])

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>
type Environment = DataQueryServerEnvironment
type Dependencies = {
  environment: Environment
  approvedAuthContextResolver: ApprovedAuthContextResolver
  fetchImpl?: FetchLike
  requestId?: () => string
}
export type TaskListBffResult = { status: number; body: TaskListResponse }

class TaskListQueryError extends Error {}

function error(
  code: TaskListErrorCode,
  message: string,
  retryable: boolean,
  requestId: string,
): TaskListResponse {
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

function normalizedOrigin(value: string): string | null {
  try {
    const url = new URL(value)
    if (
      !["https:", "http:"].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      (url.pathname !== "/" && url.pathname !== "")
    ) return null
    return url.origin
  } catch {
    return null
  }
}

function upstreamUrl(origin: string, query: TaskListRequest): string {
  const url = new URL(BACKEND_TASK_LIST_PATH, `${origin}/`)
  const orderedKeys: (keyof TaskListRequest)[] = [
    "page",
    "pageSize",
    "q",
    "status",
    "ownerUserId",
    "periodFrom",
    "periodTo",
    "hasOpenWorkItems",
  ]
  for (const key of orderedKeys) {
    const value = query[key]
    if (value !== undefined) url.searchParams.set(key, String(value))
  }
  return url.toString()
}

function serverHeaders(auth: ServerAuthContext, token: string, requestId: string): Headers {
  return new Headers({
    accept: "application/json",
    authorization: `Bearer ${token}`,
    "x-request-id": requestId,
    "x-ka-workspace-id": auth.workspaceId,
    "x-ka-user-id": auth.userId,
    "x-ka-account-scope": Buffer.from(JSON.stringify(auth.allowedAccounts)).toString("base64url"),
  })
}

function expectedStatus(response: TaskListResponse): number {
  if (response.ok) return 200
  if (response.error.code === "UNAUTHORIZED") return 401
  if (response.error.code === "FORBIDDEN") return 403
  if (
    response.error.code === "UPSTREAM_INVALID_RESPONSE" ||
    response.error.code === "SOURCE_TRUNCATED"
  ) return 502
  if (response.error.code === "SOURCE_UNAVAILABLE") return 503
  if (response.error.code === "UPSTREAM_TIMEOUT") return 504
  if (response.error.code === "INTERNAL_ERROR") return 500
  return 400
}

function timeoutCause(cause: unknown): boolean {
  return cause instanceof DOMException && (cause.name === "AbortError" || cause.name === "TimeoutError")
}

export async function handleTaskListRequest(request: Request, dependencies: Dependencies): Promise<TaskListBffResult> {
  const requestId = (dependencies.requestId ?? randomUUID)()
  let query: TaskListRequest
  try {
    query = parseTaskListSearch(new URL(request.url).searchParams)
  } catch {
    return { status: 400, body: error("INVALID_REQUEST", "Invalid task list request", false, requestId) }
  }

  let authResolution
  try {
    authResolution = await resolveServerAuthResolution({
      environment: dependencies.environment,
      approvedAuthContextResolver: dependencies.approvedAuthContextResolver,
    })
  } catch {
    return { status: 500, body: error("INTERNAL_ERROR", "The approved session could not be resolved", false, requestId) }
  }
  if (authResolution.status === "rejected") {
    const unauthorized = authResolution.httpStatus === 401
    return {
      status: authResolution.httpStatus,
      body: error(
        unauthorized ? "UNAUTHORIZED" : "FORBIDDEN",
        unauthorized ? "Authentication is required" : "Approved authentication context is invalid",
        false,
        requestId,
      ),
    }
  }

  const token = internalServiceTokenSchema.safeParse(dependencies.environment.KA_DATA_SERVICE_TOKEN?.trim())
  const origin = normalizedOrigin(dependencies.environment.KA_DATA_BACKEND_ORIGIN ?? "")
  if (!token.success || origin === null) {
    return { status: 503, body: error("INTERNAL_ERROR", "Task list upstream is not configured safely", false, requestId) }
  }

  try {
    const upstream = await (dependencies.fetchImpl ?? fetch)(upstreamUrl(origin, query), {
      method: "GET",
      headers: serverHeaders(authResolution.context, token.data, requestId),
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    })
    const bytes = await readBoundedResponseBody(upstream)
    if (bytes === null) {
      return { status: 502, body: error("UPSTREAM_INVALID_RESPONSE", "Task list response reached the 16 MB truncation boundary", false, requestId) }
    }
    let payload: unknown
    try {
      payload = JSON.parse(new TextDecoder().decode(bytes))
    } catch {
      return { status: 502, body: error("UPSTREAM_INVALID_RESPONSE", "Task list source returned a non-JSON response", false, requestId) }
    }
    const parsed = taskListResponseSchema.safeParse(payload)
    if (!parsed.success) {
      return { status: 502, body: error("UPSTREAM_INVALID_RESPONSE", "Task list response did not match the canonical contract", false, requestId) }
    }
    if (upstream.status !== expectedStatus(parsed.data)) {
      return { status: 502, body: error("UPSTREAM_INVALID_RESPONSE", "Task list response did not match the canonical contract", false, requestId) }
    }
    return { status: upstream.status, body: parsed.data }
  } catch (cause) {
    const timeout = timeoutCause(cause)
    return {
      status: timeout ? 504 : 503,
      body: error(
        timeout ? "UPSTREAM_TIMEOUT" : "SOURCE_UNAVAILABLE",
        timeout ? "The Qihang task source timed out" : "The Qihang task source is unavailable",
        true,
        requestId,
      ),
    }
  }
}
