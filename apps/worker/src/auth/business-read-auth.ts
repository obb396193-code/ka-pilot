import {
  approvedWorkspaceAuthContextSchema,
  type ApprovedWorkspaceAuthContext,
} from "@ka/domain";

export type BusinessReadAuth = ApprovedWorkspaceAuthContext;

export interface RepositoryBusinessReadScope {
  scopeKind: "explicit_accounts" | "team_workspace_readonly";
  allowedAccounts: readonly { media: string; accountId: string }[];
}
export function validBusinessReadAuth(auth: unknown): auth is BusinessReadAuth {
  return approvedWorkspaceAuthContextSchema.safeParse(auth).success;
}

export function repositoryBusinessReadScope(
  auth: BusinessReadAuth,
): RepositoryBusinessReadScope {
  if (auth.workspaceKind === "team") {
    return { scopeKind: "team_workspace_readonly", allowedAccounts: [] };
  }
  return {
    scopeKind: "explicit_accounts",
    allowedAccounts: auth.scope.accounts.map(({ media, accountId }) => ({ media, accountId })),
  };
}

export function tupleAllowed(
  auth: BusinessReadAuth,
  media: string,
  accountId: string,
): boolean {
  if (auth.workspaceKind === "team") return true;
  return auth.scope.accounts.some((account) =>
    account.media === media && account.accountId === accountId);
}
