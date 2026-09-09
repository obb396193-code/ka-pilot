import { z } from "zod";

/** v1.9.6：`viewer` = 访客只读角色。所有写类端点对它 403 READ_ONLY_ROLE。 */
export const authRoleSchema = z.enum(["optimizer", "operator", "lead", "admin", "viewer"]);
export const accountAccessLevelSchema = z.enum(["read", "preview", "execute"]);
/**
 * v1.9.6 的 `demo`（访客演示空间）**暂未加入**：加了会让 Codex 的
 * `bootstrap-seed-repository.ts` 类型不过（它有自己一份 personal|team 的窄类型），
 * 而按接缝规矩共享文件的结构性改造归 arch 开缝。已在回执点名那一行。
 */
export const workspaceKindSchema = z.enum(["personal", "team"]);

const mediaSchema = z.string().min(1).max(32).regex(/^[A-Z0-9_]+$/);
const accountIdSchema = z.string().min(1).max(128).regex(/^[A-Za-z0-9_-]+$/);

export const approvedAccountAccessSchema = z.object({
  media: mediaSchema,
  accountId: accountIdSchema,
  accessLevel: accountAccessLevelSchema,
}).strict();

export const explicitAccountsScopeSchema = z.object({
  kind: z.literal("explicit_accounts"),
  accounts: z.array(approvedAccountAccessSchema).max(1_000),
}).strict();

export const teamWorkspaceReadonlyScopeSchema = z.object({
  kind: z.literal("team_workspace_readonly"),
}).strict();

export const approvedWorkspaceScopeSchema = z.discriminatedUnion("kind", [
  explicitAccountsScopeSchema,
  teamWorkspaceReadonlyScopeSchema,
]);

const approvedContextIdentityFields = {
  workspaceId: z.string().uuid(),
  userId: z.string().uuid(),
  role: authRoleSchema,
};

export const approvedWorkspaceAuthContextSchema = z.discriminatedUnion("workspaceKind", [
  z.object({
    ...approvedContextIdentityFields,
    workspaceKind: z.literal("personal"),
    scope: explicitAccountsScopeSchema,
  }).strict(),
  z.object({
    ...approvedContextIdentityFields,
    workspaceKind: z.literal("team"),
    scope: teamWorkspaceReadonlyScopeSchema,
  }).strict(),
]);

export const authGrantSnapshotSchema = z.object({
  workspaceId: z.string().uuid(),
  identityId: z.string().uuid(),
  media: mediaSchema,
  accountId: accountIdSchema,
  accessLevel: accountAccessLevelSchema,
}).strict();

export const authSessionSnapshotSchema = z.object({
  sessionId: z.string().uuid(),
  identityId: z.string().uuid(),
  activeWorkspaceId: z.string().uuid(),
  workspaceKind: workspaceKindSchema,
  activePersonalWorkspaceIds: z.array(z.string().uuid()).max(1_000),
  activeWorkspaceMemberCount: z.number().int().nonnegative(),
  expiresAt: z.date(),
  revokedAt: z.date().nullable(),
  identityActive: z.boolean(),
  membershipWorkspaceId: z.string().uuid().nullable(),
  membershipIdentityId: z.string().uuid().nullable(),
  membershipUserId: z.string().uuid().nullable(),
  membershipRole: authRoleSchema.nullable(),
  membershipActive: z.boolean().nullable(),
  userWorkspaceId: z.string().uuid().nullable(),
  userId: z.string().uuid().nullable(),
  userActive: z.boolean().nullable(),
  grants: z.array(authGrantSnapshotSchema).max(1_000),
}).strict();

export const authRejectionReasonSchema = z.enum([
  "SESSION_NOT_FOUND",
  "SESSION_REVOKED",
  "SESSION_EXPIRED",
  "IDENTITY_INACTIVE",
  "MEMBERSHIP_MISSING",
  "MEMBERSHIP_INACTIVE",
  "USER_MISSING",
  "USER_INACTIVE",
  "WORKSPACE_MISMATCH",
  "AUTH_STATE_MISMATCH",
  "GRANT_SCOPE_MISMATCH",
  "DUPLICATE_GRANT",
  "PERSONAL_WORKSPACE_MISSING",
  "PERSONAL_WORKSPACE_AMBIGUOUS",
  "PERSONAL_WORKSPACE_MISMATCH",
  "PERSONAL_WORKSPACE_SHARED",
  "INVALID_AUTH_STATE",
]);

export const authResolutionSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("approved"),
    context: approvedWorkspaceAuthContextSchema,
  }).strict(),
  z.object({
    status: z.literal("rejected"),
    httpStatus: z.union([z.literal(401), z.literal(403)]),
    reason: authRejectionReasonSchema,
  }).strict(),
]);

export type AuthRole = z.infer<typeof authRoleSchema>;
export type AccountAccessLevel = z.infer<typeof accountAccessLevelSchema>;
export type WorkspaceKind = z.infer<typeof workspaceKindSchema>;
export type ExplicitAccountsScope = z.infer<typeof explicitAccountsScopeSchema>;
export type TeamWorkspaceReadonlyScope = z.infer<typeof teamWorkspaceReadonlyScopeSchema>;
export type ApprovedWorkspaceScope = z.infer<typeof approvedWorkspaceScopeSchema>;
export type ApprovedWorkspaceAuthContext = z.infer<typeof approvedWorkspaceAuthContextSchema>;
export type AuthSessionSnapshot = z.infer<typeof authSessionSnapshotSchema>;
export type AuthResolution = z.infer<typeof authResolutionSchema>;
export type AuthRejectionReason = z.infer<typeof authRejectionReasonSchema>;

