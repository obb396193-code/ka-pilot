import { z } from "zod"

import {
  MAX_BFF_REQUEST_BYTES,
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
} from "../internal-api-bff.ts"
import { requestIdSchema, stableDataQueryErrorSchema } from "../contracts.ts"

/**
 * R-014 的 BFF 转发器。17 条端点如果各抄一遍 task-list-bff 的 fetch/相关性/边界逻辑，
 * 迟早会有一条抄漏一处校验——所以把不变的部分收在这里，每条路由只给
 * 「上游路径 + 允许的查询参数 + 响应 schema」三样。
 *
 * 保留 task-list-bff 的全部防线：Session cookie + 服务令牌、requestId 双向对齐、
 * 16MB 边界、响应必须过 schema 且状态码与 body 自洽、失败不透传上游原文。
 */
export type R014BffResult = { status: number; body: unknown; requestId: string }

/**
 * r014 后端除了那 11 个稳定码，还会返 NOT_FOUND / CONFLICT / RATE_LIMITED
 * （kb 单读、账户交接、任务详情、改密限速都在用）。共享的 stableDataQueryError 枚举
 * 认不出它们，于是**合法的 404/409/429 会被判成 502「上游不合契约」**——
 * 用户看到「上游坏了」，而不是「这篇文档不存在」。这里就地扩，不动共享枚举。
 */
const r014ErrorSchema = stableDataQueryErrorSchema.omit({ code: true }).extend({
  code: z.union([stableDataQueryErrorSchema.shape.code, z.enum(["NOT_FOUND", "CONFLICT", "RATE_LIMITED"])]),
}).strict()
const errorEnvelopeSchema = z.object({ ok: z.literal(false), error: r014ErrorSchema }).strict()

/** 成功信封：`data` 交给每条路由自己的 schema，`meta` 只要求带回相关的 requestId。 */
export function successEnvelope<T extends z.ZodTypeAny>(data: T) {
  return z.object({
    ok: z.literal(true),
    data,
    meta: z.looseObject({ requestId: requestIdSchema }),
  }).strict()
}

export function envelope<T extends z.ZodTypeAny>(data: T) {
  return z.union([successEnvelope(data), errorEnvelopeSchema])
}

function error(code: z.infer<typeof stableDataQueryErrorSchema>["code"], message: string, retryable: boolean, requestId: string): unknown {
  return errorEnvelopeSchema.parse({ ok: false, error: { code, message, retryable, requestId } })
}

function expectedStatus(body: unknown): number | null {
  const parsed = errorEnvelopeSchema.safeParse(body)
  if (!parsed.success) return 200
  const code = parsed.data.error.code
  if (code === "UNAUTHORIZED") return 401
  if (code === "FORBIDDEN") return 403
  if (code === "UPSTREAM_INVALID_RESPONSE" || code === "SOURCE_TRUNCATED") return 502
  if (code === "SOURCE_UNAVAILABLE") return 503
  if (code === "UPSTREAM_TIMEOUT") return 504
  if (code === "INTERNAL_ERROR") return 500
  if (code === "NOT_FOUND") return 404
  if (code === "CONFLICT") return 409
  if (code === "RATE_LIMITED") return 429
  // 其余（405/410 等）状态码由后端决定，BFF 不再二次判定，只要求 body 是合法 envelope。
  return null
}

export type ForwardOptions = {
  /** 上游路径；带路径参数的路由自己拼好再传进来。 */
  path: string
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE"
  /** 允许透传的查询参数白名单；未列出的一律拒绝，不静默丢弃。 */
  allowedQuery?: readonly string[]
  /** `data` 的 schema；204 无响应体的路由传 undefined。 */
  dataSchema?: z.ZodTypeAny
  environment: InternalApiEnvironment & Record<string, string | undefined>
  fetchImpl?: FetchLike
  requestId?: () => string
}

export async function forwardToBackend(request: Request, options: ForwardOptions): Promise<R014BffResult> {
  const requestId = createRequestId(options.requestId)
  const session = resolveSessionCookie(request)
  if (session.status !== "valid") {
    return { status: 401, body: error("UNAUTHORIZED", "A valid session cookie is required", false, requestId), requestId }
  }
  const config = resolveInternalApiConfig(options.environment)
  if (config === null) {
    return { status: 503, body: error("INTERNAL_ERROR", "The upstream is not configured safely", false, requestId), requestId }
  }

  const incoming = new URL(request.url)
  const allowed = new Set(options.allowedQuery ?? [])
  const upstream = new URL(options.path, `${config.origin}/`)
  const seen = new Set<string>()
  for (const [key, value] of incoming.searchParams) {
    if (!allowed.has(key) || seen.has(key)) {
      return { status: 400, body: error("INVALID_REQUEST", "The request carries an unsupported query parameter", false, requestId), requestId }
    }
    seen.add(key)
    upstream.searchParams.set(key, value)
  }

  let payload: BodyInit | undefined
  if (options.method !== "GET" && options.method !== "DELETE") {
    const body = await readBoundedRequestJson(request)
    if (body === null) {
      return { status: 413, body: error("INVALID_REQUEST", `The request body exceeds ${MAX_BFF_REQUEST_BYTES} bytes`, false, requestId), requestId }
    }
    payload = JSON.stringify(body)
  }

  try {
    // internalApiHeaders 返回的是 Headers 实例：用对象展开会得到空对象，
    // 把 Authorization 和 Session cookie 全丢掉。必须拿实例再 set。
    const headers = internalApiHeaders({ config, requestId, session, json: payload !== undefined })
    const response = await (options.fetchImpl ?? fetch)(upstream.toString(), {
      method: options.method,
      headers,
      ...(payload === undefined ? {} : { body: payload }),
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    })
    if (!hasCorrelatedRequestId(response, requestId)) {
      return { status: 502, body: error("UPSTREAM_INVALID_RESPONSE", "The upstream requestId did not match the BFF request", false, requestId), requestId }
    }
    // 204 没有响应体，直接透传状态。
    if (response.status === 204) return { status: 204, body: undefined, requestId }

    const body = await readBoundedJson(response)
    if (body === null) {
      return { status: 502, body: error("UPSTREAM_INVALID_RESPONSE", "The upstream response reached the 16 MB truncation boundary", false, requestId), requestId }
    }
    const schema = options.dataSchema === undefined ? envelope(z.unknown()) : envelope(options.dataSchema)
    const parsed = schema.safeParse(body)
    const expected = expectedStatus(body)
    if (!parsed.success || bodyRequestId(body) !== requestId || (expected !== null && response.status !== expected)) {
      return { status: 502, body: error("UPSTREAM_INVALID_RESPONSE", "The upstream response did not match the canonical contract", false, requestId), requestId }
    }
    return { status: response.status, body: parsed.data, requestId }
  } catch (cause) {
    const timeout = isTimeoutCause(cause)
    return {
      status: timeout ? 504 : 503,
      body: error(
        timeout ? "UPSTREAM_TIMEOUT" : "SOURCE_UNAVAILABLE",
        timeout ? "The upstream timed out" : "The upstream is unavailable",
        true,
        requestId,
      ),
      requestId,
    }
  }
}
