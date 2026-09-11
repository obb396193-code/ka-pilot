import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { runMigrations } from "@ka/db";
import { findR014Route, registerR014Routes } from "../../src/r014/routes.js";
import { createTaskDetailRoutes } from "../../src/r014/task-detail-routes.js";
import { callRoute, type Captured } from "./fake-http.js";

// Synthetic data only. Execute on the explicitly selected isolated test database.
const databaseUrl = process.env.TEST_DATABASE_URL ?? "postgres://ka:ka@127.0.0.1:55432/ka_be_be2check_test";

interface AuthContext {
  workspaceId: string; userId: string; role: "lead" | "optimizer"; workspaceKind: "personal" | "team";
  scope: { kind: "explicit_accounts"; accounts: { media: string; accountId: string; accessLevel: "execute" }[] }
    | { kind: "team_workspace_readonly" };
}

/** v1.9.28 任务管理视图（be2 Q-043 ②）：PATCH 四字段 + 整类保存全成功才写。 */
describe("v1.9.28 task manage routes (real PostgreSQL)", () => {
  const pool = new Pool({ connectionString: databaseUrl });
  let auth: AuthContext;
  let teamAuth: AuthContext;
  let workspaceId = "";
  let teamWorkspaceId = "";
  const identityIds: string[] = [];
  const mine = `manage-${randomUUID()}`;
  const alsoMine = `manage-${randomUUID()}`;
  const hidden = `manage-${randomUUID()}`;

  const patch = (taskId: string, body: unknown, as: AuthContext = auth): Promise<Captured> =>
    callRoute(as, `/api/v1/tasks/${encodeURIComponent(taskId)}`, "PATCH", body);
  const batchSave = (items: unknown[], as: AuthContext = auth): Promise<Captured> =>
    callRoute(as, "/api/v1/tasks/batch-save", "POST", { items });
  const dataOf = (result: Captured): Record<string, unknown> =>
    (result.body as { data: Record<string, unknown> }).data;
  const errorOf = (result: Captured): Record<string, unknown> =>
    (result.body as { error: Record<string, unknown> }).error;

  async function makeWorkspace(kind: "personal" | "team"): Promise<{ id: string; userId: string }> {
    const id = (await pool.query(
      "INSERT INTO workspaces(name,kind) VALUES($1,$2) RETURNING id", [`manage-${randomUUID()}`, kind],
    )).rows[0].id;
    const identityId = (await pool.query(
      "INSERT INTO auth_identities(provider,provider_subject,display_name) VALUES('internal_test',$1,'synthetic') RETURNING id",
      [`manage-${randomUUID()}`],
    )).rows[0].id;
    identityIds.push(identityId);
    const userId = (await pool.query(
      "INSERT INTO users(workspace_id,name,role) VALUES($1,'synthetic','lead') RETURNING id", [id],
    )).rows[0].id;
    await pool.query(
      "INSERT INTO workspace_memberships(workspace_id,identity_id,user_id,role,is_active) VALUES($1,$2,$3,'lead',true)",
      [id, identityId, userId]);
    return { id, userId };
  }

  beforeAll(async () => {
    await runMigrations({ databaseUrl });
    registerR014Routes(createTaskDetailRoutes(pool));
    const personal = await makeWorkspace("personal");
    workspaceId = personal.id;
    const team = await makeWorkspace("team");
    teamWorkspaceId = team.id;

    for (const [workspace, accountId] of [[workspaceId, "manage-a1"], [workspaceId, "manage-a2"],
      [workspaceId, "manage-a3"], [teamWorkspaceId, "manage-t1"]] as const) {
      await pool.query(
        "INSERT INTO accounts(workspace_id,media,account_id,account_name) VALUES($1,'KUAISHOU',$2,'合成账户')",
        [workspace, accountId]);
    }
    for (const [workspace, taskId, accountId] of [
      // 一个账户同一时间只能挂一个任务（task_accounts 上有排他约束），所以一task一户。
      [workspaceId, mine, "manage-a1"], [workspaceId, alsoMine, "manage-a3"],
      [workspaceId, hidden, "manage-a2"], [teamWorkspaceId, mine, "manage-t1"],
    ] as const) {
      await pool.query(
        `INSERT INTO tasks(workspace_id,task_id,task_name,biz_name,status,period_start,period_end)
         VALUES($1,$2,'合成任务','拉新','active','2026-09-01','2026-09-30')
         ON CONFLICT DO NOTHING`, [workspace, taskId]);
      await pool.query(
        `INSERT INTO task_accounts(workspace_id,task_id,media,account_id,valid_from)
         VALUES($1,$2,'KUAISHOU',$3,'2026-09-01')`, [workspace, taskId, accountId]);
    }

    // 只授权 a1：挂在 a2 上的那个任务对这个会话就是「不存在」。
    auth = {
      workspaceId, userId: personal.userId, role: "lead", workspaceKind: "personal",
      scope: {
        kind: "explicit_accounts",
        accounts: [
          { media: "KUAISHOU", accountId: "manage-a1", accessLevel: "execute" },
          { media: "KUAISHOU", accountId: "manage-a3", accessLevel: "execute" },
        ],
      },
    };
    teamAuth = {
      workspaceId: teamWorkspaceId, userId: team.userId, role: "lead", workspaceKind: "team",
      scope: { kind: "team_workspace_readonly" },
    };
  });

  afterAll(async () => {
    for (const workspace of [workspaceId, teamWorkspaceId]) {
      for (const table of ["task_accounts", "tasks", "accounts", "workspace_memberships", "users"]) {
        await pool.query(`DELETE FROM ${table} WHERE workspace_id=$1`, [workspace]);
      }
      await pool.query("DELETE FROM workspaces WHERE id=$1", [workspace]);
    }
    // 只删本用例建的身份，不按前缀批量删。
    await pool.query("DELETE FROM auth_identities WHERE id = ANY($1::uuid[])", [identityIds]);
    await pool.end();
  });

  it("does not let batch-save be swallowed by the :id route", () => {
    // `batch-save` 长得就像一个 task_id。详情路由先匹配上的话整条端点变成 405，
    // 而且换个注册顺序才会犯——所以正则里就把它排掉，这里钉住。
    const route = findR014Route("/api/v1/tasks/batch-save");
    expect(route).not.toBeNull();
    const detail = findR014Route(`/api/v1/tasks/${encodeURIComponent(mine)}`);
    expect(detail).not.toBeNull();
    expect(route).not.toBe(detail);
  });

  it("patches the four manage fields and can clear the nullable ones", async () => {
    const saved = await patch(mine, {
      aliases: ["拉新A", "拉新A", " 拉新B "], monitor_url: "https://example.invalid/m",
      product_name: "某产品", status: "paused",
    });
    expect(saved.status, JSON.stringify(saved.body)).toBe(200);
    // 别名去重去空白：重复项只会让最长命中多比几次。
    expect(dataOf(saved).aliases).toEqual(["拉新A", "拉新B"]);
    expect(dataOf(saved).monitorUrl).toBe("https://example.invalid/m");
    expect(dataOf(saved).status).toBe("paused");

    // 显式清空与「没给这个字段」必须分得开：COALESCE 会把清空当成没改。
    const cleared = await patch(mine, { monitor_url: null });
    expect(cleared.status).toBe(200);
    expect(dataOf(cleared).monitorUrl).toBeNull();
    expect(dataOf(cleared).productName).toBe("某产品");
    expect(dataOf(cleared).status).toBe("paused");
  });

  it("refuses an empty patch instead of reporting success for nothing", async () => {
    expect((await patch(mine, {})).status).toBe(400);
    // 认不出的字段也拒：静默丢掉等于告诉调用方「保存成功了」。
    expect((await patch(mine, { budget: 100 })).status).toBe(400);
    expect((await patch(mine, { status: "stopped" })).status).toBe(400);
  });

  it("treats a task outside the session scope as missing, not forbidden", async () => {
    // 403 等于确认「这个任务存在」。
    expect((await patch(hidden, { product_name: "x" })).status).toBe(404);
  });

  it("keeps the team workspace read-only", async () => {
    // 团队空间是 ka-data 的只读镜像：改了也不会回流到源。
    expect((await patch(mine, { product_name: "x" }, teamAuth)).status).toBe(403);
  });

  it("saves a whole batch or none of it, and names what failed", async () => {
    const rejected = await batchSave([
      { task_id: mine, product_name: "批量A" },
      { task_id: alsoMine, status: "nonsense" },
    ]);
    expect(rejected.status).toBe(400);
    const failed = (errorOf(rejected).details as { failed: { task_id: string; code: string }[] }).failed;
    expect(failed.map((entry) => entry.task_id)).toEqual([alsoMine]);
    expect(failed[0]!.code).toBe("INVALID_INPUT");
    // 一半写进去一半没写，页面上看不出是哪一半——所以第一条也必须没写。
    expect((await pool.query(
      "SELECT product_name FROM tasks WHERE workspace_id=$1 AND task_id=$2", [workspaceId, mine],
    )).rows[0].product_name).not.toBe("批量A");

    const duplicated = await batchSave([
      { task_id: mine, product_name: "一" }, { task_id: mine, product_name: "二" },
    ]);
    expect(duplicated.status).toBe(400);

    // 看不见的任务混在批里：整批回滚，并说明是「有任务看不见」。
    const invisible = await batchSave([
      { task_id: mine, product_name: "批量B" }, { task_id: hidden, product_name: "批量B" },
    ]);
    expect(invisible.status).toBe(400);
    expect((await pool.query(
      "SELECT product_name FROM tasks WHERE workspace_id=$1 AND task_id=$2", [workspaceId, mine],
    )).rows[0].product_name).not.toBe("批量B");

    const saved = await batchSave([
      { task_id: mine, product_name: "批量C", status: "active" },
      { task_id: alsoMine, product_name: "批量C", aliases: ["别名C"] },
    ]);
    expect(saved.status, JSON.stringify(saved.body)).toBe(200);
    expect((dataOf(saved).saved as { taskId: string }[]).map((row) => row.taskId).sort())
      .toEqual([mine, alsoMine].sort());
    const rows = (await pool.query(
      "SELECT task_id, product_name, aliases FROM tasks WHERE workspace_id=$1 AND task_id = ANY($2::text[]) ORDER BY task_id",
      [workspaceId, [mine, alsoMine]])).rows as { product_name: string; aliases: string[] }[];
    expect(rows.every((row) => row.product_name === "批量C")).toBe(true);
  });

  it("rejects a batch that is not a non-empty list", async () => {
    expect((await batchSave([])).status).toBe(400);
    expect((await callRoute(auth, "/api/v1/tasks/batch-save", "POST", { items: "nope" })).status).toBe(400);
  });
});
