import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { runMigrations } from "@ka/db";
import { registerR014Routes } from "../../src/r014/routes.js";
import { createTaskTabRoutes } from "../../src/r014/task-tab-routes.js";
import { callRoute, type Captured } from "./fake-http.js";

// Synthetic data only. Execute on the explicitly selected isolated test database.
const databaseUrl = process.env.TEST_DATABASE_URL ?? "postgres://ka:ka@127.0.0.1:55432/ka_be_be2check_test";
const DATE = "2026-09-05";

/** 任务详情八页签补的两签（timeline / funnel）+ 契约点名一期 501 的两签。 */
describe("task detail tabs (real PostgreSQL)", () => {
  const pool = new Pool({ connectionString: databaseUrl });
  let workspaceId = "";
  let identityId = "";
  let userId = "";
  let taskId = "";

  const dataOf = (result: Captured): Record<string, unknown> =>
    (result.body as { data: Record<string, unknown> }).data;

  const auth = (accounts: string[]): never => ({
    workspaceId, userId, role: "optimizer", workspaceKind: "personal",
    scope: {
      kind: "explicit_accounts",
      accounts: accounts.map((accountId) => ({ media: "KUAISHOU", accountId, accessLevel: "read" })),
    },
  }) as never;

  const call = (path: string, accounts = ["tab-mine"], search = ""): Promise<Captured> =>
    callRoute(auth(accounts), path, "GET", undefined, search);

  beforeAll(async () => {
    await runMigrations({ databaseUrl });
    registerR014Routes(createTaskTabRoutes(pool));
    workspaceId = (await pool.query(
      "INSERT INTO workspaces(name,kind) VALUES($1,'personal') RETURNING id", [`tab-${randomUUID()}`],
    )).rows[0].id;
    identityId = (await pool.query(
      "INSERT INTO auth_identities(provider,provider_subject,display_name) VALUES('internal_test',$1,'synthetic') RETURNING id",
      [`tab-${randomUUID()}`],
    )).rows[0].id;
    userId = (await pool.query(
      "INSERT INTO users(workspace_id,name,role) VALUES($1,'合成优化师','optimizer') RETURNING id", [workspaceId],
    )).rows[0].id;
    await pool.query(
      "INSERT INTO workspace_memberships(workspace_id,identity_id,user_id,role,is_active) VALUES($1,$2,$3,'optimizer',true)",
      [workspaceId, identityId, userId]);

    taskId = `tab-${randomUUID()}`;
    await pool.query("INSERT INTO tasks(workspace_id,task_id,task_name) VALUES($1,$2,'页签任务')",
      [workspaceId, taskId]);
    for (const accountId of ["tab-mine", "tab-theirs"]) {
      await pool.query("INSERT INTO accounts(workspace_id,media,account_id) VALUES($1,'KUAISHOU',$2)",
        [workspaceId, accountId]);
      await pool.query(
        "INSERT INTO task_accounts(workspace_id,task_id,media,account_id,valid_from) VALUES($1,$2,'KUAISHOU',$3,'2026-09-01')",
        [workspaceId, taskId, accountId]);
      await pool.query(
        `INSERT INTO account_metrics_daily(workspace_id,media,account_id,ds,exposure,click,conversion,real_conversion,cost)
         VALUES($1,'KUAISHOU',$2,$3::date,1000,100,10,8,500)`,
        [workspaceId, accountId, DATE]);
      await pool.query(
        `INSERT INTO external_changes(workspace_id,media,account_id,target_type,target_id,field,to_value,detected_at)
         VALUES($1,'KUAISHOU',$2,'campaign',$3,'budget','1'::jsonb, now())`,
        [workspaceId, accountId, `c-${accountId}`]);
    }
    await pool.query(
      "INSERT INTO assessment_price_history(workspace_id,task_id,price,effective_date,changed_by) VALUES($1,$2,38,$3::date,$4)",
      [workspaceId, taskId, DATE, userId]);
    await pool.query(
      `INSERT INTO work_items(workspace_id,type,severity,title,status,task_id,assignee)
       VALUES($1,'diagnosis','P1','页签用工作项','open',$2,$3)`,
      [workspaceId, taskId, userId]);
  });

  afterAll(async () => {
    for (const table of ["external_changes", "work_items", "assessment_price_history",
      "account_metrics_daily", "task_accounts", "tasks", "accounts", "workspace_memberships", "users"]) {
      await pool.query(`DELETE FROM ${table} WHERE workspace_id=$1`, [workspaceId]);
    }
    await pool.query("DELETE FROM workspaces WHERE id=$1", [workspaceId]);
    await pool.query("DELETE FROM auth_identities WHERE id=$1", [identityId]);
    await pool.end();
  });

  it("merges the timeline sources newest first and says which kind it cannot serve", async () => {
    const result = await call(`/api/v1/tasks/${encodeURIComponent(taskId)}/timeline`);
    expect(result.status, JSON.stringify(result.body)).toBe(200);
    const items = dataOf(result).items as { at: string; kind: string; summary: string }[];
    expect(items.length).toBeGreaterThan(0);
    // 倒序：最新的在前。
    for (let index = 1; index < items.length; index += 1) {
      expect(items[index - 1]!.at >= items[index]!.at).toBe(true);
    }
    expect(new Set(items.map((item) => item.kind))).toContain("assessment_price");

    // ★dispatches 表还没建 → 整类如实标出来。空列表会被当成「查过了，没有派发」。
    const meta = (result.body as { meta: Record<string, unknown> }).meta;
    expect(meta.unavailableKinds).toEqual(["dispatch"]);
  });

  it("★keeps another optimizer's account events out of the timeline", async () => {
    const items = dataOf(await call(`/api/v1/tasks/${encodeURIComponent(taskId)}/timeline`)).items as
      { kind: string; ref: { id: string } }[];
    const external = items.filter((item) => item.kind === "external_change");
    // 任务过闸不等于任务下每个户都看得见：只授权了 tab-mine，就只该看到它的带外变更。
    expect(external).toHaveLength(1);

    const both = dataOf(await call(
      `/api/v1/tasks/${encodeURIComponent(taskId)}/timeline`, ["tab-mine", "tab-theirs"])).items as
      { kind: string }[];
    expect(both.filter((item) => item.kind === "external_change")).toHaveLength(2);
  });

  it("pages with a cursor that neither skips nor repeats a row", async () => {
    const first = dataOf(await call(`/api/v1/tasks/${encodeURIComponent(taskId)}/timeline`, ["tab-mine"], "?limit=1"));
    expect((first.items as unknown[])).toHaveLength(1);
    expect(first.nextCursor).toBeTypeOf("string");

    const second = dataOf(await call(
      `/api/v1/tasks/${encodeURIComponent(taskId)}/timeline`, ["tab-mine"],
      `?limit=1&cursor=${encodeURIComponent(String(first.nextCursor))}`));
    const firstId = ((first.items as { ref: { id: string } }[])[0]!).ref.id;
    const secondId = ((second.items as { ref: { id: string } }[])[0]!).ref.id;
    expect(secondId).not.toBe(firstId);
  });

  it("refuses an unknown kind instead of silently ignoring it", async () => {
    // 悄悄忽略会让调用方以为筛过了。
    expect((await call(`/api/v1/tasks/${encodeURIComponent(taskId)}/timeline`, ["tab-mine"], "?kinds=nope")).status)
      .toBe(400);
  });

  it("counts only granted accounts in the funnel and leaves the offline leg missing", async () => {
    const mine = dataOf(await call(
      `/api/v1/tasks/${encodeURIComponent(taskId)}/funnel`, ["tab-mine"], `?date_from=${DATE}&date_to=${DATE}`));
    const online = mine.online as Record<string, { value: number | null }>;
    // 两个户各 1000 曝光，只授权一个 → 1000 不是 2000。
    expect(online.exposure!.value).toBe(1000);

    const offline = mine.offline as Record<string, { value: number | null; availability?: string }>;
    // account_offline 表还没建：整条线下链路 missing，不拿线上数顶替。
    expect(offline.wakeUv).toEqual({ value: null, availability: "missing" });
    expect(offline.potentialUv).toEqual({ value: null, availability: "missing" });

    const rates = mine.rates as Record<string, { value: number | null; state: string }>;
    expect(rates.ctr).toEqual({ value: 0.1, state: "finite" });
    // 依赖线下量的两个比率算不出来，是 undefined 不是 0。
    expect(rates.potentialRate!.state).toBe("undefined");
    expect(rates.biCvr!.state).toBe("undefined");
  });

  it("answers 501 for the tabs the contract defers, not 404", async () => {
    for (const tab of ["materials", "review"]) {
      const result = await call(`/api/v1/tasks/${encodeURIComponent(taskId)}/${tab}`);
      // 404 会让前端分不出「一期不做」和「路径写错」。
      expect(result.status, tab).toBe(501);
      expect((result.body as { error: { code: string } }).error.code).toBe("NOT_IMPLEMENTED");
    }
  });
});
