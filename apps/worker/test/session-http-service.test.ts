import { describe, expect, it, vi } from "vitest";

import type { AuthResolution, SessionView } from "@ka/domain";

import { SessionAuthService } from "../src/auth/session-auth-service.js";
import { SessionHttpService } from "../src/auth/session-http.js";

const personalWorkspaceId = "00000000-0000-4000-8000-000000000821";
const teamWorkspaceId = "00000000-0000-4000-8000-000000000822";
const identityId = "00000000-0000-4000-8000-000000000823";
const userId = "00000000-0000-4000-8000-000000000824";
const firstToken = "first-session-token-with-at-least-thirty-two-bytes-001";
const nextToken = "next-session-token-with-at-least-thirty-two-bytes-002";

function workspaceView(active: "personal" | "team"): SessionView {
  const personal = {
    id: personalWorkspaceId,
    name: "我的工作台",
    kind: "personal" as const,
    role: "admin" as const,
    readOnly: false,
  };
  const team = {
    id: teamWorkspaceId,
    name: "团队数据",
    kind: "team" as const,
    role: "optimizer" as const,
    readOnly: true,
  };
  return {
    identity: { displayName: "fixture user" },
    activeWorkspace: active === "personal" ? personal : team,
    workspaces: [personal, team],
  };
}

function approved(kind: "personal" | "team"): AuthResolution {
  return kind === "personal" ? {
    status: "approved",
    context: {
      workspaceId: personalWorkspaceId,
      userId,
      role: "admin",
      workspaceKind: "personal",
      scope: { kind: "explicit_accounts", accounts: [] },
    },
  } : {
    status: "approved",
    context: {
      workspaceId: teamWorkspaceId,
      userId,
      role: "optimizer",
      workspaceKind: "team",
      scope: { kind: "team_workspace_readonly" },
    },
  };
}

function harness() {
  let active: "personal" | "team" = "personal";
  const repository = {
    resolveApprovedAuthContext: vi.fn(async () => approved(active)),
    createSessionForIdentity: vi.fn(async () => approved("personal")),
    switchSessionWorkspace: vi.fn(async () => {
      active = "team";
      return approved("team");
    }),
    readSessionView: vi.fn(async () => ({ status: "approved" as const, view: workspaceView(active) })),
    revokeSession: vi.fn(async () => undefined),
  };
  const tokens = [firstToken, nextToken];
  const auth = new SessionAuthService(repository, {
    now: () => new Date("2026-08-25T08:00:00Z"),
  });
  const loginProvider = {
    authenticate: vi.fn(async (username: string, password: string) =>
      username === "fixture.user" && password === "runtime-password" ? identityId : null),
  };
  const service = new SessionHttpService(auth, loginProvider, {
    now: () => new Date("2026-08-25T08:00:00Z"),
    token: () => tokens.shift()!,
    ttlSeconds: 3_600,
  });
  return { service, repository, loginProvider };
}

describe("SessionHttpService", () => {
  it("logs in without returning credentials or the session token in JSON", async () => {
    const { service, repository } = harness();
    const result = await service.login({
      provider: "internal_test",
      username: "fixture.user",
      password: "runtime-password",
    }, "auth-login-001");
    expect(result).toMatchObject({
      status: 200,
      sessionToken: firstToken,
      cookieMaxAgeSeconds: 3_600,
      body: {
        ok: true,
        data: { activeWorkspace: { kind: "personal", readOnly: false } },
        meta: { requestId: "auth-login-001" },
      },
    });
    expect(JSON.stringify(result.body)).not.toContain(firstToken);
    expect(JSON.stringify(result.body)).not.toContain("runtime-password");
    expect(repository.createSessionForIdentity).toHaveBeenCalledWith(expect.objectContaining({
      identityId,
      expiresAt: new Date("2026-08-25T09:00:00Z"),
    }));
  });

  it("returns current memberships and rotates into an approved team workspace", async () => {
    const { service } = harness();
    await service.login({
      provider: "internal_test",
      username: "fixture.user",
      password: "runtime-password",
    }, "auth-login-before-switch");
    const current = await service.current(firstToken, "auth-current-001");
    expect(current.body).toMatchObject({
      ok: true,
      data: { activeWorkspace: { id: personalWorkspaceId }, workspaces: expect.any(Array) },
    });
    const switched = await service.switchWorkspace(firstToken, {
      workspaceId: teamWorkspaceId,
    }, "auth-switch-001");
    expect(switched).toMatchObject({
      status: 200,
      sessionToken: nextToken,
      body: { ok: true, data: { activeWorkspace: { kind: "team", readOnly: true } } },
    });
  });

  it("rejects invalid credentials, missing sessions and browser supplied scope", async () => {
    const { service, repository } = harness();
    await expect(service.login({
      provider: "internal_test",
      username: "fixture.user",
      password: "wrong",
    }, "auth-bad-login")).resolves.toMatchObject({ status: 401, body: { ok: false } });
    await expect(service.current(null, "auth-no-session")).resolves.toMatchObject({
      status: 401,
      body: { ok: false, error: { code: "UNAUTHORIZED" } },
    });
    await expect(service.switchWorkspace(firstToken, {
      workspaceId: teamWorkspaceId,
      scope: { kind: "team_workspace_readonly" },
    }, "auth-forged-scope")).resolves.toMatchObject({
      status: 400,
      body: { ok: false, error: { code: "INVALID_REQUEST" } },
    });
    expect(repository.switchSessionWorkspace).not.toHaveBeenCalled();
  });

  it("logs out idempotently even without a valid cookie", async () => {
    const { service, repository } = harness();
    await expect(service.logout(firstToken, "auth-logout-001")).resolves.toMatchObject({
      status: 200,
      clearCookie: true,
      body: { ok: true, data: { loggedOut: true } },
    });
    await expect(service.logout(null, "auth-logout-002")).resolves.toMatchObject({
      status: 200,
      clearCookie: true,
    });
    expect(repository.revokeSession).toHaveBeenCalledTimes(1);
  });
});
