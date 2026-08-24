import { describe, expect, it } from "vitest";

import {
  MaterialExperimentError,
  analyzeMaterialExperimentMatrix,
  createMaterialExperimentPolicy,
  type MaterialExperimentObservation,
  type MaterialExperimentPolicyInput,
} from "../src/material-experiment.js";

function policy(overrides: Partial<MaterialExperimentPolicyInput> = {}) {
  return createMaterialExperimentPolicy({
    policyVersion: "official-test-v1",
    minActiveDays: 2,
    minAccounts: 2,
    minExposure: 100,
    minClicks: 20,
    minRealConversions: 4,
    minCost: 40,
    minCpaImprovementRate: 0.1,
    conversionRateDenominator: "click",
    ...overrides,
  });
}

function observation(overrides: Partial<MaterialExperimentObservation> = {}): MaterialExperimentObservation {
  return {
    sourceFactId: "fact-001",
    productVersionId: "product-001",
    materialVersionId: "material-001",
    accountId: "account-001",
    dataDate: "2026-08-19",
    exposure: 100,
    click: 20,
    realConversion: 4,
    cost: 40,
    ...overrides,
  };
}

function candidate(input: {
  product?: string;
  material: string;
  prefix: string;
  click: number;
  conversion: number;
  cost: number;
}): MaterialExperimentObservation[] {
  return [0, 1].map((index) => observation({
    sourceFactId: `${input.prefix}-${index}`,
    productVersionId: input.product ?? "product-001",
    materialVersionId: input.material,
    accountId: `account-${index + 1}`,
    dataDate: `2026-08-${19 + index}`,
    exposure: Math.max(100, input.click),
    click: input.click,
    realConversion: input.conversion,
    cost: input.cost,
  }));
}

