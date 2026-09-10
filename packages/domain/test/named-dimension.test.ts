import { describe, expect, it } from "vitest";
import { dimensionSourceSummarySchema, resolveNamedDimensions, summarizeDimensionSources } from "../src/named-dimension.js";

const segment = (key: string, value: string, mapsTo: string | null) => ({ key, value, mapsTo, taskIds: [] });
const input = () => ({ segments: { owner: segment("owner", "甲", "optimizer"), slot: segment("slot", "优选", "placement") },
  override: {}, nameMatches: true, ruleMappings: [
    { key: "owner", mapsTo: "optimizer", pending: false }, { key: "slot", mapsTo: "placement", pending: false },
    { key: "target", mapsTo: "goal", pending: false },
  ] });

describe("P211 stored naming evidence, not parsing current names again", () => {
  it("uses mapped segments and emits explicit missing dimensions", () => {
    expect(resolveNamedDimensions(input())).toEqual({ optimizer: { value: "甲", source: "nickname" },
      placement: { value: "优选", source: "nickname" }, goal: { value: null, source: null } });
  });
  it("manual override wins and can fill a segment absent from the old parse using its exact rule", () => {
    expect(resolveNamedDimensions({ ...input(), override: { owner: "乙", target: "唤端" } })).toEqual({
      optimizer: { value: "乙", source: "manual" }, goal: { value: "唤端", source: "manual" }, placement: { value: "优选", source: "nickname" },
    });
  });
  it("stale nickname is not reused but manual decisions survive a rename", () => {
    expect(resolveNamedDimensions({ ...input(), nameMatches: false, override: { owner: "乙" } })).toEqual({
      optimizer: { value: "乙", source: "manual" }, goal: { value: null, source: null }, placement: { value: null, source: null },
    });
  });
  it("pending rule segments never enter dimensions even if old mapsTo or manual values are present", () => {
    const value = input(); value.ruleMappings[0]!.pending = true;
    expect(resolveNamedDimensions({ ...value, override: { owner: "乙" } }).optimizer).toEqual({ value: null, source: null });
  });
  it("missing historical rule preserves proven mappings but cannot guess a new override mapping", () => {
    expect(resolveNamedDimensions({ ...input(), ruleMappings: null, override: { target: "唤端" } })).toEqual({
      optimizer: { value: "甲", source: "nickname" }, placement: { value: "优选", source: "nickname" }, goal: { value: null, source: null },
    });
  });
  it("does not mutate stored segments or infer a platform fallback", () => {
    const original = input(), before = structuredClone(original);
    resolveNamedDimensions({ ...original, override: { owner: "乙" } }); expect(original).toEqual(before);
    expect(resolveNamedDimensions({ segments: {}, override: {}, ruleMappings: [], nameMatches: true })).toEqual({
      optimizer: { value: null, source: null }, placement: { value: null, source: null }, goal: { value: null, source: null },
    });
  });
  it("ambiguous same-dimension mappings and mismatched rule maps fail closed", () => {
    expect(() => resolveNamedDimensions({ ...input(), segments: { ...input().segments, other: segment("other", "丙", "optimizer") } })).toThrow();
    const bad = input(); bad.ruleMappings[0]!.mapsTo = "goal";
    expect(() => resolveNamedDimensions(bad)).toThrow();
    expect(() => resolveNamedDimensions({ ...input(), ruleMappings: [...input().ruleMappings, input().ruleMappings[0]] })).toThrow();
  });
  it.each([{ nameMatches: "false" }, { segments: [] }, { override: { owner: 1 } }, { ruleMappings: [{ key: "owner", mapsTo: "optimizer", pending: "false" }] }, { workspaceId: "spoof" }])("rejects present-invalid or unknown field %j", patch => {
    expect(() => resolveNamedDimensions({ ...input(), ...patch })).toThrow();
  });
  it("counts account sources once, keeps mixed and unknown distinct", () => {
    expect(summarizeDimensionSources(["nickname", "nickname"])).toEqual({ source: "nickname", sources: { nickname: 2 } });
    expect(summarizeDimensionSources(["manual", "nickname"])).toEqual({ source: "mixed", sources: { manual: 1, nickname: 1 } });
    expect(summarizeDimensionSources([null, null])).toEqual({ source: null, sources: {} });
    expect(summarizeDimensionSources(["platform", "qihang"])).toEqual({ source: "mixed", sources: { platform: 1, qihang: 1 } });
    expect(summarizeDimensionSources([null, "nickname"])).toEqual({ source: "mixed", sources: { nickname: 1 } });
  });
  it("rejects invalid sources and excessive members", () => {
    expect(() => summarizeDimensionSources(["mixed"])).toThrow();
    expect(() => summarizeDimensionSources(Array(1001).fill(null))).toThrow();
    expect(summarizeDimensionSources([])).toEqual({ source: null, sources: {} });
  });
  it.each([
    { source: null, sources: { nickname: 1 } }, { source: "manual", sources: { nickname: 1 } },
    { source: "mixed", sources: {} }, { source: null, sources: { nickname: undefined } },
    { source: "mixed", sources: { manual: 600, nickname: 600 } },
  ])("rejects inconsistent public provenance %j", value => {
    expect(dimensionSourceSummarySchema.safeParse(value).success).toBe(false);
  });
});
