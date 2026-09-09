import { forwardToBackend, type R014BffResult } from "./forwarder.ts"
import {
  accountPipelineSchema,
  capabilityListSchema,
  decisionPolicySchema,
  exportQueuedSchema,
  exportRecordSchema,
  meCountsSchema,
  meNotificationsReadSchema,
  meNotificationsSchema,
  mePreferencesSchema,
  meWorkloadSchema,
  readinessOverrideSchema,
  savedViewListSchema,
  savedViewSchema,
  searchResultSchema,
  accountNamePatchSchema,
  accountNamesSchema,
  namingRuleSchema,
  namingRulesTestSchema,
  taskBindingsSchema,
  taskDetailSchema,
  watchlistSchema,
} from "./schemas.ts"

type Environment = Record<string, string | undefined>
type Deps = { environment: Environment; fetchImpl?: Parameters<typeof forwardToBackend>[1]["fetchImpl"]; requestId?: () => string }

const withDeps = (deps: Deps) => ({
  environment: deps.environment as Parameters<typeof forwardToBackend>[1]["environment"],
  ...(deps.fetchImpl === undefined ? {} : { fetchImpl: deps.fetchImpl }),
  ...(deps.requestId === undefined ? {} : { requestId: deps.requestId }),
})

export const handleMeCounts = (request: Request, deps: Deps): Promise<R014BffResult> =>
  forwardToBackend(request, { path: "/api/v1/me/counts", method: "GET", dataSchema: meCountsSchema, ...withDeps(deps) })

export const handleMePreferences = (request: Request, deps: Deps): Promise<R014BffResult> =>
  forwardToBackend(request, {
    path: "/api/v1/me/preferences",
    method: request.method === "PATCH" ? "PATCH" : "GET",
    dataSchema: mePreferencesSchema,
    ...withDeps(deps),
  })

export const handleMeWorkload = (request: Request, deps: Deps): Promise<R014BffResult> =>
  forwardToBackend(request, { path: "/api/v1/me/workload", method: "GET", dataSchema: meWorkloadSchema, ...withDeps(deps) })

export const handleMeNotifications = (request: Request, deps: Deps): Promise<R014BffResult> =>
  forwardToBackend(request, {
    path: "/api/v1/me/notifications",
    method: "GET",
    allowedQuery: ["cursor", "limit", "unread_only"],
    dataSchema: meNotificationsSchema,
    ...withDeps(deps),
  })

export const handleMeNotificationsRead = (request: Request, deps: Deps): Promise<R014BffResult> =>
  forwardToBackend(request, {
    path: "/api/v1/me/notifications/read",
    method: "POST",
    dataSchema: meNotificationsReadSchema,
    ...withDeps(deps),
  })

export const handleSearch = (request: Request, deps: Deps): Promise<R014BffResult> =>
  forwardToBackend(request, {
    path: "/api/v1/search",
    method: "GET",
    allowedQuery: ["q", "type"],
    dataSchema: searchResultSchema,
    ...withDeps(deps),
  })

export const handleAccountPipeline = (request: Request, deps: Deps): Promise<R014BffResult> =>
  forwardToBackend(request, {
    path: "/api/v1/accounts/pipeline",
    method: "GET",
    allowedQuery: ["media"],
    dataSchema: accountPipelineSchema,
    ...withDeps(deps),
  })

/* ── S5b：其余同源路由 ─────────────────────────────────────────────── */

export const handleMeViews = (request: Request, deps: Deps): Promise<R014BffResult> =>
  forwardToBackend(request, {
    path: "/api/v1/me/views",
    method: request.method === "POST" ? "POST" : "GET",
    allowedQuery: ["page"],
    dataSchema: request.method === "POST" ? savedViewSchema : savedViewListSchema,
    ...withDeps(deps),
  })

/** 路径参数由路由文件解出来再传进来：转发器不认识路径形状，避免它去猜哪一段是 id。 */
export const handleMeView = (request: Request, viewId: string, deps: Deps): Promise<R014BffResult> =>
  forwardToBackend(request, {
    path: `/api/v1/me/views/${encodeURIComponent(viewId)}`,
    method: request.method === "DELETE" ? "DELETE" : "PATCH",
    dataSchema: savedViewSchema,
    ...withDeps(deps),
  })

