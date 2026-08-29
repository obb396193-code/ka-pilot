import type { Pool } from "pg";
import { describe, expect, it, vi } from "vitest";

import {
  AuthSessionRepository,
  grantsForWorkspaceSnapshot,
} from "../src/auth-repository.js";

const tokenHash = "a".repeat(64);
const now = new Date("2026-08-25T08:00:00Z");
const identityId = "10000000-0000-4000-8000-000000000001";
const personalWorkspaceId = "20000000-0000-4000-8000-000000000001";
const teamWorkspaceId = "20000000-0000-4000-8000-000000000002";
const userId = "30000000-0000-4000-8000-000000000001";

function validGrant(index: number) {
  return {
    workspaceId: personalWorkspaceId,
    identityId,
    media: "KUAISHOU",
    accountId: `account-${index}`,
    accessLevel: "read",
  };
}

function sessionRow(workspaceKind: "personal" | "team", grants: unknown) {
  const workspaceId = workspaceKind === "personal" ? personalWorkspaceId : teamWorkspaceId;
  return {
    session_id: "40000000-0000-4000-8000-000000000001",
    identity_id: identityId,
    active_workspace_id: workspaceId,
    workspace_kind: workspaceKind,
    active_personal_workspace_ids: [personalWorkspaceId],
    active_workspace_member_count: workspaceKind === "personal" ? "1" : "2",
    expires_at: new Date("2026-08-25T09:00:00Z"),
    revoked_at: null,
    identity_active: true,
    membership_workspace_id: workspaceId,
    membership_identity_id: identityId,
    membership_user_id: userId,
    membership_role: "optimizer",
    membership_active: true,
    user_workspace_id: workspaceId,
    user_id: userId,
    user_active: true,
    grants,
  };
}

function repositoryFor(row: ReturnType<typeof sessionRow>) {
  const query = vi.fn().mockResolvedValue({ rows: [row] });
  return {
    query,
    repository: new AuthSessionRepository({ query } as unknown as Pool),
  };
}

describe("AuthSessionRepository grant boundary", () => {
  it("does not parse more than 1000 unrelated grants for a team workspace", async () => {
    const { query, repository } = repositoryFor(
      sessionRow("team", Array.from({ length: 1_001 }, (_, index) => validGrant(index))),
    );

    await expect(repository.resolveApprovedAuthContext(tokenHash, now)).resolves.toMatchObject({
      status: "approved",
      context: {
        workspaceId: teamWorkspaceId,
        workspaceKind: "team",
        scope: { kind: "team_workspace_readonly" },
      },
    });
    expect(query.mock.calls[0]?.[0]).toContain("workspace.kind = 'personal'");
  });

  it("does not parse a present-but-invalid unrelated grant for a team workspace", async () => {
    const { repository } = repositoryFor(sessionRow("team", [{ accessLevel: "execute" }]));

    await expect(repository.resolveApprovedAuthContext(tokenHash, now)).resolves.toMatchObject({
      status: "approved",
      context: { workspaceKind: "team", scope: { kind: "team_workspace_readonly" } },
    });
    expect(grantsForWorkspaceSnapshot("team", "present-invalid")).toEqual([]);
  });

  it("fails closed when a personal workspace has more than 1000 grants", async () => {
    const { repository } = repositoryFor(
      sessionRow("personal", Array.from({ length: 1_001 }, (_, index) => validGrant(index))),
    );

    await expect(repository.resolveApprovedAuthContext(tokenHash, now)).resolves.toEqual({
      status: "rejected",
      httpStatus: 403,
      reason: "INVALID_AUTH_STATE",
    });
  });

  it("fails closed when a personal workspace has a present-but-invalid grant", async () => {
    const invalid = [{ accessLevel: "execute" }];
    const { repository } = repositoryFor(sessionRow("personal", invalid));

    expect(grantsForWorkspaceSnapshot("personal", invalid)).toBe(invalid);
    await expect(repository.resolveApprovedAuthContext(tokenHash, now)).resolves.toEqual({
      status: "rejected",
      httpStatus: 403,
      reason: "INVALID_AUTH_STATE",
    });
  });
});
