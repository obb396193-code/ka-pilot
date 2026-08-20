import { describe, expect, it } from "vitest";

import {
  MATERIAL_SIMILARITY_PROFILE_VERSION,
  MATERIAL_REPLICATION_LINEAGE_SCHEMA_VERSION,
  MaterialSimilarityError,
  compareMaterialSimilarityProfiles,
  createMaterialReplicationLineage,
  createMaterialSimilarityProfile,
} from "../src/material-similarity.js";
import type { MaterialTeardownResult, MaterialTeardownVisualSummary } from "../src/material-teardown.js";

const analysisSha = "a".repeat(64);
const sourceSha = "b".repeat(64);

function teardown(overrides: Partial<MaterialTeardownResult> = {}): MaterialTeardownResult {
  return {
    alignmentStatus: "unavailable_whole_video",
    summary: "先提出通勤痛点，再给出轻便耐用的解决方案。",
    hook: {
      kind: "question",
      text: "通勤路上总是手忙脚乱吗",
      evidenceIds: ["transcript-0000"],
    },
    sellingPoints: [
      { text: "轻便而且耐用", evidenceIds: ["transcript-0000"] },
      { text: "收纳空间充足", evidenceIds: ["transcript-0000"] },
    ],
    audiences: ["每天通勤的上班族", "需要轻装出行的人"],
    rhythm: {
      description: "前三秒快速提问，中段平稳展示卖点，结尾加速收口",
      evidenceIds: ["transcript-0000"],
    },
    cta: {
      text: "现在点击了解更多",
      evidenceIds: ["transcript-0000"],
    },
    semanticSections: [
      {
        order: 1,
        role: "hook",
        title: "问题钩子",
        description: "用通勤痛点抓住注意力",
        evidenceIds: ["transcript-0000"],
      },
      {
        order: 2,
        role: "selling_point",
        title: "利益承接",
        description: "展示轻便耐用和收纳能力",
        evidenceIds: ["transcript-0000"],
      },
      {
        order: 3,
        role: "cta",
        title: "行动引导",
        description: "邀请用户进一步了解",
        evidenceIds: ["transcript-0000"],
      },
    ],
    segments: [],
    replicationSuggestions: ["保留问题开场，替换具体通勤场景"],
    uncertainties: [],
    ...overrides,
  };
}

function visual(overrides: Partial<MaterialTeardownVisualSummary> = {}): MaterialTeardownVisualSummary {
  return {
    hardCutCount: 8,
    visualEventCount: 12,
    averageShotLengthMs: 1_250,
    hookVisualDensity: 0.6,
    ...overrides,
  };
}

function profile(overrides: Parameters<typeof createMaterialSimilarityProfile>[0] extends infer T
  ? Partial<T>
  : never = {}) {
  return createMaterialSimilarityProfile({
    materialVersionId: "material-version-001",
    teardownFingerprint: analysisSha,
    teardown: teardown(),
    visualSummary: visual(),
    ...overrides,
  });
}

