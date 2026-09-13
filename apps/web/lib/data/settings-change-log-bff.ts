import { parseSettingsChangeLogSearch, settingsChangeLogResponseSchema } from "../../../../packages/domain/src/settings-change-log.ts"
import { commandErrorSchema, type CommandErrorCode } from "./r010-command-contracts.ts"
import { readBoundedResponseBody } from "./bounded-response.ts"
import { createRequestId, hasCorrelatedRequestId, internalApiHeaders, isTimeoutCause,
  resolveInternalApiConfig, resolveSessionCookie, validatedSessionSetCookie,
  type FetchLike, type InternalApiEnvironment, type InternalBffResult } from "./internal-api-bff.ts"

const statuses = { INVALID_REQUEST: 400, UNAUTHORIZED: 401, FORBIDDEN: 403, SOURCE_UNAVAILABLE: 503,
  SOURCE_TRUNCATED: 502, UPSTREAM_INVALID_RESPONSE: 502, UPSTREAM_TIMEOUT: 504, INTERNAL_ERROR: 500 } as const
type ErrorCode = keyof typeof statuses
type ResponseBody = ReturnType<typeof settingsChangeLogResponseSchema.parse> | ReturnType<typeof commandErrorSchema.parse>

/** Read-only passthrough: filters are shared with Worker; business values are never recomputed. */
export async function handleSettingsChangeLogRequest(request: Request, deps: {
  environment: InternalApiEnvironment; fetchImpl?: FetchLike; requestId?: () => string,
}): Promise<InternalBffResult<ResponseBody>> {
  const requestId = createRequestId(deps.requestId)
  function fail(code: ErrorCode, status: number = statuses[code]): InternalBffResult<ResponseBody> {
    return { status, requestId, body: { ok: false, error: { code, message: "Change log request could not be completed", requestId, retryable: false } } }
  }
  if (request.method !== "GET") return fail("INVALID_REQUEST", 405)
  let input
  try { input = parseSettingsChangeLogSearch(new URL(request.url).searchParams) }
  catch { return fail("INVALID_REQUEST") }
  const session = resolveSessionCookie(request)
  if (session.status !== "valid") return fail("UNAUTHORIZED")
  const config = resolveInternalApiConfig(deps.environment)
  if (!config) return fail("SOURCE_UNAVAILABLE")
  const url = new URL("/api/v1/settings/change-log", config.origin)
  for (const [key, value] of Object.entries(input)) url.searchParams.set(key, Array.isArray(value) ? value.join(",") : value)
  try {
    const upstream = await (deps.fetchImpl ?? fetch)(url.toString(), {
      method: "GET", headers: internalApiHeaders({ config, requestId, session }),
      redirect: "error", cache: "no-store", signal: AbortSignal.timeout(10_000),
    })
    if (!hasCorrelatedRequestId(upstream, requestId) || validatedSessionSetCookie(upstream, "absent") === null) {
      try { await upstream.body?.cancel() } catch { /* Do not expose transport details. */ }
      return fail("UPSTREAM_INVALID_RESPONSE")
    }
    const bytes = await readBoundedResponseBody(upstream)
    if (bytes === null) {
      try { await upstream.body?.cancel() } catch { /* May already be cancelled. */ }
      return fail("SOURCE_TRUNCATED")
    }
    let raw: unknown
    try { raw = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) }
    catch { return fail("UPSTREAM_INVALID_RESPONSE") }
    if (upstream.status === 200) {
      const parsed = settingsChangeLogResponseSchema.safeParse(raw)
      if (!parsed.success || parsed.data.meta.requestId !== requestId) return fail("UPSTREAM_INVALID_RESPONSE")
      if (parsed.data.data.items.some(row =>
        (input.kinds !== undefined && !input.kinds.includes(row.kind)) ||
        (input.task_id !== undefined && "taskId" in row.scope && row.scope.taskId !== input.task_id) ||
        (input.media !== undefined && "media" in row.scope && row.scope.media !== input.media))) return fail("UPSTREAM_INVALID_RESPONSE")
      return { status: 200, requestId, body: parsed.data }
    }
    const error = commandErrorSchema.safeParse(raw)
    if (!error.success || error.data.error.requestId !== requestId) return fail("UPSTREAM_INVALID_RESPONSE")
    const code: CommandErrorCode = error.data.error.code
    if (!Object.hasOwn(statuses, code) || upstream.status !== statuses[code as ErrorCode]) return fail("UPSTREAM_INVALID_RESPONSE")
    // Preserve stable code/status, never relay arbitrary upstream diagnostic messages.
    return fail(code as ErrorCode)
  } catch (error) {
    return fail(isTimeoutCause(error) ? "UPSTREAM_TIMEOUT" : "SOURCE_UNAVAILABLE")
  }
}
