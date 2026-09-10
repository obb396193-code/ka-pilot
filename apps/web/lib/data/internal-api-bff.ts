import { randomUUID } from "node:crypto"

import { z } from "zod"

import { readBoundedResponseBody } from "./bounded-response.ts"
import { requestIdSchema } from "./contracts.ts"

export const SESSION_COOKIE_NAME = "ka_session"
export const MAX_BFF_REQUEST_BYTES = 1024 * 1024

export const internalServiceTokenSchema = z.string().min(32)

export type InternalApiEnvironment = {
  NODE_ENV?: string
  KA_DATA_BACKEND_ORIGIN?: string
  KA_DATA_SERVICE_TOKEN?: string
}

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>

export type InternalApiConfig = {
  origin: string
  token: string
}

export type SessionCookieResolution =
  | { status: "valid"; header: string }
  | { status: "missing" }
  | { status: "invalid" }

export type InternalBffResult<T> = {
  status: number
  body: T
  requestId: string
  setCookie?: string
}

export function createRequestId(factory: () => string = randomUUID): string {
  const candidate = factory()
  return requestIdSchema.safeParse(candidate).success ? candidate : randomUUID()
}

export function normalizeBackendOrigin(value: string): string | null {
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

export function resolveInternalApiConfig(environment: InternalApiEnvironment): InternalApiConfig | null {
  const origin = normalizeBackendOrigin(environment.KA_DATA_BACKEND_ORIGIN ?? "")
  const token = internalServiceTokenSchema.safeParse(environment.KA_DATA_SERVICE_TOKEN?.trim())
  return origin === null || !token.success ? null : { origin, token: token.data }
}

export function resolveSessionCookie(request: Request): SessionCookieResolution {
  const cookie = request.headers.get("cookie")
  if (cookie === null || cookie.trim() === "") return { status: "missing" }
  const matches = cookie
    .split(";")
    .map((part) => part.trim())
    .filter((part) => part.startsWith(`${SESSION_COOKIE_NAME}=`))
  if (matches.length === 0) return { status: "missing" }
  if (matches.length !== 1) return { status: "invalid" }
  const value = matches[0]!.slice(SESSION_COOKIE_NAME.length + 1)
  if (!/^[A-Za-z0-9._~-]{32,512}$/.test(value)) return { status: "invalid" }
  return { status: "valid", header: `${SESSION_COOKIE_NAME}=${value}` }
}

/**
 * F8-15 ③：把入站请求里的来源 IP 原样带给后端。
 * 登录限速是**按 IP** 算的（后端取 XFF 首段），BFF 不透传的话后端只看得到 BFF 自己的地址——
 * 所有人共用一个计数，一个人试错就把全公司锁了。
 * 只转发这两个头、原样不加工：信任边界是内网反向代理（网关会覆盖 XFF）；
 * 一期不做可信代理白名单，它只护演示访客的限速，伪造的下场是多试几次登录。
 */
const FORWARDED_CLIENT_HEADERS = ["x-forwarded-for", "x-real-ip"] as const

export function internalApiHeaders(options: {
  config: InternalApiConfig
  requestId: string
  session?: SessionCookieResolution
  json?: boolean
  /** 入站请求；给了就把来源 IP 头带过去 */
  request?: Request
}): Headers {
  const headers = new Headers({
    accept: "application/json",
    authorization: `Bearer ${options.config.token}`,
    "x-request-id": options.requestId,
  })
  if (options.json) headers.set("content-type", "application/json")
  if (options.session?.status === "valid") headers.set("cookie", options.session.header)
  for (const name of FORWARDED_CLIENT_HEADERS) {
    const value = options.request?.headers.get(name)
    if (value) headers.set(name, value)
  }
  return headers
}

export function hasCorrelatedRequestId(upstream: Response, requestId: string): boolean {
  const header = upstream.headers.get("x-request-id")
  return header !== null && requestIdSchema.safeParse(header).success && header === requestId
}

export function bodyRequestId(body: unknown): string | null {
  if (typeof body !== "object" || body === null || Array.isArray(body)) return null
  const record = body as Record<string, unknown>
  const container = record.ok === true ? record.meta : record.error
  if (typeof container !== "object" || container === null || Array.isArray(container)) return null
  const requestId = (container as Record<string, unknown>).requestId
  return typeof requestId === "string" ? requestId : null
}

export async function readBoundedJson(upstream: Response): Promise<unknown | null> {
  const bytes = await readBoundedResponseBody(upstream)
  if (bytes === null) return null
  try {
    return JSON.parse(new TextDecoder().decode(bytes)) as unknown
  } catch {
    return undefined
  }
}

export async function readBoundedRequestJson(request: Request): Promise<unknown | null> {
  const declared = Number(request.headers.get("content-length") ?? "0")
  if (Number.isFinite(declared) && declared > MAX_BFF_REQUEST_BYTES) return null
  if (request.body === null || request.bodyUsed) return undefined
  const reader = request.body.getReader()
  try {
    const chunks: Uint8Array[] = []
    let total = 0
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.byteLength
      if (total > MAX_BFF_REQUEST_BYTES) {
        try { await reader.cancel() } catch { /* Cancellation must not expose a stream error. */ }
        return null
      }
      chunks.push(value)
    }
    const bytes = new Uint8Array(total)
    let offset = 0
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
    return JSON.parse(new TextDecoder().decode(bytes)) as unknown
  } catch {
    return undefined
  } finally {
    reader.releaseLock()
  }
}

