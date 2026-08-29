import { describe, expect, it } from "vitest";

import {
  approvedWorkspaceAuthContextSchema,
  resolveApprovedAuthContext,
  type AuthSessionSnapshot,
} from "../src/index.js";

const NOW = new Date("2026-08-25T08:00:00Z");
const WORKSPACE = "00000000-0000-4000-8000-000000000301";
const IDENTITY = "00000000-0000-4000-8000-000000000302";
const USER = "00000000-0000-4000-8000-000000000303";

function snapshot(overrides: Partial<AuthSessionSnapshot> = {}): AuthSessionSnapshot {
  return {
    sessionId: "00000000-0000-4000-8000-000000000304",
    identityId: IDENTITY,
    activeWorkspaceId: WORKSPACE,
    expiresAt: new Date("2026-08-25T09:00:00Z"),
    revokedAt: null,
    identityActive: true,
    membershipWorkspaceId: WORKSPACE,
    membershipIdentityId: IDENTITY,
    membershipUserId: USER,
    membershipRole: "optimizer",
    membershipActive: true,
    userWorkspaceId: WORKSPACE,
    userId: USER,
    userActive: true,
    grants: [
      {
        workspaceId: WORKSPACE,
        identityId: IDENTITY,
        media: "TENCENT",
        accountId: "same-account",
        accessLevel: "preview",
      },
      {
        workspaceId: WORKSPACE,
        identityId: IDENTITY,
        media: "KUAISHOU",
        accountId: "same-account",
        accessLevel: "read",
      },
    ],
    ...overrides,
  };
}

describe("resolveApprovedAuthContext", () => {
  it("returns a workspace-local actor and media-account grants in stable order", () => {
    expect(resolveApprovedAuthContext(snapshot(), NOW, WORKSPACE)).toEqual({
      status: "approved",
      context: {
        workspaceId: WORKSPACE,
        userId: USER,
        role: "optimizer",
        allowedAccounts: [
          { media: "KUAISHOU", accountId: "same-account", accessLevel: "read" },
          { media: "TENCENT", accountId: "same-account", accessLevel: "preview" },
        ],
      },
    });
  });

  it("treats no explicit grants as an approved empty scope", () => {
    const result = resolveApprovedAuthContext(snapshot({ grants: [] }), NOW);
    expect(result).toEqual({
      status: "approved",
      context: {
        workspaceId: WORKSPACE,
        userId: USER,
        role: "optimizer",
        allowedAccounts: [],
      },
    });
  });

  it.each([
    ["missing", null, "SESSION_NOT_FOUND"],
    ["revoked", snapshot({ revokedAt: new Date("2026-08-25T07:00:00Z") }), "SESSION_REVOKED"],
    ["expired", snapshot({ expiresAt: NOW }), "SESSION_EXPIRED"],
  ])("rejects %s sessions as unauthorized", (_label, input, reason) => {
    expect(resolveApprovedAuthContext(input, NOW)).toEqual({
      status: "rejected",
      httpStatus: 401,
      reason,
    });
  });

  it.each([
    ["identity", { identityActive: false }, "IDENTITY_INACTIVE"],
    ["membership", { membershipActive: false }, "MEMBERSHIP_INACTIVE"],
    ["user", { userActive: false }, "USER_INACTIVE"],
  ])("rejects inactive %s state as forbidden", (_label, overrides, reason) => {
    expect(resolveApprovedAuthContext(snapshot(overrides), NOW)).toEqual({
      status: "rejected",
      httpStatus: 403,
      reason,
    });
  });

  it.each([
    ["membership workspace", { membershipWorkspaceId: "00000000-0000-4000-8000-000000000399" }],
    ["membership identity", { membershipIdentityId: "00000000-0000-4000-8000-000000000399" }],
    ["user workspace", { userWorkspaceId: "00000000-0000-4000-8000-000000000399" }],
    ["user id", { userId: "00000000-0000-4000-8000-000000000399" }],
  ])("fails closed for %s mismatch", (_label, overrides) => {
    expect(resolveApprovedAuthContext(snapshot(overrides), NOW)).toMatchObject({
      status: "rejected",
      httpStatus: 403,
      reason: "AUTH_STATE_MISMATCH",
    });
  });

  it("fails closed when the caller expects another active workspace", () => {
    expect(resolveApprovedAuthContext(
      snapshot(),
      NOW,
      "00000000-0000-4000-8000-000000000399",
    )).toMatchObject({ status: "rejected", reason: "WORKSPACE_MISMATCH" });
  });

  it("fails closed instead of filtering a cross-workspace grant", () => {
    const grants = snapshot().grants.map((grant, index) => index === 0
      ? { ...grant, workspaceId: "00000000-0000-4000-8000-000000000399" }
      : grant);
    expect(resolveApprovedAuthContext(snapshot({ grants }), NOW)).toMatchObject({
      status: "rejected",
      reason: "GRANT_SCOPE_MISMATCH",
    });
  });

  it("rejects duplicate account tuples instead of silently choosing an access level", () => {
    const first = snapshot().grants[0]!;
    expect(resolveApprovedAuthContext(snapshot({ grants: [first, { ...first, accessLevel: "execute" }] }), NOW))
      .toMatchObject({ status: "rejected", reason: "DUPLICATE_GRANT" });
  });
});

describe("approved workspace auth context contract", () => {
  const base = {
    workspaceId: WORKSPACE,
    userId: USER,
    role: "optimizer",
  };

  it("accepts a personal workspace with explicit account grants", () => {
    expect(approvedWorkspaceAuthContextSchema.safeParse({
      ...base,
      workspaceKind: "personal",
      scope: {
        kind: "explicit_accounts",
        accounts: [{ media: "KUAISHOU", accountId: "account-1", accessLevel: "execute" }],
      },
    }).success).toBe(true);
  });

  it("accepts a team workspace only with the read-only workspace scope", () => {
    expect(approvedWorkspaceAuthContextSchema.safeParse({
      ...base,
      workspaceKind: "team",
      scope: { kind: "team_workspace_readonly" },
    }).success).toBe(true);
  });

  it("rejects mismatched workspace kinds and scope modes", () => {
    expect(approvedWorkspaceAuthContextSchema.safeParse({
      ...base,
      workspaceKind: "personal",
      scope: { kind: "team_workspace_readonly" },
    }).success).toBe(false);
    expect(approvedWorkspaceAuthContextSchema.safeParse({
      ...base,
      workspaceKind: "team",
      scope: { kind: "explicit_accounts", accounts: [] },
    }).success).toBe(false);
  });

  it("rejects team account grants, execute authority and missing workspace kind", () => {
    expect(approvedWorkspaceAuthContextSchema.safeParse({
      ...base,
      workspaceKind: "team",
      scope: {
        kind: "team_workspace_readonly",
        accounts: [{ media: "KUAISHOU", accountId: "account-1", accessLevel: "execute" }],
      },
    }).success).toBe(false);
    expect(approvedWorkspaceAuthContextSchema.safeParse({
      ...base,
      scope: { kind: "explicit_accounts", accounts: [] },
    }).success).toBe(false);
  });
});
