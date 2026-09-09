import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { runMigrations } from "@ka/db";
import { createAccountRoutes } from "../../src/r014/account-routes.js";
import { createMeRoutes } from "../../src/r014/me-routes.js";
import { findR014Route, registerR014Routes } from "../../src/r014/routes.js";
import { createTaskRoutes } from "../../src/r014/task-routes.js";
import { createWorkspaceRoutes } from "../../src/r014/workspace-routes.js";
import { callRoute, type Captured } from "./fake-http.js";

// Synthetic data only. Execute on the explicitly selected isolated test database (ka_be2_r014_test).
const databaseUrl = process.env.TEST_DATABASE_URL ?? "postgres://ka:ka@127.0.0.1:55432/ka_be2_r014_test";

interface AuthContext {
  workspaceId: string; userId: string; role: "optimizer" | "lead"; workspaceKind: "personal";
  scope: { kind: "explicit_accounts"; accounts: { media: string; accountId: string; accessLevel: "read" }[] };
}

describe("R-014 S4b routes: accounts / tasks / workspace (real PostgreSQL)", () => {
  const pool = new Pool({ connectionString: databaseUrl });
  const workspaces: string[] = [];
  const capabilityKey = `r014.s4b.${randomUUID()}`;
  let lead: AuthContext;
  let optimizer: AuthContext;
  let task = "";

  const call = (auth: AuthContext, pathname: string, method: string, body?: unknown, search = ""): Promise<Captured> =>
    callRoute(auth, pathname, method, body, search);
  const dataOf = (result: Captured): Record<string, unknown> =>
    (result.body as { data: Record<string, unknown> }).data;

  beforeAll(async () => {
    await runMigrations({ databaseUrl });
    registerR014Routes([
      ...createMeRoutes(pool), ...createAccountRoutes(pool),
      ...createTaskRoutes(pool), ...createWorkspaceRoutes(pool),
    ]);
    const workspaceId = (await pool.query(
      "INSERT INTO workspaces(name,kind) VALUES($1,'personal') RETURNING id", [`r014-${randomUUID()}`],
    )).rows[0].id;
    workspaces.push(workspaceId);
    const contexts: AuthContext[] = [];
    for (const role of ["lead", "optimizer"] as const) {
      const identityId = (await pool.query(
        "INSERT INTO auth_identities(provider,provider_subject,display_name) VALUES('internal_test',$1,'synthetic') RETURNING id",
        [`r014-${randomUUID()}`],
      )).rows[0].id;
      const userId = (await pool.query(
        "INSERT INTO users(workspace_id,name,role) VALUES($1,$2,$3) RETURNING id", [workspaceId, `synthetic-${role}`, role],
      )).rows[0].id;
      await pool.query(
        "INSERT INTO workspace_memberships(workspace_id,identity_id,user_id,role,is_active) VALUES($1,$2,$3,$4,true)",
        [workspaceId, identityId, userId, role],
      );
      await pool.query(
        "INSERT INTO accounts(workspace_id,media,account_id,account_name) VALUES($1,'KUAISHOU',$2,$3)",
        [workspaceId, `r014-s4b-${role}`, `S4B 合成账户 ${role}`],
      );
      await pool.query(
        "INSERT INTO account_access_grants(workspace_id,identity_id,media,account_id,access_level) VALUES($1,$2,'KUAISHOU',$3,'read')",
        [workspaceId, identityId, `r014-s4b-${role}`],
      );
      contexts.push({
        workspaceId, userId, role, workspaceKind: "personal",
        scope: { kind: "explicit_accounts", accounts: [{ media: "KUAISHOU", accountId: `r014-s4b-${role}`, accessLevel: "read" }] },
      });
    }
    [lead, optimizer] = contexts as [AuthContext, AuthContext];
    task = `r014-task-${randomUUID()}`;
    await pool.query("INSERT INTO tasks(workspace_id,task_id,task_name) VALUES($1,$2,'S4B 任务')", [workspaceId, task]);
    await pool.query(
      `INSERT INTO capabilities(key,name,category,form_schema,permission,version,status,executor,media)
       VALUES ($1,'查数：S4B','query','{"type":"object"}'::jsonb,'accounts:read','1.0','verified','product_direct','{}')`,
      [capabilityKey],
    );
  });

  afterAll(async () => {
    await pool.query("DELETE FROM capabilities WHERE key=$1", [capabilityKey]);
    for (const workspaceId of workspaces) {
      for (const table of ["exports", "decision_policies", "task_readiness_overrides", "tasks",
        "account_access_grants", "accounts"]) {
        await pool.query(`DELETE FROM ${table} WHERE workspace_id=$1`, [workspaceId]);
      }
      await pool.query(
        "DELETE FROM identity_preferences WHERE identity_id IN (SELECT identity_id FROM workspace_memberships WHERE workspace_id=$1)",
        [workspaceId],
      );
      await pool.query("DELETE FROM workspace_memberships WHERE workspace_id=$1", [workspaceId]);
      await pool.query("DELETE FROM users WHERE workspace_id=$1", [workspaceId]);
      await pool.query("DELETE FROM workspaces WHERE id=$1", [workspaceId]);
    }
    await pool.query("DELETE FROM auth_identities WHERE display_name='synthetic' AND provider_subject LIKE 'r014-%'");
    await pool.end();
  });

  it("claims every S4b path and still refuses paths that belong to the shell", () => {
    for (const pathname of [
      "/api/v1/accounts/pipeline", "/api/v1/accounts/KUAISHOU/acc-1/pool-status",
      `/api/v1/tasks/${task}/bindings`, `/api/v1/tasks/${task}/readiness/strategy`,
      "/api/v1/capabilities", "/api/v1/settings/decision-policy",
      "/api/v1/export", "/api/v1/exports/00000000-0000-4000-8000-000000001101", "/api/v1/search",
    ]) {
      expect(findR014Route(pathname), pathname).not.toBeNull();
    }
    for (const pathname of ["/api/v1/accounts", "/api/v1/tasks", "/api/v1/query", "/api/v1/exports/not-a-uuid"]) {
      expect(findR014Route(pathname), pathname).toBeNull();
    }
  });

  it("serves the nine-state pipeline with missing deltas rather than zeros", async () => {
    const data = dataOf(await call(lead, "/api/v1/accounts/pipeline", "GET"));
    const stages = data.stages as { poolStatus: string; count: number; deltaVsYesterday: unknown }[];
    expect(stages).toHaveLength(9);
    expect(stages[0]!.poolStatus).toBe("available");
    for (const stage of stages) {
      expect(stage.deltaVsYesterday).toEqual({ value: null, availability: "missing" });
    }
  });

  it("overrides and clears a pool status through the three-key path", async () => {
    const patched = dataOf(await call(lead, "/api/v1/accounts/KUAISHOU/r014-s4b-lead/pool-status", "PATCH", { pool_status: "paused" }));
    expect(patched).toMatchObject({ poolStatus: "paused", poolStatusSource: "manual" });
    const cleared = dataOf(await call(lead, "/api/v1/accounts/KUAISHOU/r014-s4b-lead/pool-status", "DELETE"));
    // 清除只把标记复位，状态值交回系统推导，不在这里改成别的态。
    expect(cleared).toMatchObject({ poolStatus: "paused", poolStatusSource: "system" });
  });

  it("refuses an unknown pool status and an account the caller cannot see", async () => {
    expect((await call(lead, "/api/v1/accounts/KUAISHOU/r014-s4b-lead/pool-status", "PATCH", { pool_status: "delivering" })).status).toBe(400);
    expect((await call(lead, "/api/v1/accounts/KUAISHOU/r014-s4b-lead/pool-status", "PATCH", {})).status).toBe(400);
    expect((await call(optimizer, "/api/v1/accounts/KUAISHOU/r014-s4b-lead/pool-status", "PATCH", { pool_status: "paused" })).status).toBe(403);
  });

  it("returns empty bindings for a task with nothing bound", async () => {
    const data = dataOf(await call(lead, `/api/v1/tasks/${task}/bindings`, "GET"));
    expect(data).toEqual({ taskId: task, rules: [], workflows: [], sop: null });
  });

  it("records a manual readiness mark and rejects a seventh dimension", async () => {
    const marked = dataOf(await call(lead, `/api/v1/tasks/${task}/readiness/strategy`, "PUT", { ready: true, note: "已定" }));
    expect(marked).toMatchObject({ dimension: "strategy", ready: true, note: "已定", markedBy: lead.userId });
    expect((await call(lead, `/api/v1/tasks/${task}/readiness/budget`, "PUT", { ready: true })).status).toBe(400);
    expect((await call(lead, `/api/v1/tasks/${task}/readiness/strategy`, "PUT", { ready: "yes" })).status).toBe(400);
  });

  it("lists capabilities and never exposes an execute effect", async () => {
    const data = dataOf(await call(lead, "/api/v1/capabilities", "GET", undefined, "?category=query"));
    const items = data.items as { key: string; category: string }[];
    expect(items.map((item) => item.key)).toContain(capabilityKey);
    expect(items.every((item) => item.category === "query")).toBe(true);
    expect((await call(lead, "/api/v1/capabilities", "GET", undefined, "?category=teardown")).status).toBe(400);
  });

  it("lets a lead write the decision policy and refuses an optimizer", async () => {
    const policy = { confidenceMin: 0.9, historicalSuccessRateMin: 0.8, recentManualOpsWindowHours: 24, dailyCapCny: 5000 };
    expect(dataOf(await call(lead, "/api/v1/settings/decision-policy", "PUT", { policy })).policy).toEqual(policy);
    // 放开给 optimizer 等于让人自己抬高自己的自动执行额度上限。
    expect((await call(optimizer, "/api/v1/settings/decision-policy", "PUT", { policy })).status).toBe(403);
    expect((await call(lead, "/api/v1/settings/decision-policy", "PUT", {})).status).toBe(400);
    expect(dataOf(await call(optimizer, "/api/v1/settings/decision-policy", "GET")).policy).toEqual(policy);
  });

  it("queues an export and hides another user's export behind 404", async () => {
    const queued = dataOf(await call(lead, "/api/v1/export", "POST", {
      kind: "query", ref: { queryId: "account.summary", params: {} }, format: "xlsx",
    }));
    expect(queued).toMatchObject({ status: "queued", kind: "query", format: "xlsx" });
    const exportId = queued.exportId as string;
    expect(dataOf(await call(lead, `/api/v1/exports/${exportId}`, "GET"))).toMatchObject({ status: "queued" });
    expect((await call(optimizer, `/api/v1/exports/${exportId}`, "GET")).status).toBe(404);
    expect((await call(lead, "/api/v1/export", "POST", { kind: "view", ref: { queryId: "q", params: {} }, format: "xlsx" })).status).toBe(400);
  });

  it("answers 410 for an expired signed file instead of handing back a dead link", async () => {
    const queued = dataOf(await call(lead, "/api/v1/export", "POST", {
      kind: "query", ref: { queryId: "account.summary", params: {} }, format: "png",
    }));
    await pool.query(
      `UPDATE exports SET status='done', file_ref='blob://x', bytes=1, expires_at=now() - interval '1 minute' WHERE id=$1`,
      [queued.exportId],
    );
    const expired = await call(lead, `/api/v1/exports/${queued.exportId as string}`, "GET");
    expect(expired.status).toBe(410);
    expect(JSON.stringify(expired.body)).not.toContain("blob://");
  });

  it("searches only what the caller can see and names the types that have no table yet", async () => {
    const result = await call(lead, "/api/v1/search", "GET", undefined, "?q=S4B");
    const items = dataOf(result).items as { type: string; title: string }[];
    expect(items.some((item) => item.type === "account" && item.title === "S4B 合成账户 lead")).toBe(true);
    // 别人的户不该出现在我的搜索结果里。
    expect(items.some((item) => item.title.includes("optimizer"))).toBe(false);
    expect((result.body as { meta: { unavailableTypes?: string[] } }).meta.unavailableTypes)
      .toEqual(["material", "document"]);
    expect((await call(lead, "/api/v1/search", "GET", undefined, "?q=")).status).toBe(400);
  });
});
