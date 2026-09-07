import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { aggregatePivotWindow, pivotWindowRowsSchema } from "../src/pivot-window.js";
import { metricValue } from "../src/metric-value.js";

const workspaceId = "00000000-0000-4000-8000-000000000001";
const missing = metricValue(null), finite = (value: number) => ({ value, state: "finite" as const });
const undefinedRatio = { value: null, state: "undefined" as const };
function member(ds = "2026-09-01", accountId = "a", cash = 20, conversions = 1, price = 30) {
  return { workspaceId, media: "KUAISHOU", accountId,
    metrics: { cost: metricValue(cash * 2), cashCost: metricValue(cash), realConversion: metricValue(conversions),
      exposure: metricValue(100), click: metricValue(10), conversion: metricValue(conversions),
      costSpace: missing, wakeUv: missing, potentialUv: missing,
      ratios: { ctr: finite(999), cvr: finite(999), realCpa: finite(999), cashCpa: finite(999),
        gap: finite(999), potentialRate: undefinedRatio, biConversionRate: undefinedRatio },
    },
    assessment: { ds, cashCost: metricValue(cash), realConversion: metricValue(conversions),
      price: { value: price, effectiveDate: "2026-09-01", versionKey: `price-${price}` } },
  };
}
const cell = (members = [member()], a: string | null = "task-1", b: string | null = "biz-1") => ({
  a: { key: a, label: a }, b: { key: b, label: b }, members,
});
function input() {
  return { source: "history", granularity: "account_day", workspaceId,
    accounts: [{ media: "KUAISHOU", accountId: "a" }], dimA: "task", dimB: "biz",
    window: { from: "2026-09-01", to: "2026-09-01", preset: "custom" }, cells: [cell()],
  };
}
function fixture(name: string) {
  const source = JSON.parse(readFileSync(new URL(`../../contract/fixtures/data-query/${name}.json`, import.meta.url), "utf8")).data.source;
  return { queryId: source.queryId, rowSchemaVersion: source.rowSchemaVersion, dimA: source.dimA, dimB: source.dimB, rows: source.rows };
}

