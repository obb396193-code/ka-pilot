import { z } from "zod"

// apps/web 不依赖 @ka/domain，契约按既有做法在前端侧镜像。
// 这些 schema 逐条对应 packages/domain/src/r014/*，改后端必须同步改这里——
// 不同步的后果是 BFF 以 UPSTREAM_INVALID_RESPONSE 挡住，正是这层校验的用处。
const ratioValueSchema = z.object({
  value: z.number().finite().nullable(),
  state: z.enum(["finite", "infinite", "undefined"]),
}).strict()

const metricValueSchema = z.object({
  value: z.number().finite().nullable(),
  availability: z.enum(["available", "missing", "error"]),
}).strict()

/* me/counts（v1.7.1） */
export const meCountsSchema = z.object({
  workItems: z.object({
    open: z.number().int().nonnegative(),
    p0: z.number().int().nonnegative(),
    p1: z.number().int().nonnegative(),
    opportunity: z.number().int().nonnegative(),
  }).strict(),
  approvalsToApprove: z.number().int().nonnegative(),
  dispatchesReceived: z.number().int().nonnegative(),
  runsWaitingConfirmation: z.number().int().nonnegative(),
  notificationsUnread: z.number().int().nonnegative(),
  changesetsDraft: z.number().int().nonnegative(),
}).strict()

/* me/preferences（v1.7.1） */
export const mePreferencesSchema = z.object({
  theme: z.object({
    mode: z.enum(["bw", "bwc", "full"]),
    hue: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  }).strict(),
  locale: z.string().min(2).max(35).nullable(),
  updatedAt: z.string().datetime({ offset: true }).nullable(),
}).strict()

/* me/workload（v1.7.4 G9） */
export const meWorkloadSchema = z.object({
  tasks: z.object({ owned: z.number().int().nonnegative(), participating: z.number().int().nonnegative() }).strict(),
  accounts: z.object({ owned: z.number().int().nonnegative(), watching: z.number().int().nonnegative() }).strict(),
  pending: z.object({
    workItems: z.number().int().nonnegative(),
    approvals: z.number().int().nonnegative(),
    dispatches: z.number().int().nonnegative(),
    runsWaitingConfirmation: z.number().int().nonnegative(),
  }).strict(),
  oncall: z.object({
    today: z.boolean(),
    next: z.object({ at: z.string().min(1), role: z.string().min(1) }).strict().nullable(),
  }).strict(),
  loadScore: z.object({
    value: ratioValueSchema,
    source: z.enum(["not_configured", "formula", "manual"]),
    formula: z.string().min(1).nullable(),
  }).strict(),
}).strict()

/* me/notifications（v1.7.8 G10） */
export const meNotificationsSchema = z.object({
  items: z.array(z.object({
    id: z.string().min(1),
    kind: z.enum(["alert", "approval", "dispatch", "run", "system"]),
    severity: z.enum(["p0", "p1", "p2", "info", "warning"]),
    title: z.string().min(1),
    body: z.string(),
    at: z.string().datetime({ offset: true }),
    read: z.boolean(),
    ref: z.object({ type: z.string().min(1), id: z.string().min(1) }).strict().nullable(),
    href: z.string().min(1),
  }).strict()),
  unread: z.number().int().nonnegative(),
  nextCursor: z.string().min(1).nullable(),
}).strict()

export const meNotificationsReadSchema = z.object({ unread: z.number().int().nonnegative() }).strict()

/* search（v1.7.4 G6 + v1.9 ⑦：后端只出机器 meta，中文由前端组装） */
export const searchResultSchema = z.object({
  items: z.array(z.object({
    type: z.enum(["account", "task", "work_item", "material", "document"]),
    id: z.string().min(1),
    title: z.string().min(1),
    meta: z.object({
      status: z.string().min(1).optional(),
      stage: z.string().min(1).optional(),
      taskName: z.string().min(1).optional(),
      accountCount: z.number().int().nonnegative().optional(),
      severity: z.string().min(1).optional(),
      kind: z.string().min(1).optional(),
      durationMs: z.number().int().nonnegative().optional(),
      analysisVersion: z.number().int().nonnegative().optional(),
    }).strict(),
    href: z.string().min(1),
    workspaceKind: z.enum(["personal", "team"]),
  }).strict()),
}).strict()

/* accounts/pipeline（v1.5.1 ①） */
export const POOL_STATUS_ORDER = [
  "available", "assigned", "pending_open", "pending_recharge", "pending_build",
  "in_delivery", "paused", "closed", "abnormal",
] as const

export const accountPipelineSchema = z.object({
  stages: z.array(z.object({
    poolStatus: z.enum(POOL_STATUS_ORDER),
    count: z.number().int().nonnegative(),
    deltaVsYesterday: metricValueSchema,
  }).strict()).length(POOL_STATUS_ORDER.length),
  asOf: z.string().datetime({ offset: true }),
}).strict().superRefine((value, context) => {
  // 九态顺序即产品语义（库存→投放→终止）；上游乱序说明后端出了问题，挡住而不是照渲染。
  if (value.stages.map((stage) => stage.poolStatus).join(",") !== POOL_STATUS_ORDER.join(",")) {
    context.addIssue({ code: "custom", message: "pipeline stages must keep the frozen nine-state order", path: ["stages"] })
  }
})
