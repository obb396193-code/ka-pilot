import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  MaterialDesignBriefError,
  assessMaterialBriefBacktestReadiness,
  createMaterialDesignBrief,
  normalizeMaterialBriefDeliveries,
  type MaterialDesignBriefInput,
} from "../src/material-design-brief.js";
import {
  analyzeMaterialExperimentMatrix,
  createMaterialExperimentPolicy,
  type MaterialExperimentObservation,
} from "../src/material-experiment.js";
import { createMaterialReplicationLineage } from "../src/material-similarity.js";

const teardownSha = "a".repeat(64);
const profileSha = "b".repeat(64);
const policyShaFallback = "c".repeat(64);

function briefInput(overrides: Partial<MaterialDesignBriefInput> = {}): MaterialDesignBriefInput {
  return {
    briefId: "brief-001",
    briefVersion: "brief-v1",
    productVersionId: "product-001",
    sourceMaterialVersionId: "material-source",
    sourceTeardownFingerprint: teardownSha,
    sourceProfileFingerprint: profileSha,
    objective: "验证问题钩子在保持核心卖点时能否提升素材表现",
    globalConstraints: ["商品与价格不变", "不得使用无依据功效描述"],
    variants: [
      {
        variantKey: "hook-question",
        changeDimension: "hook",
        hypothesis: "把陈述开场改成问题开场可提高注意力",
        instruction: "首句使用通勤痛点问题，其余卖点顺序不变",
        keepDimensions: ["selling_point", "cta"],
      },
      {
        variantKey: "cta-short",
        changeDimension: "cta",
        hypothesis: "缩短行动号召可以降低结尾流失",
        instruction: "只缩短 CTA，不改变钩子和卖点",
        keepDimensions: ["hook", "selling_point"],
      },
    ],
    experimentPolicyFingerprint: policyShaFallback,
    createdByUserId: "user-001",
    createdAt: "2026-08-21T00:00:00.000Z",
    ...overrides,
  };
}

function brief(overrides: Partial<MaterialDesignBriefInput> = {}) {
  return createMaterialDesignBrief(briefInput(overrides), "2026-08-21T00:01:00.000Z");
}

function lineage(derived: string, createdAt = "2026-08-21T00:02:00.000Z") {
  return createMaterialReplicationLineage({
    sourceMaterialVersionId: "material-source",
    derivedMaterialVersionId: derived,
    method: "structure_adaptation",
    sourceTeardownFingerprint: teardownSha,
    createdByUserId: "user-001",
    createdAt,
  }, "2026-08-21T00:03:00.000Z");
}

function deliveries(inputBrief = brief()) {
  return normalizeMaterialBriefDeliveries(inputBrief, [
    {
      variantKey: "hook-question",
      lineage: lineage("material-hook"),
      deliveredAt: "2026-08-21T00:04:00.000Z",
    },
    {
      variantKey: "cta-short",
      lineage: lineage("material-cta"),
      deliveredAt: "2026-08-21T00:04:00.000Z",
    },
  ], "2026-08-21T00:05:00.000Z");
}

function experimentPolicy(policyVersion = "brief-test-v1") {
  return createMaterialExperimentPolicy({
    policyVersion,
    minActiveDays: 1,
    minAccounts: 1,
    minExposure: 10,
    minClicks: 5,
    minRealConversions: 1,
    minCost: 1,
    minCpaImprovementRate: 0.1,
    conversionRateDenominator: "click",
  });
}

function fact(materialVersionId: string, overrides: Partial<MaterialExperimentObservation> = {}) {
  return {
    sourceFactId: `fact-${materialVersionId}`,
    productVersionId: "product-001",
    materialVersionId,
    accountId: "account-001",
    dataDate: "2026-08-21",
    exposure: 100,
    click: 20,
    realConversion: 4,
    cost: 20,
    ...overrides,
  };
}

