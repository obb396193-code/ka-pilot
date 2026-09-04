import { z } from "zod"

import { stableDataQueryErrorSchema, requestIdSchema } from "./contracts.ts"

export const internalTestLoginRequestSchema = z.object({
  provider: z.literal("internal_test"),
  username: z.string().trim().min(1).max(128).regex(/^[A-Za-z0-9._@-]+$/),
  password: z.string().min(1).max(512),
}).strict()

export const workspaceSwitchRequestSchema = z.object({
  workspaceId: z.string().uuid(),
}).strict()

export const sessionWorkspaceSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(200),
  kind: z.enum(["personal", "team"]),
  role: z.enum(["optimizer", "operator", "lead", "admin"]),
  readOnly: z.boolean(),
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
  identity: z.object({ displayName: z.string().trim().min(1).max(200) }).strict(),
  activeWorkspace: sessionWorkspaceSchema,
  workspaces: z.array(sessionWorkspaceSchema).min(1).max(1_000),
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

const sessionMetaSchema = z.object({ requestId: requestIdSchema }).strict()

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
