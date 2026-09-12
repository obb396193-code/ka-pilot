import { describe, expect, it } from "vitest";
import { projectAccountHourly } from "../src/hourly-projection.js";

const workspaceId = "11111111-1111-4111-8111-111111111111", date = "2026-09-07";
const account = { media: "KUAISHOU", accountId: "synthetic" };
const mv = (value: number | null) => value === null ? { value: null, availability: "missing" as const } : { value, availability: "available" as const };
const error = { value: null, availability: "error" as const };
function observation(hh: number, cost = 10) {
  return { workspaceId, date, ...account, hh,
    cumulative: { cost: mv(cost), cashCost: mv(cost / 2), conversion: mv(4), realConversion: mv(2) },
    budget: mv(100), lastSyncAt: "2026-09-07T02:00:00+08:00",
    completeHour: true, elapsedDayFraction: 0.5 };
}
function input(observations: unknown[] = [observation(0), observation(1, 20)]) {
  return { workspaceId, date, accounts: [account], hhFrom: 0, hhTo: 1, observations };
}

describe("trusted account cumulative hourly projection", () => {
  it("computes per-field differences, weighted input CPA and actual elapsed projection", () => {
    const rows = projectAccountHourly(input());
    expect(rows).toHaveLength(2);
    expect(rows[0]!.delta.cost).toEqual(mv(10));
    expect(rows[1]!.delta).toEqual({ cost: mv(10), cashCost: mv(5), conversion: mv(0), realConversion: mv(0) });
    expect(rows[1]!.ratios).toEqual({ cashCpa: { value: 5, state: "finite" }, realCpa: { value: 10, state: "finite" } });
    expect(rows[1]!.velocity.costPerHour).toEqual(mv(10));
    expect(rows[1]!.projectedDayCost).toEqual(mv(40));
    expect(rows[1]!.budgetUsage).toEqual({ value: 0.2, state: "finite" });
    expect(rows[1]!.lastSyncAt).toBe("2026-09-07T02:00:00+08:00");
  });
  it("uses a predecessor outside the visible interval but never returns it", () => {
    const rows = projectAccountHourly({ ...input(), hhFrom: 1 });
    expect(rows).toHaveLength(1); expect(rows[0]!.delta.cost).toEqual(mv(10));
  });
  it("fills missing requested observations with missing, not zero, and blocks adjacent delta", () => {
    const rows = projectAccountHourly(input([observation(1)]));
    expect(rows[0]!.cumulative.cost).toEqual(mv(null));
    expect(rows[0]!.lastSyncAt).toBeNull();
    expect(rows[1]!.delta.cost).toEqual(mv(null));
    expect(rows[1]!.cumulative.cost).toEqual(mv(10));
  });
  it("propagates missing/error independently per metric", () => {
    const previous = observation(0); previous.cumulative.cost = mv(null);
    const current = { ...observation(1), cumulative: { ...observation(1).cumulative, cashCost: error } };
    const rows = projectAccountHourly(input([previous, current]));
    expect(rows[1]!.delta.cost).toEqual(mv(null)); expect(rows[1]!.delta.cashCost).toEqual(error);
    expect(rows[1]!.delta.conversion).toEqual(mv(0));
    expect(rows[1]!.ratios.cashCpa).toEqual({ value: null, state: "undefined" });
  });
  it("keeps source corrections visible instead of clamping a negative difference to zero", () => {
    const rows = projectAccountHourly(input([observation(0, 20), observation(1, 10)]));
    expect(rows[1]!.cumulative.cost).toEqual(mv(10)); expect(rows[1]!.delta.cost).toEqual(error);
    expect(rows[1]!.velocity.costPerHour).toEqual(error);
  });
  it("whole-day 24 is not another hourly interval", () => {
    const rows = projectAccountHourly({ ...input([observation(23), observation(24, 20)]), hhFrom: 24, hhTo: 24 });
    expect(rows[0]!.cumulative.cost).toEqual(mv(20)); expect(rows[0]!.delta.cost).toEqual(mv(null));
    expect(rows[0]!.velocity.costPerHour).toEqual(mv(null));
  });
  it("does not infer elapsed time or completeness from the hour or response time", () => {
    const rows = projectAccountHourly(input([{ ...observation(0), completeHour: false, elapsedDayFraction: null, lastSyncAt: null }]));
    expect(rows[0]!.delta.cost).toEqual(mv(10)); expect(rows[0]!.velocity.costPerHour).toEqual(mv(null));
    expect(rows[0]!.projectedDayCost).toEqual(mv(null)); expect(rows[0]!.lastSyncAt).toBeNull();
  });
  it("positive/zero CPA is infinite; zero/zero and absent budget are undefined", () => {
    const obs = observation(0); obs.cumulative.realConversion = mv(0); obs.budget = mv(null);
    const row = projectAccountHourly(input([obs]))[0]!;
    expect(row.ratios.realCpa).toEqual({ value: null, state: "infinite" });
    expect(row.budgetUsage).toEqual({ value: null, state: "undefined" });
    obs.cumulative.cost = mv(0); obs.cumulative.cashCost = mv(0);
    expect(projectAccountHourly(input([obs]))[0]!.ratios.realCpa).toEqual({ value: null, state: "undefined" });
  });
  it("same ID across media remains two independent series and output is deterministic", () => {
    const other = { ...account, media: "TENCENT" };
    const query = { ...input([observation(0), { ...observation(0, 99), media: other.media }]), accounts: [other, account], hhTo: 0 };
    const rows = projectAccountHourly(query);
    expect(rows.map(r => [r.media, r.cumulative.cost.value])).toEqual([["KUAISHOU", 10], ["TENCENT", 99]]);
    expect(projectAccountHourly({ ...query, observations: [...query.observations].reverse() })).toEqual(rows);
  });
  it.each([
    { workspaceId: "22222222-2222-4222-8222-222222222222" }, { date: "2026-09-06" },
    { media: "TENCENT" }, { accountId: "not-granted" }, { hh: 2 }, { hh: 25 },
    { hh: "0" }, { date: "2026-02-31" }, { completeHour: "false" },
    { elapsedDayFraction: 0 }, { elapsedDayFraction: 2 }, { elapsedDayFraction: Infinity },
    { lastSyncAt: "today" }, { token: "synthetic" },
  ])("rejects invalid or out-of-scope observation %j", (patch) => {
    expect(() => projectAccountHourly(input([{ ...observation(0), ...patch }]))).toThrow();
  });
  it.each([NaN, Infinity, "10", null])("rejects present-invalid numeric value %s", value => {
    const obs = observation(0);
    expect(() => projectAccountHourly(input([{ ...obs, cumulative: { ...obs.cumulative, cost: { value, availability: "available" } } }]))).toThrow();
  });
  it("rejects duplicate grant and duplicate observation, invalid interval, overflow", () => {
    expect(() => projectAccountHourly({ ...input(), accounts: [account, account] })).toThrow();
    expect(() => projectAccountHourly(input([observation(0), observation(0)]))).toThrow();
    expect(() => projectAccountHourly({ ...input(), hhFrom: 2 })).toThrow();
    expect(() => projectAccountHourly({ ...input(), hhTo: 25 })).toThrow();
    const obs = observation(0, Number.MAX_VALUE); obs.elapsedDayFraction = 0.01;
    expect(() => projectAccountHourly(input([obs]))).toThrow();
  });
  it("rejects excess observations before parsing and refuses a >10k output grid", () => {
    expect(() => projectAccountHourly(input(Array(10001).fill(observation(0))))).toThrow();
    const accounts = Array.from({ length: 401 }, (_, i) => ({ ...account, accountId: `synthetic-${i}` }));
    expect(() => projectAccountHourly({ ...input([]), accounts, hhTo: 24 })).toThrow();
  });
  it("accepts exactly 10k expected cells without claiming any source completeness", () => {
    const accounts = Array.from({ length: 400 }, (_, i) => ({ ...account, accountId: `synthetic-${i}` }));
    const rows = projectAccountHourly({ ...input([]), accounts, hhTo: 24 });
    expect(rows).toHaveLength(10000);
    expect(rows.every(row => row.cumulative.cost.availability === "missing" && row.lastSyncAt === null)).toBe(true);
  }, 30000);
  it("rejects duplicate-key tricks and unknown input fields rather than stripping them", () => {
    expect(() => projectAccountHourly({ ...input(), scope: "all" })).toThrow();
    expect(() => projectAccountHourly({ ...input(), accounts: [{ ...account, permission: "execute" }] })).toThrow();
    expect(() => projectAccountHourly(null)).toThrow();
    expect(() => projectAccountHourly({ ...input(), observations: {} })).toThrow();
    expect(() => projectAccountHourly({ ...input(), date: "2026-02-31" })).toThrow();
  });
  it("empty approved scope only produces empty rows and cannot accept observations", () => {
    expect(projectAccountHourly({ ...input([]), accounts: [] })).toEqual([]);
    expect(() => projectAccountHourly({ ...input(), accounts: [] })).toThrow();
  });
  it("does not mutate caller input", () => {
    const value = input(), before = structuredClone(value);
    const rows = projectAccountHourly(value); rows[0]!.cumulative.cost.value = 300;
    expect(value).toEqual(before);
  });
});

