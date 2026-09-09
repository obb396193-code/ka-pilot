import { readFileSync } from "node:fs";
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
  let identityId = "";
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
    identityId = (await pool.query(
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
      // v1.9.11：工作项必须归得到某处——挂账户（账户型）、挂任务（任务型）或有 assignee（私人）。
      // 三者皆空的行不归任何人，按矩阵谁都看不到，那种数据本来就不该存在。
      `INSERT INTO work_items(workspace_id,type,severity,title,status,media,account_id)
       VALUES($1,'diagnosis','P1','account-2 成本超考核','open','KUAISHOU','d7-a1'),
              ($1,'diagnosis','P2','早处理完了','done','KUAISHOU','d7-a1')`,
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
    // 只删本套件建的那一个：按 display_name/前缀批删会连带别的用例还在用的行（外键当场报错）。
    await pool.query("DELETE FROM auth_identities WHERE id=$1", [identityId]);
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
      `INSERT INTO work_items(workspace_id,type,severity,title,status,media,account_id)
       VALUES($1,'diagnosis','P0','更严重的','open','KUAISHOU','d7-a1')`, [workspaceId],
    );
    expect(moduleOf(dataOf(await call()), "health").status).toBe("p0_pending");
    await pool.query("DELETE FROM work_items WHERE workspace_id=$1 AND severity='P0'", [workspaceId]);
  });

  it("separates the three sourced dimensions from the seven that have no source", async () => {
    const data = dataOf(await call());
    const dimensions = (data.modules as Record<string, unknown>[]).filter((module) => "unsupported" in module);
    expect(dimensions).toHaveLength(10);
    const sourced = dimensions.filter((module) => module.unsupported === false).map((module) => module.key);
    // v1.9.2：前三个从 canonical 日表聚；后三个按 account_name_parses 的解析维度归并。
    // 剩下四个（含 dim_ubp——它对不上命名规范任何一段）源没接。
    expect(sourced.sort()).toEqual([
      "dim_account", "dim_agent", "dim_biz", "dim_bid_tool", "dim_resource_position", "dim_task",
    ].sort());
    for (const module of dimensions) {
      if (module.unsupported === false) continue;
      // 「源没接」和「查过了没有数据」在页面上必须分得开。
      expect(module.unsupported, String(module.key)).toBe(true);
      expect(module.rows).toEqual([]);
    }
  });

  it("aggregates the sourced dimension rows from the same canonical day as the cards", async () => {
    const modules = dataOf(await call()).modules as Record<string, unknown>[];
    const account = modules.find((module) => module.key === "dim_account")!;
    const rows = account.rows as { key: string; label: string; media: string; accountId: string;
      metrics: Record<string, { value: number | null }> }[];
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0]!.key).toBe(`${rows[0]!.media}:${rows[0]!.accountId}`);
    // metrics 是 canonical 形状：裸数字分不出「0」和「没有数据」。
    expect(rows[0]!.metrics.cost!.value).not.toBeUndefined();

    // 维度行加总必须等于大盘卡——不同源就说明两处口径已经分叉。
    const summary = modules.find((module) => module.key === "executive_summary")!;
    const cardCost = (summary.cards as { cost: { value: number | null } }).cost.value;
    const rowSum = rows.reduce((total, row) => total + (row.metrics.cost!.value ?? 0), 0);
    expect(rowSum).toBeCloseTo(cardCost ?? 0, 6);
  });

  it("returns seven trend points and leaves a day with no data null instead of skipping it", async () => {
    const modules = dataOf(await call()).modules as Record<string, unknown>[];
    const overview = modules.find((module) => module.key === "overview")!;
    const trend = overview.trend as { ds: string; metrics: { cost: number | null } }[];
    expect(trend).toHaveLength(7);
    expect(trend[6]!.ds).toBe(DATE);
    // 缺数日出 null 不跳日：跳日会把两个不相邻的日子连成一段，看着像"那天有量"。
    expect(trend.some((point) => point.metrics.cost === null)).toBe(true);
    for (let index = 1; index < trend.length; index += 1) {
      expect(trend[index]!.ds > trend[index - 1]!.ds).toBe(true);
    }
  });

  it("echoes the requested role rather than the identity role, and rejects an unknown one", async () => {
    // F-Q019-1：role 是请求参数，不是身份角色。
    expect(dataOf(await call()).role).toBe("optimizer");
    expect(dataOf(await call(`?date=${DATE}&role=exec`)).role).toBe("exec");
    expect((await call(`?date=${DATE}&role=ceo`)).status).toBe(400);
  });

  it("titles the summary in Chinese (v1.9.1 文案规则)", async () => {
    const modules = dataOf(await call()).modules as Record<string, unknown>[];
    expect(modules.find((module) => module.key === "executive_summary")!.title).toBe("管理摘要");
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

  it("groups the parse-driven dimensions and puts unparsed accounts under 未标注", async () => {
    const modules = dataOf(await call()).modules as Record<string, unknown>[];
    const agent = modules.find((module) => module.key === "dim_agent")!;
    const rows = agent.rows as {
      key: string; label: string; agent_type: string; metrics: Record<string, { value: number | null }>;
    }[];
    expect(rows.length).toBeGreaterThan(0);
    // F-Q026-1：key 是冻结枚举 self|agency|unknown，**不是原文**；label 才是中文，
    // 认不出的显「未标注」。这批账户没有解析行 → unknown。
    expect(rows.map((row) => row.key)).toEqual(["unknown"]);
    expect(rows[0]!.label).toBe("未标注");
    expect(rows[0]!.agent_type).toBe("unknown");

    // 归并只是把账户行合并，不重算指标：加总必须仍等于大盘卡。
    const summary = modules.find((module) => module.key === "executive_summary")!;
    const cardCost = (summary.cards as { cost: { value: number | null } }).cost.value;
    expect(rows.reduce((total, row) => total + (row.metrics.cost!.value ?? 0), 0)).toBeCloseTo(cardCost ?? 0, 6);
  });

  it("leaves dim_ubp unsupported rather than guessing which segment UBP means", async () => {
    const modules = dataOf(await call()).modules as Record<string, unknown>[];
    const ubp = modules.find((module) => module.key === "dim_ubp")!;
    // 十个解析维度里没有叫 UBP 的；猜一个映射上去就是给日报贴错标签。
    expect(ubp.unsupported).toBe(true);
    expect(ubp.rows).toEqual([]);
  });

  it("attributes business by the bound task, then the nickname, then 未标注业务", async () => {
    // 这个套件原来没建任务绑定，所以先补一条：账户 → 任务 → 业务 是 v1.4 的归属链。
    const taskId = `d7-biz-${randomUUID()}`;
    await pool.query(
      "INSERT INTO tasks(workspace_id,task_id,task_name,status) VALUES($1,$2,'带业务的任务','active')",
      [workspaceId, taskId]);
    await pool.query(
      `INSERT INTO task_accounts(workspace_id,task_id,media,account_id,valid_from)
       VALUES($1,$2,'KUAISHOU','d7-a1',$3::date)`,
      [workspaceId, taskId, DATE]);

    const before = (dataOf(await call()).modules as Record<string, unknown>[])
      .find((module) => module.key === "dim_biz")!;
    // 灌数任务没填 biz_name、账户也没有解析行 → 全部「未标注业务」，但不丢行。
    expect((before.rows as { key: string }[]).map((row) => row.key)).toEqual(["未标注业务"]);

    // 给绑定任务填上业务名 → 归属链第一跳就该接管。
    await pool.query("UPDATE tasks SET biz_name='CVR有端' WHERE workspace_id=$1 AND task_id=$2", [workspaceId, taskId]);
    const after = (dataOf(await call()).modules as Record<string, unknown>[])
      .find((module) => module.key === "dim_biz")!;
    const rows = after.rows as { key: string; metrics: Record<string, { value: number | null }> }[];
    expect(rows.map((row) => row.key)).toContain("CVR有端");

    // 归并加总仍等于大盘卡：归属换了口径，钱不能变多也不能变少。
    const summary = (dataOf(await call()).modules as Record<string, unknown>[])
      .find((module) => module.key === "executive_summary")!;
    const cardCost = (summary.cards as { cost: { value: number | null } }).cost.value;
    expect(rows.reduce((total, row) => total + (row.metrics.cost!.value ?? 0), 0)).toBeCloseTo(cardCost ?? 0, 6);

    await pool.query("DELETE FROM task_accounts WHERE workspace_id=$1 AND task_id=$2", [workspaceId, taskId]);
    await pool.query("DELETE FROM tasks WHERE workspace_id=$1 AND task_id=$2", [workspaceId, taskId]);
  });

  it("returns exactly the frozen fixture's module list and per-module key sets", async () => {
    const frozen = JSON.parse(readFileSync(
      new URL("../../../../packages/contract/fixtures/reports/daily-v1.json", import.meta.url), "utf8",
    )) as { data: { modules: Record<string, unknown>[] } & Record<string, unknown> };
    const live = dataOf(await call());

    expect(Object.keys(live).sort()).toEqual(Object.keys(frozen.data).sort());

    const liveModules = live.modules as Record<string, unknown>[];
    expect(liveModules.map((module) => module.key)).toEqual(frozen.data.modules.map((module) => module.key));

    for (const frozenModule of frozen.data.modules) {
      const liveModule = liveModules.find((module) => module.key === frozenModule.key)!;
      // 键只允许多出 `unsupported`（「源没接」的标记，fixture 只在部分模块上冻了它）。
      const extra = Object.keys(liveModule).filter((key) => !(key in frozenModule));
      expect(extra, String(frozenModule.key)).toEqual(extra.filter((key) => key === "unsupported"));
      for (const key of Object.keys(frozenModule)) {
        expect(Object.keys(liveModule), `${String(frozenModule.key)} 缺 ${key}`).toContain(key);
      }
    }

    // fixture 声明了 unsupported 的模块，取值必须和我一致。
    // （v1.9.13 起 arch 已把 dim_bid_tool / dim_resource_position 同步成填行，
    //  我上一轮钉的「已知分歧」到此作废，改成直接严格比对。）
    for (const frozenModule of frozen.data.modules) {
      if (frozenModule.unsupported === undefined) continue;
      expect(liveModules.find((module) => module.key === frozenModule.key)!.unsupported,
        String(frozenModule.key)).toBe(frozenModule.unsupported);
    }
  });

  it("carries the v3 row shape: every dimension row has assessment and anomaly", async () => {
    const modules = dataOf(await call()).modules as Record<string, unknown>[];
    for (const key of ["dim_account", "dim_biz", "dim_agent", "dim_resource_position", "dim_bid_tool"]) {
      for (const row of (modules.find((module) => module.key === key)!.rows as Record<string, unknown>[])) {
        const assessment = row.assessment as Record<string, unknown>;
        expect(assessment, `${key} 行缺 assessment`).toBeDefined();
        expect(typeof row.anomaly).toBe("boolean");
        // 达标判定与六卡同源：现金消耗 ≤ 考核价 × 真实转化。
        const metrics = row.metrics as Record<string, { value: number | null }>;
        const price = (assessment.price as { value: number } | null)?.value ?? null;
        if (price !== null && metrics.cashCost!.value !== null && metrics.realConversion!.value !== null) {
          expect(assessment.onTarget).toBe(metrics.cashCost!.value <= price * metrics.realConversion!.value);
        } else {
          // 缺任一项时是「不知道」，不是「不达标」。
          expect(assessment.onTarget).toBeNull();
          expect(row.anomaly).toBe(false);
        }
      }
    }
  });
});