describe("material experiment policy", () => {
  it("creates a stable immutable policy without inventing defaults", () => {
    const first = policy();
    const second = createMaterialExperimentPolicy({
      minCpaImprovementRate: 0.1,
      conversionRateDenominator: "click",
      minCost: 40,
      minRealConversions: 4,
      minClicks: 20,
      minExposure: 100,
      minAccounts: 2,
      minActiveDays: 2,
      policyVersion: "official-test-v1",
    });

    expect(first).toEqual(second);
    expect(first.confidenceLevel).toBe(0.95);
    expect(first.fingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(Object.isFrozen(first)).toBe(true);
  });

  it.each([
    { policyVersion: "bad version" },
    { minActiveDays: 0 },
    { minAccounts: 0 },
    { minExposure: -1 },
    { minClicks: 1.2 },
    { minRealConversions: -1 },
    { minCost: Number.NaN },
    { minCpaImprovementRate: 1.1 },
    { conversionRateDenominator: "unknown" },
    { unexpected: true },
  ])("rejects invalid policy %#", (override) => {
    expect(() => createMaterialExperimentPolicy({
      policyVersion: "official-test-v1",
      minActiveDays: 2,
      minAccounts: 2,
      minExposure: 100,
      minClicks: 20,
      minRealConversions: 4,
      minCost: 40,
      minCpaImprovementRate: 0.1,
      conversionRateDenominator: "click",
      ...override,
    } as never)).toThrow(MaterialExperimentError);
  });
});

describe("material experiment aggregation", () => {
  it("deduplicates identical source facts and recomputes ratios from aggregate numerators", () => {
    const first = observation({
      sourceFactId: "fact-a",
      exposure: 100,
      click: 10,
      realConversion: 2,
      cost: 30,
    });
    const second = observation({
      sourceFactId: "fact-b",
      accountId: "account-002",
      dataDate: "2026-08-20",
      exposure: 300,
      click: 90,
      realConversion: 18,
      cost: 90,
    });
    const result = analyzeMaterialExperimentMatrix({ policy: policy(), observations: [first, second, first] });
    const cell = result.products[0]?.cells[0];

    expect(cell).toMatchObject({
      productVersionId: "product-001",
      materialVersionId: "material-001",
      accountCount: 2,
      activeDayCount: 2,
      exposure: 400,
      click: 100,
      realConversion: 20,
      cost: 120,
      ctr: { state: "finite", value: 0.25 },
      inferenceRateDenominator: "click",
      inferenceRate: { state: "finite", value: 0.2 },
      realCpa: { state: "finite", value: 6 },
      sampleStatus: "sufficient",
      exclusionReasons: [],
    });
    expect(cell?.inferenceRateInterval95).toMatchObject({ confidenceLevel: 0.95 });
    expect(cell?.inferenceRateInterval95?.lower).toBeLessThan(0.2);
    expect(cell?.inferenceRateInterval95?.upper).toBeGreaterThan(0.2);
  });

  it("is stable across fact order, product order, and exact duplicate placement", () => {
    const facts = [
      ...candidate({ product: "product-b", material: "material-b", prefix: "b", click: 20, conversion: 4, cost: 40 }),
      ...candidate({ product: "product-a", material: "material-a", prefix: "a", click: 30, conversion: 6, cost: 45 }),
    ];
    const first = analyzeMaterialExperimentMatrix({ policy: policy(), observations: facts });
    const second = analyzeMaterialExperimentMatrix({
      policy: policy(),
      observations: [facts[2]!, facts[0]!, facts[3]!, facts[1]!, facts[0]!],
    });

    expect(second).toEqual(first);
    expect(first.products.map(({ productVersionId }) => productVersionId)).toEqual(["product-a", "product-b"]);
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.products[0]?.cells)).toBe(true);
  });

  it("rejects conflicting duplicate facts and invalid metric relationships", () => {
    const first = observation();
    expect(() => analyzeMaterialExperimentMatrix({
      policy: policy(),
      observations: [first, { ...first, cost: first.cost + 1 }],
    })).toThrowError(expect.objectContaining({ code: "conflicting_source_fact" }));

    for (const invalid of [
      observation({ click: 101 }),
      observation({ click: 10, realConversion: 11 }),
      observation({ exposure: -1 }),
      observation({ cost: Number.POSITIVE_INFINITY }),
      observation({ dataDate: "2026-02-30" }),
      observation({ sourceFactId: "../unsafe" }),
    ]) {
      expect(() => analyzeMaterialExperimentMatrix({ policy: policy(), observations: [invalid] }))
        .toThrowError(expect.objectContaining({ code: "invalid_observation" }));
    }
  });

  it("supports an explicit exposure denominator without assuming click attribution", () => {
    const exposurePolicy = policy({
      conversionRateDenominator: "exposure",
      minClicks: 0,
      minRealConversions: 1,
    });
    const facts = candidate({ material: "material-a", prefix: "a", click: 2, conversion: 4, cost: 40 });
    const result = analyzeMaterialExperimentMatrix({ policy: exposurePolicy, observations: facts });
    const cell = result.products[0]?.cells[0];

    expect(cell).toMatchObject({
      inferenceRateDenominator: "exposure",
      inferenceRate: { state: "finite", value: 0.04 },
    });
    expect(cell?.inferenceRateInterval95).not.toBeNull();
  });

  it("rejects a forged policy fingerprint before consuming facts", () => {
    const valid = policy();
    expect(() => analyzeMaterialExperimentMatrix({
      policy: { ...valid, fingerprint: "f".repeat(64) },
      observations: [observation()],
    })).toThrowError(expect.objectContaining({ code: "invalid_policy" }));
  });

  it("fails closed on fact, cell, aggregate-count, and aggregate-cost budgets", () => {
    expect(() => analyzeMaterialExperimentMatrix({
      policy: policy(),
      observations: Array.from({ length: 10_001 }, () => observation()),
    })).toThrowError(expect.objectContaining({ code: "resource_limit_exceeded" }));

    expect(() => analyzeMaterialExperimentMatrix({
      policy: policy(),
      observations: Array.from({ length: 1_001 }, (_, index) => observation({
        sourceFactId: `fact-${index}`,
        productVersionId: `product-${index}`,
        materialVersionId: `material-${index}`,
      })),
    })).toThrowError(expect.objectContaining({ code: "resource_limit_exceeded" }));

    expect(() => analyzeMaterialExperimentMatrix({
      policy: policy(),
      observations: [
        observation({ sourceFactId: "count-a", exposure: 1_000_000_000_000, click: 0, realConversion: 0, cost: 0 }),
        observation({ sourceFactId: "count-b", exposure: 1_000_000_000_000, click: 0, realConversion: 0, cost: 0 }),
      ],
    })).toThrowError(expect.objectContaining({ code: "resource_limit_exceeded" }));

    expect(() => analyzeMaterialExperimentMatrix({
      policy: policy(),
      observations: [
        observation({ sourceFactId: "cost-a", exposure: 0, click: 0, realConversion: 0, cost: 1_000_000_000_000_000 }),
        observation({ sourceFactId: "cost-b", exposure: 0, click: 0, realConversion: 0, cost: 1_000_000_000_000_000 }),
      ],
    })).toThrowError(expect.objectContaining({ code: "resource_limit_exceeded" }));
  });
});

