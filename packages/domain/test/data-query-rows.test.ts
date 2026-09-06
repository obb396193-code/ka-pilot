import { metricValue } from "../src/metric-value.js";
import { describe, expect, it } from "vitest";

import {
  canonicalQueryRowSchemaById,
  canonicalRowSchemaVersionByQueryId,
  ratioValueSchema,
} from "../src/data-query-rows.js";

const undefinedRatio = { value: null, state: "undefined" } as const;
const assessment = { priceSource: "history", price: null, onTarget: null, costStatus: null,
  costStatusReason: "assessment_missing", budgetUsageRate: undefinedRatio } as const;
const metrics = {
  cost: metricValue(100),
  exposure: metricValue(1_000),
  click: metricValue(100),
  conversion: metricValue(10),
  realConversion: metricValue(5),
  cashCost: metricValue(90),
  costSpace: metricValue(10),
  wakeUv: metricValue(null),
  potentialUv: metricValue(null),
  ratios: {
    ctr: { value: 0.1, state: "finite" },
    cvr: { value: 0.1, state: "finite" },
    realCpa: { value: 20, state: "finite" },
    cashCpa: { value: 18, state: "finite" },
    gap: { value: 1, state: "finite" },
    potentialRate: undefinedRatio,
    biConversionRate: undefinedRatio,
  },
} as const;

describe("canonical data query rows", () => {
  it("requires strict metric availability and a v3 assessment, rejecting bare v1 numbers", () => {
    const v2 = { rowCount: 1, accountCount: 1, anomalyRows: 0, metrics, assessment };
    expect(canonicalQueryRowSchemaById["account.summary"].safeParse(v2).success).toBe(true);
    expect(canonicalQueryRowSchemaById["account.summary"].safeParse({ ...v2, metrics: { ...metrics, cost: 100 } }).success).toBe(false);
    expect(canonicalRowSchemaVersionByQueryId["account.summary"]).toBe("account.summary/v3");
    expect(canonicalRowSchemaVersionByQueryId["account.table"]).toBe("account.table/v2");
    for (const cost of [
      { value: 1, availability: "missing" },
      { value: 0, availability: "error" },
      { value: null, availability: "available" },
      { value: 1, availability: "unknown" },
    ]) {
      expect(canonicalQueryRowSchemaById["account.summary"].safeParse({ ...v2, metrics: { ...metrics, cost } }).success).toBe(false);
    }
  });
  it("freezes one strict versioned row schema for every canonical query id", () => {
    expect(Object.keys(canonicalQueryRowSchemaById).sort()).toEqual([
      "account.anomalies",
      "account.detail",
      "account.summary",
      "account.table",
      "account.trend",
      "reconcile.account_daily",
    ]);
    expect(new Set(Object.values(canonicalRowSchemaVersionByQueryId)).size).toBe(6);
  });

  it("keeps summary and trend metrics source-neutral and strict", () => {
    const summary = {
      rowCount: 1,
      accountCount: 1,
      anomalyRows: 0,
      metrics,
      assessment,
    };
    expect(canonicalQueryRowSchemaById["account.summary"].parse(summary)).toEqual(summary);
    expect(canonicalQueryRowSchemaById["account.trend"].parse({
      ds: "2026-08-24",
      metrics,
    })).toMatchObject({ ds: "2026-08-24" });
    expect(() => canonicalQueryRowSchemaById["account.summary"].parse({
      ...summary,
      cash_cost: 90,
    })).toThrow();
    expect(() => canonicalQueryRowSchemaById["account.trend"].parse({
      ds: "2026-02-31",
      metrics,
    })).toThrow(/calendar date/i);
  });

  it("requires the account tuple and rejects source-specific daily fields", () => {
    const row = {
      workspaceId: "00000000-0000-4000-8000-000000000024",
      media: "KUAISHOU",
      accountId: "account-1",
      accountName: null,
      ownerUserId: null,
      ds: "2026-08-24",
      metrics: {
        ...metrics,
        budget: metricValue(null),
        budgetUsageRate: metricValue(null),
        deductionRate: metricValue(null),
        mainAdCostProportion: metricValue(null),
        assessmentPrice: metricValue(null),
      },
      dataAnomaly: false,
      computedAt: null,
      tasks: [],
    };
    expect(canonicalQueryRowSchemaById["account.table"].parse(row)).toEqual(row);
    expect(() => canonicalQueryRowSchemaById["account.table"].parse({
      ...row,
      account_id: "source-field",
    })).toThrow();
    expect(() => canonicalQueryRowSchemaById["account.table"].parse({
      ...row,
      workspaceId: undefined,
    })).toThrow();
  });

  it("preserves finite, infinite and denominator-zero undefined ratio states", () => {
    expect(ratioValueSchema.parse({ value: 2, state: "finite" })).toEqual({
      value: 2,
      state: "finite",
    });
    expect(ratioValueSchema.parse({ value: null, state: "infinite" })).toMatchObject({
      state: "infinite",
    });
    expect(ratioValueSchema.parse({ value: null, state: "undefined" })).toMatchObject({
      state: "undefined",
    });
    expect(() => ratioValueSchema.parse({ value: 0, state: "undefined" })).toThrow();
  });
});
