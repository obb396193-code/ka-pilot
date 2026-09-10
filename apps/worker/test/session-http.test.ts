import { once } from "node:events";
import type { AddressInfo } from "node:net";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  sessionSuccessResponseSchema,
  type AuthResolution,
  type SessionView,
  type SessionViewResolution,
} from "@ka/domain";

import { SessionAuthService } from "../src/auth/session-auth-service.js";
import {
  AUTH_LOGIN_HTTP_PATH,
  AUTH_SESSION_HTTP_PATH,
  AUTH_WORKSPACES_HTTP_PATH,
  AUTH_WORKSPACE_HTTP_PATH,
  SessionHttpService,
} from "../src/auth/session-http.js";
import { createDataApiServer } from "../src/data/http-server.js";
import { DataQueryService } from "../src/data/query-service.js";
import { createDataQueryRegistry } from "../src/data/query-registry.js";
import { readySource } from "./canonical-query-fixtures.js";

const internalToken = "fixture-internal-token-that-is-long-enough";
const identityId = "00000000-0000-4000-8000-000000000831";
const userId = "00000000-0000-4000-8000-000000000832";
const personalWorkspaceId = "00000000-0000-4000-8000-000000000833";
const teamWorkspaceId = "00000000-0000-4000-8000-000000000834";
const loginToken = "login-session-token-with-at-least-thirty-two-bytes-001";
const switchToken = "switch-session-token-with-at-least-thirty-two-bytes-002";

function view(active: "personal" | "team"): SessionView {
  const personal = {
    id: personalWorkspaceId,
    name: "我的工作台",
    kind: "personal" as const,
    role: "admin" as const,
    readOnly: false, isDemo: false,
  };
  const team = {
    id: teamWorkspaceId,
    name: "团队数据",
    kind: "team" as const,
    role: "optimizer" as const,
    readOnly: true, isDemo: false,
  };
  return {
    identity: {
          id: "00000000-0000-4000-8000-0000000000d1",
          provider: "internal_test" as const,
          displayName: "fixture user",
          mustChangePassword: false,
        },
    activeWorkspace: active === "personal" ? personal : team,
    workspaces: [personal, team],
  };
}

