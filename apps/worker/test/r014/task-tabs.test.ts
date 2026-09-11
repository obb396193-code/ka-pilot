import { readFileSync } from "node:fs";
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

  const post = (path: string, body: unknown, accounts = ["tab-mine"]): Promise<Captured> =>
    callRoute(auth(accounts), path, "POST", body);

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

  it("records an assessment price change and reports how many days it re-prices", async () => {
    const result = await post(`/api/v1/tasks/${encodeURIComponent(taskId)}/assessment-price`,
      { price: 42, effective_date: DATE, evidence_url: "https://example.invalid/evidence" });
    expect(result.status, JSON.stringify(result.body)).toBe(200);
    const data = dataOf(result);
    // 之前有一条 38 的价（beforeAll 灌的），所以 old_price 是 38 不是 null。
    expect(data.old_price).toBe(38);
    expect(data.new_price).toBe(42);
    // recomputedDays = 生效日至今的天数：表示「有多少天的派生指标会跟着变」，
    // 不是「已经重算了多少天」——一期不跑批。
    expect(typeof data.recomputed_days).toBe("number");
    expect(data.recomputed_days as number).toBeGreaterThan(0);

    const rows = (await pool.query(
      "SELECT price, evidence_url FROM assessment_price_history WHERE workspace_id=$1 AND task_id=$2 ORDER BY id DESC LIMIT 1",
      [workspaceId, taskId])).rows;
    expect(Number(rows[0]!.price)).toBe(42);
    expect(rows[0]!.evidence_url).toBe("https://example.invalid/evidence");
  });

  it("★refuses to re-price a task the caller cannot see", async () => {
    // 与任务详情同一口径：列表里看不见的任务，价也不能改；404 不是 403。
    const result = await post(`/api/v1/tasks/${encodeURIComponent(taskId)}/assessment-price`,
      { price: 50, effective_date: DATE }, []);
    expect(result.status).toBe(404);
  });

  it("rejects a non-positive price instead of treating it as not on target", async () => {
    for (const price of [0, -1, "abc"]) {
      expect((await post(`/api/v1/tasks/${encodeURIComponent(taskId)}/assessment-price`,
        { price, effective_date: DATE })).status, String(price)).toBe(400);
    }
  });

  it("refuses a change that sets the very same price", async () => {
    const body = { price: 77, effective_date: DATE };
    expect((await post(`/api/v1/tasks/${encodeURIComponent(taskId)}/assessment-price`, body)).status).toBe(200);
    // 改成同一个价什么也没变；再写一行只会让历史里堆无意义的「调整」。
    expect((await post(`/api/v1/tasks/${encodeURIComponent(taskId)}/assessment-price`, body)).status).toBe(409);
  });

  it("★Q-043 ④: a revoked segment stops being the effective price everywhere", async () => {
    const revokeDate = "2026-09-06";
    // 先记下作废前这一天本来生效的价——作废掉新写的那段之后，就该回到它，
    // 而不是回到 0 或停在被作废的价上。这样断言不依赖本文件前面几条用例写了什么。
    const effectiveAt = async (): Promise<number | null> => {
      const row = (await pool.query(
        `SELECT history.price FROM assessment_price_history AS history
         WHERE history.workspace_id=$1 AND history.task_id=$2 AND history.effective_date <= $3::date
           AND history.op='set' AND NOT EXISTS (
             SELECT 1 FROM assessment_price_history AS revoked
             WHERE revoked.workspace_id=history.workspace_id AND revoked.task_id=history.task_id
               AND revoked.op='revoke' AND revoked.effective_date=history.effective_date)
         ORDER BY history.effective_date DESC, history.id DESC LIMIT 1`,
        [workspaceId, taskId, revokeDate])).rows[0] as { price: string } | undefined;
      return row === undefined ? null : Number(row.price);
    };
    const fallback = await effectiveAt();
    expect(fallback).not.toBe(123);

    expect((await post(`/api/v1/tasks/${encodeURIComponent(taskId)}/assessment-price`,
      { price: 123, effective_date: revokeDate })).status).toBe(200);
    expect(await effectiveAt()).toBe(123);

    const revoked = await post(`/api/v1/tasks/${encodeURIComponent(taskId)}/assessment-price`,
      { op: "revoke", effective_date: revokeDate });
    expect(revoked.status, JSON.stringify(revoked.body)).toBe(200);
    expect(dataOf(revoked).op).toBe("revoke");
    // 作废掉的那段是 123；作废后这一天生效的回到作废前那一段，不是 0、也不是停在 123。
    expect(dataOf(revoked).old_price).toBe(123);
    expect(dataOf(revoked).new_price).toBe(fallback);
    // 读侧与写侧回的是同一条判定——不是两套各算各的。
    expect(await effectiveAt()).toBe(fallback);

    // 只增不改：原来那行还在，多出来的是一条 revoke 行。
    const rows = (await pool.query(
      `SELECT op, price FROM assessment_price_history
       WHERE workspace_id=$1 AND task_id=$2 AND effective_date=$3::date ORDER BY id`,
      [workspaceId, taskId, revokeDate])).rows as { op: string; price: string }[];
    expect(rows.map((row) => row.op)).toEqual(["set", "revoke"]);
    expect(rows.every((row) => Number(row.price) === 123)).toBe(true);

    // 任务详情、任务列表、窗口考核那几个读点走的是同一个共享谓词，
    // 由绊线 assessment-price-selection 保证（本文件只注册了页签路由，够不着详情路由）。

    // 作废一个不存在的段是笔误，不是幂等操作。
    expect((await post(`/api/v1/tasks/${encodeURIComponent(taskId)}/assessment-price`,
      { op: "revoke", effective_date: revokeDate })).status).toBe(404);
    expect((await post(`/api/v1/tasks/${encodeURIComponent(taskId)}/assessment-price`,
      { op: "revoke", effective_date: "2020-01-01" })).status).toBe(404);
    // 认不出的 op 直接拒，别当成 set 悄悄写一行价。
    expect((await post(`/api/v1/tasks/${encodeURIComponent(taskId)}/assessment-price`,
      { op: "REVOKE", price: 9, effective_date: revokeDate })).status).toBe(400);
  });

  it("answers 501 for the review endpoints too (v1.9.19)", async () => {
    expect((await call(`/api/v1/tasks/${encodeURIComponent(taskId)}/review/latest`)).status).toBe(501);
    expect((await post(`/api/v1/tasks/${encodeURIComponent(taskId)}/review`, {})).status).toBe(501);
  });

  it("★Q-036: dispatch stays unavailable until the UNION actually reads the table, not merely when it exists", async () => {
    const source = readFileSync(
      new URL("../../../../packages/db/src/r014/task-timeline-repository.ts", import.meta.url), "utf8");

    // 判定必须同时看「读取段接了没」和「表在不在」——只看表存在的话，
    // Codex 的 024 一落地这里就会声称派发类可用，而 UNION 里根本没读它，
    // 用户看到的是「查过了，没有派发」。假完整比缺失更难发现。
    expect(source).toContain("DISPATCH_SEGMENT_WIRED && await this.tableExists(\"dispatches\")");

    // 现在读取段还没接，所以这个开关必须是 false；接完的人要同时翻它。
    expect(source).toMatch(/const DISPATCH_SEGMENT_WIRED = false;/);
    // 反向守住：开关翻成 true 却没在 UNION 里出现 dispatches，就是自欺。
    const wired = /const DISPATCH_SEGMENT_WIRED = true;/.test(source);
    if (wired) expect(source).toContain("FROM dispatches");
  });
});
