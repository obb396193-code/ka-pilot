import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";

import {
  AccountListRepository,
  AuthSessionRepository,
  ChangeSetRepository,
  SemanticQueryRepository,
  TaskListRepository,
  WorkItemListRepository,
  WorkItemRepository,
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
import { PlatformDataSource } from "../src/data/platform-data-source.js";
import { DataQueryService } from "../src/data/query-service.js";
import { createDataQueryRegistry } from "../src/data/query-registry.js";
import { createKaDataClientFromEnv } from "../src/data/ka-data-client.js";
import { ReadDetailService } from "../src/data/read-detail-service.js";
import { TaskListService } from "../src/tasks/task-list-service.js";
import { WorkItemListService } from "../src/work-items/work-item-list-service.js";

const databaseUrl =
  process.env.TEST_DATABASE_URL ?? "postgres://ka:ka@127.0.0.1:55432/ka";
const internalToken = "task5-pg-internal-token-with-at-least-thirty-two-chars";
const loginToken = "task5-personal-session-token-with-at-least-thirty-two-chars";
const teamToken = "task5-team-session-token-with-at-least-thirty-two-characters";
const now = new Date("2026-09-04T08:00:00.000Z");

describe.each([false, true])("Session-backed business reads with PostgreSQL (KA enabled=%s)", (kaEnabled) => {
  const pool = new Pool({ connectionString: databaseUrl, max: 4 });
  const cleanupWorkspaceIds: string[] = [];
  let identityId: string;
  let personalWorkspaceId: string;
  let teamWorkspaceId: string;
  let server: ReturnType<typeof createDataApiServer> | undefined;
  let baseUrl: string;
  let personalVisibleTaskId: string;
  let teamTaskId: string;
  let personalSelfWorkItemId: string;
  let teamAccountWorkItemId: string;
  let teamPrivateWorkItemId: string;
  const sourceCalls = {
    accounts: 0,
    tasks: 0,
    workItems: 0,
    workItemDetail: 0,
    changeSetDetail: 0,
    platformQuery: 0,
    kaQuery: 0,
  };

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
         ($1, 'KUAISHOU', 'team-one', '个人未授权同号账户', 'active'),
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
    personalVisibleTaskId = `personal-visible-${suffix}`;
    const personalHiddenTaskId = `personal-hidden-${suffix}`;
    teamTaskId = `team-${suffix}`;
    await pool.query(
      `INSERT INTO tasks (
         workspace_id, task_id, task_name, biz_name, period_start, period_end,
         target_volume, budget, owner_user_id, status
       ) VALUES
         ($1, $3, '个人可见任务', '个人业务', '2026-09-01', '2026-09-30', 100, 1000, $5, 'active'),
         ($1, $4, '个人隐藏任务', '未授权业务', '2026-09-01', '2026-09-30', 200, 2000, $5, 'active'),
         ($2, $6, '团队任务', '团队业务', '2026-09-01', '2026-09-30', 300, 3000, $7, 'active')`,
      [
        personalWorkspaceId,
        teamWorkspaceId,
        personalVisibleTaskId,
        personalHiddenTaskId,
        personalUserId,
        teamTaskId,
        teamUserId,
      ],
    );
    await pool.query(
      `INSERT INTO task_accounts (
         workspace_id, task_id, media, account_id, valid_from
       ) VALUES
         ($1, $3, 'KUAISHOU', 'personal-approved', '2026-09-01'),
         ($1, $4, 'KUAISHOU', 'team-one', '2026-09-01'),
         ($2, $5, 'KUAISHOU', 'team-one', '2026-09-01')`,
      [personalWorkspaceId, teamWorkspaceId, personalVisibleTaskId, personalHiddenTaskId, teamTaskId],
    );
    await pool.query(
      `INSERT INTO account_metrics_daily (
         workspace_id, media, account_id, ds, cost, real_conversion, computed_at
       ) VALUES
         ($1, 'KUAISHOU', 'personal-approved', '2026-09-04', 10, 1, '2026-09-04T07:00:00Z'),
         ($1, 'KUAISHOU', 'team-one', '2026-09-04', 20, 2, '2026-09-04T07:00:00Z'),
         ($2, 'KUAISHOU', 'team-one', '2026-09-04', 30, 3, '2026-09-04T07:00:00Z'),
         ($2, 'KUAISHOU', 'team-two', '2026-09-04', 40, 4, '2026-09-04T07:00:00Z'),
         ($2, 'TENCENT', 'team-one', '2026-09-04', 50, 5, '2026-09-04T07:00:00Z')`,
      [personalWorkspaceId, teamWorkspaceId],
    );
    const workItems = await pool.query<{ id: string; title: string }>(
      `INSERT INTO work_items (
         workspace_id, type, media, account_id, task_id, severity, title, status,
         assignee, creator, evidence_snapshot, diagnosis
       ) VALUES
         ($1, 'diagnosis', 'KUAISHOU', 'personal-approved', $3, 'P1', '个人账户工作项', 'open', $5, $5, '{"proof":"personal"}', '{"state":"checked"}'),
         ($1, 'diagnosis', 'KUAISHOU', 'team-one', $4, 'P0', '个人隐藏工作项', 'open', $5, $5, NULL, NULL),
         ($1, 'self', NULL, NULL, NULL, 'P2', '个人无账户工作项', 'open', $5, $5, '{"proof":"self"}', NULL),
         ($1, 'self', NULL, NULL, $3, 'P2', '个人获授任务工作项', 'open', NULL, NULL, NULL, NULL),
         ($1, 'self', NULL, NULL, $4, 'P2', '个人隐藏任务工作项', 'open', NULL, NULL, NULL, NULL),
         ($2, 'diagnosis', 'KUAISHOU', 'team-one', $6, 'P1', '团队账户工作项', 'open', $7, $7, '{"proof":"team"}', NULL),
         ($2, 'self', NULL, NULL, $6, 'P2', '团队任务工作项', 'open', NULL, NULL, NULL, NULL),
         ($2, 'self', NULL, NULL, NULL, 'P2', '团队空间私人工作项', 'open', $7, $7, NULL, NULL)
       RETURNING id, title`,
      [
        personalWorkspaceId,
        teamWorkspaceId,
        personalVisibleTaskId,
        personalHiddenTaskId,
        personalUserId,
        teamTaskId,
        teamUserId,
      ],
    );
    personalSelfWorkItemId = workItems.rows.find((row) => row.title === "个人无账户工作项")!.id;
    teamAccountWorkItemId = workItems.rows.find((row) => row.title === "团队账户工作项")!.id;
    teamPrivateWorkItemId = workItems.rows.find((row) => row.title === "团队空间私人工作项")!.id;

    const authRepository = new AuthSessionRepository(pool);
    const sessionAuth = new SessionAuthService(authRepository, { now: () => now });
    const tokens = [loginToken, teamToken];
    const sessionHttp = new SessionHttpService(
      sessionAuth,
      { authenticate: async () => identityId },
      {
        now: () => now,
        token: () => tokens.shift() ?? randomUUID(),
        ttlSeconds: 3_600,
      },
    );
    const semanticRepository = new SemanticQueryRepository(pool);
    const platformDataSource = new PlatformDataSource(semanticRepository);
    const dataService = new DataQueryService({
      registry: createDataQueryRegistry(),
      sourcePolicy: { kaDataEnabled: kaEnabled, diagnosticEnabled: false, entitlements: [] },
      kaData: createKaDataClientFromEnv({
        KA_DATA_BASE_URL: "https://synthetic-team-source.example",
        KA_DATA_READER_TOKEN: "synthetic-team-reader-token",
        KA_DATA_TEAM_WORKSPACE_ID: teamWorkspaceId,
      }, { fetchFn: async (_url, init) => {
        sourceCalls.kaQuery += 1;
        // Real registered SQL over a synthetic SQLite source; NOT a live internal reader.
        const sqlite = new DatabaseSync(":memory:");
        try {
          sqlite.exec(`CREATE TABLE dwd_account_daily (ds INTEGER, media TEXT, account_id TEXT,
            account_name TEXT, task_id TEXT, biz_name TEXT, sub_biz TEXT, cost_yuan REAL,
            cash_yuan REAL, assessment REAL, cash_assessment REAL, conv REAL, show REAL, click REAL);
            INSERT INTO dwd_account_daily VALUES
            (20260904,'KUAISHOU','team-one','Synthetic KA',NULL,NULL,NULL,999,500,10,8,3,10,2),
            (20260904,'TENCENT','team-one','Synthetic other media',NULL,NULL,NULL,9999,5000,10,8,3,10,2)`);
          const input = JSON.parse(String(init?.body)) as { backend: string; sql: string };
          expect(input.backend).toBe("sqlite");
          const rows = sqlite.prepare(input.sql).all();
          return Response.json({ backend: "sqlite", rowCount: rows.length, rows });
        } finally { sqlite.close(); }
      } }),
      platform: {
        query: async (resolved, execution) => {
          sourceCalls.platformQuery += 1;
          return platformDataSource.query(resolved, execution);
        },
      },
    });
    const workItemRepository = new WorkItemRepository(pool);
    const changeSetRepository = new ChangeSetRepository(pool);
    const taskListRepository = new TaskListRepository(pool);
    const accountListRepository = new AccountListRepository(pool);
    const workItemListRepository = new WorkItemListRepository(pool);
    server = createDataApiServer({
      service: dataService,
      detailService: new ReadDetailService({
        workItems: {
          find: async (workspaceId, workItemId) => {
            sourceCalls.workItemDetail += 1;
            return workItemRepository.find(workspaceId, workItemId);
          },
        },
        changeSets: {
          find: async (workspaceId, changeSetId, auth) => {
            sourceCalls.changeSetDetail += 1;
            return changeSetRepository.find(workspaceId, changeSetId, auth);
          },
        },
      }),
      taskListService: new TaskListService({
        repository: {
          list: async (query) => {
            sourceCalls.tasks += 1;
            return taskListRepository.list(query);
          },
        },
        now: () => now,
      }),
      accountListService: new AccountListService({
        repository: {
          list: async (query) => {
            sourceCalls.accounts += 1;
            return accountListRepository.list(query);
          },
        },
        now: () => now,
      }),
      workItemListService: new WorkItemListService({
        repository: {
          list: async (query) => {
            sourceCalls.workItems += 1;
            return workItemListRepository.list(query);
          },
        },
        now: () => now,
      }),
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
      "DELETE FROM work_items WHERE workspace_id = ANY($1::uuid[])",
      [cleanupWorkspaceIds],
    );
    await pool.query(
      "DELETE FROM task_accounts WHERE workspace_id = ANY($1::uuid[])",
      [cleanupWorkspaceIds],
    );
    await pool.query(
      "DELETE FROM tasks WHERE workspace_id = ANY($1::uuid[])",
      [cleanupWorkspaceIds],
    );
    await pool.query(
      "DELETE FROM account_metrics_daily WHERE workspace_id = ANY($1::uuid[])",
      [cleanupWorkspaceIds],
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
    const personalReadBody = await (await fetch(`${baseUrl}/api/v1/accounts`, {
      headers: headers(personalCookie, "task5-personal-cross-workspace-proof"),
    })).json() as {
      data: { items: Array<{ workspaceId: string; media: string; accountId: string }> };
    };
    expect(personalReadBody.data.items).toEqual([expect.objectContaining({
      workspaceId: personalWorkspaceId,
      media: "KUAISHOU",
      accountId: "personal-approved",
    })]);
    expect(personalReadBody.data.items).not.toContainEqual(expect.objectContaining({
      accountId: "team-one",
    }));

    const personalTasks = await fetch(`${baseUrl}/api/v1/tasks`, {
      headers: headers(personalCookie, "task5-personal-tasks"),
    });
    expect(personalTasks.status).toBe(200);
    expect(await personalTasks.json()).toMatchObject({
      ok: true,
      data: {
        total: 1,
        items: [{ taskId: personalVisibleTaskId, taskName: "个人可见任务" }],
      },
    });

    const personalItems = await fetch(`${baseUrl}/api/v1/work-items`, {
      headers: headers(personalCookie, "task5-personal-items"),
    });
    expect(personalItems.status).toBe(200);
    const personalItemsBody = await personalItems.json() as {
      data: { total: number; items: Array<{ title: string }> };
    };
    expect(personalItemsBody.data.total).toBe(3);
    expect(personalItemsBody.data.items.map((item) => item.title).sort()).toEqual([
      "个人无账户工作项",
      "个人获授任务工作项",
      "个人账户工作项",
    ]);
    expect(JSON.stringify(personalItemsBody)).not.toContain("taskScopeAccount");

    const personalDetail = await fetch(
      `${baseUrl}/api/v1/work-items/${personalSelfWorkItemId}`,
      { headers: headers(personalCookie, "task5-personal-detail") },
    );
    expect(personalDetail.status).toBe(200);
    expect(await personalDetail.json()).toMatchObject({
      ok: true,
      data: {
        kind: "work_item",
        workItem: { id: personalSelfWorkItemId, title: "个人无账户工作项" },
      },
    });

    const personalData = await fetch(`${baseUrl}/api/v1/data/query`, {
      method: "POST",
      headers: headers(personalCookie, "task5-personal-data"),
      body: JSON.stringify({
        queryId: "account.table",
        params: { date: "2026-09-04" },
      }),
    });
    expect(personalData.status).toBe(200);
    expect(sourceCalls.kaQuery).toBe(0);
    expect(await personalData.json()).toMatchObject({
      ok: true,
      data: {
        mode: "platform",
        source: {
          rows: [{
            workspaceId: personalWorkspaceId,
            media: "KUAISHOU",
            accountId: "personal-approved",
          }],
        },
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
    expect(teamBody.data.items).toContainEqual(expect.objectContaining({
      workspaceId: teamWorkspaceId,
      media: "KUAISHOU",
      accountId: "team-one",
    }));
    expect(teamBody.data.items).not.toContainEqual(expect.objectContaining({
      workspaceId: personalWorkspaceId,
      accountId: "team-one",
    }));
    expect(teamBody.data.items).not.toContainEqual(expect.objectContaining({
      media: "TENCENT",
      accountId: "team-one",
    }));

    const teamTasks = await fetch(`${baseUrl}/api/v1/tasks`, {
      headers: headers(teamCookie, "task5-team-tasks"),
    });
    expect(teamTasks.status).toBe(200);
    expect(await teamTasks.json()).toMatchObject({
      ok: true,
      data: { total: 1, items: [{ taskId: teamTaskId, taskName: "团队任务" }] },
    });

    const teamItems = await fetch(`${baseUrl}/api/v1/work-items`, {
      headers: headers(teamCookie, "task5-team-items"),
    });
    expect(teamItems.status).toBe(200);
    expect(await teamItems.json()).toMatchObject({
      ok: true,
      data: {
        total: 2,
        items: [{ workItemId: teamAccountWorkItemId, title: "团队账户工作项" }, { title: "团队任务工作项" }],
      },
    });

    const teamDetail = await fetch(`${baseUrl}/api/v1/work-items/${teamAccountWorkItemId}`, {
      headers: headers(teamCookie, "task5-team-detail"),
    });
    expect(teamDetail.status).toBe(200);
    const teamPrivateDetail = await fetch(`${baseUrl}/api/v1/work-items/${teamPrivateWorkItemId}`, {
      headers: headers(teamCookie, "task5-team-private-detail"),
    });
    expect(teamPrivateDetail.status).toBe(403);

    const changeSetFindCallsBefore = sourceCalls.changeSetDetail;
    const teamChangeSet = await fetch(`${baseUrl}/api/v1/changesets/${randomUUID()}`, {
      headers: headers(teamCookie, "task5-team-changeset-detail"),
    });
    expect(teamChangeSet.status).toBe(403);
    expect(sourceCalls.changeSetDetail).toBe(changeSetFindCallsBefore);

    const platformCallsBeforeTeamData = sourceCalls.platformQuery;
    const teamData = await fetch(`${baseUrl}/api/v1/data/query`, {
      method: "POST",
      headers: headers(teamCookie, "task5-team-data"),
      body: JSON.stringify({
        queryId: "account.table",
        params: { date: "2026-09-04", media: "KUAISHOU" },
      }),
    });
    expect(teamData.status).toBe(kaEnabled ? 200 : 503);
    const teamDataBody = await teamData.json();
    if (kaEnabled) {
      expect(teamDataBody).toMatchObject({ ok: true, data: { mode: "ka_data", source: {
        returnedRowCount: 1,
        rows: [{ workspaceId: teamWorkspaceId, media: "KUAISHOU", accountId: "team-one", metrics: { cost: { value: 999, availability: "available" } } }],
        lineage: { workspaceKind: "team", partial: true, coverage: { complete: false } },
      } } });
      expect(sourceCalls.kaQuery).toBe(1);
    } else {
      expect(teamDataBody).toMatchObject({ ok: false, error: { code: "SOURCE_UNAVAILABLE" } });
      expect(sourceCalls.kaQuery).toBe(0);
    }
    expect(sourceCalls.platformQuery).toBe(platformCallsBeforeTeamData);

    const loggedOut = await fetch(`${baseUrl}${AUTH_SESSION_HTTP_PATH}`, {
      method: "DELETE",
      headers: headers(teamCookie, "task5-logout-request"),
    });
    expect(loggedOut.status).toBe(200);
    const callsAfterLogout = { ...sourceCalls };
    const unauthorizedReads = [
      { path: "/api/v1/data/query", method: "POST", body: JSON.stringify({
        queryId: "account.table",
        params: { date: "2026-09-04" },
      }) },
      { path: "/api/v1/tasks", method: "GET" },
      { path: "/api/v1/accounts", method: "GET" },
      { path: "/api/v1/work-items", method: "GET" },
      { path: `/api/v1/work-items/${teamAccountWorkItemId}`, method: "GET" },
    ];
    for (const [index, input] of unauthorizedReads.entries()) {
      const afterLogout = await fetch(`${baseUrl}${input.path}`, {
        method: input.method,
        headers: headers(teamCookie, `task5-after-logout-${index}`),
        ...(input.body === undefined ? {} : { body: input.body }),
      });
      expect(afterLogout.status).toBe(401);
      expect(afterLogout.headers.get("x-request-id")).toBe(`task5-after-logout-${index}`);
    }
    expect(sourceCalls).toEqual(callsAfterLogout);
  });

  it("re-resolves soft-revoked grants for the same live cookie on the next HTTP read", async () => {
    const login = await fetch(`${baseUrl}${AUTH_LOGIN_HTTP_PATH}`, {
      method: "POST", headers: headers(),
      body: JSON.stringify({ provider: "internal_test", username: "task5.user", password: "task5.password" }),
    });
    expect(login.status).toBe(200);
    const cookie = login.headers.get("set-cookie")!.split(";")[0]!;
    const before = await fetch(`${baseUrl}/api/v1/accounts`, { headers: headers(cookie) });
    expect(before.status).toBe(200);
    expect(await before.json()).toMatchObject({ data: { total: 1 } });
    try {
      await pool.query("UPDATE account_access_grants SET revoked_at=now() WHERE workspace_id=$1 AND identity_id=$2", [personalWorkspaceId, identityId]);
      for (const [index, path] of ["/api/v1/accounts", "/api/v1/tasks"].entries()) {
        const response = await fetch(`${baseUrl}${path}`, { headers: {
          ...headers(cookie, `soft-revoke-${index}`),
          "x-ka-account-scope": JSON.stringify([{ media: "KUAISHOU", accountId: "personal-approved" }]),
        } });
        expect(response.status).toBe(200);
        expect(response.headers.get("x-request-id")).toBe(`soft-revoke-${index}`);
        expect(await response.json()).toMatchObject({ ok: true, data: { total: 0, items: [] } });
      }
      const items = await fetch(`${baseUrl}/api/v1/work-items`, { headers: headers(cookie, "soft-revoke-work-items") });
      expect(items.status).toBe(200);
      expect(await items.json()).toMatchObject({ ok: true, data: { total: 1, items: [{ title: "个人无账户工作项" }] } });
    } finally {
      // Restore only the synthetic grant created by this suite; never a real grant.
      await pool.query("UPDATE account_access_grants SET revoked_at=NULL WHERE workspace_id=$1 AND identity_id=$2", [personalWorkspaceId, identityId]);
    }
  });
});
