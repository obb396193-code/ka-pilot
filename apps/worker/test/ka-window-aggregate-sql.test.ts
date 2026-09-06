// Real SQLite statements against synthetic data only.
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createDataQueryRegistry } from "../src/data/query-registry.js";

describe("bounded team window aggregate SQL", () => {
  let db: DatabaseSync;
  const registry = createDataQueryRegistry();
  const window = { from: "2026-08-01", to: "2026-08-31", preset: "custom" as const };
  beforeEach(() => {
    db = new DatabaseSync(":memory:");
    db.exec(`CREATE TABLE dwd_account_daily(ds INTEGER,media TEXT,account_id TEXT,cost_yuan REAL,
      cash_yuan REAL,show REAL,click REAL,conv REAL,cash_assessment REAL)`);
  });
  afterEach(() => db.close());
  const insert = (ds: number, account = "a", price: number | string | null = 10, cash: number | null = 8, media = "KUAISHOU") =>
    db.prepare("INSERT INTO dwd_account_daily VALUES(?,?,?,12,?,100,10,1,?)").run(ds, media, account, cash, price);
  function run(current = window, compare?: "dod" | "wow") {
    const resolved = registry.resolve("account.summary", { date_from: current.from, date_to: current.to, media: "KUAISHOU" }, "ka_data");
    const plan = registry.buildTeamKaWindowAggregatePlan(resolved, current, compare);
    return { plan, rows: db.prepare(plan.sql).all() };
  }
  it("keeps 500 accounts x 31 days in one snapshot below transport row/byte budgets", () => {
    db.exec("BEGIN");
    for (let day = 1; day <= 31; day++) for (let account = 0; account < 500; account++) insert(20260800 + day, `a-${account}`);
    db.exec("COMMIT");
    const { rows, plan } = run();
    expect(rows).toHaveLength(32);
    expect(plan.limit).toBe(10000);
    expect(Buffer.byteLength(JSON.stringify(rows))).toBeLessThan(16 * 1024 * 1024);
    expect(rows.find((row) => row.kind === "window")).toMatchObject({ period: "current", expected_count: 15500,
      member_count: 15500, observed_count: 15500, account_count: 500, catalog_count: 500,
      cash_yuan: 124000, target: 155000, price_count: 1, unique_price: 10,
      determinable_count: 500, on_target_count: 500, day_over_count: 0, invalid_count: 0 });
  });
  it("calculates both windows and day-overspend without averaging prices or CPA", () => {
    insert(20260801, "a", 5, 8); insert(20260802, "a", 20, 12); insert(20260731, "a", 10, 10);
    insert(20260801, "a", 999, 900, "TENCENT");
    const { rows } = run({ ...window, from: "2026-08-01", to: "2026-08-02" }, "dod");
    expect(rows.filter((row) => row.kind === "window")).toEqual(expect.arrayContaining([
      expect.objectContaining({ period: "current", cash_yuan: 20, target: 25, price_count: 2, unique_price: null,
        determinable_count: 1, on_target_count: 1, day_over_count: 1 }),
      expect.objectContaining({ period: "previous", cash_yuan: 18, target: 15, on_target_count: 0 }),
    ]));
  });
  it("retains missing days and excludes undeterminable accounts from the rate denominator", () => {
    insert(20260801, "a"); insert(20260802, "a"); insert(20260801, "b");
    const { rows } = run({ ...window, from: "2026-08-01", to: "2026-08-02" });
    expect(rows.find((row) => row.kind === "window")).toMatchObject({ expected_count: 4, member_count: 4,
      observed_count: 3, account_count: 2, catalog_count: 2, cash_yuan: null, target: null,
      missing_price_count: 1, determinable_count: 1, on_target_count: 1 });
  });
  it("empty inventory returns only a zero-count window proof, not fabricated daily zeros", () => {
    const { rows } = run();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ kind: "window", expected_count: 0, member_count: 0, catalog_count: 0,
      observed_count: 0, account_count: 0, cash_yuan: null, target: null, price_count: 0,
      determinable_count: 0, on_target_count: 0 });
  });
  it("duplicate account-days stay detectable after aggregation", () => {
    insert(20260801); insert(20260801);
    const { rows } = run({ ...window, from: "2026-08-01", to: "2026-08-01" });
    expect(rows[0]).toMatchObject({ expected_count: 2, member_count: 1 });
  });
  it.each(["bad-price", Number.POSITIVE_INFINITY, Number.MAX_VALUE])("preserves invalid price/product evidence %s instead of null or zero", (price) => {
    insert(20260801, "a", price); insert(20260802, "a", null);
    db.exec("UPDATE dwd_account_daily SET conv=3");
    const { rows } = run({ ...window, from: "2026-08-01", to: "2026-08-02" });
    expect(rows.find((row) => row.kind === "window")!.invalid_count).toBeGreaterThan(0);
  });
  it("does not add a previous window for today without same-hour history", () => {
    const { plan, rows } = run({ ...window, preset: "today" } as never, "dod");
    expect(plan.previousWindow).toBeNull();
    expect(rows.every((row) => row.period === "current")).toBe(true);
  });
});
