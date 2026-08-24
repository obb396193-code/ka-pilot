import { describe, expect, it } from "vitest";

import {
  canonicalQueryRowSchemaById,
  canonicalRowSchemaVersionByQueryId,
  ratioValueSchema,
} from "../src/data-query-rows.js";

const undefinedRatio = { value: null, state: "undefined" } as const;
const metrics = {
  cost: 100,
  exposure: 1_000,
  click: 100,
  conversion: 10,
  realConversion: 5,
  cashCost: 90,
  costSpace: 10,
  wakeUv: null,
  potentialUv: null,
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
    };
    expect(canonicalQueryRowSchemaById["account.summary"].parse(summary)).toEqual(summary);
    expect(canonicalQueryRowSchemaById["account.trend"].parse({
      ds: "2026-08-24",
      metrics: summary,
    })).toMatchObject({ ds: "2026-08-24" });
    expect(() => canonicalQueryRowSchemaById["account.summary"].parse({
      ...summary,
      cash_cost: 90,
    })).toThrow();
  });

  it("requires the account tuple and rejects source-specific daily fields", () => {
    const row = {
      workspaceId: "workspace-1",
      media: "KUAISHOU",
      accountId: "account-1",
      accountName: null,
      ownerUserId: null,
      ds: "2026-08-24",
      metrics: {
        ...metrics,
        budget: null,
        budgetUsageRate: null,
        deductionRate: null,
        mainAdCostProportion: null,
        assessmentPrice: null,
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
