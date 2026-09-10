import { z } from "zod"

import { stableDataQueryErrorSchema, requestIdSchema } from "./contracts.ts"

export const internalTestLoginRequestSchema = z.object({
  provider: z.literal("internal_test"),
  username: z.string().trim().min(1).max(128).regex(/^[A-Za-z0-9._@-]+$/),
  password: z.string().min(1).max(512),
}).strict()

// F8-12（契约 v1.9.6）：访客浏览 —— 匿名会话，不带任何凭证，后端仅在 GUEST_ACCESS_ENABLED=1 时开放。
export const guestLoginRequestSchema = z.object({ provider: z.literal("guest") }).strict()
export const loginRequestSchema = z.union([internalTestLoginRequestSchema, guestLoginRequestSchema])
export type GuestLoginRequest = z.infer<typeof guestLoginRequestSchema>
export type LoginRequest = z.infer<typeof loginRequestSchema>

export const workspaceSwitchRequestSchema = z.object({
  workspaceId: z.string().uuid(),
}).strict()

export const sessionWorkspaceSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(200),
  kind: z.enum(["personal", "team"]),
  // viewer = 访客/只读身份（be2 在后端加的角色，写类请求一律 403 READ_ONLY_ROLE）
  role: z.enum(["optimizer", "operator", "lead", "admin", "viewer"]),
  readOnly: z.boolean(),
  // 演示空间（契约 v1.9.12 改口：不再有 demo kind，就是 team + isDemo）。老会话不带这个字段。
  isDemo: z.boolean().optional(),
}).strict().superRefine((workspace, context) => {
  if (workspace.readOnly !== (workspace.kind === "team")) {
    context.addIssue({
      code: "custom",
      path: ["readOnly"],
      message: "team workspaces must be read-only and personal workspaces must be writable",
    })
  }
})

export const sessionViewSchema = z.object({
  // v1.9.14 / v1.9.15 目标形：id / provider / mustChangePassword。
  // 三个都可选，是因为 be2 的 Q-032 落地前 personal.json / team.json 还是老形（只有 displayName）——
  // 必填的话联调环境会整条会话解析失败。字段并齐后可以收成必填。
  identity: z.object({
    id: z.string().uuid().optional(),
    displayName: z.string().trim().min(1).max(200),
    provider: z.enum(["internal_test", "buc", "guest"]).optional(),
    // 初始密码还没改过：本人进设置页要看到提示（成员列表只有 admin 能读，普通用户只能从会话拿）
    mustChangePassword: z.boolean().optional(),
  }).strict(),
  activeWorkspace: sessionWorkspaceSchema,
  workspaces: z.array(sessionWorkspaceSchema).min(1).max(1_000),
  // 访客会话是有 TTL 的（2h），登录响应里回；普通会话没有这个字段
  expiresAt: z.string().datetime({ offset: true }).optional(),
}).strict().superRefine((view, context) => {
  const ids = new Set(view.workspaces.map((workspace) => workspace.id))
  if (ids.size !== view.workspaces.length) {
    context.addIssue({ code: "custom", path: ["workspaces"], message: "workspace ids must be unique" })
  }
  const active = view.workspaces.filter((workspace) => workspace.id === view.activeWorkspace.id)
  if (active.length !== 1 || JSON.stringify(active[0]) !== JSON.stringify(view.activeWorkspace)) {
    context.addIssue({
      code: "custom",
      path: ["activeWorkspace"],
      message: "activeWorkspace must equal exactly one workspace entry",
    })
  }
})

// meta 只取 requestId（相关性校验用），其余键不消费也不拦：
// 老的 session fixture 只有 requestId，新的访客 fixture 带了标准信封那一套（dataAsOf/businessDate/…）。
// 这里 strict 的话，后端哪天多回一个 meta 字段就是整条会话解析失败、用户卡在登录页——不值当。
const sessionMetaSchema = z.looseObject({ requestId: requestIdSchema })

export const sessionSuccessResponseSchema = z.object({
  ok: z.literal(true),
  data: sessionViewSchema,
  meta: sessionMetaSchema,
}).strict()

export const logoutSuccessResponseSchema = z.object({
  ok: z.literal(true),
  data: z.object({ loggedOut: z.literal(true) }).strict(),
  meta: sessionMetaSchema,
}).strict()

export const sessionErrorResponseSchema = z.object({
  ok: z.literal(false),
  error: stableDataQueryErrorSchema,
}).strict()

export const sessionHttpResponseSchema = z.union([
  sessionSuccessResponseSchema,
  logoutSuccessResponseSchema,
  sessionErrorResponseSchema,
])

export type InternalTestLoginRequest = z.infer<typeof internalTestLoginRequestSchema>
export type WorkspaceSwitchRequest = z.infer<typeof workspaceSwitchRequestSchema>
export type SessionView = z.infer<typeof sessionViewSchema>
export type SessionHttpResponse = z.infer<typeof sessionHttpResponseSchema>
