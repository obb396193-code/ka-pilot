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
  memberCreatedSchema,
  memberPasswordResetSchema,
  namingRuleSchema,
  namingRulesTestSchema,
  taskBindingsSchema,
  taskDetailSchema,
  taskFunnelSchema,
  taskTimelineSchema,
  watchlistSchema,
  accountNamesConfirmSchema,
  accountNamesReparseSchema,
  accountTransferSchema,
  dailyReportSchema,
  kbBacklinksSchema,
  kbByObjectSchema,
  kbDeletedSchema,
  kbDocumentSchema,
  kbSearchSchema,
  kbTreeSchema,
  passwordChangedSchema,
  poolStatusRecordSchema,
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

// ── Q-030（arch 临时移交）：kb 七条 / 账户交接两条 / 自助改密 / 日报 ──────────
// 与上面九条同一套写法。`allowedQuery` 是白名单：没列的查询参数会被 forwarder 挡成
// 400，免得浏览器侧随手加个参数就越过后端的入参校验。

export const handleKbDocuments = (request: Request, deps: Deps): Promise<R014BffResult> =>
  forwardToBackend(request, {
    path: "/api/v1/kb/documents",
    method: request.method === "POST" ? "POST" : "GET",
    allowedQuery: ["parent_id", "kind", "visibility", "q", "page", "page_size"],
    // 建文档回单篇，列表回树——两种形状，按方法选。
    dataSchema: request.method === "POST" ? kbDocumentSchema : kbTreeSchema,
    ...withDeps(deps),
  })

export const handleKbDocument = (request: Request, documentId: string, deps: Deps): Promise<R014BffResult> =>
  forwardToBackend(request, {
    path: `/api/v1/kb/documents/${encodeURIComponent(documentId)}`,
    method: request.method === "PATCH" ? "PATCH" : request.method === "DELETE" ? "DELETE" : "GET",
    dataSchema: request.method === "DELETE" ? kbDeletedSchema : kbDocumentSchema,
    ...withDeps(deps),
  })

export const handleKbBacklinks = (request: Request, documentId: string, deps: Deps): Promise<R014BffResult> =>
  forwardToBackend(request, {
    path: `/api/v1/kb/documents/${encodeURIComponent(documentId)}/backlinks`,
    method: "GET",
    dataSchema: kbBacklinksSchema,
    ...withDeps(deps),
  })

export const handleKbSearch = (request: Request, deps: Deps): Promise<R014BffResult> =>
  forwardToBackend(request, {
    path: "/api/v1/kb/search",
    method: "GET",
    allowedQuery: ["q", "kind"],
    dataSchema: kbSearchSchema,
    ...withDeps(deps),
  })

export const handleKbByObject = (
  request: Request, objectType: string, objectId: string, deps: Deps,
): Promise<R014BffResult> =>
  forwardToBackend(request, {
    path: `/api/v1/kb/by-object/${encodeURIComponent(objectType)}/${encodeURIComponent(objectId)}`,
    method: "GET",
    dataSchema: kbByObjectSchema,
    ...withDeps(deps),
  })

export const handleAccountTransfer = (request: Request, deps: Deps): Promise<R014BffResult> =>
  forwardToBackend(request, {
    path: "/api/v1/accounts/transfer",
    method: "POST",
    dataSchema: accountTransferSchema,
    ...withDeps(deps),
  })

export const handleTransferAll = (request: Request, userId: string, deps: Deps): Promise<R014BffResult> =>
  forwardToBackend(request, {
    path: `/api/v1/users/${encodeURIComponent(userId)}/transfer-all`,
    method: "POST",
    dataSchema: accountTransferSchema,
    ...withDeps(deps),
  })

export const handleAuthPassword = (request: Request, deps: Deps): Promise<R014BffResult> =>
  forwardToBackend(request, {
    path: "/api/v1/auth/password",
    method: "POST",
    dataSchema: passwordChangedSchema,
    ...withDeps(deps),
  })

export const handleDailyReport = (request: Request, deps: Deps): Promise<R014BffResult> =>
  forwardToBackend(request, {
    path: "/api/v1/reports/daily",
    method: "GET",
    allowedQuery: ["date", "role"],
    dataSchema: dailyReportSchema,
    ...withDeps(deps),
  })

/* 新增成员 / 重置密码（契约 v1.9.5）——F8-11 */
export const handleAdminMemberCreate = (request: Request, deps: Deps): Promise<R014BffResult> =>
  forwardToBackend(request, {
    path: "/api/v1/admin/members",
    method: "POST",
    dataSchema: memberCreatedSchema,
    ...withDeps(deps),
  })

// 密码类端点一律不开查询参数白名单：连 ?debug= 这种都不许透过去
export const handleAdminMemberResetPassword = (request: Request, identityId: string, deps: Deps): Promise<R014BffResult> =>
  forwardToBackend(request, {
    path: `/api/v1/admin/members/${encodeURIComponent(identityId)}/reset-password`,
    method: "POST",
    dataSchema: memberPasswordResetSchema,
    ...withDeps(deps),
  })

export const handleAccountPoolStatus = (
  request: Request, media: string, accountId: string, deps: Deps,
): Promise<R014BffResult> =>
  forwardToBackend(request, {
    path: `/api/v1/accounts/${encodeURIComponent(media)}/${encodeURIComponent(accountId)}/pool-status`,
    method: request.method === "DELETE" ? "DELETE" : "PATCH",
    dataSchema: poolStatusRecordSchema,
    ...withDeps(deps),
  })

export const handleAdminAccountNamesConfirm = (request: Request, deps: Deps): Promise<R014BffResult> =>
  forwardToBackend(request, {
    path: "/api/v1/admin/account-names/confirm",
    method: "POST",
    dataSchema: accountNamesConfirmSchema,
    ...withDeps(deps),
  })

export const handleAdminAccountNamesReparse = (request: Request, deps: Deps): Promise<R014BffResult> =>
  forwardToBackend(request, {
    path: "/api/v1/admin/account-names/reparse",
    method: "POST",
    allowedQuery: ["media"],
    dataSchema: accountNamesReparseSchema,
    ...withDeps(deps),
  })

export const handleTaskTimeline = (request: Request, taskId: string, deps: Deps): Promise<R014BffResult> =>
  forwardToBackend(request, {
    path: `/api/v1/tasks/${encodeURIComponent(taskId)}/timeline`,
    method: "GET",
    allowedQuery: ["cursor", "limit", "kinds"],
    dataSchema: taskTimelineSchema,
    ...withDeps(deps),
  })

export const handleTaskFunnel = (request: Request, taskId: string, deps: Deps): Promise<R014BffResult> =>
  forwardToBackend(request, {
    path: `/api/v1/tasks/${encodeURIComponent(taskId)}/funnel`,
    method: "GET",
    allowedQuery: ["date_from", "date_to"],
    dataSchema: taskFunnelSchema,
    ...withDeps(deps),
  })

/**
 * 契约点名一期 501 的两签。BFF 照样透传，让前端拿到 501 而不是 404——
 * 「一期不做」和「路径写错」必须分得开。
 */
export const handleTaskDeferredTab = (
  request: Request, taskId: string, tab: "materials" | "review", deps: Deps,
): Promise<R014BffResult> =>
  forwardToBackend(request, {
    path: `/api/v1/tasks/${encodeURIComponent(taskId)}/${tab}`,
    method: "GET",
    ...withDeps(deps),
  })
