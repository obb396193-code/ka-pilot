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

export function internalApiHeaders(options: {
  config: InternalApiConfig
  requestId: string
  session?: SessionCookieResolution
  json?: boolean
}): Headers {
  const headers = new Headers({
    accept: "application/json",
    authorization: `Bearer ${options.config.token}`,
    "x-request-id": options.requestId,
  })
  if (options.json) headers.set("content-type", "application/json")
  if (options.session?.status === "valid") headers.set("cookie", options.session.header)
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
  const bytes = new Uint8Array(await request.arrayBuffer())
  if (bytes.byteLength > MAX_BFF_REQUEST_BYTES) return null
  try {
    return JSON.parse(new TextDecoder().decode(bytes)) as unknown
  } catch {
    return undefined
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
    !attributes.has("secure") ||
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
