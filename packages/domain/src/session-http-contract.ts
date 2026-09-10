import { z } from "zod";

import {
  requestIdSchema,
  stableDataQueryErrorSchema,
} from "./data-query-contract.js";
import {
  authRejectionReasonSchema,
  authRoleSchema,
  workspaceKindSchema,
} from "./auth-context.js";

export const internalTestLoginRequestSchema = z.object({
  provider: z.literal("internal_test"),
  username: z.string().trim().min(1).max(128).regex(/^[A-Za-z0-9._@-]+$/),
  password: z.string().min(1).max(512),
}).strict();

/** v1.9.6 访客登录：无用户名密码，仅 `GUEST_ACCESS_ENABLED=1` 时开放。 */
export const guestLoginRequestSchema = z.object({
  provider: z.literal("guest"),
}).strict();

export const loginRequestSchema = z.union([internalTestLoginRequestSchema, guestLoginRequestSchema]);

export const workspaceSwitchRequestSchema = z.object({
  workspaceId: z.string().uuid(),
}).strict();

export const sessionWorkspaceSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(200),
  kind: workspaceKindSchema,
  role: authRoleSchema,
  readOnly: z.boolean(),
  /** v1.9.15：演示空间 = `kind="team"` + `isDemo`。访客只会落在这种空间里。 */
  isDemo: z.boolean(),
}).strict().superRefine((workspace, context) => {
  if (workspace.readOnly !== (workspace.kind === "team")) {
    context.addIssue({
      code: "custom",
      path: ["readOnly"],
      message: "team workspaces must be read-only and personal workspaces must be writable",
    });
  }
});

export const sessionViewSchema = z.object({
  identity: z.object({
    id: z.string().uuid(),
    provider: z.enum(["internal_test", "buc", "guest"]),
    displayName: z.string().trim().min(1).max(200),
    /**
     * v1.9.14：这个人还在用管理员给的初始密码吗。
     * buc/guest 恒 false —— 他们的密码不在我们手里 / 根本没有密码。
     */
    mustChangePassword: z.boolean(),
  }).strict(),
  activeWorkspace: sessionWorkspaceSchema,
  workspaces: z.array(sessionWorkspaceSchema).min(1).max(1_000),
}).strict().superRefine((view, context) => {
  const ids = new Set(view.workspaces.map((workspace) => workspace.id));
  if (ids.size !== view.workspaces.length) {
    context.addIssue({
      code: "custom",
      path: ["workspaces"],
      message: "workspace ids must be unique",
    });
  }
  const active = view.workspaces.filter((workspace) => workspace.id === view.activeWorkspace.id);
  if (active.length !== 1 || JSON.stringify(active[0]) !== JSON.stringify(view.activeWorkspace)) {
    context.addIssue({
      code: "custom",
      path: ["activeWorkspace"],
      message: "activeWorkspace must equal exactly one workspace entry",
    });
  }
});

const sessionMetaSchema = z.object({
  requestId: requestIdSchema,
}).strict();

export const sessionSuccessResponseSchema = z.object({
  ok: z.literal(true),
  data: sessionViewSchema,
  meta: sessionMetaSchema,
}).strict();

export const logoutSuccessResponseSchema = z.object({
  ok: z.literal(true),
  data: z.object({ loggedOut: z.literal(true) }).strict(),
  meta: sessionMetaSchema,
}).strict();

export const sessionErrorResponseSchema = z.object({
  ok: z.literal(false),
  error: stableDataQueryErrorSchema,
}).strict();

export const sessionHttpResponseSchema = z.union([
  sessionSuccessResponseSchema,
  logoutSuccessResponseSchema,
  sessionErrorResponseSchema,
]);

export const sessionViewResolutionSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("approved"), view: sessionViewSchema }).strict(),
  z.object({
    status: z.literal("rejected"),
    httpStatus: z.union([z.literal(401), z.literal(403)]),
    reason: authRejectionReasonSchema,
  }).strict(),
]);

export type InternalTestLoginRequest = z.infer<typeof internalTestLoginRequestSchema>;
export type WorkspaceSwitchRequest = z.infer<typeof workspaceSwitchRequestSchema>;
export type SessionWorkspace = z.infer<typeof sessionWorkspaceSchema>;
export type SessionView = z.infer<typeof sessionViewSchema>;
export type SessionSuccessResponse = z.infer<typeof sessionSuccessResponseSchema>;
export type LogoutSuccessResponse = z.infer<typeof logoutSuccessResponseSchema>;
export type SessionHttpResponse = z.infer<typeof sessionHttpResponseSchema>;
export type SessionViewResolution = z.infer<typeof sessionViewResolutionSchema>;
