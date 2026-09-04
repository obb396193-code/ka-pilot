import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";

import {
  AccountListRepository,
  AuthSessionRepository,
  runMigrations,
} from "@ka/db";

import { AccountListService } from "../src/accounts/account-list-service.js";
import { SessionAuthService } from "../src/auth/session-auth-service.js";
import {
  AUTH_LOGIN_HTTP_PATH,
  AUTH_SESSION_HTTP_PATH,
  AUTH_WORKSPACE_HTTP_PATH,
  SessionHttpService,
} from "../src/auth/session-http.js";
import { createDataApiServer } from "../src/data/http-server.js";
import { DataQueryService } from "../src/data/query-service.js";
import { createDataQueryRegistry } from "../src/data/query-registry.js";
import { readySource } from "./canonical-query-fixtures.js";

const databaseUrl =
  process.env.TEST_DATABASE_URL ?? "postgres://ka:ka@127.0.0.1:55432/ka";
const internalToken = "task5-pg-internal-token-with-at-least-thirty-two-chars";
const loginToken = "task5-personal-session-token-with-at-least-thirty-two-chars";
const teamToken = "task5-team-session-token-with-at-least-thirty-two-characters";
const now = new Date("2026-09-04T08:00:00.000Z");

describe("Task5 session-backed business reads with PostgreSQL", () => {
  const pool = new Pool({ connectionString: databaseUrl, max: 4 });
  const cleanupWorkspaceIds: string[] = [];
  let identityId: string;
  let personalWorkspaceId: string;
  let teamWorkspaceId: string;
  let server: ReturnType<typeof createDataApiServer> | undefined;
  let baseUrl: string;

  beforeAll(async () => {
    await runMigrations({ databaseUrl });
    const suffix = randomUUID();
    const workspaces = await pool.query<{ id: string; kind: "personal" | "team" }>(
      `INSERT INTO workspaces (name, kind)
       VALUES ($1, 'personal'), ($2, 'team')
       RETURNING id, kind`,
      [`task5-personal-${suffix}`, `task5-team-${suffix}`],
    );
    personalWorkspaceId = workspaces.rows.find((row) => row.kind === "personal")!.id;
    teamWorkspaceId = workspaces.rows.find((row) => row.kind === "team")!.id;
    cleanupWorkspaceIds.push(personalWorkspaceId, teamWorkspaceId);

    const users = await pool.query<{ id: string; workspace_id: string }>(
      `INSERT INTO users (workspace_id, name)
       VALUES ($1, 'task5 personal actor'), ($2, 'task5 team actor')
       RETURNING id, workspace_id`,
      [personalWorkspaceId, teamWorkspaceId],
    );
    const personalUserId = users.rows.find((row) => row.workspace_id === personalWorkspaceId)!.id;
    const teamUserId = users.rows.find((row) => row.workspace_id === teamWorkspaceId)!.id;
    identityId = (await pool.query<{ id: string }>(
      `INSERT INTO auth_identities (provider, provider_subject, display_name)
       VALUES ('internal_test', $1, 'Task5 PG identity') RETURNING id`,
      [`task5-${suffix}`],
    )).rows[0]!.id;
    await pool.query(
      `INSERT INTO workspace_memberships (workspace_id, identity_id, user_id, role)
       VALUES ($1, $3, $4, 'admin'), ($2, $3, $5, 'optimizer')`,
      [personalWorkspaceId, teamWorkspaceId, identityId, personalUserId, teamUserId],
    );
    await pool.query(
      `INSERT INTO accounts (workspace_id, media, account_id, account_name, status)
       VALUES
         ($1, 'KUAISHOU', 'personal-approved', '个人已授权', 'active'),
         ($1, 'KUAISHOU', 'personal-hidden', '个人未授权', 'active'),
         ($2, 'KUAISHOU', 'team-one', '团队账户一', 'active'),
         ($2, 'KUAISHOU', 'team-two', '团队账户二', 'active'),
         ($2, 'TENCENT', 'team-one', '团队跨媒体同号', 'active')`,
      [personalWorkspaceId, teamWorkspaceId],
    );
    await pool.query(
      `INSERT INTO account_access_grants (
         workspace_id, identity_id, media, account_id, access_level
       ) VALUES ($1, $2, 'KUAISHOU', 'personal-approved', 'read')`,
      [personalWorkspaceId, identityId],
    );

    const authRepository = new AuthSessionRepository(pool);
    const sessionAuth = new SessionAuthService(authRepository, { now: () => now });
    const tokens = [loginToken, teamToken];
    const sessionHttp = new SessionHttpService(
      sessionAuth,
      { authenticate: async () => identityId },
      {
        now: () => now,
        token: () => tokens.shift() ?? teamToken,
        ttlSeconds: 3_600,
      },
    );
    const dataService = new DataQueryService({
      registry: createDataQueryRegistry(),
      kaData: { query: async (resolved) => readySource(resolved.queryId, "ka_data", []) },
      platform: { query: async (resolved) => readySource(resolved.queryId, "canonical", []) },
    });
    server = createDataApiServer({
      service: dataService,
      detailService: {} as never,
      taskListService: {} as never,
      accountListService: new AccountListService({
        repository: new AccountListRepository(pool),
        now: () => now,
      }),
      workItemListService: {} as never,
      sessionHttpService: sessionHttp,
      sessionAuthService: sessionAuth,
      internalToken,
    });
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    if (server !== undefined) {
      server.close();
      await once(server, "close");
    }
    await pool.query(
      "DELETE FROM auth_sessions WHERE identity_id = $1",
      [identityId],
    );
    await pool.query(
      "DELETE FROM account_access_grants WHERE identity_id = $1",
      [identityId],
    );
    await pool.query(
      "DELETE FROM workspace_memberships WHERE identity_id = $1",
      [identityId],
    );
    await pool.query(
      "DELETE FROM accounts WHERE workspace_id = ANY($1::uuid[])",
      [cleanupWorkspaceIds],
    );
    await pool.query(
      "DELETE FROM users WHERE workspace_id = ANY($1::uuid[])",
      [cleanupWorkspaceIds],
    );
    await pool.query(
      "DELETE FROM workspaces WHERE id = ANY($1::uuid[])",
      [cleanupWorkspaceIds],
    );
    await pool.query("DELETE FROM auth_identities WHERE id = $1", [identityId]);
    await pool.end();
  });

  const headers = (cookie?: string, requestId: string = randomUUID()) => ({
    authorization: `Bearer ${internalToken}`,
    "content-type": "application/json",
    "x-request-id": requestId,
    ...(cookie === undefined ? {} : { cookie }),
  });

  it("keeps personal and team reads bound to the server-approved session", async () => {
    const loggedIn = await fetch(`${baseUrl}${AUTH_LOGIN_HTTP_PATH}`, {
      method: "POST",
      headers: headers(undefined, "task5-login-request"),
      body: JSON.stringify({
        provider: "internal_test",
        username: "task5.user",
        password: "task5.password",
      }),
    });
    expect(loggedIn.status).toBe(200);
    expect(loggedIn.headers.get("x-request-id")).toBe("task5-login-request");
    const personalCookie = loggedIn.headers.get("set-cookie")!.split(";")[0]!;

    const personalRead = await fetch(`${baseUrl}/api/v1/accounts`, {
      headers: {
        ...headers(personalCookie, "task5-personal-read"),
        "x-ka-workspace-id": teamWorkspaceId,
        "x-ka-user-id": randomUUID(),
        "x-ka-account-scope": JSON.stringify([
          { media: "KUAISHOU", accountId: "personal-hidden" },
        ]),
      },
    });
    expect(personalRead.status).toBe(200);
    expect(personalRead.headers.get("x-request-id")).toBe("task5-personal-read");
    expect(await personalRead.json()).toMatchObject({
      ok: true,
      data: {
        total: 1,
        items: [{
          workspaceId: personalWorkspaceId,
          media: "KUAISHOU",
          accountId: "personal-approved",
        }],
      },
    });

    const switched = await fetch(`${baseUrl}${AUTH_WORKSPACE_HTTP_PATH}`, {
      method: "POST",
      headers: headers(personalCookie, "task5-switch-request"),
      body: JSON.stringify({ workspaceId: teamWorkspaceId }),
    });
    expect(switched.status).toBe(200);
    const teamCookie = switched.headers.get("set-cookie")!.split(";")[0]!;
    expect(teamCookie).not.toBe(personalCookie);

    const oldTokenRead = await fetch(`${baseUrl}/api/v1/accounts`, {
      headers: headers(personalCookie, "task5-old-token"),
    });
    expect(oldTokenRead.status).toBe(401);

    const teamRead = await fetch(`${baseUrl}/api/v1/accounts`, {
      headers: {
        ...headers(teamCookie, "task5-team-read"),
        "x-ka-workspace-id": personalWorkspaceId,
        "x-ka-user-id": randomUUID(),
        "x-ka-account-scope": "[]",
      },
    });
    expect(teamRead.status).toBe(200);
    const teamBody = await teamRead.json() as {
      data: { total: number; items: Array<{ workspaceId: string; media: string; accountId: string }> };
    };
    expect(teamBody.data.total).toBe(2);
    expect(teamBody.data.items.map((item) => item.accountId).sort()).toEqual(["team-one", "team-two"]);
    expect(teamBody.data.items.every((item) =>
      item.workspaceId === teamWorkspaceId && item.media === "KUAISHOU")).toBe(true);

    const loggedOut = await fetch(`${baseUrl}${AUTH_SESSION_HTTP_PATH}`, {
      method: "DELETE",
      headers: headers(teamCookie, "task5-logout-request"),
    });
    expect(loggedOut.status).toBe(200);
    const afterLogout = await fetch(`${baseUrl}/api/v1/accounts`, {
      headers: headers(teamCookie, "task5-after-logout"),
    });
    expect(afterLogout.status).toBe(401);
  });
});