function approved(kind: "personal" | "team"): AuthResolution {
  if (kind === "team") {
    return {
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
  return {
    status: "approved",
    context: {
      workspaceId: personalWorkspaceId,
      userId,
      role: "admin",
      workspaceKind: "personal",
      scope: { kind: "explicit_accounts", accounts: [] },
    },
  };
}

function bearer(token = internalToken): Record<string, string> {
  return { authorization: `Bearer ${token}`, "content-type": "application/json" };
}

describe("session HTTP composition", () => {
  const servers: ReturnType<typeof createDataApiServer>[] = [];

  afterEach(async () => {
    await Promise.all(servers.splice(0).map(async (server) => {
      server.close();
      await once(server, "close");
    }));
  });

  async function start(options: {
    maxResponseBytes?: number;
    switchResolution?: AuthResolution;
    viewResolution?: SessionViewResolution;
  } = {}) {
    let active: "personal" | "team" = "personal";
    const revokeSession = vi.fn(async () => undefined);
    const repository = {
      resolveApprovedAuthContext: vi.fn(async () => approved(active)),
      createSessionForIdentity: vi.fn(async () => approved("personal")),
      switchSessionWorkspace: vi.fn(async () => {
        if (options.switchResolution !== undefined) return options.switchResolution;
        active = "team";
        return approved("team");
      }),
      readSessionView: vi.fn(async () => options.viewResolution ?? ({
        status: "approved" as const,
        view: view(active),
      })),
      revokeSession,
    };
    const tokens = [loginToken, switchToken];
    const sessionHttpService = new SessionHttpService(
      new SessionAuthService(repository, { now: () => new Date("2026-08-25T08:00:00Z") }),
      {
        authenticate: vi.fn(async (username: string, password: string) =>
          username === "fixture.user" && password === "runtime-password" ? identityId : null),
      },
      {
        now: () => new Date("2026-08-25T08:00:00Z"),
        token: () => tokens.shift() ?? switchToken,
        ttlSeconds: 3_600,
      },
    );
    const dataService = new DataQueryService({
      registry: createDataQueryRegistry(),
      kaData: { query: async (resolved) => readySource(resolved.queryId, "ka_data", []) },
      platform: { query: async (resolved) => readySource(resolved.queryId, "canonical", []) },
    });
    const server = createDataApiServer({
      service: dataService,
      detailService: {} as never,
      taskListService: {} as never,
      accountListService: {} as never,
      workItemListService: {} as never,
      sessionHttpService,
      internalToken,
      ...(options.maxResponseBytes === undefined
        ? {}
        : { maxResponseBytes: options.maxResponseBytes }),
    });
    servers.push(server);
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address() as AddressInfo;
    return {
      baseUrl: `http://127.0.0.1:${address.port}`,
      revokeSession,
    };
  }

  async function login(baseUrl: string, requestId = "auth-login-http-001") {
    return fetch(`${baseUrl}${AUTH_LOGIN_HTTP_PATH}`, {
      method: "POST",
      headers: { ...bearer(), "x-request-id": requestId },
      body: JSON.stringify({
        provider: "internal_test",
        username: "fixture.user",
        password: "runtime-password",
      }),
    });
  }

  it("logs in, reads current session and lists memberships without exposing the token", async () => {
    const { baseUrl } = await start();
    const loggedIn = await login(baseUrl);
    expect(loggedIn.status).toBe(200);
    expect(loggedIn.headers.get("x-request-id")).toBe("auth-login-http-001");
    expect(loggedIn.headers.get("cache-control")).toBe("no-store");
    const setCookie = loggedIn.headers.get("set-cookie");
    expect(setCookie).toContain("ka_session=");
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("Secure");
    expect(setCookie).toContain("SameSite=Lax");
    const loginBody = await loggedIn.json();
    expect(loginBody).toMatchObject({
      ok: true,
      data: { activeWorkspace: { kind: "personal", readOnly: false, isDemo: false } },
    });
    expect(JSON.stringify(loginBody)).not.toContain(loginToken);
    expect(JSON.stringify(loginBody)).not.toContain("runtime-password");

    const cookie = setCookie!.split(";")[0]!;
    for (const path of [AUTH_SESSION_HTTP_PATH, AUTH_WORKSPACES_HTTP_PATH]) {
      const response = await fetch(`${baseUrl}${path}`, {
        headers: { ...bearer(), cookie },
      });
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({
        ok: true,
        data: { workspaces: expect.arrayContaining([
          expect.objectContaining({ id: personalWorkspaceId, readOnly: false, isDemo: false }),
          expect.objectContaining({ id: teamWorkspaceId, readOnly: true, isDemo: false }),
        ]) },
      });
    }
  });

  it("switches only by workspace id, rotates the cookie and returns team readonly", async () => {
    const { baseUrl } = await start();
    const loggedIn = await login(baseUrl);
    const oldCookie = loggedIn.headers.get("set-cookie")!.split(";")[0]!;
    const switched = await fetch(`${baseUrl}${AUTH_WORKSPACE_HTTP_PATH}`, {
      method: "POST",
      headers: { ...bearer(), cookie: oldCookie, "x-request-id": "auth-switch-http-001" },
      body: JSON.stringify({ workspaceId: teamWorkspaceId }),
    });
    expect(switched.status).toBe(200);
    expect(switched.headers.get("x-request-id")).toBe("auth-switch-http-001");
    expect(switched.headers.get("set-cookie")).toContain(`ka_session=${switchToken}`);
    expect(switched.headers.get("set-cookie")).not.toContain(loginToken);
    expect(await switched.json()).toMatchObject({
      ok: true,
      data: { activeWorkspace: { id: teamWorkspaceId, kind: "team", readOnly: true, isDemo: false } },
    });

    const forged = await fetch(`${baseUrl}${AUTH_WORKSPACE_HTTP_PATH}`, {
      method: "POST",
      headers: { ...bearer(), cookie: oldCookie },
      body: JSON.stringify({
        workspaceId: teamWorkspaceId,
        workspaceKind: "personal",
        role: "admin",
        scope: { kind: "explicit_accounts", accounts: [] },
      }),
    });
    expect(forged.status).toBe(400);
  });

  it("logs out idempotently and clears the cookie", async () => {
    const { baseUrl, revokeSession } = await start();
    const loggedIn = await login(baseUrl);
    const cookie = loggedIn.headers.get("set-cookie")!.split(";")[0]!;
    const loggedOut = await fetch(`${baseUrl}${AUTH_SESSION_HTTP_PATH}`, {
      method: "DELETE",
      headers: { ...bearer(), cookie },
    });
    expect(loggedOut.status).toBe(200);
    expect(loggedOut.headers.get("set-cookie")).toContain("Max-Age=0");
    expect(await loggedOut.json()).toMatchObject({ ok: true, data: { loggedOut: true } });
    const repeated = await fetch(`${baseUrl}${AUTH_SESSION_HTTP_PATH}`, {
      method: "DELETE",
      headers: bearer(),
    });
    expect(repeated.status).toBe(200);
    expect(revokeSession).toHaveBeenCalledTimes(1);
  });

  it("requires the internal caller and a valid session without accepting duplicate cookies", async () => {
    const { baseUrl } = await start();
    const missingCaller = await fetch(`${baseUrl}${AUTH_SESSION_HTTP_PATH}`);
    expect(missingCaller.status).toBe(401);
    const badCaller = await fetch(`${baseUrl}${AUTH_SESSION_HTTP_PATH}`, {
      headers: bearer("wrong-internal-token-that-is-long-enough"),
    });
    expect(badCaller.status).toBe(403);
    const missingSession = await fetch(`${baseUrl}${AUTH_SESSION_HTTP_PATH}`, {
      headers: bearer(),
    });
    expect(missingSession.status).toBe(401);
    const duplicateCookie = await fetch(`${baseUrl}${AUTH_SESSION_HTTP_PATH}`, {
      headers: { ...bearer(), cookie: `ka_session=${loginToken}; ka_session=${switchToken}` },
    });
    expect(duplicateCookie.status).toBe(401);
    const browserScope = await fetch(
      `${baseUrl}${AUTH_SESSION_HTTP_PATH}?workspaceKind=team&scope=all`,
      { headers: { ...bearer(), cookie: `ka_session=${loginToken}` } },
    );
    expect(browserScope.status).toBe(400);
  });

  it("maps non-member switches and inactive memberships to a non-enumerating 403", async () => {
    const nonMember = await start({
      switchResolution: {
        status: "rejected",
        httpStatus: 403,
        reason: "MEMBERSHIP_MISSING",
      },
    });
    const switched = await fetch(`${nonMember.baseUrl}${AUTH_WORKSPACE_HTTP_PATH}`, {
      method: "POST",
      headers: { ...bearer(), cookie: `ka_session=${loginToken}` },
      body: JSON.stringify({ workspaceId: teamWorkspaceId }),
    });
    expect(switched.status).toBe(403);
    const switchedBody = await switched.json();
    expect(switchedBody).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
    expect(JSON.stringify(switchedBody)).not.toContain("MEMBERSHIP_MISSING");

    const inactive = await start({
      viewResolution: {
        status: "rejected",
        httpStatus: 403,
        reason: "MEMBERSHIP_INACTIVE",
      },
    });
    const current = await fetch(`${inactive.baseUrl}${AUTH_SESSION_HTTP_PATH}`, {
      headers: { ...bearer(), cookie: `ka_session=${loginToken}` },
    });
    expect(current.status).toBe(403);
    expect(JSON.stringify(await current.json())).not.toContain("MEMBERSHIP_INACTIVE");
  });

  it.each([
    [AUTH_LOGIN_HTTP_PATH, "GET"],
    [AUTH_SESSION_HTTP_PATH, "POST"],
    [AUTH_WORKSPACES_HTTP_PATH, "POST"],
    [AUTH_WORKSPACE_HTTP_PATH, "GET"],
  ])("returns 405 for the frozen write boundary on %s %s", async (path, method) => {
    const { baseUrl } = await start();
    const response = await fetch(`${baseUrl}${path}`, { method, headers: bearer() });
    expect(response.status).toBe(405);
    expect(await response.json()).toMatchObject({
      ok: false,
      error: { code: "INVALID_REQUEST" },
    });
  });

  it("preserves a safe request id and regenerates an unsafe one", async () => {
    const { baseUrl } = await start();
    const safe = await fetch(`${baseUrl}${AUTH_SESSION_HTTP_PATH}`, {
      headers: { ...bearer(), "x-request-id": "auth-correlation-001" },
    });
    expect(safe.headers.get("x-request-id")).toBe("auth-correlation-001");
    const unsafeValue = `bad-${"x".repeat(200)}`;
    const unsafe = await fetch(`${baseUrl}${AUTH_SESSION_HTTP_PATH}`, {
      headers: { ...bearer(), "x-request-id": unsafeValue },
    });
    expect(unsafe.headers.get("x-request-id")).not.toBe(unsafeValue);
    expect(unsafe.headers.get("x-request-id")).toMatch(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/);
  });

  it("treats equality with the configured response limit as truncated", async () => {
    const requestId = "auth-exact-limit-001";
    const payload = sessionSuccessResponseSchema.parse({
      ok: true,
      data: view("personal"),
      meta: { requestId },
    });
    const exactBytes = Buffer.byteLength(JSON.stringify(payload));
    const { baseUrl } = await start({ maxResponseBytes: exactBytes });
    const response = await fetch(`${baseUrl}${AUTH_SESSION_HTTP_PATH}`, {
      headers: {
        ...bearer(),
        cookie: `ka_session=${loginToken}`,
        "x-request-id": requestId,
      },
    });
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({
      ok: false,
      error: {
        code: "SOURCE_TRUNCATED",
        message: "Session response reached the configured body limit",
        retryable: false,
        requestId,
      },
    });
  });
});