describe("pivot2 account-day aggregation", () => {
  it.each(["pivot2", "pivot2-biz-resource_position"])("matches frozen %s projection without inventing lineage", name => {
    const projected = fixture(name);
    expect(pivotWindowRowsSchema.parse(projected)).toEqual(projected);
  });
  it("recalculates rates from totals and cash assessment from daily prices", () => {
    const value = input(); value.window.to = "2026-09-02";
    value.cells = [cell([member(), member("2026-09-02", "a", 80, 9, 40)])];
    const result = aggregatePivotWindow(value);
    expect(result.rows[0]).toMatchObject({ metrics: { cashCost: metricValue(100), realConversion: metricValue(10),
      costSpace: metricValue(290), ratios: { cashCpa: finite(10), realCpa: finite(20), ctr: finite(0.1) } },
      assessment: { price: null, priceVersions: 2, priceSource: "history", onTarget: true, costStatus: "green" },
    });
    expect(result).not.toHaveProperty("lineage");
  });
  it("preserves movement between cells across dates", () => {
    const value = input(); value.window.to = "2026-09-02";
    value.cells = [cell([member()], "old"), cell([member("2026-09-02")], "new")];
    expect(aggregatePivotWindow(value).rows.map(row => row.a.key)).toEqual(["old", "new"]);
  });
  it("keeps absent membership as a null-key cell", () => {
    expect(aggregatePivotWindow({ ...input(), cells: [cell([member()], null, null)] }).rows[0])
      .toMatchObject({ a: { key: null, label: null }, b: { key: null, label: null } });
  });
  it("supports KA prices without fabricated version IDs/dates", () => {
    const daily = { ...member(), assessment: { ...member().assessment, price: 30 } };
    expect(aggregatePivotWindow({ ...input(), source: "ka_daily", cells: [{ ...cell(), members: [daily] }] }).rows[0]?.assessment)
      .toMatchObject({ priceSource: "ka_daily", price: { value: 30, effectiveDate: null } });
    expect(() => aggregatePivotWindow({ ...input(), source: "ka_daily" })).toThrow();
  });
  it("does not turn missing cash into zero or green", () => {
    const m = member(); m.metrics.cashCost = missing; m.assessment.cashCost = missing;
    expect(aggregatePivotWindow({ ...input(), cells: [cell([m])] }).rows[0])
      .toMatchObject({ metrics: { cashCost: missing }, assessment: { onTarget: null, costStatus: null, costStatusReason: "cash_missing" } });
  });
  it("retains infinite/undefined CPA for zero denominators", () => {
    const positive = aggregatePivotWindow({ ...input(), cells: [cell([member("2026-09-01", "a", 10, 0)])] });
    const zero = aggregatePivotWindow({ ...input(), cells: [cell([member("2026-09-01", "a", 0, 0)])] });
    expect(positive.rows[0]?.metrics.ratios.cashCpa).toEqual({ value: null, state: "infinite" });
    expect(zero.rows[0]?.metrics.ratios.cashCpa).toEqual(undefinedRatio);
  });
  it("requires empty cells for empty scope", () => {
    expect(aggregatePivotWindow({ ...input(), accounts: [], cells: [] }).rows).toEqual([]);
    expect(() => aggregatePivotWindow({ ...input(), accounts: [] })).toThrow();
  });
  it.each([
    (v: ReturnType<typeof input>) => ({ ...v, cells: [] }),
    (v: ReturnType<typeof input>) => ({ ...v, cells: [cell([])] }),
    (v: ReturnType<typeof input>) => ({ ...v, accounts: [...v.accounts, ...v.accounts] }),
    (v: ReturnType<typeof input>) => ({ ...v, cells: [cell([member(), member()])] }),
    (v: ReturnType<typeof input>) => ({ ...v, cells: [cell(), cell([member()], "another")] }),
    (v: ReturnType<typeof input>) => ({ ...v, cells: [cell([{ ...member(), media: "TENCENT" }])] }),
    (v: ReturnType<typeof input>) => ({ ...v, cells: [cell([{ ...member(), workspaceId: "00000000-0000-4000-8000-000000000002" }])] }),
    (v: ReturnType<typeof input>) => ({ ...v, cells: [cell([member("2026-09-02")])] }),
    (v: ReturnType<typeof input>) => ({ ...v, granularity: "adgroup_day" }),
    (v: ReturnType<typeof input>) => ({ ...v, window: { ...v.window, from: "2026-02-31" } }),
    (v: ReturnType<typeof input>) => ({ ...v, window: { ...v.window, to: "2026-10-02" } }),
    (v: ReturnType<typeof input>) => ({ ...v, cells: [cell([{ ...member(), assessment: { ...member().assessment, cashCost: metricValue(99) } }])] }),
  ])("rejects incomplete, duplicate, out-of-scope or mismatched evidence %#", mutate => {
    expect(() => aggregatePivotWindow(mutate(input()))).toThrow();
  });
  it("does not collide keys containing delimiter-like text", () => {
    const value = input(); value.accounts.push({ media: "KUAISHOU", accountId: "b" });
    value.cells = [cell([member()], "a:b", "c"), cell([member("2026-09-01", "b")], "a", "b:c")];
    expect(aggregatePivotWindow(value).rows).toHaveLength(2);
  });
  it("rejects duplicate cells or conflicting labels", () => {
    const projected = fixture("pivot2");
    expect(pivotWindowRowsSchema.safeParse({ ...projected, rows: [projected.rows[0], projected.rows[0]] }).success).toBe(false);
    const conflicting = structuredClone(projected); conflicting.rows[1].b.label = "different";
    expect(pivotWindowRowsSchema.safeParse(conflicting).success).toBe(false);
  });
  it("rejects unknown fields and invalid numeric types", () => {
    const projected = fixture("pivot2");
    expect(pivotWindowRowsSchema.safeParse({ ...projected, sql: "select" }).success).toBe(false);
    projected.rows[0].metrics.cashCost.value = "not-a-number";
    expect(pivotWindowRowsSchema.safeParse(projected).success).toBe(false);
  });

  it("preserves cross-media same-ID account axes and refuses collapsed or forged account keys", () => {
    const value = { ...input(), dimA: "account" };
    value.accounts.push({ media: "TENCENT", accountId: "a" });
    value.cells = [cell([member()], "KUAISHOU:a"), cell([{ ...member(), media: "TENCENT" }], "TENCENT:a")];
    expect(aggregatePivotWindow(value).rows.map(row => row.a.key)).toEqual(["KUAISHOU:a", "TENCENT:a"]);
    const collapsed = structuredClone(value); collapsed.cells[1]!.a.key = "KUAISHOU:a";
    expect(() => aggregatePivotWindow(collapsed)).toThrow();
    for (const key of [null, "a", "bad-media:a"]) {
      const projected = fixture("pivot2"); projected.dimA = "account"; projected.rows[0].a.key = key;
      expect(pivotWindowRowsSchema.safeParse(projected).success).toBe(false);
    }
  });
  it("requires same-dimension axes to agree", () => {
    const value = { ...input(), dimB: "task" };
    expect(() => aggregatePivotWindow(value)).toThrow();
    value.cells[0]!.b = { ...value.cells[0]!.a };
    expect(aggregatePivotWindow(value).rows).toHaveLength(1);
  });
  it("preserves KA unknown-version warning for mixed daily prices", () => {
    const value = input(); value.window.to = "2026-09-02";
    const first = { ...member(), assessment: { ...member().assessment, price: 30 } };
    const second = { ...member("2026-09-02"), assessment: { ...member("2026-09-02").assessment, price: 40 } };
    const result = aggregatePivotWindow({ ...value, source: "ka_daily", cells: [{ ...cell(), members: [first, second] }] });
    expect(result.warnings).toEqual(["ASSESSMENT_VERSION_UNKNOWN"]);
    expect(result.rows[0]?.assessment).toMatchObject({ price: null, priceVersions: 2 });
  });
  it.each([null, [], {}, { cells: null }, { cells: [null] }, { cells: [{}] }, { cells: new Array(10001) },
    { cells: [{ members: new Array(10001) }] }])("bounds malformed and oversized input before parsing %#", value => {
    expect(() => aggregatePivotWindow(value)).toThrow();
  });
  it("rejects absent or invalid evidence rather than silently mapping it to missing", () => {
    for (const bad of ["not-a-number", Infinity, NaN, undefined]) {
      const value = input();
      expect(() => aggregatePivotWindow({ ...value, cells: [{ ...cell(), members: [{ ...member(),
        metrics: { ...member().metrics, cashCost: { value: bad, availability: "available" } },
      }] }] })).toThrow();
    }
    const value = input(); value.cells[0]!.members[0]!.assessment.price.effectiveDate = "2026-09-02";
    expect(() => aggregatePivotWindow(value)).toThrow();
    value.cells[0]!.members[0]!.assessment.price.effectiveDate = "2026-09-01";
    value.cells[0]!.members[0]!.assessment.realConversion = metricValue(999);
    expect(() => aggregatePivotWindow(value)).toThrow();
  });
  it("rejects a partial Cartesian account-day scope before reporting cells", () => {
    const value = input(); value.window.to = "2026-09-11";
    value.accounts = Array.from({ length: 1000 }, (_, i) => ({ media: "KUAISHOU", accountId: String(i) }));
    expect(() => aggregatePivotWindow(value)).toThrow();
  });
  it("accepts an exact 10000-member complete manifest instead of treating the local limit as upstream truncation", () => {
    const value = input(); value.window.to = "2026-09-10";
    value.accounts = Array.from({ length: 1000 }, (_, i) => ({ media: "KUAISHOU", accountId: String(i) }));
    const members = value.accounts.flatMap(account => Array.from({ length: 10 }, (_, day) =>
      member(`2026-09-${String(day + 1).padStart(2, "0")}`, account.accountId)));
    value.cells = [cell(members)];
    expect(aggregatePivotWindow(value).rows[0]).toMatchObject({
      metrics: { cashCost: metricValue(200000), realConversion: metricValue(10000), costSpace: metricValue(100000) },
    });
  }, 30000);
});
