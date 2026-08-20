import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  AssetGovernanceError,
  buildAssetGovernanceSummary,
  createGovernedAssetVersion,
  recordAssetValidation,
  transitionGovernedAsset,
  type GovernedAssetVersion,
  type GovernedAssetVersionInput,
} from "../src/asset-governance.js";

const workspaceId = "10000000-0000-4000-8000-000000000001";
const ownerId = "20000000-0000-4000-8000-000000000001";
const reviewerId = "20000000-0000-4000-8000-000000000002";
const definitionFingerprint = "a".repeat(64);

function input(overrides: Partial<GovernedAssetVersionInput> = {}): GovernedAssetVersionInput {
  return {
    workspaceId,
    assetId: "asset-report-001",
    versionId: "asset-report-001-v1",
    versionNumber: 1,
    assetType: "report",
    definitionFingerprint,
    ownerUserId: ownerId,
    maintainerUserIds: [reviewerId, ownerId],
    applicability: [
      { dimension: "channel", value: "kuaishou" },
      { dimension: "business", value: "cvr" },
    ],
    dependencies: [
      { dependencyType: "field", dependencyId: "cost_api", version: "v1" },
      { dependencyType: "data_source", dependencyId: "qihang-offline" },
    ],
    origin: { kind: "original" },
    changeSummary: "建立团队月报模板",
    createdAt: "2026-08-21T01:00:00.000Z",
    ...overrides,
  };
}

function created(overrides: Partial<GovernedAssetVersionInput> = {}): GovernedAssetVersion {
  return createGovernedAssetVersion(input(overrides), "2026-08-21T01:01:00.000Z");
}

function validatePassed(asset: GovernedAssetVersion, validationId = "validation-001") {
  return recordAssetValidation(asset, {
    validationId,
    assetVersionId: asset.versionId,
    definitionFingerprint: asset.definitionFingerprint,
    outcome: "passed",
    successfulRuns: 18,
    totalRuns: 20,
    businessEffect: "连续两周按相同口径复核",
    evidenceRefs: ["evidence:run-002", "evidence:run-001"],
    validatedByUserId: reviewerId,
    validatedAt: "2026-08-21T01:02:00.000Z",
  }, "2026-08-21T01:03:00.000Z");
}

function transition(
  asset: GovernedAssetVersion,
  toState: "shared" | "verified" | "official" | "deprecated",
  eventId: string,
  changedAt: string,
  extras: Record<string, unknown> = {},
) {
  return transitionGovernedAsset(asset, {
    eventId,
    toState,
    changedByUserId: reviewerId,
    changedAt,
    ...extras,
  }, "2026-08-21T02:00:00.000Z");
}

function officialAsset(): GovernedAssetVersion {
  let asset = created();
  asset = transition(asset, "shared", "event-share", "2026-08-21T01:01:30.000Z");
  asset = validatePassed(asset);
  asset = transition(asset, "verified", "event-verify", "2026-08-21T01:04:00.000Z");
  return transition(asset, "official", "event-official", "2026-08-21T01:05:00.000Z");
}

