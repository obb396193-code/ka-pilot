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
} from "../internal-api-bff.ts"
import {
  accountListRequestSchema,
  accountListResponseSchema,
  type AccountListErrorCode,
  type AccountListRequest,
  type AccountListResponse,
} from "./account-list-contracts.ts"

// I-001：浏览器只打同源 /api/internal/*，这条把账户列表转发到后端 GET /api/v1/accounts。
// 织法逐条照 task-list-bff.ts：白名单参数、Session cookie + 服务令牌、requestId 双向对齐、
// 16MB 边界、上游响应必须过契约校验且状态码与 body 自洽，任一不符一律 502，不把上游原文透出去。
export const BACKEND_ACCOUNT_LIST_PATH = "/api/v1/accounts"
const ALLOWED_QUERY_PARAMETERS = new Set([
  "page", "pageSize", "q", "media", "stage", "starred", "tags", "ownerUserId", "status",
])

type Dependencies = {
  environment: InternalApiEnvironment & Record<string, string | undefined>
  fetchImpl?: FetchLike
  requestId?: () => string
}
export type AccountListBffResult = { status: number; body: AccountListResponse; requestId: string }
class AccountListQueryError extends Error {}

function error(code: AccountListErrorCode, message: string, retryable: boolean, requestId: string): AccountListResponse {
  return accountListResponseSchema.parse({ ok: false, error: { code, message, retryable, requestId } })
}

function positiveInteger(value: string): number {
  if (!/^[1-9]\d*$/.test(value)) throw new AccountListQueryError()
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed)) throw new AccountListQueryError()
  return parsed
}

function booleanValue(value: string): boolean {
  if (value === "true") return true
  if (value === "false") return false
  throw new AccountListQueryError()
}

export function parseAccountListSearch(search: URLSearchParams): AccountListRequest {
  const raw: Record<string, unknown> = {}
  const seen = new Set<string>()
  for (const [key, value] of search) {
    if (!ALLOWED_QUERY_PARAMETERS.has(key) || seen.has(key)) throw new AccountListQueryError()
    seen.add(key)
    if (key === "page" || key === "pageSize") raw[key] = positiveInteger(value)
    else if (key === "starred") raw[key] = booleanValue(value)
    // tags 是重复参数会歧义，统一用逗号分隔的一个参数；空段直接判非法而不是悄悄丢掉。
    else if (key === "tags") raw[key] = value.split(",").map((tag) => tag.trim())
    else raw[key] = value
  }
  const parsed = accountListRequestSchema.safeParse(raw)
  if (!parsed.success) throw new AccountListQueryError()
  return parsed.data
}

function upstreamUrl(origin: string, query: AccountListRequest): string {
  const url = new URL(BACKEND_ACCOUNT_LIST_PATH, `${origin}/`)
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined) continue
    url.searchParams.set(key, Array.isArray(value) ? value.join(",") : String(value))
  }
  return url.toString()
}

function expectedStatus(response: AccountListResponse): number {
  if (response.ok) return 200
  if (response.error.code === "UNAUTHORIZED") return 401
  if (response.error.code === "FORBIDDEN") return 403
  if (response.error.code === "UPSTREAM_INVALID_RESPONSE" || response.error.code === "SOURCE_TRUNCATED") return 502
  if (response.error.code === "SOURCE_UNAVAILABLE") return 503
  if (response.error.code === "UPSTREAM_TIMEOUT") return 504
  if (response.error.code === "INTERNAL_ERROR") return 500
  return 400
}

export async function handleAccountListRequest(
  request: Request,
  dependencies: Dependencies,
): Promise<AccountListBffResult> {
  const requestId = createRequestId(dependencies.requestId)
  let query: AccountListRequest
  try {
    query = parseAccountListSearch(new URL(request.url).searchParams)
  } catch {
    return { status: 400, body: error("INVALID_REQUEST", "Invalid account list request", false, requestId), requestId }
  }
  const session = resolveSessionCookie(request)
  if (session.status !== "valid") {
    return { status: 401, body: error("UNAUTHORIZED", "A valid session cookie is required", false, requestId), requestId }
  }
  const config = resolveInternalApiConfig(dependencies.environment)
  if (config === null) {
    return { status: 503, body: error("INTERNAL_ERROR", "Account list upstream is not configured safely", false, requestId), requestId }
  }

  try {
    const upstream = await (dependencies.fetchImpl ?? fetch)(upstreamUrl(config.origin, query), {
      method: "GET",
      headers: internalApiHeaders({ config, requestId, session }),
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    })
    if (!hasCorrelatedRequestId(upstream, requestId)) {
      return { status: 502, body: error("UPSTREAM_INVALID_RESPONSE", "Account list response requestId did not match the BFF request", false, requestId), requestId }
    }
    const payload = await readBoundedJson(upstream)
    if (payload === null) {
      return { status: 502, body: error("UPSTREAM_INVALID_RESPONSE", "Account list response reached the 16 MB truncation boundary", false, requestId), requestId }
    }
    const parsed = accountListResponseSchema.safeParse(payload)
    if (!parsed.success || bodyRequestId(payload) !== requestId || upstream.status !== expectedStatus(parsed.data)) {
      return { status: 502, body: error("UPSTREAM_INVALID_RESPONSE", "Account list response did not match the canonical contract", false, requestId), requestId }
    }
    return { status: upstream.status, body: parsed.data, requestId }
  } catch (cause) {
    const timeout = isTimeoutCause(cause)
    return {
      status: timeout ? 504 : 503,
      body: error(
        timeout ? "UPSTREAM_TIMEOUT" : "SOURCE_UNAVAILABLE",
        timeout ? "The account source timed out" : "The account source is unavailable",
        true,
        requestId,
      ),
      requestId,
    }
  }
}