describe("material experiment sample sufficiency", () => {
  it("reports every sample gap in a stable order", () => {
    const result = analyzeMaterialExperimentMatrix({
      policy: policy({
        minActiveDays: 3,
        minAccounts: 3,
        minExposure: 1_000,
        minClicks: 100,
        minRealConversions: 20,
        minCost: 500,
      }),
      observations: [observation({ exposure: 10, click: 2, realConversion: 0, cost: 10 })],
    });

    expect(result.products[0]?.cells[0]).toMatchObject({
      sampleStatus: "insufficient",
      exclusionReasons: [
        "insufficient_active_days",
        "insufficient_accounts",
        "insufficient_exposure",
        "insufficient_clicks",
        "insufficient_real_conversions",
        "insufficient_cost",
        "non_finite_real_cpa",
      ],
      realCpa: { state: "infinite", value: null },
    });
  });

  it("treats exact policy thresholds as sufficient", () => {
    const facts = candidate({ material: "material-a", prefix: "a", click: 10, conversion: 2, cost: 20 });
    const result = analyzeMaterialExperimentMatrix({ policy: policy(), observations: facts });

    expect(result.products[0]?.cells[0]).toMatchObject({
      activeDayCount: 2,
      accountCount: 2,
      exposure: 200,
      click: 20,
      realConversion: 4,
      cost: 40,
      sampleStatus: "sufficient",
      exclusionReasons: [],
    });
  });

  it("keeps zero-denominator ratios and intervals explicitly unavailable", () => {
    const result = analyzeMaterialExperimentMatrix({
      policy: policy({ minClicks: 0, minRealConversions: 0, minCost: 0 }),
      observations: [observation({ click: 0, realConversion: 0, cost: 0 })],
    });
    const cell = result.products[0]?.cells[0];

    expect(cell?.inferenceRate).toEqual({ state: "undefined", value: null });
    expect(cell?.inferenceRateInterval95).toBeNull();
    expect(cell?.realCpa).toEqual({ state: "undefined", value: null });
    expect(cell?.sampleStatus).toBe("insufficient");
    expect(cell?.exclusionReasons).toContain("non_finite_real_cpa");
  });
});

describe("material experiment product conclusion", () => {
  it("distinguishes no eligible sample from only one comparable candidate", () => {
    const insufficient = analyzeMaterialExperimentMatrix({
      policy: policy(),
      observations: [observation({ exposure: 10, click: 1, realConversion: 0, cost: 1 })],
    });
    const one = analyzeMaterialExperimentMatrix({
      policy: policy(),
      observations: candidate({ material: "material-a", prefix: "a", click: 20, conversion: 4, cost: 40 }),
    });

    expect(insufficient.products[0]?.conclusion).toEqual({
      status: "insufficient_sample",
      directionalLeaderMaterialVersionId: null,
      observedLeaderMaterialVersionId: null,
      cpaImprovementRate: null,
    });
    expect(one.products[0]?.conclusion).toEqual({
      status: "insufficient_candidates",
      directionalLeaderMaterialVersionId: null,
      observedLeaderMaterialVersionId: null,
      cpaImprovementRate: null,
    });
  });

  it("requires the configured CPA effect before interval separation", () => {
    const facts = [
      ...candidate({ material: "material-a", prefix: "a", click: 100, conversion: 50, cost: 49 }),
      ...candidate({ material: "material-b", prefix: "b", click: 100, conversion: 50, cost: 50 }),
    ];
    const result = analyzeMaterialExperimentMatrix({ policy: policy({ minCpaImprovementRate: 0.05 }), observations: facts });

    expect(result.products[0]?.conclusion).toMatchObject({
      status: "effect_too_small",
      directionalLeaderMaterialVersionId: "material-a",
      observedLeaderMaterialVersionId: null,
      cpaImprovementRate: 0.02,
    });
  });

  it("does not call a leader while CVR intervals overlap", () => {
    const facts = [
      ...candidate({ material: "material-a", prefix: "a", click: 100, conversion: 30, cost: 50 }),
      ...candidate({ material: "material-b", prefix: "b", click: 100, conversion: 25, cost: 60 }),
    ];
    const result = analyzeMaterialExperimentMatrix({ policy: policy(), observations: facts });

    expect(result.products[0]?.conclusion).toMatchObject({
      status: "intervals_overlap",
      directionalLeaderMaterialVersionId: "material-a",
      observedLeaderMaterialVersionId: null,
    });
  });

  it("returns an observed leader only when CPA and every CVR interval separate", () => {
    const facts = [
      ...candidate({ material: "material-a", prefix: "a", click: 100, conversion: 50, cost: 50 }),
      ...candidate({ material: "material-b", prefix: "b", click: 100, conversion: 10, cost: 50 }),
      ...candidate({ material: "material-c", prefix: "c", click: 100, conversion: 15, cost: 60 }),
    ];
    const result = analyzeMaterialExperimentMatrix({ policy: policy(), observations: facts });

    expect(result.products[0]?.conclusion).toMatchObject({
      status: "separated_observation",
      directionalLeaderMaterialVersionId: "material-a",
      observedLeaderMaterialVersionId: "material-a",
    });
    expect(result.products[0]?.conclusion.cpaImprovementRate).toBeGreaterThan(0.5);
  });

  it("uses stable material identity for equal CPA without claiming a leader", () => {
    const facts = [
      ...candidate({ material: "material-b", prefix: "b", click: 100, conversion: 20, cost: 40 }),
      ...candidate({ material: "material-a", prefix: "a", click: 100, conversion: 20, cost: 40 }),
    ];
    const result = analyzeMaterialExperimentMatrix({ policy: policy(), observations: facts });

    expect(result.products[0]?.conclusion).toEqual({
      status: "effect_too_small",
      directionalLeaderMaterialVersionId: "material-a",
      observedLeaderMaterialVersionId: null,
      cpaImprovementRate: 0,
    });
  });
});
