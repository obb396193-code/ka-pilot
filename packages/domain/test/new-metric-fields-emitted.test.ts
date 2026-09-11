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
      expect(assessment.biCashCost).toEqual(metricValue(10));
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
    expect(assessment.biCashCost).toEqual(metricValue(null));
    expect(assessment.overCost).toEqual(metricValue(null));
  });

  it("keeps the zero-BI spend visible in the kernel even though the wire shape loses it", () => {
    // 花了钱一个 BI 数都没有：内核（RatioValue）能说出这是 infinite；
    // 但 wire 形按契约是 MetricValue，没有 infinite 这一档，只能落成 missing——
    // 这一档有损，已在回执里请 arch 裁。这条用例把「损在哪」钉住，免得以后被当成正常。
    const days = [day("2026-09-01", 100, 0, 12)];
    expect(computeDashboardBi({ priceSource: "history", days }).bi_cash_cost)
      .toEqual({ value: null, state: "infinite" });
    expect(computeWindowAssessment(days).assessment.biCashCost).toEqual(metricValue(null));
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
    // 老行没有这个键（源里就没这一列）：求和结果是 missing，不是 0。
    const legacy = { ...withValue };
    delete (legacy as { incentiveCost?: unknown }).incentiveCost;
    expect(aggregateWindowMetrics([withValue, legacy]).incentiveCost).toEqual(metricValue(null));
  });
});
