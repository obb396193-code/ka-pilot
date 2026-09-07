import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  DEFAULT_DECISION_POLICY, decisionPolicySchema, decisionSchema, evaluateDecisionTier,
  type DecisionGates,
} from "../../src/r014/decision-tier-contract.js";
import { exportCreateSchema, exportQueuedSchema, exportRecordSchema } from "../../src/r014/export-contract.js";

const fixture = (name: string): { data: unknown } =>
  JSON.parse(readFileSync(new URL(`../../../contract/fixtures/${name}`, import.meta.url), "utf8"));

const finite = (value: number) => ({ value, state: "finite" as const });
const PASSING: DecisionGates = {
  confidence: finite(0.95),
  historicalSuccessRate: finite(0.9),
  recentManualOps: 0,
  reversible: true,
  withinCap: true,
};

describe("v1.5 10.11 decision tier", () => {
  it("parses the frozen work-item fixture and reproduces its verdict", () => {
    const decision = decisionSchema.parse((fixture("work-items/detail.json").data as { decision: unknown }).decision);
    expect(decision.tier).toBe("card_confirm");
    expect(decision.overriddenBy).toBeNull();
    const recomputed = evaluateDecisionTier({
      autonomyLevel: 3, gates: decision.gates, policy: DEFAULT_DECISION_POLICY,
    });
    expect(recomputed.tier).toBe("card_confirm");
    expect(recomputed.reason).toBe("置信度 <0.9，走确认卡");
  });

  it("grants auto only at autonomy level 3 with every gate passing", () => {
    expect(evaluateDecisionTier({ autonomyLevel: 3, gates: PASSING, policy: DEFAULT_DECISION_POLICY }).tier).toBe("auto");
    for (const level of [1, 2] as const) {
      const decision = evaluateDecisionTier({ autonomyLevel: level, gates: PASSING, policy: DEFAULT_DECISION_POLICY });
      expect(decision.tier).toBe("card_confirm");
      expect(decision.reason).toMatch(level === 1 ? /仅建议/ : /确认后执行/);
    }
  });

  it.each([
    ["confidence below the floor", { confidence: finite(0.89) }, /置信度 <0\.9/],
    ["success rate below the floor", { historicalSuccessRate: finite(0.79) }, /历史成功率 <0\.8/],
    ["a recent manual op", { recentManualOps: 1 }, /人工操作/],
    ["an irreversible action", { reversible: false }, /不可逆/],
    ["breaching the daily cap", { withinCap: false }, /单日影响金额上限/],
  ])("caps at card_confirm on %s", (_label, override, reason) => {
    const decision = evaluateDecisionTier({
      autonomyLevel: 3, gates: { ...PASSING, ...override }, policy: DEFAULT_DECISION_POLICY,
    });
    expect(decision.tier).toBe("card_confirm");
    expect(decision.reason).toMatch(reason);
  });

  it.each(["undefined", "infinite"] as const)("treats a %s confidence as failing, never as zero or as a pass", (state) => {
    const decision = evaluateDecisionTier({
      autonomyLevel: 3,
      gates: { ...PASSING, confidence: { value: null, state } },
      policy: DEFAULT_DECISION_POLICY,
    });
    expect(decision.tier).toBe("card_confirm");
    expect(decision.reason).toBe("置信度缺数，不自动执行");
  });

  it("parses the frozen policy fixture and rejects out-of-range thresholds", () => {
    const policy = (fixture("settings/decision-policy.json").data as { policy: unknown }).policy;
    expect(decisionPolicySchema.parse(policy)).toEqual({
      confidenceMin: 0.9, historicalSuccessRateMin: 0.8, recentManualOpsWindowHours: 24, dailyCapCny: 5000,
    });
    expect(() => decisionPolicySchema.parse({ ...DEFAULT_DECISION_POLICY, confidenceMin: 1.5 })).toThrow();
    expect(() => decisionPolicySchema.parse({ ...DEFAULT_DECISION_POLICY, recentManualOpsWindowHours: 0 })).toThrow();
    expect(() => decisionPolicySchema.parse({ ...DEFAULT_DECISION_POLICY, extra: 1 })).toThrow();
  });
});

describe("v1.5 7.4 exports", () => {
  it("parses the queued receipt fixture, which carries no file or error keys", () => {
    expect(exportQueuedSchema.parse(fixture("exports/queued.json").data))
      .toEqual({ exportId: "00000000-0000-4000-8000-000000001101", status: "queued", kind: "query", format: "xlsx" });
    // 详情 schema 对同一份数据也成立：缺省的 file/error 归 null，不是"完成但没文件"。
    expect(exportRecordSchema.parse(fixture("exports/queued.json").data))
      .toMatchObject({ status: "queued", file: null, error: null });
  });

  it("parses the finished detail fixture with its signed file", () => {
    const record = exportRecordSchema.parse(fixture("exports/done.json").data);
    expect(record.status).toBe("done");
    expect(record.file?.bytes).toBe(184320);
    expect(record.error).toBeNull();
  });

  it("requires kind and ref to agree", () => {
    expect(() => exportCreateSchema.parse({ kind: "query", ref: { queryId: "account.summary", params: {} }, format: "xlsx" })).not.toThrow();
    expect(() => exportCreateSchema.parse({ kind: "view", ref: { queryId: "account.summary", params: {} }, format: "xlsx" }))
      .toThrow(/does not match kind view/);
    expect(() => exportCreateSchema.parse({ kind: "report", ref: { viewId: "00000000-0000-4000-8000-000000001201" }, format: "pdf" }))
      .toThrow(/does not match kind report/);
  });

  it("never reports a finished export without a file, or a file before it finished", () => {
    const base = { exportId: "00000000-0000-4000-8000-000000001101", kind: "query" as const, format: "xlsx" as const };
    const file = { url: "https://example.internal/x", bytes: 1, expiresAt: "2026-09-05T09:25:00.000+08:00" };
    expect(() => exportRecordSchema.parse({ ...base, status: "done", file: null, error: null })).toThrow(/must carry its file/);
    expect(() => exportRecordSchema.parse({ ...base, status: "running", file, error: null })).toThrow(/only a finished export/);
    expect(() => exportRecordSchema.parse({ ...base, status: "failed", file: null, error: null })).toThrow(/must carry its error/);
    expect(() => exportRecordSchema.parse({ ...base, status: "queued", file: null, error: "boom" })).toThrow(/only a failed export/);
  });
});
