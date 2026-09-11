import { describe, expect, it } from "vitest";

import { canonicalMetricSetSchema } from "../src/data-query-base-rows.js";
import { aggregateWindowMetrics } from "../src/summary-window.js";
import { computeDashboardBi } from "../src/dashboard-bi.js";
import { computeKaDailyWindowAssessment, computeWindowAssessment } from "../src/window-assessment.js";
import { metricValue } from "../src/metric-value.js";

/**
 * 绊线：v1.9.27 新增的四个字段（`incentiveCost` 与三个 BI 值）**产出路径必须恒发**。
 *
 * 它们在 schema 里暂为 optional，只是因为几十份冻结 fixture 是这些字段存在之前从真响应导出的，
 * 转必填会把它们全判非法。**「optional」不等于「可以不发」**——没有这条绊线，
 * 哪条路径漏发都不会有任何东西报警，前端只是静悄悄显「−」，而「后端没算」与「真没有数」
 * 在页面上长得一模一样。fixtures 重导之后把 optional 去掉，这条绊线也就退役。
 */
const day = (ds: string, cash: number, conversions: number, price: number) => ({
  ds, cashCost: metricValue(cash), realConversion: metricValue(conversions),
  price: { value: price, effectiveDate: "2026-09-01", versionKey: `p-${price}` },
});

describe("v1.9.27 new metric fields are always emitted by the real producers", () => {
  it("puts the three BI values on every assessment, both price sources", () => {
    for (const assessment of [
      computeWindowAssessment([day("2026-09-01", 100, 10, 12)]).assessment,
      computeKaDailyWindowAssessment([
        { ds: "2026-09-01", cashCost: metricValue(100), realConversion: metricValue(10), price: 12 },
      ]).assessment,
    ]) {
      for (const key of ["biConv", "biCashCost", "overCost"] as const) {
        expect(assessment[key], key).toBeDefined();
      }
      // 值也要对得上：现金 100 / BI 10 = 10；成本空间 = 10×12 − 100 = 20 ⇒ 超成本 −20（没超）。
      expect(assessment.biConv).toEqual(metricValue(10));
      expect(assessment.biCashCost).toEqual({ value: 10, state: "finite" });
      expect(assessment.overCost).toEqual(metricValue(-20));
    }
  });

  it("keeps a missing BI count from turning the BI cash cost into a number", () => {
    // BI 数缺失时除法的结果是「不知道」，不是 0 也不是 infinite。
    const assessment = computeWindowAssessment([
      { ds: "2026-09-01", cashCost: metricValue(100), realConversion: metricValue(null),
        price: { value: 12, effectiveDate: "2026-09-01", versionKey: "p" } },
    ]).assessment;
    expect(assessment.biConv).toEqual(metricValue(null));
    expect(assessment.biCashCost).toEqual({ value: null, state: "undefined" });
    expect(assessment.overCost).toEqual(metricValue(null));
  });

  it("reports a real zero-BI spend as infinite instead of hiding it", () => {
    // 花了钱一个 BI 数都没有：这是最该被看见的一种，v1.9.32 裁 biCashCost 用 RatioValue
    // 就是为了留住这一档（压成 MetricValue 会和「根本没数据」长得一样）。
    const days = [day("2026-09-01", 100, 0, 12)];
    expect(computeDashboardBi({ priceSource: "history", days }).bi_cash_cost)
      .toEqual({ value: null, state: "infinite" });
    expect(computeWindowAssessment(days).assessment.biCashCost).toEqual({ value: null, state: "infinite" });
  });

  it("aggregates incentiveCost and treats an absent column as missing, never zero", () => {
    const withValue = canonicalMetricSetSchema.parse({
      cost: metricValue(10), exposure: metricValue(1), click: metricValue(1), conversion: metricValue(1),
      realConversion: metricValue(1), cashCost: metricValue(5), costSpace: metricValue(null),
      incentiveCost: metricValue(3), wakeUv: metricValue(null), potentialUv: metricValue(null),
      ratios: {
        ctr: { value: 1, state: "finite" }, cvr: { value: 1, state: "finite" },
        realCpa: { value: 1, state: "finite" }, cashCpa: { value: 1, state: "finite" },
        gap: { value: 0, state: "finite" }, potentialRate: { value: null, state: "undefined" },
        biConversionRate: { value: null, state: "undefined" },
      },
    });
    expect(aggregateWindowMetrics([withValue, withValue]).incentiveCost).toEqual(metricValue(6));
    // 老行没有这个键（源里就没这一列）：v1.9.35 起窗口聚合是**部分合计**，
    // 给的是有数那部分的和并标 partial——不是 0，也不再是整体 missing。
    const legacy = { ...withValue };
    delete (legacy as { incentiveCost?: unknown }).incentiveCost;
    expect(aggregateWindowMetrics([withValue, legacy]).incentiveCost)
      .toEqual({ value: 3, availability: "partial" });
    // 一个都没有才是 missing。
    const none = { ...withValue };
    delete (none as { incentiveCost?: unknown }).incentiveCost;
    expect(aggregateWindowMetrics([none, legacy]).incentiveCost).toEqual(metricValue(null));
  });
});

/**
 * v1.9.35（老板拍板 B）部分合计：窗口里缺账户日时给「有数那部分的和」并标 `partial`，
 * 但**任何判定都挂起**。这两件事必须同时成立——只给数不挂判定，等于用半个窗口判达标；
 * 只挂判定不给数，用户又回到一屏「−」。
 */
describe("v1.9.35 partial window totals suspend every judgement", () => {
  const full = day("2026-09-01", 100, 10, 12);
  const blank = { ds: "2026-09-02", cashCost: metricValue(null), realConversion: metricValue(null),
    price: { value: 12, effectiveDate: "2026-09-01", versionKey: "p-12" } };

  it("gives the partial total and refuses to judge on it", () => {
    const out = computeWindowAssessment([full, blank]);
    // 有数那天的和照给，并明说这是「部分」。
    expect(out.costSpace).toEqual({ value: 20, availability: "partial" });
    // 判定一律挂起：拿半个窗口的花费跟整窗目标比，结论必错且看不出来。
    expect(out.assessment.onTarget).toBeNull();
    expect(out.assessment.costStatus).toBeNull();
    expect(out.assessment.costStatusReason).toBe("partial_data");
  });

  it("still judges normally when every expected day is present", () => {
    const out = computeWindowAssessment([full, day("2026-09-02", 100, 10, 12)]);
    expect(out.costSpace.availability).toBe("available");
    expect(out.assessment.costStatusReason).toBe("window_ok");
    expect(out.assessment.onTarget).toBe(true);
  });

  it("falls back to missing only when nothing in the window has data", () => {
    const out = computeWindowAssessment([blank, { ...blank, ds: "2026-09-03" }]);
    expect(out.costSpace).toEqual(metricValue(null));
    // 一个数都没有时理由是「缺现金」而不是「部分」——partial 的前提是有一部分。
    expect(out.assessment.costStatusReason).toBe("cash_missing");
  });
});