describe("asset governance", () => {
  it("creates a stable deeply immutable draft with normalized metadata", () => {
    const first = created();
    const source = input({
      maintainerUserIds: [ownerId, reviewerId, ownerId],
      applicability: [...input().applicability].reverse(),
      dependencies: [...input().dependencies].reverse(),
    });
    const second = createGovernedAssetVersion(source, "2026-08-21T01:01:00.000Z");

    expect(second).toEqual(first);
    expect(first.state).toBe("draft");
    expect(first.maintainerUserIds).toEqual([ownerId, reviewerId]);
    expect(first.fingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(Object.isFrozen(first.dependencies)).toBe(true);
  });

  it.each([
    { assetId: "../bad" },
    { versionNumber: 0 },
    { definitionFingerprint: "bad" },
    { ownerUserId: "not-a-uuid" },
    { createdAt: "2026-08-21 01:00:00" },
    { applicability: [] },
    { dependencies: [{ dependencyType: "asset", dependencyId: "asset-report-001", version: "v1" }] },
  ])("rejects invalid version input %#", (overrides) => {
    expect(() => created(overrides as Partial<GovernedAssetVersionInput>)).toThrowError(
      new AssetGovernanceError("invalid_asset"),
    );
  });

  it("rejects duplicate applicability and dependencies instead of silently hiding conflicts", () => {
    expect(() => created({ applicability: [input().applicability[0]!, input().applicability[0]!] }))
      .toThrowError(new AssetGovernanceError("invalid_asset"));
    expect(() => created({ dependencies: [input().dependencies[0]!, input().dependencies[0]!] }))
      .toThrowError(new AssetGovernanceError("invalid_asset"));
  });

  it("requires copied and new versions to carry a distinct source reference", () => {
    const copied = created({
      assetId: "asset-copy",
      versionId: "asset-copy-v1",
      origin: {
        kind: "copied",
        source: { assetType: "report", assetId: "report-source", versionId: "report-source-v2" },
      },
    });
    expect(copied.origin.kind).toBe("copied");
    expect(() => created({ origin: { kind: "copied", source: {
      assetType: "report", assetId: "asset-report-001", versionId: "asset-report-001-v1",
    } } })).toThrowError(new AssetGovernanceError("invalid_asset"));
    const next = created({
      versionId: "asset-report-001-v2",
      versionNumber: 2,
      origin: {
        kind: "new_version",
        source: { assetType: "report", assetId: "asset-report-001", versionId: "asset-report-001-v1" },
      },
    });
    expect(next.versionNumber).toBe(2);
    expect(() => created({
      assetId: "asset-copy",
      versionId: "asset-copy-v2",
      versionNumber: 2,
      origin: {
        kind: "copied",
        source: { assetType: "report", assetId: "report-source", versionId: "report-source-v1" },
      },
    })).toThrowError(new AssetGovernanceError("invalid_asset"));
  });

  it("records validations deterministically and calculates an explicit success rate", () => {
    const validated = validatePassed(created());
    expect(validated.validations).toHaveLength(1);
    expect(validated.validations[0]?.successRate).toBe(0.9);
    expect(validated.validations[0]?.evidenceRefs).toEqual(["evidence:run-001", "evidence:run-002"]);
  });

  it("allows a qualitative validation without inventing a success rate", () => {
    const draft = created();
    const asset = recordAssetValidation(draft, {
      validationId: "validation-qualitative",
      assetVersionId: draft.versionId,
      definitionFingerprint,
      outcome: "passed",
      businessEffect: "负责人按清单完成口径验收",
      evidenceRefs: ["evidence:review-001"],
      validatedByUserId: reviewerId,
      validatedAt: "2026-08-21T01:02:00.000Z",
    }, "2026-08-21T01:03:00.000Z");
    expect(asset.validations[0]?.successRate).toBeNull();
  });

  it.each([
    { assetVersionId: "another-version" },
    { definitionFingerprint: "b".repeat(64) },
    { successfulRuns: 2, totalRuns: 1 },
    { successfulRuns: 1, totalRuns: undefined },
    { businessEffect: undefined, successfulRuns: undefined, totalRuns: undefined },
    { validatedAt: "2026-08-21T00:59:00.000Z" },
  ])("rejects invalid validation evidence %#", (overrides) => {
    const base = {
      validationId: "validation-bad",
      assetVersionId: "asset-report-001-v1",
      definitionFingerprint,
      outcome: "passed" as const,
      successfulRuns: 1,
      totalRuns: 1,
      businessEffect: "有效",
      evidenceRefs: ["evidence:1"],
      validatedByUserId: reviewerId,
      validatedAt: "2026-08-21T01:02:00.000Z",
    };
    expect(() => recordAssetValidation(created(), { ...base, ...overrides }, "2026-08-21T01:03:00.000Z"))
      .toThrowError(new AssetGovernanceError("invalid_validation"));
  });

  it("treats an identical validation event as idempotent and rejects an event-id conflict", () => {
    const first = validatePassed(created());
    const same = validatePassed(first);
    expect(same).toEqual(first);
    expect(() => recordAssetValidation(first, {
      validationId: first.validations[0]!.validationId,
      assetVersionId: first.validations[0]!.assetVersionId,
      definitionFingerprint: first.validations[0]!.definitionFingerprint,
      outcome: "failed",
      successfulRuns: first.validations[0]!.successfulRuns,
      totalRuns: first.validations[0]!.totalRuns,
      businessEffect: first.validations[0]!.businessEffect,
      evidenceRefs: first.validations[0]!.evidenceRefs,
      validatedByUserId: first.validations[0]!.validatedByUserId,
      validatedAt: first.validations[0]!.validatedAt,
    }, "2026-08-21T01:03:00.000Z")).toThrowError(
      new AssetGovernanceError("conflicting_validation"),
    );
  });

  it("enforces the five-stage lifecycle and requires current passed evidence for verification", () => {
    let asset = created();
    asset = transition(asset, "shared", "event-share", "2026-08-21T01:01:30.000Z");
    expect(() => transition(asset, "verified", "event-verify", "2026-08-21T01:04:00.000Z"))
      .toThrowError(new AssetGovernanceError("missing_passed_validation"));
    asset = validatePassed(asset);
    asset = transition(asset, "verified", "event-verify", "2026-08-21T01:04:00.000Z");
    asset = transition(asset, "official", "event-official", "2026-08-21T01:05:00.000Z");
    expect(asset.state).toBe("official");
    expect(asset.lifecycleEvents.map(({ toState }) => toState)).toEqual(["shared", "verified", "official"]);
  });

  it("does not let an older pass override the latest failed validation", () => {
    let asset = transition(created(), "shared", "event-share", "2026-08-21T01:01:30.000Z");
    asset = validatePassed(asset);
    asset = recordAssetValidation(asset, {
      validationId: "validation-002",
      assetVersionId: asset.versionId,
      definitionFingerprint,
      outcome: "failed",
      successfulRuns: 2,
      totalRuns: 10,
      evidenceRefs: ["evidence:run-failed"],
      validatedByUserId: reviewerId,
      validatedAt: "2026-08-21T01:03:00.000Z",
    }, "2026-08-21T01:03:30.000Z");
    expect(() => transition(asset, "verified", "event-verify", "2026-08-21T01:04:00.000Z"))
      .toThrowError(new AssetGovernanceError("missing_passed_validation"));
  });

  it("rejects skips, stale times and unsupported backward transitions", () => {
    expect(() => transition(created(), "verified", "event-skip", "2026-08-21T01:02:00.000Z"))
      .toThrowError(new AssetGovernanceError("invalid_transition"));
    const shared = transition(created(), "shared", "event-share", "2026-08-21T01:02:00.000Z");
    expect(() => transition(shared, "shared", "event-repeat", "2026-08-21T01:03:00.000Z"))
      .toThrowError(new AssetGovernanceError("invalid_transition"));
    expect(() => transition(shared, "verified", "event-old", "2026-08-21T01:00:00.000Z"))
      .toThrowError(new AssetGovernanceError("invalid_transition"));
  });

  it("makes lifecycle retries idempotent and rejects conflicting event ids", () => {
    const asset = created();
    const shared = transition(asset, "shared", "event-share", "2026-08-21T01:02:00.000Z");
    const same = transition(shared, "shared", "event-share", "2026-08-21T01:02:00.000Z");
    expect(same).toEqual(shared);
    expect(() => transition(shared, "verified", "event-share", "2026-08-21T01:02:00.000Z"))
      .toThrowError(new AssetGovernanceError("conflicting_transition"));
  });

  it("requires a reason when deprecating and records a non-self replacement", () => {
    const asset = officialAsset();
    expect(() => transition(asset, "deprecated", "event-deprecate", "2026-08-21T01:06:00.000Z"))
      .toThrowError(new AssetGovernanceError("invalid_transition"));
    const deprecated = transition(asset, "deprecated", "event-deprecate", "2026-08-21T01:06:00.000Z", {
      reason: "已由新版月报替代",
      replacement: { assetType: "report", assetId: "asset-report-002", versionId: "asset-report-002-v1" },
    });
    expect(deprecated.deprecation?.reason).toBe("已由新版月报替代");
    expect(buildAssetGovernanceSummary(deprecated, [], "2026-08-21T02:00:00.000Z").deprecation)
      .toEqual(deprecated.deprecation);
    expect(() => transition(asset, "deprecated", "event-self", "2026-08-21T01:06:00.000Z", {
      reason: "错误替代",
      replacement: { assetType: "report", assetId: asset.assetId, versionId: asset.versionId },
    })).toThrowError(new AssetGovernanceError("invalid_transition"));
  });

  it("does not append validation evidence after a version is deprecated", () => {
    const asset = transition(officialAsset(), "deprecated", "event-deprecate", "2026-08-21T01:06:00.000Z", {
      reason: "停止维护",
    });
    expect(() => validatePassed(asset, "validation-after-deprecation"))
      .toThrowError(new AssetGovernanceError("invalid_validation"));
  });

  it("aggregates explicit usage facts with user dedupe, frequency and recency", () => {
    const asset = officialAsset();
    const summary = buildAssetGovernanceSummary(asset, [
      { usageId: "usage-002", assetVersionId: asset.versionId, definitionFingerprint, userId: ownerId, usedAt: "2026-08-21T01:08:00.000Z" },
      { usageId: "usage-001", assetVersionId: asset.versionId, definitionFingerprint, userId: ownerId, usedAt: "2026-08-21T01:07:00.000Z" },
      { usageId: "usage-003", assetVersionId: asset.versionId, definitionFingerprint, userId: reviewerId, usedAt: "2026-08-21T01:09:00.000Z" },
      { usageId: "usage-001", assetVersionId: asset.versionId, definitionFingerprint, userId: ownerId, usedAt: "2026-08-21T01:07:00.000Z" },
    ], "2026-08-21T02:00:00.000Z");
    expect(summary.usage).toEqual({ userCount: 2, usageCount: 3, lastUsedAt: "2026-08-21T01:09:00.000Z" });
    expect(summary.latestValidation?.successRate).toBe(0.9);
    expect(summary.fingerprint).toMatch(/^[a-f0-9]{64}$/);
  });

  it("rejects conflicting usage ids and future usage instead of guessing", () => {
    const asset = officialAsset();
    expect(() => buildAssetGovernanceSummary(asset, [
      { usageId: "usage-001", assetVersionId: asset.versionId, definitionFingerprint, userId: ownerId, usedAt: "2026-08-21T01:07:00.000Z" },
      { usageId: "usage-001", assetVersionId: asset.versionId, definitionFingerprint, userId: reviewerId, usedAt: "2026-08-21T01:07:00.000Z" },
    ], "2026-08-21T02:00:00.000Z")).toThrowError(new AssetGovernanceError("conflicting_usage"));
    expect(() => buildAssetGovernanceSummary(asset, [
      { usageId: "usage-future", assetVersionId: asset.versionId, definitionFingerprint, userId: ownerId, usedAt: "2026-08-22T01:00:00.000Z" },
    ], "2026-08-21T02:00:00.000Z")).toThrowError(new AssetGovernanceError("invalid_usage"));
    expect(() => buildAssetGovernanceSummary(asset, [
      { usageId: "usage-wrong-version", assetVersionId: "another-version", definitionFingerprint, userId: ownerId, usedAt: "2026-08-21T01:07:00.000Z" },
    ], "2026-08-21T02:00:00.000Z")).toThrowError(new AssetGovernanceError("invalid_usage"));
  });

  it("returns zero usage rather than fabricating adoption", () => {
    expect(buildAssetGovernanceSummary(created(), [], "2026-08-21T02:00:00.000Z").usage)
      .toEqual({ userCount: 0, usageCount: 0, lastUsedAt: null });
  });

  it("detects nested semantic tampering even when the caller recomputes the outer fingerprint", () => {
    const asset = officialAsset();
    const tampered = structuredClone(asset) as GovernedAssetVersion;
    (tampered as { validations: Array<{ outcome: string }> }).validations[0]!.outcome = "failed";
    (tampered as { fingerprint: string }).fingerprint = fingerprintWithoutOuterHash(tampered);
    expect(() => buildAssetGovernanceSummary(tampered, [], "2026-08-21T02:00:00.000Z"))
      .toThrowError(new AssetGovernanceError("invalid_asset"));
  });
});

function fingerprintWithoutOuterHash(asset: GovernedAssetVersion): string {
  const body = Object.fromEntries(Object.entries(asset).filter(([key]) => key !== "fingerprint"));
  return createHash("sha256").update(JSON.stringify(sortCanonical(body))).digest("hex");
}

function sortCanonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortCanonical);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, sortCanonical(item)]));
  }
  return value;
}