describe("material similarity profile", () => {
  it("builds a bounded immutable profile with Chinese and Latin tokens", () => {
    const result = profile({
      teardown: teardown({
        sellingPoints: [
          { text: "轻便 durable 2.0", evidenceIds: ["transcript-0000"] },
        ],
      }),
    });

    expect(result.profileVersion).toBe(MATERIAL_SIMILARITY_PROFILE_VERSION);
    expect(result.semanticRoleSequence).toEqual(["hook", "selling_point", "cta"]);
    expect(result.textTokens.sellingPoints.length).toBeGreaterThan(0);
    expect(result.textTokens.sellingPoints.length).toBeLessThanOrEqual(512);
    expect(result.visual).toEqual({
      averageShotLengthMs: 1_250,
      hardCutDensity: 0.6667,
      hookVisualDensity: 0.6,
    });
    expect(result.fingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.textTokens.sellingPoints)).toBe(true);
  });

  it("keeps the fingerprint stable across input key order and source array order", () => {
    const first = profile();
    const original = teardown();
    const second = createMaterialSimilarityProfile({
      visualSummary: visual(),
      teardown: {
        ...original,
        audiences: [...original.audiences].reverse(),
        sellingPoints: [...original.sellingPoints].reverse(),
      },
      teardownFingerprint: analysisSha,
      materialVersionId: "material-version-001",
    });

    expect(second.fingerprint).toBe(first.fingerprint);
  });

  it("changes the fingerprint when semantic order or visual pacing changes", () => {
    const first = profile();
    const reversedSections = [...teardown().semanticSections]
      .reverse()
      .map((section, index) => ({ ...section, order: index + 1 }));

    expect(profile({ teardown: teardown({ semanticSections: reversedSections }) }).fingerprint)
      .not.toBe(first.fingerprint);
    expect(profile({ visualSummary: visual({ averageShotLengthMs: 2_000 }) }).fingerprint)
      .not.toBe(first.fingerprint);
  });

  it.each([
    { materialVersionId: "../unsafe" },
    { teardownFingerprint: "not-a-sha" },
    { profileVersion: "bad version" },
    { profileVersion: "2" },
    { visualSummary: visual({ hookVisualDensity: 2 }) },
    { visualSummary: visual({ hardCutCount: 13, visualEventCount: 12 }) },
    { unexpected: true },
  ])("rejects invalid or unknown profile input %#", (override) => {
    expect(() => createMaterialSimilarityProfile({
      materialVersionId: "material-version-001",
      teardownFingerprint: analysisSha,
      teardown: teardown(),
      visualSummary: visual(),
      ...override,
    } as never)).toThrow(MaterialSimilarityError);
  });
});

