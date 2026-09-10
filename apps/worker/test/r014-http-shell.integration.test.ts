// Actual HTTP shell + real PG session/repositories, synthetic local data, no media writes.
import { randomUUID } from "node:crypto";
import type { Server } from "node:http";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { AuthSessionRepository, runMigrations } from "@ka/db";
import { createDataApiServer, type DataApiServerOptions } from "../src/data/http-server.js";
import { SessionAuthService } from "../src/auth/session-auth-service.js";
import { registerR014Routes } from "../src/r014/routes.js";
import { createKbRoutes } from "../src/r014/kb-routes.js";
import { createTaskDetailRoutes } from "../src/r014/task-detail-routes.js";
import { createDailyReportRoutes } from "../src/r014/daily-report-routes.js";

const databaseUrl = process.env.TEST_DATABASE_URL;
if (databaseUrl === undefined) throw new Error("Explicit synthetic TEST_DATABASE_URL required");

/**
 * 我这批端点此前只在路由替身（fake-http）下验过 —— 替身不走鉴权、不走真 cookie、
 * 不走壳层的 404/401 分支。这里用**真 HTTP 壳层 + 真会话**跑一遍冒烟：
 * 会话 cookie 能不能带出正确的 scope、越权是不是真的 404、写请求路径通不通。
 */
describe("R-014 endpoints through the real data-api shell (real PostgreSQL)", () => {
  const pool = new Pool({ connectionString: databaseUrl, max: 4, connectionTimeoutMillis: 3000 });
  const sessionAuth = new SessionAuthService(new AuthSessionRepository(pool));
  const internalToken = "synthetic-r014-shell-token-long-enough";
  let server: Server;
  let origin = "";
  let workspaceId = "";
  let identityId = "";
  let userId = "";
  let sessionToken = "";
  let taskId = "";

  const call = async (
    path: string, method = "GET", body?: unknown,
  ): Promise<{ status: number; body: Record<string, unknown> }> => {
    const response = await fetch(`${origin}/api/v1${path}`, {
      method,
      headers: {
        authorization: `Bearer ${internalToken}`,
        cookie: `ka_session=${sessionToken}`,
        "x-request-id": "shell-request",
        "content-type": "application/json",
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return { status: response.status, body: await response.json() as Record<string, unknown> };
  };

  beforeAll(async () => {
    await runMigrations({ databaseUrl });
    registerR014Routes([
      ...createKbRoutes(pool), ...createTaskDetailRoutes(pool), ...createDailyReportRoutes(pool),
    ]);
    const unrelated = new Proxy({}, { get() { throw new Error("Unexpected unrelated service"); } });
    server = createDataApiServer({
      service: unrelated, detailService: unrelated, accountListService: unrelated,
      taskListService: unrelated, workItemListService: unrelated,
      internalToken, sessionAuthService: sessionAuth,
    } as unknown as DataApiServerOptions);
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    const address = server.address();
    if (address === null || typeof address === "string") throw new Error("Missing synthetic listener");
    origin = `http://127.0.0.1:${address.port}`;

    workspaceId = randomUUID();
    userId = randomUUID();
    identityId = randomUUID();
    await pool.query("INSERT INTO workspaces(id,name,kind) VALUES($1,'r014 shell','personal')", [workspaceId]);
    await pool.query("INSERT INTO users(id,workspace_id,name,role) VALUES($1,$2,'合成优化师','optimizer')",
      [userId, workspaceId]);
    await pool.query(
      "INSERT INTO auth_identities(id,provider,provider_subject,display_name) VALUES($1::uuid,'internal_test',$1::text,'synthetic')",
      [identityId]);
    await pool.query(
      "INSERT INTO workspace_memberships(workspace_id,user_id,identity_id,role) VALUES($1,$2,$3,'optimizer')",
      [workspaceId, userId, identityId]);
    await pool.query(
      "INSERT INTO accounts(workspace_id,media,account_id,account_name) VALUES($1,'KUAISHOU','shell-mine','我的户'),($1,'TENCENT','shell-theirs','别人的户')",
      [workspaceId]);
    await pool.query(
      "INSERT INTO account_access_grants(workspace_id,identity_id,media,account_id) VALUES($1,$2,'KUAISHOU','shell-mine')",
      [workspaceId, identityId]);

    taskId = `shell-${randomUUID()}`;
    await pool.query(
      "INSERT INTO tasks(workspace_id,task_id,task_name,status,stage,stage_source) VALUES($1,$2,'壳层任务','active','delivering','system')",
      [workspaceId, taskId]);
    await pool.query(
      "INSERT INTO task_accounts(workspace_id,task_id,media,account_id,valid_from) VALUES($1,$2,'TENCENT','shell-theirs','2026-09-01')",
      [workspaceId, taskId]);

    sessionToken = randomUUID() + randomUUID();
    expect((await sessionAuth.issueForIdentity({
      identityId, token: sessionToken, expiresAt: new Date(Date.now() + 60_000),
    })).status).toBe("approved");
  });

  afterAll(async () => {
    if (server?.listening) {
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    }
    try {
      await pool.query("DELETE FROM auth_sessions WHERE identity_id=$1", [identityId]);
      await pool.query("DELETE FROM kb_business_refs WHERE workspace_id=$1", [workspaceId]);
      await pool.query("DELETE FROM kb_links WHERE workspace_id=$1", [workspaceId]);
      await pool.query(
        "DELETE FROM kb_revisions WHERE document_id IN (SELECT id FROM kb_documents WHERE workspace_id=$1)",
        [workspaceId]);
      for (const table of ["kb_documents", "task_accounts", "tasks", "account_access_grants",
        "accounts", "workspace_memberships", "users"] as const) {
        await pool.query(`DELETE FROM ${table} WHERE workspace_id=$1`, [workspaceId]);
      }
      await pool.query("DELETE FROM workspaces WHERE id=$1", [workspaceId]);
      await pool.query("DELETE FROM auth_identities WHERE id=$1", [identityId]);
    } finally {
      await pool.end();
    }
  });

  it("carries the session all the way to a write and back", async () => {
    const created = await call("/kb/documents", "POST",
      { title: "壳层建的文档", kind: "manual", visibility: "workspace" });
    expect(created.status, JSON.stringify(created.body)).toBe(200);
    const data = created.body.data as { id: string; updatedBy: { userId: string } | null };
    // 会话 cookie 一路带到了仓储：作者是会话里那个人，不是空。
    expect(data.updatedBy?.userId).toBe(userId);

    const read = await call(`/kb/documents/${data.id}`);
    expect(read.status).toBe(200);
  });

  it("refuses an unauthenticated caller instead of falling through to 404", async () => {
    const response = await fetch(`${origin}/api/v1/kb/documents`, {
      headers: { authorization: `Bearer ${internalToken}`, "x-request-id": "shell-anon" },
    });
    expect(response.status).toBe(401);
  });

  it("keeps Q-020 scoping intact through the shell: an unauthorised task is 404", async () => {
    const detail = await call(`/tasks/${encodeURIComponent(taskId)}`);
    // 这个任务只挂了没授权的腾讯户；壳层拿到的 scope 必须让它 404，而不是 200。
    expect(detail.status).toBe(404);
  });

  it("serves the daily report through the shell with the request id echoed", async () => {
    const report = await call("/reports/daily?date=2026-09-05");
    expect(report.status).toBe(200);
    expect((report.body.meta as { requestId: string }).requestId).toBe("shell-request");
  });

  it("404s a path no route claims", async () => {
    expect((await call("/kb/nope")).status).toBe(404);
  });
});
