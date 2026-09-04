import type { ApprovedWorkspaceAuthContext, AuthResolution } from "@ka/domain";

import { SessionAuthService } from "../src/auth/session-auth-service.js";

export const TEST_SESSION_TOKEN = "fixture-session-token-with-at-least-thirty-two-characters";

export function personalAuth(input: {
  workspaceId: string;
  userId: string;
  accounts: readonly { media: string; accountId: string }[];
}): ApprovedWorkspaceAuthContext {
  return {
    workspaceId: input.workspaceId,
    userId: input.userId,
    role: "admin",
    workspaceKind: "personal",
    scope: {
      kind: "explicit_accounts",
      accounts: input.accounts.map((account) => ({ ...account, accessLevel: "read" })),
    },
  };
}

export function teamAuth(input: {
  workspaceId: string;
  userId: string;
}): ApprovedWorkspaceAuthContext {
  return {
    workspaceId: input.workspaceId,
    userId: input.userId,
    role: "optimizer",
    workspaceKind: "team",
    scope: { kind: "team_workspace_readonly" },
  };
}

export function approvedSessionAuth(
  context: ApprovedWorkspaceAuthContext,
): SessionAuthService {
  return new SessionAuthService({
    resolveApprovedAuthContext: async (): Promise<AuthResolution> => ({
      status: "approved",
      context,
    }),
  });
}

export function rejectedSessionAuth(httpStatus: 401 | 403): SessionAuthService {
  return new SessionAuthService({
    resolveApprovedAuthContext: async (): Promise<AuthResolution> => ({
      status: "rejected",
      httpStatus,
      reason: httpStatus === 401 ? "SESSION_NOT_FOUND" : "MEMBERSHIP_INACTIVE",
    }),
  });
}

export function businessHeaders(
  internalToken: string,
  sessionToken = TEST_SESSION_TOKEN,
): Record<string, string> {
  return {
    authorization: `Bearer ${internalToken}`,
    cookie: `ka_session=${sessionToken}`,
  };
}
