import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { runMigrations } from "@ka/db";
import { DAILY_REPORT_MODULES } from "@ka/domain";
import { createDailyReportRoutes } from "../../src/r014/daily-report-routes.js";
import { findR014Route, registerR014Routes } from "../../src/r014/routes.js";
import { callRoute, type Captured } from "./fake-http.js";

// Synthetic data only. Execute on the explicitly selected isolated test database (ka_be2_r014_test).
const databaseUrl = process.env.TEST_DATABASE_URL ?? "postgres://ka:ka@127.0.0.1:55432/ka_be2_r014_test";
const DATE = "2026-09-05";

interface AuthContext {
  workspaceId: string; userId: string; role: "optimizer"; workspaceKind: "team";
  scope: { kind: "team_workspace_readonly" };
}

describe("D7 daily report route (real PostgreSQL)", () => {
  const pool = new Pool({ connectionString: databaseUrl });
  let auth: AuthContext;
  let workspaceId = "";
  let runId = "";

  const call = (search = `?date=${DATE}`): Promise<Captured> =>
    callRoute(auth, "/api/v1/reports/daily", "GET", undefined, search);
  const dataOf = (result: Captured): Record<string, unknown> =>
    (result.body as { data: Record<string, unknown> }).data;
  const moduleOf = (data: Record<string, unknown>, key: string): Record<string, unknown> =>
    (data.modules as Record<string, unknown>[]).find((module) => module.key === key)!;

  beforeAll(async () => {
    await runMigrations({ databaseUrl });
    registerR014Routes(createDailyReportRoutes(pool));
    workspaceId = (await pool.query(
      "INSERT INTO workspaces(name,kind) VALUES($1,'team') RETURNING id", [`d7-${randomUUID()}`],
    )).rows[0].id;
    const identityId = (await pool.query(
      "INSERT INTO auth_identities(provider,provider_subject,display_name) VALUES('internal_test',$1,'synthetic') RETURNING id",
      [`d7-${randomUUID()}`],
    )).rows[0].id;
    const userId = (await pool.query(
      "INSERT INTO users(workspace_id,name,role) VALUES($1,'synthetic','optimizer') RETURNING id", [workspaceId],
    )).rows[0].id;
    await pool.query(
      "INSERT INTO workspace_memberships(workspace_id,identity_id,user_id,role,is_active) VALUES($1,$2,$3,'optimizer',true)",
      [workspaceId, identityId, userId],
    );
    // 三条账户日：两条可判定（一达标一不达标），一条缺考核价 → 不可判定。
    for (const [accountId, cashCost, realConv, price] of [
      ["d7-a1", 3800, 100, 38], ["d7-a2", 5000, 100, 38], ["d7-a3", 1000, 10, null],
    ] as const) {
      await pool.query("INSERT INTO accounts(workspace_id,media,account_id) VALUES($1,'KUAISHOU',$2)", [workspaceId, accountId]);
      await pool.query(
        `INSERT INTO account_metrics_daily(workspace_id,media,account_id,ds,cost,cash_cost,real_conversion,
           cost_space,assessment_price_snapshot,computed_at)
         VALUES($1,'KUAISHOU',$2,$3::date,$4,$5,$6,$7,$8,now())`,
        [workspaceId, accountId, DATE, cashCost * 1.2, cashCost, realConv, 100, price],
      );
    }
    await pool.query(
      `INSERT INTO work_items(workspace_id,type,severity,title,status)
       VALUES($1,'diagnosis','P1','account-2 成本超考核','open'),
              ($1,'diagnosis','P2','早处理完了','done')`,
      [workspaceId],
    );
    runId = (await pool.query(
      `INSERT INTO report_runs(workspace_id,user_id,kind,ref,status)
       VALUES($1,$2,'daily_brief',$3::jsonb,'ready') RETURNING id`,
      [workspaceId, userId, JSON.stringify({ date: DATE })],
    )).rows[0].id;
    auth = { workspaceId, userId, role: "optimizer", workspaceKind: "team", scope: { kind: "team_workspace_readonly" } };
  });

  afterAll(async () => {
    for (const table of ["outbound_messages", "report_runs", "work_items", "account_metrics_daily",
      "accounts", "workspace_memberships", "users"]) {
      await pool.query(`DELETE FROM ${table} WHERE workspace_id=$1`, [workspaceId]);
    }
    await pool.query("DELETE FROM workspaces WHERE id=$1", [workspaceId]);
    await pool.query("DELETE FROM auth_identities WHERE display_name='synthetic' AND provider_subject LIKE 'd7-%'");
    await pool.end();
  });

  it("claims the daily report path and returns the frozen thirteen modules in order", async () => {
    expect(findR014Route("/api/v1/reports/daily")).not.toBeNull();
    const data = dataOf(await call());
    expect(data.schema).toBe("daily-report/v1");
    expect((data.modules as { key: string }[]).map((module) => module.key))
      .toEqual(DAILY_REPORT_MODULES.map((module) => module.key));
  });

  it("computes the headline cards from canonical metrics", async () => {
    const cards = moduleOf(dataOf(await call()), "executive_summary").cards as Record<string, unknown>;
    expect(cards.cashCost).toEqual({ value: 9800, availability: "available" });
    expect(cards.realConversion).toEqual({ value: 210, availability: "available" });
    // 现金 CPA = 9800 / 210
    expect((cards.cashCpa as { value: number }).value).toBeCloseTo(9800 / 210, 6);
  });

  it("uses determinable account-days as the on-target denominator, not every row", async () => {
    const cards = moduleOf(dataOf(await call()), "executive_summary").cards as Record<string, unknown>;
    // 三条里只有两条可判定（第三条没有考核价），其中一条达标 → 1/2 而不是 1/3。
    expect(cards.onTargetRate).toEqual({ value: 0.5, state: "finite" });
  });

  it("reports an undeterminable on-target rate rather than zero when nothing can be judged", async () => {
    const cards = moduleOf(dataOf(await call("?date=2026-01-01")), "executive_summary").cards as Record<string, unknown>;
    expect(cards.onTargetRate).toEqual({ value: null, state: "undefined" });
    expect(cards.cashCost).toEqual({ value: null, availability: "missing" });
  });

  it("lists anomalies straight from open work items without composing new wording", async () => {
    const summary = moduleOf(dataOf(await call()), "executive_summary");
    expect(summary.anomalies).toEqual(["account-2 成本超考核（P1）"]);
    // 已办的那条不该出现。
    expect(JSON.stringify(summary.anomalies)).not.toContain("早处理完了");
  });

  it("grades health by the highest open severity instead of defaulting to healthy", async () => {
    expect(moduleOf(dataOf(await call()), "health").status).toBe("p1_pending");
    await pool.query(
      `INSERT INTO work_items(workspace_id,type,severity,title,status)
       VALUES($1,'diagnosis','P0','更严重的','open')`, [workspaceId],
    );
    expect(moduleOf(dataOf(await call()), "health").status).toBe("p0_pending");
    await pool.query("DELETE FROM work_items WHERE workspace_id=$1 AND severity='P0'", [workspaceId]);
  });

  it("marks every dimension module unsupported instead of inventing rows", async () => {
    const data = dataOf(await call());
    const dimensions = (data.modules as Record<string, unknown>[]).filter((module) => "unsupported" in module);
    expect(dimensions).toHaveLength(10);
    // fixture 把行结构冻成了空数组，行结构没定义；编一套出来等 arch 冻了就要推倒重来。
    for (const module of dimensions) {
      expect(module.unsupported, String(module.key)).toBe(true);
      expect(module.rows).toEqual([]);
    }
  });

  it("says not_sent until a real outbound message points at the run", async () => {
    expect(dataOf(await call()).delivery).toEqual({ status: "not_sent", at: null, target: null });
    await pool.query(
      `INSERT INTO outbound_messages(workspace_id,channel,target,kind,payload,status,sent_at)
       VALUES($1,'dingtalk','KA 快手投放群','daily_brief',$2::jsonb,'sent',now())`,
      [workspaceId, JSON.stringify({ reportRunId: runId })],
    );
    const delivery = dataOf(await call()).delivery as Record<string, unknown>;
    expect(delivery).toMatchObject({ status: "sent", target: "KA 快手投放群" });
    expect(delivery.at).not.toBeNull();
  });

  it("never claims an action is available while it is not wired", async () => {
    // 「已生成」不等于「可推送」；PDF 与钉钉推送本批没接，一律 false。
    expect(dataOf(await call()).actions).toEqual({ pushDingtalk: false, exportPdf: false });
  });

  it("rejects a malformed date", async () => {
    expect((await call("?date=2026-9-5")).status).toBe(400);
  });
});