/**
 * v1.9.39：整天一行都没采到的账户，空值给 `pending`（还没采），不是 `missing`（采过了就是没有）。
 *
 * 两者在页面上都是「−」，但一个该等下一轮采集、一个该去查为什么没数。原来整日 25 行全 `missing`
 * 会让人以为这个账户当天真的没花钱。这个事实**必须由仓储按整日单独给**，不能从窗口内的
 * observations 反推：窗口选 0–10 点而账户 20 点才开始投放时，反推会把正常账户说成没采到。
 */
describe("v1.9.39 an entirely unsampled day is pending, not missing", () => {
  const other = { media: "KUAISHOU", accountId: "second" };
  const pending = { value: null, availability: "pending" as const };

  it("marks every hour of an unsampled account pending while a sampled one is unaffected", () => {
    const rows = projectAccountHourly({
      ...input(), accounts: [account, other], sampledAccounts: [account],
    });
    const unsampled = rows.filter((row) => row.accountId === other.accountId);
    expect(unsampled).toHaveLength(2);
    for (const row of unsampled) {
      expect(row.cumulative).toEqual({ cost: pending, cashCost: pending, conversion: pending, realConversion: pending });
      // 「还没采」推不出任何增量或比率，这些仍旧是不可计算，不是 0。
      expect(row.delta.cost).toEqual(mv(null));
      expect(row.ratios.realCpa).toEqual({ value: null, state: "undefined" });
      expect(row.lastSyncAt).toBeNull();
    }
    expect(rows.find((row) => row.accountId === account.accountId)!.cumulative.cost).toEqual(mv(10));
  });

  it("keeps missing for a sampled account whose requested hours happen to be empty", () => {
    // 这一条是整条改动的分界线：采过样、只是这几个小时没有 —— 那就是 missing，不是 pending。
    const rows = projectAccountHourly({ ...input([observation(1)]), sampledAccounts: [account] });
    expect(rows[0]!.cumulative.cost).toEqual(mv(null));
    expect(rows[1]!.cumulative.cost).toEqual(mv(10));
  });

  it("behaves exactly as before when the caller supplies no sampling list", () => {
    expect(projectAccountHourly({ ...input(), accounts: [account, other] })
      .filter((row) => row.accountId === other.accountId)
      .every((row) => row.cumulative.cost.availability === "missing")).toBe(true);
  });

  it("refuses evidence that contradicts itself", () => {
    // 说这户整天没采到，却又交上来一条它当天的观测 —— 两句话来自同一张表，不能各显各的。
    expect(() => projectAccountHourly({ ...input(), sampledAccounts: [] })).toThrow();
    // 名单里出现授权范围外的账户同理。
    expect(() => projectAccountHourly({ ...input(), sampledAccounts: [other] })).toThrow();
  });
});