function rejected(
  httpStatus: 401 | 403,
  reason: AuthRejectionReason,
): AuthResolution {
  return { status: "rejected", httpStatus, reason };
}

function hasMembership(snapshot: AuthSessionSnapshot): boolean {
  return snapshot.membershipWorkspaceId !== null &&
    snapshot.membershipIdentityId !== null &&
    snapshot.membershipUserId !== null &&
    snapshot.membershipRole !== null &&
    snapshot.membershipActive !== null;
}

function hasUser(snapshot: AuthSessionSnapshot): boolean {
  return snapshot.userWorkspaceId !== null &&
    snapshot.userId !== null &&
    snapshot.userActive !== null;
}

function validateIdentityChain(snapshot: AuthSessionSnapshot): AuthResolution | null {
  if (!snapshot.identityActive) return rejected(403, "IDENTITY_INACTIVE");
  if (!hasMembership(snapshot)) return rejected(403, "MEMBERSHIP_MISSING");
  if (!snapshot.membershipActive) return rejected(403, "MEMBERSHIP_INACTIVE");
  if (!hasUser(snapshot)) return rejected(403, "USER_MISSING");
  if (!snapshot.userActive) return rejected(403, "USER_INACTIVE");
  if (
    snapshot.membershipWorkspaceId !== snapshot.activeWorkspaceId ||
    snapshot.membershipIdentityId !== snapshot.identityId ||
    snapshot.userWorkspaceId !== snapshot.activeWorkspaceId ||
    snapshot.userId !== snapshot.membershipUserId
  ) {
    return rejected(403, "AUTH_STATE_MISMATCH");
  }
  return null;
}

function accountScope(
  snapshot: AuthSessionSnapshot,
): ExplicitAccountsScope["accounts"] | AuthResolution {
  const seen = new Set<string>();
  const accounts: ExplicitAccountsScope["accounts"] = [];
  for (const grant of snapshot.grants) {
    if (
      grant.workspaceId !== snapshot.activeWorkspaceId ||
      grant.identityId !== snapshot.identityId
    ) {
      return rejected(403, "GRANT_SCOPE_MISMATCH");
    }
    const key = `${grant.media}\u0000${grant.accountId}`;
    if (seen.has(key)) return rejected(403, "DUPLICATE_GRANT");
    seen.add(key);
    accounts.push({
      media: grant.media,
      accountId: grant.accountId,
      accessLevel: grant.accessLevel,
    });
  }
  return accounts.sort((left, right) =>
    left.media.localeCompare(right.media) || left.accountId.localeCompare(right.accountId));
}

export function resolveApprovedAuthContext(
  input: unknown,
  now: Date,
  expectedWorkspaceId?: string,
): AuthResolution {
  if (input === null) return rejected(401, "SESSION_NOT_FOUND");
  if (!Number.isFinite(now.getTime())) return rejected(403, "INVALID_AUTH_STATE");
  if (
    expectedWorkspaceId !== undefined &&
    !z.string().uuid().safeParse(expectedWorkspaceId).success
  ) {
    return rejected(403, "INVALID_AUTH_STATE");
  }
  const parsed = authSessionSnapshotSchema.safeParse(input);
  if (!parsed.success) return rejected(403, "INVALID_AUTH_STATE");
  const snapshot = parsed.data;
  if (snapshot.revokedAt !== null) return rejected(401, "SESSION_REVOKED");
  if (snapshot.expiresAt.getTime() <= now.getTime()) return rejected(401, "SESSION_EXPIRED");
  const chainError = validateIdentityChain(snapshot);
  if (chainError !== null) return chainError;
  const uniquePersonalWorkspaces = new Set(snapshot.activePersonalWorkspaceIds);
  if (uniquePersonalWorkspaces.size !== snapshot.activePersonalWorkspaceIds.length) {
    return rejected(403, "INVALID_AUTH_STATE");
  }
  if (uniquePersonalWorkspaces.size === 0) {
    return rejected(403, "PERSONAL_WORKSPACE_MISSING");
  }
  if (uniquePersonalWorkspaces.size > 1) {
    return rejected(403, "PERSONAL_WORKSPACE_AMBIGUOUS");
  }
  if (
    expectedWorkspaceId !== undefined &&
    snapshot.activeWorkspaceId !== expectedWorkspaceId
  ) {
    return rejected(403, "WORKSPACE_MISMATCH");
  }
  if (snapshot.workspaceKind === "team") {
    return authResolutionSchema.parse({
      status: "approved",
      context: {
        workspaceId: snapshot.activeWorkspaceId,
        userId: snapshot.userId,
        role: snapshot.membershipRole,
        workspaceKind: "team",
        scope: { kind: "team_workspace_readonly" },
      },
    });
  }
  if (snapshot.activeWorkspaceMemberCount !== 1) {
    return rejected(403, "PERSONAL_WORKSPACE_SHARED");
  }
  if (!uniquePersonalWorkspaces.has(snapshot.activeWorkspaceId)) {
    return rejected(403, "PERSONAL_WORKSPACE_MISMATCH");
  }
  const accounts = accountScope(snapshot);
  if (!Array.isArray(accounts)) return accounts;
  return authResolutionSchema.parse({
    status: "approved",
    context: {
      workspaceId: snapshot.activeWorkspaceId,
      userId: snapshot.userId,
      role: snapshot.membershipRole,
      workspaceKind: "personal",
      scope: { kind: "explicit_accounts", accounts },
    },
  });
}