export function isTimeoutCause(cause: unknown): boolean {
  return cause instanceof DOMException && (cause.name === "AbortError" || cause.name === "TimeoutError")
}

export function validatedSessionSetCookie(
  upstream: Response,
  expectation: "absent" | "active" | "cleared",
): string | null {
  const value = upstream.headers.get("set-cookie")
  if (expectation === "absent") return value === null ? "" : null
  if (value === null || /[\r\n]/.test(value)) return null
  const parts = value.split(";").map((part) => part.trim())
  const first = parts.shift()
  if (first === undefined || !first.startsWith(`${SESSION_COOKIE_NAME}=`)) return null
  const token = first.slice(SESSION_COOKIE_NAME.length + 1)
  const attributes = new Map<string, string>()
  for (const part of parts) {
    const [rawName, ...rest] = part.split("=")
    if (!rawName) return null
    const name = rawName.toLowerCase()
    if (attributes.has(name)) return null
    attributes.set(name, rest.join("="))
  }
  if (
    attributes.get("path") !== "/" ||
    !attributes.has("httponly") ||
    // Secure 默认必须有；只有显式 AUTH_COOKIE_INSECURE=1（本地/内测走 http 端口映射，无 TLS）才放行。
    // 与后端 session-http.ts 的 cookieSecureAttribute() 成对，生产禁止设置该变量。
    (!attributes.has("secure") && process.env.AUTH_COOKIE_INSECURE !== "1") ||
    attributes.get("samesite")?.toLowerCase() !== "lax" ||
    attributes.has("domain")
  ) return null
  const maxAge = attributes.get("max-age")
  if (maxAge === undefined || !/^\d+$/.test(maxAge)) return null
  if (expectation === "cleared") return token === "" && maxAge === "0" ? value : null
  return /^[A-Za-z0-9._~-]{32,512}$/.test(token) && Number(maxAge) > 0 ? value : null
}

export function internalJsonResponse<T>(result: InternalBffResult<T>): Response {
  const headers = new Headers({
    "cache-control": "no-store",
    "content-type": "application/json; charset=utf-8",
    "x-content-type-options": "nosniff",
    "x-request-id": result.requestId,
  })
  if (result.setCookie !== undefined) headers.set("set-cookie", result.setCookie)
  return new Response(JSON.stringify(result.body), { status: result.status, headers })
}
