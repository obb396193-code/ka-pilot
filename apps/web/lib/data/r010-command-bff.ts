import { z } from "zod"
import {
  createRequestId, hasCorrelatedRequestId, internalApiHeaders, isTimeoutCause, MAX_BFF_REQUEST_BYTES,
  resolveInternalApiConfig, resolveSessionCookie, validatedSessionSetCookie,
  type FetchLike, type InternalApiEnvironment, type InternalBffResult,
} from "./internal-api-bff.ts"
import { readBoundedResponseBody } from "./bounded-response.ts"
import {
  commandErrorSchema, commandErrorStatus, commandSuccessSchema, dryRunRequestSchema, ignoreRequestSchema, muteRequestSchema,
  preflightPresentationResponseSchema,
  type CommandErrorCode, type CommandResponse,
} from "./r010-command-contracts.ts"
import { isRetryableErrorCode } from "./contracts.ts"

type Command = { kind: "mute" | "ignore" | "dry-run"; upstreamPath: string }
const targetSchema = z.object({ media: z.string().min(1).max(32).regex(/^[A-Z0-9_]+$/),
  accountId: z.string().min(1).max(128).regex(/^[A-Za-z0-9_-]+$/) }).strict()
const messages: Record<CommandErrorCode, string> = {
  INVALID_REQUEST: "Invalid request", UNAUTHORIZED: "Authentication required", FORBIDDEN: "Access not allowed",
  NOT_FOUND: "Object not found", INVALID_STATE: "Object state does not allow this operation", FROM_VALUE_CHANGED: "Current value changed",
  SOURCE_UNAVAILABLE: "Source unavailable", SOURCE_TRUNCATED: "Response exceeds the safe limit",
  UPSTREAM_TIMEOUT: "Upstream request timed out", UPSTREAM_INVALID_RESPONSE: "Invalid upstream response", INTERNAL_ERROR: "Internal error",
  // 这张表是 BFF 自己造错误时的兜底英文；到用户眼前的中文走 contracts.ts 的 resolveErrorMessage
  READ_ONLY_ROLE: "Read-only role", RATE_LIMITED: "Too many requests",
}

function commandPath(pathname: string): Command | "invalid" | null {
  const mute = /^\/api\/internal\/accounts\/([^/]+)\/([^/]+)\/mute$/.exec(pathname)
  const item = /^\/api\/internal\/(work-items|changesets)\/([^/]+)\/(ignore|dry-run)$/.exec(pathname)
  try {
    if (mute) {
      const parsed = targetSchema.safeParse({ media: decodeURIComponent(mute[1]!), accountId: decodeURIComponent(mute[2]!) })
      return parsed.success ? { kind: "mute", upstreamPath: `/api/v1/accounts/${parsed.data.media}/${parsed.data.accountId}/mute` } : "invalid"
    }
    if (item && ((item[1] === "work-items" && item[3] === "ignore") || (item[1] === "changesets" && item[3] === "dry-run"))) {
      const id = z.string().uuid().safeParse(decodeURIComponent(item[2]!))
      return id.success ? { kind: item[3] as "ignore" | "dry-run", upstreamPath: `/api/v1/${item[1]}/${id.data}/${item[3]}` } : "invalid"
    }
    return null
  } catch { return "invalid" }
}

// Tagged results distinguish valid JSON null from an oversized stream. No clone,
// unbounded Request.json(), or Content-Length-only trust on a mutation request.
async function readRequest(request: Request): Promise<{ kind: "json"; value: unknown } | { kind: "oversize" | "invalid" }> {
  const declared = Number(request.headers.get("content-length") ?? "0")
  if (Number.isFinite(declared) && declared > MAX_BFF_REQUEST_BYTES) {
    try { await request.body?.cancel() } catch { /* Ignore transport details. */ }
    return { kind: "oversize" }
  }
  if (!request.body || request.bodyUsed) return { kind: "invalid" }
  const reader = request.body.getReader()
  try {
    const chunks: Uint8Array[] = []
    let total = 0
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.byteLength
      if (total > MAX_BFF_REQUEST_BYTES) {
        try { await reader.cancel() } catch { /* Ignore transport details. */ }
        return { kind: "oversize" }
      }
      chunks.push(value)
    }
    const bytes = new Uint8Array(total)
    let offset = 0
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
    return { kind: "json", value: JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as unknown }
  } catch { return { kind: "invalid" } }
  finally { reader.releaseLock() }
}

