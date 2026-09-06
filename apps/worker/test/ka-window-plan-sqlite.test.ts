// Synthetic source only: execute registered SQL against SQLite, never internal production data.
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { computeKaDailyWindowAssessment, metricValue } from "@ka/domain";
import { createDataQueryRegistry } from "../src/data/query-registry.js";

describe("team window one-query member snapshot", () => {
  let db: DatabaseSync;
  const registry = createDataQueryRegistry({ today: () => "2026-09-08" });
  const current = { from: "2026-09-01", to: "2026-09-02" };
  beforeEach(() => { db = new DatabaseSync(":memory:"); db.exec(`CREATE TABLE dwd_account_daily(
    ds INTEGER,media TEXT,account_id TEXT,cost_yuan REAL,cash_yuan REAL,show REAL,click REAL,conv REAL,cash_assessment REAL
  )`); });
  afterEach(() => db.close());
  function insert(ds: number, cash: number | null, price: number | null, conv = 1, media = "KUAISHOU", id = "same") {
    db.prepare("INSERT INTO dwd_account_daily VALUES(?,?,?,100,?,1000,10,?,?)").run(ds, media, id, cash, conv, price);
  }
  function plan(window = current, compare?: "dod" | "wow") {
    const resolved = registry.resolve("account.summary", { date_from: window.from, date_to: window.to, media: "KUAISHOU", accountIds: ["same"] }, "ka_data");
    return registry.buildTeamKaWindowPlan(resolved, window, compare);
  }
  it("preserves each daily price and applies weighted assessment to actual SQL rows", () => {
    insert(20260901, 10, 20, 1); insert(20260902, 150, 10, 9); insert(20260901, 999, 999, 99, "TENCENT");
    const built = plan(), rows = db.prepare(built.sql).all();
    expect(built.limit).toBe(10000); expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.media)).toEqual(["KUAISHOU", "KUAISHOU"]);
    const result = computeKaDailyWindowAssessment(rows.map((row) => ({ ds: row.ds, cashCost: metricValue(row.cash_yuan), realConversion: metricValue(row.conv), price: row.cash_assessment })));
    expect(result).toMatchObject({ costSpace: { value: -50 }, assessment: { priceSource: "ka_daily", price: null, priceVersions: 2, onTarget: false } });
  });
  it("keeps a missing expected account-day instead of claiming the observed remainder complete", () => {
    insert(20260901, 10, 20);
    const rows = db.prepare(plan().sql).all();
    expect(rows).toHaveLength(2); expect(rows[1]).toMatchObject({ ds: "2026-09-02", observed: 0, cash_yuan: null, cash_assessment: null });
    const result = computeKaDailyWindowAssessment(rows.map((row) => ({ ds: row.ds, cashCost: metricValue(row.cash_yuan), realConversion: metricValue(row.conv), price: row.cash_assessment })));
    expect(result.assessment.onTarget).toBeNull();
  });
  it("reads current and previous windows in a single SQL plan, excluding days/accounts in the gap", () => {
    insert(20260901, 10, 20); insert(20260908, 10, 20); insert(20260904, 900, 20, 1, "KUAISHOU", "gap-only");
    const window = { from: "2026-09-08", to: "2026-09-08" };
    const resolved = registry.resolve("account.summary", { date: "2026-09-08" }, "ka_data");
    const built = registry.buildTeamKaWindowPlan(resolved, window, "wow");
    expect(built.previousWindow).toEqual({ from: "2026-09-01", to: "2026-09-01", preset: "custom" });
    const rows = db.prepare(built.sql).all();
    expect(rows.map((row) => [row.ds, row.account_id])).toEqual([["2026-09-01", "same"], ["2026-09-08", "same"]]);
  });
  it("today preset never fetches a previous full-day comparator", () => {
    insert(20260901, 10, 20); insert(20260908, 10, 20);
    const resolved = registry.resolve("account.summary", { date: "2026-09-08" }, "ka_data");
    const built = registry.buildTeamKaWindowPlan(resolved, { from: "2026-09-08", to: "2026-09-08", preset: "today" }, "wow");
    expect(built.previousWindow).toBeNull(); expect(db.prepare(built.sql).all()).toHaveLength(1);
  });
  it("does not invent accounts for an empty source", () => { expect(db.prepare(plan().sql).all()).toEqual([]); });
  it("keeps the 10001st account-day as an overflow sentinel instead of concealing a 10000-row cap", () => {
    db.exec("BEGIN");
    for (let i = 0; i < 5001; i++) insert(20260901, 10, 20, 1, "KUAISHOU", `a${i}`);
    db.exec("COMMIT");
    const resolved = registry.resolve("account.summary", { date_from: current.from, date_to: current.to }, "ka_data");
    const built = registry.buildTeamKaWindowPlan(resolved, current);
    expect(built.limit).toBe(10000);
    expect(db.prepare(built.sql).all()).toHaveLength(10001);
  });
  it("does not coerce invalid daily prices or hide duplicate account-days", () => {
    insert(20260901, 10, 20); insert(20260901, 15, 25);
    db.prepare("UPDATE dwd_account_daily SET cash_assessment=? WHERE cash_yuan=15").run("invalid-price");
    const rows = db.prepare(plan().sql).all();
    expect(rows.filter((row) => row.ds === "2026-09-01")).toHaveLength(2);
    expect(rows.some((row) => row.cash_assessment === "invalid-price")).toBe(true);
    expect(() => computeKaDailyWindowAssessment(rows.map((row) => ({ ds: row.ds, cashCost: metricValue(row.cash_yuan), realConversion: metricValue(row.conv), price: row.cash_assessment })))).toThrow();
  });
  it("rejects unresolved queries, divergent window bounds and non-summary IDs", () => {
    expect(() => registry.buildTeamKaWindowPlan({ queryId: "account.summary" } as never, current)).toThrow();
    const resolved = registry.resolve("account.summary", { date: "2026-09-01" }, "ka_data");
    expect(() => registry.buildTeamKaWindowPlan(resolved, current)).toThrow();
    expect(() => registry.buildTeamKaWindowPlan(registry.resolve("account.table", { date: "2026-09-01" }, "ka_data"), { from: "2026-09-01", to: "2026-09-01" })).toThrow();
  });
});
