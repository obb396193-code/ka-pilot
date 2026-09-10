import { createHash } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

import type { AuthResolution } from "@ka/domain";

import { SessionAuthService } from "../src/auth/session-auth-service.js";

const TOKEN = "session-token-with-at-least-thirty-two-bytes-001";
const approved: AuthResolution = {
  status: "approved",
  context: {
    workspaceId: "00000000-0000-4000-8000-000000000401",
    userId: "00000000-0000-4000-8000-000000000402",
    role: "admin",
    workspaceKind: "personal",
    scope: { kind: "explicit_accounts", accounts: [] },
  },
};

describe("SessionAuthService", () => {
  it("hashes the opaque token before calling the repository", async () => {
    const resolveApprovedAuthContext = vi.fn(async () => approved);
    const service = new SessionAuthService({ resolveApprovedAuthContext });
    await expect(service.resolve(TOKEN)).resolves.toEqual(approved);
    expect(resolveApprovedAuthContext).toHaveBeenCalledWith(
      createHash("sha256").update(TOKEN, "utf8").digest("hex"),
      expect.any(Date),
      undefined,
    );
    expect(resolveApprovedAuthContext.mock.calls.flat().join(" ")).not.toContain(TOKEN);
  });

  it("issues a session through the repository without exposing the opaque token", async () => {
    const createSessionForIdentity = vi.fn(async () => approved);
    const service = new SessionAuthService({
      resolveApprovedAuthContext: vi.fn(async () => approved),
      createSessionForIdentity,
      switchSessionWorkspace: vi.fn(async () => approved),
    }, { now: () => new Date("2026-08-25T08:00:00Z") });
    const expiresAt = new Date("2026-08-25T10:00:00Z");
    await expect(service.issueForIdentity({
      identityId: "00000000-0000-4000-8000-000000000403",
      token: TOKEN,
      expiresAt,
    })).resolves.toEqual(approved);
    expect(createSessionForIdentity).toHaveBeenCalledWith({
      identityId: "00000000-0000-4000-8000-000000000403",
      tokenHash: createHash("sha256").update(TOKEN, "utf8").digest("hex"),
      now: new Date("2026-08-25T08:00:00Z"),
      expiresAt,
    });
    expect(createSessionForIdentity.mock.calls.flat().join(" ")).not.toContain(TOKEN);
  });

  it("rotates the session token while switching only by target workspace id", async () => {
    const switchSessionWorkspace = vi.fn(async () => approved);
    const service = new SessionAuthService({
      resolveApprovedAuthContext: vi.fn(async () => approved),
      createSessionForIdentity: vi.fn(async () => approved),
      switchSessionWorkspace,
    }, { now: () => new Date("2026-08-25T08:00:00Z") });
    const nextToken = "next-session-token-with-at-least-thirty-two-bytes-002";
    const targetWorkspaceId = "00000000-0000-4000-8000-000000000404";
    const expiresAt = new Date("2026-08-25T10:00:00Z");
    await expect(service.switchWorkspace({
      token: TOKEN,
      nextToken,
      targetWorkspaceId,
      expiresAt,
    })).resolves.toEqual(approved);
    expect(switchSessionWorkspace).toHaveBeenCalledWith({
      tokenHash: createHash("sha256").update(TOKEN, "utf8").digest("hex"),
      nextTokenHash: createHash("sha256").update(nextToken, "utf8").digest("hex"),
      targetWorkspaceId,
      now: new Date("2026-08-25T08:00:00Z"),
      expiresAt,
    });
    expect(switchSessionWorkspace.mock.calls.flat().join(" ")).not.toContain(TOKEN);
    expect(switchSessionWorkspace.mock.calls.flat().join(" ")).not.toContain(nextToken);
  });

  it("treats an invalid current switch token as unauthenticated without touching storage", async () => {
    const switchSessionWorkspace = vi.fn(async () => approved);
    const service = new SessionAuthService({
      resolveApprovedAuthContext: vi.fn(async () => approved),
      switchSessionWorkspace,
    });
    await expect(service.switchWorkspace({
      token: "short",
      nextToken: "next-session-token-with-at-least-thirty-two-bytes-002",
      targetWorkspaceId: "00000000-0000-4000-8000-000000000404",
      expiresAt: new Date("2026-08-25T10:00:00Z"),
    })).resolves.toEqual({
      status: "rejected",
      httpStatus: 401,
      reason: "SESSION_NOT_FOUND",
    });
    expect(switchSessionWorkspace).not.toHaveBeenCalled();
  });

  it("passes an expected workspace without letting the caller provide grants", async () => {
    const resolveApprovedAuthContext = vi.fn(async () => approved);
    const service = new SessionAuthService({ resolveApprovedAuthContext }, {
      now: () => new Date("2026-08-25T08:00:00Z"),
    });
    const expectedWorkspace = "00000000-0000-4000-8000-000000000401";
    await service.resolve(TOKEN, expectedWorkspace);
    expect(resolveApprovedAuthContext).toHaveBeenCalledWith(
      expect.stringMatching(/^[0-9a-f]{64}$/),
      new Date("2026-08-25T08:00:00Z"),
      expectedWorkspace,
    );
  });

  it("reads a redacted session view and revokes only by token hash", async () => {
    const view = {
      status: "approved" as const,
      view: {
        identity: {
          id: "00000000-0000-4000-8000-0000000000d1",
          provider: "internal_test" as const,
          displayName: "fixture user",
          mustChangePassword: false,
        },
        activeWorkspace: {
          id: "00000000-0000-4000-8000-000000000401",
          name: "personal",
          kind: "personal" as const,
          role: "admin" as const,
          readOnly: false, isDemo: false,
        },
        workspaces: [{
          id: "00000000-0000-4000-8000-000000000401",
          name: "personal",
          kind: "personal" as const,
          role: "admin" as const,
          readOnly: false, isDemo: false,
        }],
      },
    };
    const readSessionView = vi.fn(async () => view);
    const revokeSession = vi.fn(async () => undefined);
    const service = new SessionAuthService({
      resolveApprovedAuthContext: vi.fn(async () => approved),
      readSessionView,
      revokeSession,
    }, { now: () => new Date("2026-08-25T08:00:00Z") });

    await expect(service.current(TOKEN)).resolves.toEqual(view);
    await service.logout(TOKEN);
    const expectedHash = createHash("sha256").update(TOKEN, "utf8").digest("hex");
    expect(readSessionView).toHaveBeenCalledWith(expectedHash, new Date("2026-08-25T08:00:00Z"));
    expect(revokeSession).toHaveBeenCalledWith(expectedHash, new Date("2026-08-25T08:00:00Z"));
    expect(JSON.stringify([readSessionView.mock.calls, revokeSession.mock.calls])).not.toContain(TOKEN);
  });

  it.each(["", "short", "contains whitespace but is otherwise long enough 001"])(
    "rejects an invalid opaque token without touching storage",
    async (token) => {
      const resolveApprovedAuthContext = vi.fn(async () => approved);
      const service = new SessionAuthService({ resolveApprovedAuthContext });
      await expect(service.resolve(token)).resolves.toEqual({
        status: "rejected",
        httpStatus: 401,
        reason: "SESSION_NOT_FOUND",
      });
      expect(resolveApprovedAuthContext).not.toHaveBeenCalled();
    },
  );
});