describe("material similarity comparison", () => {
  it("scores identical complete profiles as one with all components explained", () => {
    const left = profile();
    const right = profile({ materialVersionId: "material-version-002" });
    const result = compareMaterialSimilarityProfiles(left, right);

    expect(result.status).toBe("scored");
    expect(result.score).toBe(1);
    expect(result.comparableComponentCount).toBe(6);
    expect(result.comparableBaseWeight).toBe(1);
    expect(result.missingComponents).toEqual([]);
    expect(result.components.every((component) => component.status === "compared")).toBe(true);
    expect(result.fingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(Object.isFrozen(result.components)).toBe(true);
  });

  it("produces a monotonic text score for identical, partial, and disjoint selling points", () => {
    const base = profile();
    const partial = profile({
      materialVersionId: "material-version-002",
      teardown: teardown({
        sellingPoints: [{ text: "轻便收纳", evidenceIds: ["transcript-0000"] }],
      }),
    });
    const disjoint = profile({
      materialVersionId: "material-version-003",
      teardown: teardown({
        sellingPoints: [{ text: "高温烹饪快速清洁", evidenceIds: ["transcript-0000"] }],
      }),
    });

    const identicalScore = compareMaterialSimilarityProfiles(base, profile({ materialVersionId: "material-version-004" }));
    const partialScore = compareMaterialSimilarityProfiles(base, partial);
    const disjointScore = compareMaterialSimilarityProfiles(base, disjoint);

    expect(identicalScore.score).not.toBeNull();
    expect(partialScore.score).not.toBeNull();
    expect(disjointScore.score).not.toBeNull();
    expect(identicalScore.score as number).toBeGreaterThan(partialScore.score as number);
    expect(partialScore.score as number).toBeGreaterThan(disjointScore.score as number);
  });

  it("detects semantic role order changes independently of source list order", () => {
    const left = profile();
    const sections = teardown().semanticSections;
    const changedSections = [
      sections[0]!,
      sections[2]!,
      sections[1]!,
    ].map((section, index) => ({ ...section, order: index + 1 }));
    const right = profile({
      materialVersionId: "material-version-002",
      teardown: teardown({ semanticSections: changedSections }),
    });
    const result = compareMaterialSimilarityProfiles(left, right);
    const structure = result.components.find(({ kind }) => kind === "structure");

    expect(structure).toMatchObject({ status: "compared", reasonCode: "role_sequence_similarity" });
    expect(structure?.score).toBeLessThan(1);
  });

  it("removes missing components from the denominator and refuses sparse evidence", () => {
    const sparseTeardown = teardown({
      hook: { kind: "other", text: "钩子不确定", evidenceIds: ["transcript-0000"] },
      sellingPoints: [],
      audiences: [],
      semanticSections: [{
        order: 1,
        role: "other",
        title: "完整文稿",
        description: "仅能确认一般描述",
        evidenceIds: ["transcript-0000"],
      }],
    });
    const left = profile({ teardown: sparseTeardown });
    const right = profile({ materialVersionId: "material-version-002", teardown: sparseTeardown });
    const result = compareMaterialSimilarityProfiles(left, right);

    expect(result.status).toBe("insufficient_evidence");
    expect(result.score).toBeNull();
    expect(result.comparableComponentCount).toBe(2);
    expect(result.comparableBaseWeight).toBe(0.4);
    expect(result.missingComponents).toEqual(["hook", "selling_points", "audience", "cta"]);
  });

  it("rejects profile version drift and structurally forged profiles", () => {
    const left = profile();
    expect(() => compareMaterialSimilarityProfiles(left, {
      ...left,
      profileVersion: "2",
    })).toThrow(MaterialSimilarityError);
    expect(() => compareMaterialSimilarityProfiles(left, {
      ...left,
      fingerprint: "c".repeat(64),
    })).toThrow(MaterialSimilarityError);
  });

  it("keeps component scores and the comparison fingerprint symmetric", () => {
    const left = profile();
    const right = profile({
      materialVersionId: "material-version-002",
      teardown: teardown({
        audiences: ["通勤上班族"],
        sellingPoints: [{ text: "轻便收纳", evidenceIds: ["transcript-0000"] }],
      }),
      visualSummary: visual({ averageShotLengthMs: 1_500 }),
    });

    const forward = compareMaterialSimilarityProfiles(left, right);
    const backward = compareMaterialSimilarityProfiles(right, left);

    expect(backward).toEqual(forward);
  });
});

describe("material replication lineage", () => {
  const input = {
    sourceMaterialVersionId: "material-version-001",
    derivedMaterialVersionId: "material-version-002",
    method: "structure_adaptation" as const,
    sourceTeardownFingerprint: sourceSha,
    createdByUserId: "user-001",
    createdAt: "2026-08-21T00:00:00.000Z",
    note: "保留问题钩子，替换商品利益点",
  };

  it("creates a stable immutable lineage edge", () => {
    const first = createMaterialReplicationLineage(input, "2026-08-21T00:01:00.000Z");
    const second = createMaterialReplicationLineage({
      note: input.note,
      createdAt: input.createdAt,
      createdByUserId: input.createdByUserId,
      sourceTeardownFingerprint: input.sourceTeardownFingerprint,
      method: input.method,
      derivedMaterialVersionId: input.derivedMaterialVersionId,
      sourceMaterialVersionId: input.sourceMaterialVersionId,
    }, "2026-08-21T00:01:00.000Z");

    expect(first).toEqual(second);
    expect(first.schemaVersion).toBe(MATERIAL_REPLICATION_LINEAGE_SCHEMA_VERSION);
    expect(first.fingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(Object.isFrozen(first)).toBe(true);
  });

  it.each([
    { derivedMaterialVersionId: "material-version-001" },
    { sourceMaterialVersionId: "../unsafe" },
    { sourceTeardownFingerprint: "invalid" },
    { createdByUserId: "" },
    { createdAt: "2026-08-21T00:02:00.000Z" },
    { createdAt: "2026-08-21 00:00:00" },
    { note: "x".repeat(4_001) },
    { unexpected: true },
  ])("rejects invalid lineage %#", (override) => {
    expect(() => createMaterialReplicationLineage({
      ...input,
      ...override,
    } as never, "2026-08-21T00:01:00.000Z")).toThrow(MaterialSimilarityError);
  });
});