function fingerprint(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

describe("material design brief", () => {
  it("normalizes unordered constraints, variants and keep dimensions into a stable immutable brief", () => {
    const first = brief();
    const input = briefInput();
    const second = createMaterialDesignBrief({
      ...input,
      globalConstraints: [...input.globalConstraints].reverse(),
      variants: [...input.variants].reverse().map((variant) => ({
        ...variant,
        keepDimensions: [...variant.keepDimensions].reverse(),
      })),
    }, "2026-08-21T00:01:00.000Z");

    expect(second).toEqual(first);
    expect(first.variants.map(({ variantKey }) => variantKey)).toEqual(["cta-short", "hook-question"]);
    expect(first.fingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(Object.isFrozen(first.variants)).toBe(true);
  });

  it.each([
    { briefId: "../unsafe" },
    { sourceTeardownFingerprint: "bad" },
    { createdAt: "2026-08-21T00:02:00.000Z" },
    { variants: [] },
    { variants: [{ ...briefInput().variants[0]!, keepDimensions: ["hook"] }] },
    { variants: [briefInput().variants[0]!, { ...briefInput().variants[0]! }] },
    { globalConstraints: ["same", "same"] },
    { unexpected: true },
  ])("rejects invalid brief %#", (override) => {
    expect(() => createMaterialDesignBrief({ ...briefInput(), ...override } as never, "2026-08-21T00:01:00.000Z"))
      .toThrow(MaterialDesignBriefError);
  });
});

describe("material brief deliveries", () => {
  it("binds every delivery to a declared variant and verified replication lineage", () => {
    const inputBrief = brief();
    const result = deliveries(inputBrief);

    expect(result.briefFingerprint).toBe(inputBrief.fingerprint);
    expect(result.deliveries.map(({ variantKey }) => variantKey)).toEqual(["cta-short", "hook-question"]);
    expect(result.deliveries[0]).toMatchObject({
      variantKey: "cta-short",
      derivedMaterialVersionId: "material-cta",
    });
    expect(Object.isFrozen(result.deliveries)).toBe(true);
  });

  it("deduplicates exact retries but rejects variant, material, lineage and time conflicts", () => {
    const inputBrief = brief();
    const one = {
      variantKey: "hook-question",
      lineage: lineage("material-hook"),
      deliveredAt: "2026-08-21T00:04:00.000Z",
    };
    expect(normalizeMaterialBriefDeliveries(inputBrief, [one, one], "2026-08-21T00:05:00.000Z").deliveries)
      .toHaveLength(1);

    const invalidInputs = [
      [{ ...one, variantKey: "missing" }],
      [{ ...one, deliveredAt: "2026-08-21T00:01:00.000Z" }],
      [one, { ...one, lineage: lineage("material-other") }],
      [one, { ...one, variantKey: "cta-short" }],
      [{ ...one, lineage: createMaterialReplicationLineage({
        sourceMaterialVersionId: "another-source",
        derivedMaterialVersionId: "material-hook",
        method: "structure_adaptation",
        sourceTeardownFingerprint: teardownSha,
        createdByUserId: "user-001",
        createdAt: "2026-08-21T00:02:00.000Z",
      }, "2026-08-21T00:03:00.000Z") }],
    ];
    for (const items of invalidInputs) {
      expect(() => normalizeMaterialBriefDeliveries(inputBrief, items as never, "2026-08-21T00:05:00.000Z"))
        .toThrow(MaterialDesignBriefError);
    }
  });
});

describe("material brief backtest readiness", () => {
  it("stays awaiting delivery before checking samples", () => {
    const inputBrief = brief();
    const partial = normalizeMaterialBriefDeliveries(inputBrief, [{
      variantKey: "hook-question",
      lineage: lineage("material-hook"),
      deliveredAt: "2026-08-21T00:04:00.000Z",
    }], "2026-08-21T00:05:00.000Z");
    const result = assessMaterialBriefBacktestReadiness({
      brief: inputBrief,
      deliverySet: partial,
      experiment: analyzeMaterialExperimentMatrix({ policy: experimentPolicy(), observations: [] }),
    });

    expect(result).toMatchObject({
      status: "awaiting_delivery",
      missingVariantKeys: ["cta-short"],
      insufficientMaterialVersionIds: [],
    });
  });

  it("requires the same experiment policy and product", () => {
    const policy = experimentPolicy();
    const inputBrief = brief({ experimentPolicyFingerprint: policy.fingerprint });
    const deliverySet = deliveries(inputBrief);
    const wrongPolicy = experimentPolicy("other");

    expect(() => assessMaterialBriefBacktestReadiness({
      brief: inputBrief,
      deliverySet,
      experiment: analyzeMaterialExperimentMatrix({ policy: wrongPolicy, observations: [] }),
    })).toThrow(MaterialDesignBriefError);
  });

  it("distinguishes missing or insufficient samples from ready", () => {
    const policy = experimentPolicy();
    const inputBrief = brief({ experimentPolicyFingerprint: policy.fingerprint });
    const deliverySet = deliveries(inputBrief);
    const awaiting = assessMaterialBriefBacktestReadiness({
      brief: inputBrief,
      deliverySet,
      experiment: analyzeMaterialExperimentMatrix({
        policy,
        observations: [fact("material-hook"), fact("material-cta", { click: 1, realConversion: 0, cost: 1 })],
      }),
    });
    const ready = assessMaterialBriefBacktestReadiness({
      brief: inputBrief,
      deliverySet,
      experiment: analyzeMaterialExperimentMatrix({
        policy,
        observations: [fact("material-hook"), fact("material-cta")],
      }),
    });

    expect(awaiting).toMatchObject({
      status: "awaiting_sample",
      missingVariantKeys: [],
      insufficientMaterialVersionIds: ["material-cta"],
    });
    expect(ready).toMatchObject({
      status: "ready",
      missingVariantKeys: [],
      insufficientMaterialVersionIds: [],
    });
    expect(ready.fingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(Object.isFrozen(ready)).toBe(true);
  });

  it("rejects semantically forged delivery sets and duplicate experiment objects", () => {
    const policy = experimentPolicy();
    const inputBrief = brief({ experimentPolicyFingerprint: policy.fingerprint });
    const deliverySet = deliveries(inputBrief);
    const forgedDeliveryBody = {
      schemaVersion: deliverySet.schemaVersion,
      briefFingerprint: deliverySet.briefFingerprint,
      deliveries: [{ ...deliverySet.deliveries[0]!, variantKey: "undeclared" }],
    };
    const forgedDeliverySet = { ...forgedDeliveryBody, fingerprint: fingerprint(forgedDeliveryBody) };
    expect(() => assessMaterialBriefBacktestReadiness({
      brief: inputBrief,
      deliverySet: forgedDeliverySet as never,
      experiment: analyzeMaterialExperimentMatrix({ policy, observations: [] }),
    })).toThrow(MaterialDesignBriefError);

    const experiment = analyzeMaterialExperimentMatrix({
      policy,
      observations: [fact("material-hook"), fact("material-cta")],
    });
    const duplicateBody = {
      policyFingerprint: experiment.policyFingerprint,
      products: [experiment.products[0]!, experiment.products[0]!],
    };
    const duplicateExperiment = { ...duplicateBody, fingerprint: fingerprint(duplicateBody) };
    expect(() => assessMaterialBriefBacktestReadiness({
      brief: inputBrief,
      deliverySet,
      experiment: duplicateExperiment as never,
    })).toThrow(MaterialDesignBriefError);
  });
});
