// Compare real SQLite pushdown with the existing strict member-grid calculator.
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createDataQueryRegistry } from "../src/data/query-registry.js";
import { decodeKaWindowMembers } from "../src/data/ka-window-members.js";
import { summarizeKaWindowMembers, trendKaWindowMembers } from "../src/data/ka-window-summary.js";
import { assembleKaWindowAggregates } from "../src/data/ka-window-aggregate.js";

describe("strict bounded window aggregate assembly", () => {
  let db: DatabaseSync;
  const workspaceId = "00000000-0000-4000-8000-000000000081";
  const registry = createDataQueryRegistry();
  const window = { from: "2026-08-02", to: "2026-08-03", preset: "custom" as const };
  beforeEach(() => {
    db = new DatabaseSync(":memory:");
    db.exec(`CREATE TABLE dwd_account_daily(ds INTEGER,media TEXT,account_id TEXT,cost_yuan REAL,
      cash_yuan REAL,show REAL,click REAL,conv REAL,cash_assessment REAL);
      INSERT INTO dwd_account_daily VALUES
      (20260801,'KUAISHOU','same',12,8,100,10,1,10),
      (20260802,'KUAISHOU','same',20,12,100,10,1,10),
      (20260803,'KUAISHOU','same',10,2,100,10,1,10),
      (20260801,'TENCENT','same',1,1,10,1,1,10),
      (20260802,'TENCENT','same',2,2,10,1,1,10),
      (20260803,'TENCENT','same',3,3,10,1,1,10)`);
  });
  afterEach(() => db.close());
  function setup(compare?: "dod" | "wow", today = false) {
    const resolved = registry.resolve("account.summary", { date_from: window.from, date_to: window.to }, "ka_data");
    const actual = { ...window, ...(today ? { preset: "today" as const } : {}) };
    const plan = registry.buildTeamKaWindowAggregatePlan(resolved, actual, compare);
    const memberPlan = registry.buildTeamKaWindowPlan(resolved, actual, compare);
    const members = decodeKaWindowMembers(db.prepare(memberPlan.sql).all(), memberPlan, resolved, workspaceId);
    return { plan, raw: db.prepare(plan.sql).all(), members, compare };
  }
  it.each(["normal", "day-over", "multiple-prices", "missing-price", "missing-cash", "missing-conversion", "missing-day", "zero", "empty"])(
    "%s matches every existing v3 summary and flat trend field", (kind) => {
      if (kind === "multiple-prices") db.exec("UPDATE dwd_account_daily SET cash_assessment=20 WHERE ds=20260803");
      if (kind === "day-over") db.exec("UPDATE dwd_account_daily SET cash_assessment=0 WHERE media='TENCENT'");
      if (kind === "missing-price") db.exec("UPDATE dwd_account_daily SET cash_assessment=NULL WHERE ds=20260803");
      if (kind === "missing-cash") db.exec("UPDATE dwd_account_daily SET cash_yuan=NULL WHERE ds=20260803");
      if (kind === "missing-conversion") db.exec("UPDATE dwd_account_daily SET conv=NULL WHERE ds=20260803");
      if (kind === "missing-day") db.exec("DELETE FROM dwd_account_daily WHERE ds=20260803 AND media='TENCENT'");
      if (kind === "zero") db.exec("UPDATE dwd_account_daily SET conv=0,cash_yuan=0,cost_yuan=0");
      if (kind === "empty") db.exec("DELETE FROM dwd_account_daily");
      const { plan, raw, members } = setup("dod");
      const result = assembleKaWindowAggregates(raw, plan, "dod");
      const reference = summarizeKaWindowMembers(members, plan.window, plan.previousWindow, "dod");
      expect(result.row).toEqual(reference.row);
      expect(result.warnings).toEqual(reference.warnings);
      expect(result.trend).toEqual(trendKaWindowMembers(members.filter((row) => row.ds >= window.from)));
    },
  );
  /**
   * v1.9.46（Q-041 ⑧）：团队源也走**部分合计**。
   *
   * 这条用例的价值在于它**同时跑真 SQL 与成员路径并逐字段对拍**——个人源那次 P0
   * （2026-09-12）正是两边口径分叉：一边按成员日给 Σ 有数的部分，一边按天塌陷，
   * 中间的一致性核对把整条响应判废。团队源有两条独立算 assessment 的路，
   * 同样的错法在这里也成立，所以 partial 必须两边一起改、并且由这条对拍钉住。
   */
  describe("v1.9.46 partial totals on the team source", () => {
    it("gives the present portion and suspends the judgement, on both paths alike", () => {
      // 只让 TENCENT 的 08-03 缺现金：同一天里另一个账户有数 —— 正是「按天塌陷」与
      // 「按成员日部分合计」会分叉的那个形态。
      db.exec("UPDATE dwd_account_daily SET cash_yuan=NULL WHERE ds=20260803 AND media='TENCENT'");
      const { plan, raw, members } = setup();
      const result = assembleKaWindowAggregates(raw, plan);
      const reference = summarizeKaWindowMembers(members, plan.window, plan.previousWindow);
      // 两条路必须逐字段一致——不一致就是那次 P0 的形状。
      expect(result.row).toEqual(reference.row);
      // 现金给的是有数那部分的和（12+2+2 = 16），并标 partial，不是 null 也不是 0。
      expect(result.row.metrics.cashCost).toEqual({ value: 16, availability: "partial" });
      // 判定挂起：拿缺了一个成员日的花费跟整窗目标比，结论必错且看不出来。
      expect(result.row.assessment.onTarget).toBeNull();
      expect(result.row.assessment.costStatus).toBeNull();
      expect(result.row.assessment.costStatusReason).toBe("partial_data");
    });

    it("leaves a fully covered window untouched", () => {
      const { plan, raw, members } = setup();
      const result = assembleKaWindowAggregates(raw, plan);
      expect(result.row).toEqual(summarizeKaWindowMembers(members, plan.window, plan.previousWindow).row);
      expect(result.row.metrics.cashCost.availability).toBe("available");
      expect(result.row.assessment.costStatusReason).not.toBe("partial_data");
    });

    it("keeps a column with nothing at all as missing, not partial", () => {
      // partial 的前提是「有一部分」；一列一个数都没有时仍旧是缺失。
      db.exec("UPDATE dwd_account_daily SET cash_yuan=NULL");
      const { plan, raw, members } = setup();
      const result = assembleKaWindowAggregates(raw, plan);
      expect(result.row).toEqual(summarizeKaWindowMembers(members, plan.window, plan.previousWindow).row);
      expect(result.row.metrics.cashCost).toEqual({ value: null, availability: "missing" });
    });
  });

  it("today comparisons remain undefined with no previous-period request", () => {
    const { plan, raw } = setup("dod", true);
    const result = assembleKaWindowAggregates(raw, plan, "dod");
    // v1.9.43 起六项（realCpa 与 cashCpa 并列）；键名一并钉住，漏发一个不会只是少个数字。
    expect(Object.keys(result.row.compare!.deltas).sort())
      .toEqual(["cashCost", "cashCpa", "cost", "onTargetRate", "realConversion", "realCpa"]);
    expect(Object.values(result.row.compare!.deltas)).toEqual(Array(6).fill({ value: null, state: "undefined" }));
  });
  it.each(["missing-day", "duplicate-window", "wrong-period", "wrong-date", "wrong-member-count", "too-many-accounts", "bad-price", "bad-number", "bad-target", "wrong-on-target-count", "wrong-day-over", "wrong-sum"])(
    "rejects corrupt aggregate proof %s", (kind) => {
      const { plan, raw } = setup();
      const row = raw.find((item) => item.kind === "window")!;
      if (kind === "missing-day") raw.pop();
      if (kind === "duplicate-window") raw.push({ ...row });
      if (kind === "wrong-period") row.period = "previous";
      if (kind === "wrong-date") row.date_from = "2026-08-01";
      if (kind === "wrong-member-count") row.member_count = 3;
      if (kind === "too-many-accounts") row.account_count = 999;
      if (kind === "bad-price") row.unique_price = "wrong";
      if (kind === "bad-number") row.cash_yuan = "NaN";
      if (kind === "bad-target") row.target = null;
      if (kind === "wrong-on-target-count") row.on_target_count = 99;
      if (kind === "wrong-day-over") row.day_over_count = 99;
      if (kind === "wrong-sum") row.cost_yuan = 999;
      expect(() => assembleKaWindowAggregates(raw, plan)).toThrow();
    },
  );
  it("rejects actual duplicate members and invalid values before missing propagation", () => {
    const resolved = registry.resolve("account.summary", { date_from: window.from, date_to: window.to }, "ka_data");
    const plan = registry.buildTeamKaWindowAggregatePlan(resolved, window);
    db.exec("INSERT INTO dwd_account_daily SELECT * FROM dwd_account_daily WHERE ds=20260802");
    expect(() => assembleKaWindowAggregates(db.prepare(plan.sql).all(), plan)).toThrow();
    db.exec("DELETE FROM dwd_account_daily WHERE rowid>6; UPDATE dwd_account_daily SET conv='bad' WHERE ds=20260802; UPDATE dwd_account_daily SET cash_assessment=NULL WHERE ds=20260803");
    expect(() => assembleKaWindowAggregates(db.prepare(plan.sql).all(), plan)).toThrow();
  });
  it("rejects SQLite SUM overflow-to-null instead of mislabelling missing cash", () => {
    db.exec("DELETE FROM dwd_account_daily");
    const insert = db.prepare("INSERT INTO dwd_account_daily VALUES(20260802,'KUAISHOU',?,12,?,100,10,1,10)");
    [1e308, 1e308, -1e308, -1e308].forEach((cash, i) => insert.run(`a-${i}`, cash));
    const resolved = registry.resolve("account.summary", { date: "2026-08-02" }, "ka_data");
    const plan = registry.buildTeamKaWindowAggregatePlan(resolved, { from: "2026-08-02", to: "2026-08-02" });
    const raw = db.prepare(plan.sql).all();
    expect(raw[0]?.cash_yuan).toBe("INVALID_METRIC");
    expect(() => assembleKaWindowAggregates(raw, plan)).toThrow();
  });
  it.each([20260802.5, 20260231])("does not lose a malformed source date %s through the expected-day join", (ds) => {
    db.exec("DELETE FROM dwd_account_daily");
    db.prepare("INSERT INTO dwd_account_daily VALUES(?,'KUAISHOU','a',12,8,100,10,1,10)").run(ds);
    const interval = ds === 20260231 ? { from: "2026-02-01", to: "2026-03-01" } : window;
    const resolved = registry.resolve("account.summary", { date_from: interval.from, date_to: interval.to }, "ka_data");
    const plan = registry.buildTeamKaWindowAggregatePlan(resolved, interval);
    const raw = db.prepare(plan.sql).all();
    expect(raw[0]!.invalid_count).toBeGreaterThan(0);
    expect(() => assembleKaWindowAggregates(raw, plan)).toThrow();
  });
});
