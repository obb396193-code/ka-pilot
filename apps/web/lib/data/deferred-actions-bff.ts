import { z } from "zod"
import { forwardToBackend, type ForwardOptions, type R014BffResult } from "./r014/forwarder.ts"

type Deps = Pick<ForwardOptions, "environment" | "fetchImpl" | "requestId">
// A deferred command has no success response. Even a spurious 204 must not make
// the UI claim that a write happened. Reuse shared authentication/error limits.
async function deferred(request: Request, path: string, method: "POST" | "PUT", deps: Deps): Promise<R014BffResult> {
  const result = await forwardToBackend(request, { ...deps, path, method, dataSchema: z.never() })
  if (result.status < 200 || result.status >= 300) return result
  return { status: 502, requestId: result.requestId, body: { ok: false, error: {
    code: "UPSTREAM_INVALID_RESPONSE", message: "A deferred operation cannot return success", retryable: false, requestId: result.requestId,
  } } }
}
export const handleStopAccountTest = (r: Request, media: string, accountId: string, testId: string, d: Deps) =>
  deferred(r, `/api/v1/accounts/${encodeURIComponent(media)}/${encodeURIComponent(accountId)}/tests/${encodeURIComponent(testId)}/stop`, "POST", d)
export const handlePromoteAutonomy = (r: Request, ruleId: string, d: Deps) =>
  deferred(r, `/api/v1/rules/${encodeURIComponent(ruleId)}/autonomy/promote`, "POST", d)
export const handleReplicateMaterial = (r: Request, id: string, d: Deps) =>
  deferred(r, `/api/v1/materials/${encodeURIComponent(id)}/replicate`, "POST", d)
export const handleMaterialDelivery = (r: Request, d: Deps) => deferred(r, "/api/v1/materials/deliveries", "POST", d)
export const handleImpactEstimate = (r: Request, d: Deps) => deferred(r, "/api/v1/reports/ai-impact/estimates", "PUT", d)
export const handleMonthlyDecision = (r: Request, d: Deps) => deferred(r, "/api/v1/reports/monthly-exec/decisions", "POST", d)
export const handleSearchAction = (r: Request, d: Deps) => deferred(r, "/api/v1/search/actions", "POST", d)