export async function handleR010CommandRequest(request: Request, deps: {
  environment: InternalApiEnvironment; fetchImpl?: FetchLike; requestId?: () => string,
}): Promise<InternalBffResult<CommandResponse>> {
  const requestId = createRequestId(deps.requestId)
  const url = new URL(request.url), command = commandPath(url.pathname)
  const kind = command !== null && command !== "invalid" ? command.kind : undefined
  function fail(code: CommandErrorCode, status = commandErrorStatus[code]): InternalBffResult<CommandResponse> {
    const message = code === "SOURCE_UNAVAILABLE" && kind === "dry-run" ? "媒体只读通道未接入，试运行无法读取现值" : messages[code]
    return { status, requestId, body: { ok: false, error: { code, message,
      retryable: isRetryableErrorCode(code), requestId } } }
  }
  if (command === null) return fail("NOT_FOUND")
  if (command === "invalid") return fail("INVALID_REQUEST")
  if (request.method !== "POST") return fail("INVALID_REQUEST", 405)
  if (url.search !== "") return fail("INVALID_REQUEST")
  // Browser-controlled Fetch Metadata survives reverse proxies where request.url
  // contains localhost, not the public origin. Same-site is not same-origin.
  // Legacy clients must supply an exact Origin; never trust forwarded host.
  const fetchSite = request.headers.get("sec-fetch-site")
  if (fetchSite !== null ? fetchSite !== "same-origin" : request.headers.get("origin") !== url.origin) return fail("FORBIDDEN")
  if (request.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() !== "application/json") return fail("INVALID_REQUEST")
  const session = resolveSessionCookie(request)
  if (session.status !== "valid") return fail("UNAUTHORIZED")
  const config = resolveInternalApiConfig(deps.environment)
  if (config === null) return fail("SOURCE_UNAVAILABLE")
  const input = await readRequest(request)
  if (input.kind === "oversize") return fail("INVALID_REQUEST", 413)
  if (input.kind !== "json") return fail("INVALID_REQUEST")
  const parsed = (kind === "mute" ? muteRequestSchema : kind === "ignore" ? ignoreRequestSchema : dryRunRequestSchema).safeParse(input.value)
  if (!parsed.success) return fail("INVALID_REQUEST")
  try {
    const upstream = await (deps.fetchImpl ?? fetch)(config.origin + command.upstreamPath, {
      method: "POST", headers: internalApiHeaders({ config, session, requestId, json: true }), body: JSON.stringify(parsed.data),
      cache: "no-store", redirect: "error", signal: AbortSignal.timeout(10_000),
    })
    if (!hasCorrelatedRequestId(upstream, requestId) || validatedSessionSetCookie(upstream, "absent") === null) {
      try { await upstream.body?.cancel() } catch { /* No upstream details in errors. */ }
      return fail("UPSTREAM_INVALID_RESPONSE")
    }
    const bytes = await readBoundedResponseBody(upstream)
    if (bytes === null) {
      try { await upstream.body?.cancel() } catch { /* May already have been cancelled. */ }
      return fail("SOURCE_TRUNCATED")
    }
    let raw: unknown
    try { raw = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as unknown }
    catch { return fail("UPSTREAM_INVALID_RESPONSE") }
    if (upstream.status === 200) {
      if (kind === "dry-run") {
        const result = preflightPresentationResponseSchema.safeParse(raw)
        if (!result.success || !result.data.ok || result.data.meta.requestId !== requestId ||
          command.upstreamPath !== `/api/v1/changesets/${result.data.data.changesetId}/dry-run`)
          return fail("UPSTREAM_INVALID_RESPONSE")
        return { status: 200, requestId, body: result.data }
      }
      // A plain ignore must not masquerade as ignore+mute.
      if (kind === "ignore" && !("mute_days" in parsed.data)) return fail("UPSTREAM_INVALID_RESPONSE")
      const result = commandSuccessSchema.safeParse(raw)
      if (!result.success || result.data.meta.requestId !== requestId) return fail("UPSTREAM_INVALID_RESPONSE")
      return { status: 200, requestId, body: result.data }
    }
    const result = commandErrorSchema.safeParse(raw)
    if (!result.success || result.data.error.requestId !== requestId || commandErrorStatus[result.data.error.code] !== upstream.status)
      return fail("UPSTREAM_INVALID_RESPONSE")
    return fail(result.data.error.code)
  } catch (error) { return fail(isTimeoutCause(error) ? "UPSTREAM_TIMEOUT" : "SOURCE_UNAVAILABLE") }
}
