import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { runMigrations } from "../../src/migrate.js";
import { TaskBindingsRepository } from "../../src/r014/task-bindings-repository.js";

// Synthetic data only. Execute on the explicitly selected isolated test database (ka_be2_r014_test).
const databaseUrl = process.env.TEST_DATABASE_URL ?? "postgres://ka:ka@127.0.0.1:55432/ka_be2_r014_test";

interface AuthContext {
  workspaceId: string; userId: string; role: "optimizer"; workspaceKind: "personal";
  scope: { kind: "explicit_accounts"; accounts: never[] };
}

describe("R-014 task bindings repository (real PostgreSQL)", () => {
  const pool = new Pool({ connectionString: databaseUrl });
  const bindings = new TaskBindingsRepository(pool);
  const workspaces: string[] = [];
  let actor: AuthContext;
  let task = "";
  let runId = "";

  beforeAll(async () => {
    await runMigrations({ databaseUrl });
    const workspaceId = (await pool.query(
      "INSERT INTO workspaces(name,kind) VALUES($1,'personal') RETURNING id", [`r014-${randomUUID()}`],
    )).rows[0].id;
    workspaces.push(workspaceId);
    const identityId = (await pool.query(
      "INSERT INTO auth_identities(provider,provider_subject,display_name) VALUES('internal_test',$1,'synthetic') RETURNING id",
      [`r014-${randomUUID()}`],
    )).rows[0].id;
    const userId = (await pool.query(
      "INSERT INTO users(workspace_id,name,role) VALUES($1,'synthetic','optimizer') RETURNING id", [workspaceId],
    )).rows[0].id;
    await pool.query(
      "INSERT INTO workspace_memberships(workspace_id,identity_id,user_id,role,is_active) VALUES($1,$2,$3,'optimizer',true)",
      [workspaceId, identityId, userId],
    );
    task = `r014-task-${randomUUID()}`;
    await pool.query(
      "INSERT INTO tasks(workspace_id,task_id,task_name,biz_name) VALUES($1,$2,'绑定测试','AAC')",
      [workspaceId, task],
    );
    await pool.query("INSERT INTO accounts(workspace_id,media,account_id) VALUES($1,'KUAISHOU','r014-b1')", [workspaceId]);
    await pool.query(
      "INSERT INTO task_accounts(workspace_id,task_id,media,account_id,valid_from) VALUES($1,$2,'KUAISHOU','r014-b1','2026-09-01')",
      [workspaceId, task],
    );
    // 四条规则：绑任务 / 绑业务 / 绑账户 / 全局（全局不该出现在结果里）
    for (const [name, scope, autonomy] of [
      ["绑任务的", { taskIds: [task], accountScopes: [], bizNames: [] }, 1],
      ["绑业务的", { taskIds: [], accountScopes: [], bizNames: ["AAC"] }, 2],
      ["绑账户的", { taskIds: [], accountScopes: [{ media: "KUAISHOU", accountId: "r014-b1" }], bizNames: [] }, 1],
      ["全局的", { taskIds: [], accountScopes: [], bizNames: [] }, 1],
      ["绑别人的", { taskIds: ["other-task"], accountScopes: [], bizNames: [] }, 1],
    ] as const) {
      await pool.query(
        "INSERT INTO alert_rules(workspace_id,name,rule_type,scope,autonomy_level,enabled) VALUES($1,$2,'monitor',$3::jsonb,$4,true)",
        [workspaceId, name, JSON.stringify(scope), autonomy],
      );
    }
    const definitionId = (await pool.query(
      "INSERT INTO workflow_definitions(workspace_id,name) VALUES($1,'官方模板：新任务开户到基建') RETURNING id", [workspaceId],
    )).rows[0].id;
    const versionId = (await pool.query(
      `INSERT INTO workflow_versions(workspace_id,definition_id,version,graph,status)
       VALUES($1,$2,3,$3::jsonb,'published') RETURNING id`,
      [workspaceId, definitionId, JSON.stringify({ nodes: [{ id: "n1" }, { id: "n2" }, { id: "n3" }, { id: "n4" }, { id: "n5" }] })],
    )).rows[0].id;
    runId = (await pool.query(
      "INSERT INTO workflow_runs(workspace_id,version_id,task_id,status) VALUES($1,$2,$3,'success') RETURNING id",
      [workspaceId, versionId, task],
    )).rows[0].id;
    for (const node of ["n1", "n2", "n3", "n4"]) {
      await pool.query(
        "INSERT INTO workflow_run_events(run_id,node_id,event) VALUES($1,$2,'node_succeeded')", [runId, node],
      );
    }
    await pool.query("UPDATE tasks SET sop_run_id=$3 WHERE workspace_id=$1 AND task_id=$2", [workspaceId, task, runId]);
    actor = { workspaceId, userId, role: "optimizer", workspaceKind: "personal", scope: { kind: "explicit_accounts", accounts: [] } };
  });

  afterAll(async () => {
    for (const workspaceId of workspaces) {
      await pool.query("DELETE FROM workflow_run_events WHERE run_id=$1", [runId]);
      await pool.query("UPDATE tasks SET sop_run_id=NULL WHERE workspace_id=$1", [workspaceId]);
      for (const table of ["workflow_runs", "workflow_versions", "workflow_definitions", "alert_rules",
        "task_accounts", "tasks", "accounts"]) {
        await pool.query(`DELETE FROM ${table} WHERE workspace_id=$1`, [workspaceId]);
      }
      await pool.query("DELETE FROM workspace_memberships WHERE workspace_id=$1", [workspaceId]);
      await pool.query("DELETE FROM users WHERE workspace_id=$1", [workspaceId]);
      await pool.query("DELETE FROM workspaces WHERE id=$1", [workspaceId]);
    }
    await pool.query("DELETE FROM auth_identities WHERE display_name='synthetic' AND provider_subject LIKE 'r014-%'");
    await pool.end();
  });

  it("lists only rules actually bound to this task, never the global one", async () => {
    const result = await bindings.bindings(actor, task);
    // 用集合比较：中文 sort() 按码点排，拿它断言顺序毫无意义。
    expect(new Set(result.rules.map((rule) => rule.name)))
      .toEqual(new Set(["绑任务的", "绑业务的", "绑账户的"]));
    expect(result.rules).toHaveLength(3);
    // 全局规则对每个任务都成立，列进来就是冒充绑定。
    expect(result.rules.map((rule) => rule.name)).not.toContain("全局的");
    expect(result.rules.map((rule) => rule.name)).not.toContain("绑别人的");
  });

  it("reports the binding level each rule was matched at", async () => {
    const result = await bindings.bindings(actor, task);
    const byName = Object.fromEntries(result.rules.map((rule) => [rule.name, rule.scope]));
    expect(byName).toEqual({ 绑任务的: "task", 绑业务的: "task", 绑账户的: "account" });
  });

  it("leaves boundAt null while the 018 column has not landed", async () => {
    const result = await bindings.bindings(actor, task);
    expect(result.rules.every((rule) => rule.boundAt === null)).toBe(true);
  });

  it("derives the bound workflow from runs of this task and keeps the latest run", async () => {
    const result = await bindings.bindings(actor, task);
    expect(result.workflows).toHaveLength(1);
    expect(result.workflows[0]).toMatchObject({
      name: "官方模板：新任务开户到基建", version: 3, status: "published", scope: "task",
    });
    expect(result.workflows[0]!.lastRun).toMatchObject({ runId, status: "success" });
  });

  it("computes SOP progress from succeeded nodes over graph nodes", async () => {
    const result = await bindings.bindings(actor, task);
    expect(result.sop).toMatchObject({ sopRunId: runId, template: "官方模板：新任务开户到基建" });
    expect(result.sop!.progress).toEqual({ value: 0.8, state: "finite" });
  });

  it("returns empty bindings for a task with nothing bound, not the global rule", async () => {
    const bare = `r014-task-${randomUUID()}`;
    await pool.query("INSERT INTO tasks(workspace_id,task_id,task_name) VALUES($1,$2,'空任务')", [actor.workspaceId, bare]);
    const result = await bindings.bindings(actor, bare);
    expect(result).toEqual({ taskId: bare, rules: [], workflows: [], sop: null });
  });

  it("refuses a task from another workspace", async () => {
    await expect(bindings.bindings({ ...actor, workspaceId: randomUUID() }, task)).rejects.toThrow(/not_found/);
  });
});
