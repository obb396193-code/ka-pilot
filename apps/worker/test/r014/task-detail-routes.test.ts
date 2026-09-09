import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { runMigrations } from "@ka/db";
import { TASK_DETAIL_TABS } from "@ka/domain";
import { findR014Route, registerR014Routes } from "../../src/r014/routes.js";
import { createTaskDetailRoutes } from "../../src/r014/task-detail-routes.js";
import { callRoute, type Captured } from "./fake-http.js";

// Synthetic data only. Execute on the explicitly selected isolated test database (ka_be2_r014_test).
const databaseUrl = process.env.TEST_DATABASE_URL ?? "postgres://ka:ka@127.0.0.1:55432/ka_be2_r014_test";

interface AuthContext {
  workspaceId: string; userId: string; role: "lead"; workspaceKind: "team";
  scope: { kind: "team_workspace_readonly" };
}

describe("D5 task detail route (real PostgreSQL)", () => {
  const pool = new Pool({ connectionString: databaseUrl });
  let auth: AuthContext;
  let workspaceId = "";
  let richTask = "";
  let bareTask = "";
  let workItemId = "";

  const call = (taskId: string): Promise<Captured> =>
    callRoute(auth, `/api/v1/tasks/${encodeURIComponent(taskId)}`, "GET");
  const dataOf = (result: Captured): Record<string, unknown> =>
    (result.body as { data: Record<string, unknown> }).data;

  beforeAll(async () => {
    await runMigrations({ databaseUrl });
    registerR014Routes(createTaskDetailRoutes(pool));
    workspaceId = (await pool.query(
      "INSERT INTO workspaces(name,kind) VALUES($1,'team') RETURNING id", [`d5-${randomUUID()}`],
    )).rows[0].id;
    const identityId = (await pool.query(
      "INSERT INTO auth_identities(provider,provider_subject,display_name) VALUES('internal_test',$1,'synthetic') RETURNING id",
      [`d5-${randomUUID()}`],
    )).rows[0].id;
    const userId = (await pool.query(
      "INSERT INTO users(workspace_id,name,role) VALUES($1,'合成负责人','lead') RETURNING id", [workspaceId],
    )).rows[0].id;
    await pool.query(
      "INSERT INTO workspace_memberships(workspace_id,identity_id,user_id,role,is_active) VALUES($1,$2,$3,'lead',true)",
      [workspaceId, identityId, userId],
    );
    richTask = `d5-${randomUUID()}`;
    bareTask = `d5-${randomUUID()}`;
    await pool.query(
      `INSERT INTO tasks(workspace_id,task_id,task_name,biz_name,status,period_start,period_end,
         target_volume,budget,owner_user_id,stage,stage_source,stage_changed_at)
       VALUES ($1,$2,'AAC 拉新','AAC','active','2026-09-01','2026-09-30',120000,3000000,$4,'delivering','system',now()),
              ($1,$3,'空任务',NULL,'preparing',NULL,NULL,NULL,NULL,NULL,'preparing','system',NULL)`,
      [workspaceId, richTask, bareTask, userId],
    );
    for (const [accountId, balance, hasUnit] of [
      ["d5-a1", 10000, true], ["d5-a2", 0, false],
    ] as const) {
      await pool.query("INSERT INTO accounts(workspace_id,media,account_id) VALUES($1,'KUAISHOU',$2)", [workspaceId, accountId]);
      await pool.query(
        "INSERT INTO task_accounts(workspace_id,task_id,media,account_id,valid_from) VALUES($1,$2,'KUAISHOU',$3,'2026-09-01')",
        [workspaceId, richTask, accountId],
      );
      await pool.query(
        "INSERT INTO account_balance(workspace_id,media,account_id,balance,synced_at) VALUES($1,'KUAISHOU',$2,$3,now())",
        [workspaceId, accountId, balance],
      );
      if (hasUnit) {
        await pool.query(
          `INSERT INTO ad_entities(entity_id,workspace_id,media,account_id,entity_type,status)
           VALUES($1,$2,'KUAISHOU',$3,'unit','ACTIVE')`, [`unit-${accountId}`, workspaceId, accountId],
        );
      }
    }
    for (const [price, date] of [[42, "2026-08-01"], [38, "2026-09-01"], [30, "2099-01-01"]] as const) {
      await pool.query(
        "INSERT INTO assessment_price_history(workspace_id,task_id,price,effective_date) VALUES($1,$2,$3,$4::date)",
        [workspaceId, richTask, price, date],
      );
    }
    workItemId = (await pool.query(
      `INSERT INTO work_items(workspace_id,type,severity,title,status,task_id,media,account_id)
       VALUES($1,'diagnosis','P0','account-2 成本超考核','open',$2,'KUAISHOU','d5-a1') RETURNING id`,
      [workspaceId, richTask],
    )).rows[0].id;
    await pool.query(
      `INSERT INTO work_items(workspace_id,type,severity,title,status,task_id)
       VALUES($1,'diagnosis','P2','早处理完了','done',$2)`, [workspaceId, richTask],
    );
    auth = { workspaceId, userId, role: "lead", workspaceKind: "team", scope: { kind: "team_workspace_readonly" } };
  });

  afterAll(async () => {
    for (const table of ["work_items", "assessment_price_history", "ad_entities", "account_balance",
      "task_accounts", "tasks", "accounts", "workspace_memberships", "users"]) {
      await pool.query(`DELETE FROM ${table} WHERE workspace_id=$1`, [workspaceId]);
    }
    await pool.query("DELETE FROM workspaces WHERE id=$1", [workspaceId]);
    await pool.query("DELETE FROM auth_identities WHERE display_name='synthetic' AND provider_subject LIKE 'd5-%'");
    await pool.end();
  });

  it("claims the task detail path but not the list or the sub-tabs", () => {
    expect(findR014Route(`/api/v1/tasks/${richTask}`)).not.toBeNull();
    expect(findR014Route("/api/v1/tasks")).toBeNull();
    expect(findR014Route(`/api/v1/tasks/${richTask}/accounts`)).toBeNull();
  });

  it("serves the task block and the frozen eight tabs", async () => {
    const result = await call(richTask);
    expect(result.status).toBe(200);
    const data = dataOf(result);
    expect(data.task).toMatchObject({
      taskId: richTask, taskName: "AAC 拉新", bizName: "AAC", status: "active",
      period: { start: "2026-09-01", end: "2026-09-30" },
      owner: { userId: auth.userId, displayName: "合成负责人" },
    });
    expect(data.tabs).toEqual([...TASK_DETAIL_TABS]);
  });

  it("counts only open work items in the anomaly summary", async () => {
    const overview = dataOf(await call(richTask)).overview as Record<string, unknown>;
    // 已办的那条不该计入「异常」。
    expect(overview.anomalySummary).toEqual({ p0: 1, p1: 0, opportunity: 0 });
  });

  it("takes the assessment price effective today, not a future one", async () => {
    const overview = dataOf(await call(richTask)).overview as Record<string, unknown>;
    // 库里有 2099 那条未来价，展示价必须仍是 2026-09-01 生效的 38。
    expect(overview.assessmentPrice).toEqual({ current: 38, effectiveDate: "2026-09-01", historyCount: 3 });
  });

  it("derives readiness from real facts and keeps the sourceless dimensions undefined", async () => {
    const overview = dataOf(await call(richTask)).overview as Record<string, Record<string, unknown>>;
    const readiness = overview.readiness as Record<string, { ratio: unknown; ready: boolean; missing: string[] }>;
    expect(readiness.recharge!.ratio).toEqual({ value: 0.5, state: "finite" });
    expect(readiness.recharge!.missing).toEqual(["d5-a2 余额不足"]);
    expect(readiness.infra!.missing).toEqual(["d5-a2 无单元"]);
    expect(readiness.strategy!.ratio).toEqual({ value: null, state: "undefined" });
    // 有段算不出来，overall 就是 undefined，不拿有源的那几段平均一下冒充。
    expect(readiness.overall).toEqual({ value: null, state: "undefined" });
  });

  it("lists blockers from real work items and readiness gaps only", async () => {
    const overview = dataOf(await call(richTask)).overview as Record<string, unknown>;
    const blockers = overview.blockers as { kind: string; ref: string; title: string }[];
    expect(blockers[0]).toMatchObject({ kind: "work_item", ref: workItemId, title: "account-2 成本超考核" });
    expect(blockers.some((item) => item.kind === "readiness" && item.title === "d5-a2 余额不足")).toBe(true);
    // nextActions 是 blockers 的前几条，不是另外生成的一套建议。
    const nextActions = overview.nextActions as { ref: string }[];
    expect(nextActions.map((item) => item.ref)).toEqual(blockers.slice(0, 3).map((item) => item.ref));
  });

  it("derives SOP steps from the stage without a run, and never fakes a timestamp", async () => {
    const overview = dataOf(await call(richTask)).overview as Record<string, unknown>;
    const sop = overview.sopProgress as { runId: string | null; steps: { status: string; at: string | null }[] };
    expect(sop.runId).toBeNull();
    expect(sop.steps.map((step) => step.status)).toEqual(["done", "done", "done", "done", "done", "running"]);
    expect(sop.steps.every((step) => step.at === null)).toBe(true);
  });

  it("leaves the window and budget blocks null instead of inventing them", async () => {
    const overview = dataOf(await call(richTask)).overview as Record<string, unknown>;
    for (const key of ["cost", "costStatus", "costStatusReason", "onTarget",
      "budgetUsageRate", "budgetUsageDate", "dailyBudgetCap"]) {
      expect(overview[key], key).toBeNull();
    }
  });

  it("serves a bare task honestly instead of failing", async () => {
    const data = dataOf(await call(bareTask));
    const overview = data.overview as Record<string, unknown>;
    expect((data.task as Record<string, unknown>).period).toBeNull();
    // 没有周期就算不出 pacing；返回 null 而不是造一段进度。
    expect(overview.pacing).toBeNull();
    expect(overview.assessmentPrice).toBeNull();
    expect(overview.targetVolume).toEqual({ value: null, availability: "missing" });
    expect((overview.readiness as Record<string, unknown>).overall).toEqual({ value: null, state: "undefined" });
  });

  it("refuses a task from another workspace with 404", async () => {
    const result = await callRoute(
      { ...auth, workspaceId: randomUUID() },
      `/api/v1/tasks/${encodeURIComponent(richTask)}`, "GET",
    );
    expect(result.status).toBe(404);
  });
});
