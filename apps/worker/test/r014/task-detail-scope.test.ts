import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { runMigrations } from "@ka/db";
import { shanghaiTaskBusinessDate } from "@ka/domain";
import { registerR014Routes } from "../../src/r014/routes.js";
import { createTaskDetailRoutes } from "../../src/r014/task-detail-routes.js";
import { callRoute, type Captured } from "./fake-http.js";

// Synthetic data only. Execute on the explicitly selected isolated test database (ka_be2_r014_test).
const databaseUrl = process.env.TEST_DATABASE_URL ?? "postgres://ka:ka@127.0.0.1:55432/ka_be2_r014_test";

/**
 * Q-020（arch 派修，Codex P-168 发现）：任务详情漏了账户授权过滤。
 * 只授快手的会话能读到纯腾讯任务的任务名；混合媒体任务把没授权那部分的达成量、
 * 异常数、工作项一起算给了他。口径必须与任务列表一致——列表里看不见的任务，详情也不能有。
 */
describe("Q-020 task detail honours the personal account scope (real PostgreSQL)", () => {
  const pool = new Pool({ connectionString: databaseUrl });
  let workspaceId = "";
  let identityId = "";
  let userId = "";
  let mixedTask = "";
  let tencentTask = "";

  const dataOf = (result: Captured): Record<string, unknown> =>
    (result.body as { data: Record<string, unknown> }).data;

  /**
   * 会话 scope 按 live 授权重算——和 `auth-repository.ts` 解析会话时一个口径
   * （`revoked_at` 非空的是审计行，不是授权）。所以撤权后下一次请求 scope 里就没有它了。
   */
  async function liveScope(): Promise<{ kind: "explicit_accounts"; accounts: unknown[] }> {
    const rows = (await pool.query(
      `SELECT media, account_id FROM account_access_grants
       WHERE workspace_id=$1 AND identity_id=$2 AND revoked_at IS NULL ORDER BY media, account_id`,
      [workspaceId, identityId],
    )).rows as { media: string; account_id: string }[];
    return {
      kind: "explicit_accounts",
      accounts: rows.map((row) => ({ media: row.media, accountId: row.account_id, accessLevel: "read" })),
    };
  }

  const get = async (taskId: string): Promise<Captured> => callRoute(
    { workspaceId, userId, role: "optimizer", workspaceKind: "personal", scope: await liveScope() },
    `/api/v1/tasks/${encodeURIComponent(taskId)}`, "GET", undefined, "?date=2026-09-05",
  );

  beforeAll(async () => {
    await runMigrations({ databaseUrl });
    registerR014Routes(createTaskDetailRoutes(pool));
    workspaceId = (await pool.query(
      "INSERT INTO workspaces(name,kind) VALUES($1,'personal') RETURNING id", [`q020-${randomUUID()}`],
    )).rows[0].id;
    identityId = (await pool.query(
      "INSERT INTO auth_identities(provider,provider_subject,display_name) VALUES('internal_test',$1,'synthetic') RETURNING id",
      [`q020-${randomUUID()}`],
    )).rows[0].id;
    userId = (await pool.query(
      "INSERT INTO users(workspace_id,name,role) VALUES($1,'合成优化师','optimizer') RETURNING id", [workspaceId],
    )).rows[0].id;
    await pool.query(
      "INSERT INTO workspace_memberships(workspace_id,identity_id,user_id,role,is_active) VALUES($1,$2,$3,'optimizer',true)",
      [workspaceId, identityId, userId],
    );

    mixedTask = `q020-mixed-${randomUUID()}`;
    tencentTask = `q020-tencent-${randomUUID()}`;
    await pool.query(
      `INSERT INTO tasks(workspace_id,task_id,task_name,status,stage,stage_source)
       VALUES($1,$2,'混合媒体任务','active','delivering','system'),
              ($1,$3,'纯腾讯任务','active','delivering','system')`,
      [workspaceId, mixedTask, tencentTask],
    );

    // 授权的快手户 / 未授权的腾讯户；混合任务两边都挂，腾讯任务只挂腾讯户。
    for (const [media, accountId] of [["KUAISHOU", "q020-ks"], ["TENCENT", "q020-tx"]] as const) {
      await pool.query("INSERT INTO accounts(workspace_id,media,account_id) VALUES($1,$2,$3)",
        [workspaceId, media, accountId]);
      await pool.query(
        "INSERT INTO account_balance(workspace_id,media,account_id,balance,synced_at) VALUES($1,$2,$3,10000,now())",
        [workspaceId, media, accountId]);
      await pool.query(
        `INSERT INTO ad_entities(entity_id,workspace_id,media,account_id,entity_type,status)
         VALUES($1,$2,$3,$4,'unit','ACTIVE')`, [`q020-unit-${accountId}`, workspaceId, media, accountId]);
      await pool.query(
        "INSERT INTO task_accounts(workspace_id,task_id,media,account_id,valid_from) VALUES($1,$2,$3,$4,'2026-09-01')",
        [workspaceId, mixedTask, media, accountId]);
      await pool.query(
        `INSERT INTO account_metrics_daily(workspace_id,media,account_id,ds,real_conversion,cost)
         VALUES($1,$2,$3,'2026-09-03',4,100)`, [workspaceId, media, accountId]);
      await pool.query(
        `INSERT INTO work_items(workspace_id,type,severity,title,status,task_id,media,account_id)
         VALUES($1,'diagnosis','P0',$5,'open',$2,$3,$4)`,
        [workspaceId, mixedTask, media, accountId, `${media} 的异常`]);
    }
    // task_accounts 有排他约束：同一账户同一时段只能挂一个任务，所以纯腾讯任务另起一个户。
    await pool.query("INSERT INTO accounts(workspace_id,media,account_id) VALUES($1,'TENCENT','q020-tx2')", [workspaceId]);
    await pool.query(
      "INSERT INTO task_accounts(workspace_id,task_id,media,account_id,valid_from) VALUES($1,$2,'TENCENT','q020-tx2','2026-09-01')",
      [workspaceId, tencentTask]);
    await pool.query(
      "INSERT INTO account_access_grants(workspace_id,identity_id,media,account_id,access_level) VALUES($1,$2,'KUAISHOU','q020-ks','read')",
      [workspaceId, identityId]);

    // 窗口源是「应观测 vs 实观测」口径：窗口里缺一天，整段就算 missing（不做部分求和）。
    // 所以把本月到业务日的每一天都补上零行，只留 09-03 那条真数据。
    const businessDate = shanghaiTaskBusinessDate(new Date());
    const monthStart = `${businessDate.slice(0, 7)}-01`;
    for (const [media, accountId] of [["KUAISHOU", "q020-ks"], ["TENCENT", "q020-tx"]] as const) {
      await pool.query(
        `INSERT INTO account_metrics_daily(workspace_id,media,account_id,ds,cost,cash_cost,real_conversion,
           cost_space,assessment_price_snapshot,computed_at)
         SELECT $1,$2,$3,day.ds,0,0,0,0,38,now()
         FROM generate_series($4::date, $5::date, INTERVAL '1 day') AS day(ds)
         ON CONFLICT DO NOTHING`,
        [workspaceId, media, accountId, monthStart, businessDate]);
    }
  });

  afterAll(async () => {
    for (const table of ["work_items", "account_metrics_daily", "ad_entities", "task_accounts",
      "account_balance", "account_access_grants", "accounts", "tasks", "workspace_memberships", "users"]) {
      await pool.query(`DELETE FROM ${table} WHERE workspace_id=$1`, [workspaceId]);
    }
    await pool.query("DELETE FROM workspaces WHERE id=$1", [workspaceId]);
    await pool.query("DELETE FROM auth_identities WHERE id=$1", [identityId]);
    await pool.end();
  });

  it("404s a task whose accounts the session was never granted", async () => {
    // 改之前：200 且带回任务名「纯腾讯任务」。
    const result = await get(tencentTask);
    expect(result.status).toBe(404);
    expect(JSON.stringify(result.body)).not.toContain("纯腾讯任务");
  });

  it("counts only the granted half of a mixed-media task", async () => {
    const result = await get(mixedTask);
    expect(result.status).toBe(200);
    const overview = dataOf(result).overview as Record<string, unknown>;

    // 两个户各 4 转化，只授权了快手那个 → 4，不是 8。
    expect(overview.achieved).toEqual({ value: 4, availability: "available" });
    // 两条 open P0，只有快手那条属于他。
    expect(overview.anomalySummary).toEqual({ p0: 1, p1: 0, opportunity: 0 });

    const blockers = JSON.stringify(overview.blockers);
    expect(blockers).toContain("KUAISHOU 的异常");
    expect(blockers).not.toContain("TENCENT 的异常");

    // 就绪度分母也只数授权账户：两个户都建好了，但他只该看到 1/1 而不是 2/2。
    // 就绪度分母也只数授权账户：两个户都建好了，他只该看到自己那 1 个户的 1/1。
    const readiness = overview.readiness as Record<string, { ratio: { value: number | null } }>;
    expect(readiness.accounts!.ratio.value).toBe(1);
    expect(readiness.infra!.ratio.value).toBe(1);
  });

  it("404s the same task once the only grant is revoked", async () => {
    expect((await get(mixedTask)).status).toBe(200);
    await pool.query(
      "UPDATE account_access_grants SET revoked_at=now() WHERE workspace_id=$1 AND account_id='q020-ks'",
      [workspaceId]);
    // 软撤权后 scope 里就没有这个 tuple 了，详情立刻 404——不留「旧 Cookie 还能读」的窗口。
    expect((await get(mixedTask)).status).toBe(404);
    await pool.query(
      "UPDATE account_access_grants SET revoked_at=NULL WHERE workspace_id=$1 AND account_id='q020-ks'",
      [workspaceId]);
    expect((await get(mixedTask)).status).toBe(200);
  });

  it("fills the window cost block from the real window source, inventing no projections", async () => {
    const overview = dataOf(await get(mixedTask)).overview as Record<string, unknown>;
    const cost = overview.cost as Record<string, unknown> | null;
    expect(cost, "D5b-2：窗口口径块该有值了，不再恒 null").not.toBeNull();

    // 窗口是本月至业务日（fixture overview-v151 就是 month_to_date）。
    expect((cost!.window as { preset: string }).preset).toBe("month_to_date");
    // 只算授权那一半：两个户各 100 元，只授权快手那个。
    expect((cost!.cost as { value: number }).value).toBe(100);

    // 预估两项窗口源不提供，照 undefined 出——不自己算一个像模像样的数。
    expect(cost!.projectedWindowCashCpa).toEqual({ value: null, state: "undefined" });
    expect(cost!.affordableDailyCashCpa).toEqual({ value: null, state: "undefined" });

    // 达标判定来自源的 assessment，不是本地重算。
    expect(["green", "yellow", "red", null]).toContain(overview.costStatus);
    expect(typeof overview.costStatusReason).toBe("string");

    // 预算三项仍等 014，保持 null，不拿任务级 budget 凑。
    expect(overview.budgetUsageRate).toBeNull();
    expect(overview.dailyBudgetCap).toBeNull();
  });
});
