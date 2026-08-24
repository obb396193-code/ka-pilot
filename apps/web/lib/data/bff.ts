import { randomUUID } from "node:crypto"
import { resolveServerAuthContext, type ApprovedAuthContextResolver, type DataQueryServerEnvironment, type ServerAuthContext } from "./auth-context.ts"
import { dataQueryRequestSchema, dataQueryResponseSchema, type DataQueryResponse, type StableDataQueryError } from "./contracts.ts"

export const BACKEND_DATA_QUERY_PATH = "/api/v1/data/query"
export const MAX_UPSTREAM_BODY_BYTES = 16 * 1024 * 1024
type FetchLike = (input: string, init?: RequestInit) => Promise<Response>
type Dependencies = { backendOrigin: string; serviceToken?: string; authContext: ServerAuthContext | null; fetchImpl?: FetchLike; requestId?: () => string }
type RequestHandlerDependencies = { environment: DataQueryServerEnvironment; approvedAuthContextResolver: ApprovedAuthContextResolver; fetchImpl?: FetchLike; requestId?: () => string }
export type BffResult = { status: number; body: DataQueryResponse }
function error(code: StableDataQueryError["code"], message: string, retryable: boolean, requestId: string): DataQueryResponse { return { ok: false, error: { code, message, retryable, requestId } } }
function normalizedOrigin(value: string) {
  const url = new URL(value)
  if (!["https:", "http:"].includes(url.protocol) || url.username || url.password || url.search || url.hash || (url.pathname !== "/" && url.pathname !== "")) throw new Error("Backend origin must be an origin without path, credentials, query, or hash")
  return url.origin
}
export async function forwardDataQuery(input: unknown, dependencies: Dependencies): Promise<BffResult> {
  const requestId = (dependencies.requestId ?? randomUUID)()
  const parsed = dataQueryRequestSchema.safeParse(input)
  if (!parsed.success) return { status: 400, body: error("INVALID_REQUEST", "Invalid canonical data query request", false, requestId) }
  if (dependencies.authContext === null) return { status: 403, body: error("FORBIDDEN", "Approved server-side account scope is unavailable", false, requestId) }
  if (!dependencies.serviceToken?.trim()) return { status: 503, body: error("INTERNAL_ERROR", "Data query service credential is not configured", false, requestId) }
  let endpoint: string
  try { endpoint = `${normalizedOrigin(dependencies.backendOrigin)}${BACKEND_DATA_QUERY_PATH}` } catch { return { status: 503, body: error("INTERNAL_ERROR", "Data query backend is not configured safely", false, requestId) } }
  try {
    const headers = new Headers({ "content-type": "application/json", accept: "application/json", "x-request-id": requestId })
    headers.set("authorization", `Bearer ${dependencies.serviceToken}`)
    headers.set("x-ka-workspace-id", dependencies.authContext.workspaceId)
    headers.set("x-ka-user-id", dependencies.authContext.userId)
    headers.set("x-ka-account-scope", Buffer.from(JSON.stringify(dependencies.authContext.allowedAccounts)).toString("base64url"))
    const upstream = await (dependencies.fetchImpl ?? fetch)(endpoint, { method: "POST", headers, body: JSON.stringify(parsed.data), redirect: "error", cache: "no-store", signal: AbortSignal.timeout(10_000) })
    const contentLength = Number(upstream.headers.get("content-length") ?? "0")
    if (Number.isFinite(contentLength) && contentLength > MAX_UPSTREAM_BODY_BYTES) return { status: 502, body: error("UPSTREAM_INVALID_RESPONSE", "Upstream response exceeded the 16 MB safety limit", false, requestId) }
    const bytes = await upstream.arrayBuffer()
    if (bytes.byteLength > MAX_UPSTREAM_BODY_BYTES) return { status: 502, body: error("UPSTREAM_INVALID_RESPONSE", "Upstream response exceeded the 16 MB safety limit", false, requestId) }
    let json: unknown
    try { json = JSON.parse(new TextDecoder().decode(bytes)) } catch {
      const code = upstream.status === 401 ? "UNAUTHORIZED" : upstream.status === 403 ? "FORBIDDEN" : "UPSTREAM_INVALID_RESPONSE"
      return { status: upstream.status === 401 || upstream.status === 403 ? upstream.status : 502, body: error(code, "Upstream returned a non-JSON response", false, requestId) }
    }
    const envelope = dataQueryResponseSchema.safeParse(json)
    if (!envelope.success) return { status: 502, body: error("UPSTREAM_INVALID_RESPONSE", "Upstream response did not match the canonical contract", false, requestId) }
    return { status: upstream.status, body: envelope.data }
  } catch (cause) {
    const timeout = cause instanceof DOMException && cause.name === "AbortError"
    return { status: timeout ? 504 : 502, body: error(timeout ? "UPSTREAM_TIMEOUT" : "SOURCE_UNAVAILABLE", timeout ? "Data query timed out" : "Data query source is unavailable", true, requestId) }
  }
}

export async function handleDataQueryRequest(request: Request, dependencies: RequestHandlerDependencies): Promise<BffResult> {
  let body: unknown
  try { body = await request.json() } catch { body = null }
  const authContext = await resolveServerAuthContext({
    environment: dependencies.environment,
    approvedAuthContextResolver: dependencies.approvedAuthContextResolver,
  })
  return forwardDataQuery(body, {
    backendOrigin: dependencies.environment.KA_DATA_BACKEND_ORIGIN ?? "",
    serviceToken: dependencies.environment.KA_DATA_SERVICE_TOKEN,
    authContext,
    fetchImpl: dependencies.fetchImpl,
    requestId: dependencies.requestId,
  })
}
