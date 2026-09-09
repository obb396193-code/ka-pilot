import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { runMigrations } from "@ka/db";
import { registerR014Routes } from "../../src/r014/routes.js";
import { createDailyReportRoutes } from "../../src/r014/daily-report-routes.js";
import { callRoute, type Captured } from "./fake-http.js";

// Synthetic data only. Execute on the explicitly selected isolated test database (ka_be2_r014_test).
const databaseUrl = process.env.TEST_DATABASE_URL ?? "postgres://ka:ka@127.0.0.1:55432/ka_be2_r014_test";
const DATE = "2026-09-05";

/**
 * 日报原来按 workspace 全量聚合，一条账户授权都不核 —— 和 Q-020 的任务详情是**同一类漏检**
 * （我做维度模块时自己撞见的，不是 arch 派的）。个人空间的优化师会看到整个空间的消耗、
 * 别人的异常清单，还能从维度行里读出没授权账户的名字与消耗。
 */
describe("daily report honours the personal account scope (real PostgreSQL)", () => {
  const pool = new Pool({ connectionString: databaseUrl });
  let workspaceId = "";
  let identityId = "";
  let userId = "";

  const dataOf = (result: Captured): Record<string, unknown> =>
    (result.body as { data: Record<string, unknown> }).data;
  const moduleOf = (data: Record<string, unknown>, key: string): Record<string, unknown> =>
    (data.modules as Record<string, unknown>[]).find((module) => module.key === key)!;

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

  const get = async (): Promise<Captured> => callRoute(
    { workspaceId, userId, role: "optimizer", workspaceKind: "personal", scope: await liveScope() },
    "/api/v1/reports/daily", "GET", undefined, `?date=${DATE}`,
  );

  beforeAll(async () => {
    await runMigrations({ databaseUrl });
    registerR014Routes(createDailyReportRoutes(pool));
    workspaceId = (await pool.query(
      "INSERT INTO workspaces(name,kind) VALUES($1,'personal') RETURNING id", [`d7s-${randomUUID()}`],
    )).rows[0].id;
    identityId = (await pool.query(
      "INSERT INTO auth_identities(provider,provider_subject,display_name) VALUES('internal_test',$1,'synthetic') RETURNING id",
      [`d7s-${randomUUID()}`],
    )).rows[0].id;
    userId = (await pool.query(
      "INSERT INTO users(workspace_id,name,role) VALUES($1,'合成优化师','optimizer') RETURNING id", [workspaceId],
    )).rows[0].id;
    await pool.query(
      "INSERT INTO workspace_memberships(workspace_id,identity_id,user_id,role,is_active) VALUES($1,$2,$3,'optimizer',true)",
      [workspaceId, identityId, userId],
    );

    // 我的户 1000 元，别人的户 9000 元；只授权前者。
    for (const [accountId, cost, name] of [
      ["d7s-mine", 1000, "我的账户"], ["d7s-theirs", 9000, "别人的账户"],
    ] as const) {
      await pool.query("INSERT INTO accounts(workspace_id,media,account_id,account_name) VALUES($1,'KUAISHOU',$2,$3)",
        [workspaceId, accountId, name]);
      await pool.query(
        `INSERT INTO account_metrics_daily(workspace_id,media,account_id,ds,cost,cash_cost,real_conversion,
           cost_space,assessment_price_snapshot,computed_at)
         VALUES($1,'KUAISHOU',$2,$3::date,$4,$4,10,0,38,now())`,
        [workspaceId, accountId, DATE, cost]);
      await pool.query(
        `INSERT INTO work_items(workspace_id,type,severity,title,status,media,account_id)
         VALUES($1,'diagnosis','P0',$2,'open','KUAISHOU',$3)`,
        [workspaceId, `${name}的异常`, accountId]);
    }
    await pool.query(
      "INSERT INTO account_access_grants(workspace_id,identity_id,media,account_id,access_level) VALUES($1,$2,'KUAISHOU','d7s-mine','read')",
      [workspaceId, identityId]);
  });

  afterAll(async () => {
    for (const table of ["work_items", "account_metrics_daily", "account_access_grants",
      "accounts", "workspace_memberships", "users"]) {
      await pool.query(`DELETE FROM ${table} WHERE workspace_id=$1`, [workspaceId]);
    }
    await pool.query("DELETE FROM workspaces WHERE id=$1", [workspaceId]);
    await pool.query("DELETE FROM auth_identities WHERE id=$1", [identityId]);
    await pool.end();
  });

  it("sums only the granted account into the headline cards", async () => {
    const summary = moduleOf(dataOf(await get()), "executive_summary");
    // 改之前：10000（把别人的 9000 一起摊给他看）。
    expect((summary.cards as { cost: { value: number } }).cost.value).toBe(1000);
  });

  it("keeps another optimizer's anomalies out of the list", async () => {
    const summary = moduleOf(dataOf(await get()), "executive_summary");
    const anomalies = JSON.stringify(summary.anomalies);
    expect(anomalies).toContain("我的账户的异常");
    expect(anomalies).not.toContain("别人的账户的异常");
  });

  it("never names an unauthorised account in the dimension rows", async () => {
    const rows = JSON.stringify(moduleOf(dataOf(await get()), "dim_account").rows);
    expect(rows).toContain("我的账户");
    // 维度行会带账户名和消耗，漏一行就是把别人的经营数据端出去。
    expect(rows).not.toContain("别人的账户");
    expect(rows).not.toContain("d7s-theirs");
  });

  it("drops the account from the trend as soon as the grant is revoked", async () => {
    const before = moduleOf(dataOf(await get()), "overview").trend as { metrics: { cost: number | null } }[];
    expect(before[6]!.metrics.cost).toBe(1000);
    await pool.query(
      "UPDATE account_access_grants SET revoked_at=now() WHERE workspace_id=$1 AND account_id='d7s-mine'",
      [workspaceId]);
    const after = moduleOf(dataOf(await get()), "overview").trend as { metrics: { cost: number | null } }[];
    // 一个授权都没有 → 那天没有他能看的量，是 null 不是别人的 9000。
    expect(after[6]!.metrics.cost).toBeNull();
    await pool.query(
      "UPDATE account_access_grants SET revoked_at=NULL WHERE workspace_id=$1 AND account_id='d7s-mine'",
      [workspaceId]);
  });
});