export const handleMeWatchlist = (request: Request, deps: Deps): Promise<R014BffResult> =>
  forwardToBackend(request, {
    path: "/api/v1/me/watchlist",
    method: request.method === "PUT" ? "PUT" : "GET",
    dataSchema: watchlistSchema,
    ...withDeps(deps),
  })

export const handleTaskDetail = (request: Request, taskId: string, deps: Deps): Promise<R014BffResult> =>
  forwardToBackend(request, {
    path: `/api/v1/tasks/${encodeURIComponent(taskId)}`,
    method: "GET",
    dataSchema: taskDetailSchema,
    ...withDeps(deps),
  })

export const handleTaskBindings = (request: Request, taskId: string, deps: Deps): Promise<R014BffResult> =>
  forwardToBackend(request, {
    path: `/api/v1/tasks/${encodeURIComponent(taskId)}/bindings`,
    method: "GET",
    dataSchema: taskBindingsSchema,
    ...withDeps(deps),
  })

export const handleTaskReadiness = (
  request: Request, taskId: string, dimension: string, deps: Deps,
): Promise<R014BffResult> =>
  forwardToBackend(request, {
    path: `/api/v1/tasks/${encodeURIComponent(taskId)}/readiness/${encodeURIComponent(dimension)}`,
    method: "PUT",
    dataSchema: readinessOverrideSchema,
    ...withDeps(deps),
  })

export const handleCapabilities = (request: Request, deps: Deps): Promise<R014BffResult> =>
  forwardToBackend(request, {
    path: "/api/v1/capabilities",
    method: "GET",
    allowedQuery: ["category"],
    dataSchema: capabilityListSchema,
    ...withDeps(deps),
  })

export const handleDecisionPolicy = (request: Request, deps: Deps): Promise<R014BffResult> =>
  forwardToBackend(request, {
    path: "/api/v1/settings/decision-policy",
    method: request.method === "PUT" ? "PUT" : "GET",
    dataSchema: decisionPolicySchema,
    ...withDeps(deps),
  })

export const handleExportCreate = (request: Request, deps: Deps): Promise<R014BffResult> =>
  forwardToBackend(request, {
    path: "/api/v1/export", method: "POST", dataSchema: exportQueuedSchema, ...withDeps(deps),
  })

export const handleExportDetail = (request: Request, exportId: string, deps: Deps): Promise<R014BffResult> =>
  forwardToBackend(request, {
    path: `/api/v1/exports/${encodeURIComponent(exportId)}`,
    method: "GET",
    dataSchema: exportRecordSchema,
    ...withDeps(deps),
  })

/* 归属清洗（契约 v1.8）——F8-9 */
export const handleAdminNamingRules = (request: Request, deps: Deps): Promise<R014BffResult> =>
  forwardToBackend(request, {
    path: "/api/v1/admin/naming-rules",
    method: request.method === "PUT" ? "PUT" : "GET",
    dataSchema: namingRuleSchema,
    allowedQuery: ["media"],
    ...withDeps(deps),
  })

export const handleAdminNamingRulesTest = (request: Request, deps: Deps): Promise<R014BffResult> =>
  forwardToBackend(request, {
    path: "/api/v1/admin/naming-rules/test",
    method: "POST",
    dataSchema: namingRulesTestSchema,
    allowedQuery: ["media"],
    ...withDeps(deps),
  })

export const handleAdminAccountNames = (request: Request, deps: Deps): Promise<R014BffResult> =>
  forwardToBackend(request, {
    path: "/api/v1/admin/account-names",
    method: "GET",
    dataSchema: accountNamesSchema,
    allowedQuery: ["media", "status", "q", "page", "pageSize"],
    ...withDeps(deps),
  })

export const handleAdminAccountNamePatch = (request: Request, media: string, accountId: string, deps: Deps): Promise<R014BffResult> =>
  forwardToBackend(request, {
    path: `/api/v1/admin/account-names/${encodeURIComponent(media)}/${encodeURIComponent(accountId)}`,
    method: "PATCH",
    dataSchema: accountNamePatchSchema,
    ...withDeps(deps),
  })
