import { describe, expect, it } from "vitest";

import { AgentDiagnosisService } from "../../src/agent/diagnosis-service.js";
import type { AssembledAgentContext } from "../../src/agent/context-assembler.js";

describe("AgentDiagnosisService", () => {
  it("anchors evidence to authoritative facts and downgrades unsafe adjustments", () => {
    const service = new AgentDiagnosisService();
    const result = service.finalize({
      runtimeResult: {
        outcome: "success",
        finalText: "untrusted prose",
        structuredOutput: diagnosisOutput(),
        estimatedCostUsd: 0.02,
        unknownMessageCount: 0,
      },
      context: assembledContext(),
      recentlyFailedTargetKeys: [],
    });

    expect(result.usedFallback).toBe(false);
    expect(result.diagnosis.dataCutoffAt).toBe("2026-08-18T16:00:00.000Z");
    expect(result.diagnosis.evidence).toEqual([
      { id: "account.cost", label: "累计消耗", displayValue: "¥100.00" },
    ]);
    expect(result.diagnosis.actions[0]).toMatchObject({
      kind: "investigate",
      blockedReason: "bid_change_exceeds_20pct",
    });
    expect(result.markdown).toContain("数据截至：2026-08-18T16:00:00.000Z");
    expect(result.summary).toBe("diagnosis_completed");
  });

  it("uses an explicit fallback when output cites fabricated evidence", () => {
    const service = new AgentDiagnosisService();
    const output = diagnosisOutput();
    output.evidence = [{ id: "made-up", label: "伪造", displayValue: "999" }];
    output.findings = [];
    output.actions = [];

    const result = service.finalize({
      runtimeResult: {
        outcome: "success",
        finalText: "",
        structuredOutput: output,
        estimatedCostUsd: 0,
        unknownMessageCount: 0,
      },
      context: assembledContext(),
      recentlyFailedTargetKeys: [],
    });

    expect(result.usedFallback).toBe(true);
    expect(result.diagnosis).toMatchObject({ status: "fallback", fallbackReason: "invalid_output" });
    expect(result.summary).toBe("diagnosis_fallback_invalid_output");
  });

  it("distinguishes runtime timeout and provider capability fallback", () => {
    const service = new AgentDiagnosisService();
    const timeout = service.finalize({
      runtimeResult: {
        outcome: "error",
        code: "timeout",
        estimatedCostUsd: 0,
        unknownMessageCount: 0,
      },
      context: assembledContext(),
      recentlyFailedTargetKeys: [],
    });
    const capability = service.fallback("capability_missing", assembledContext());

    expect(timeout.diagnosis.fallbackReason).toBe("timeout");
    expect(capability.diagnosis.fallbackReason).toBe("capability_missing");
  });
});

function diagnosisOutput() {
  return {
    status: "ok" as const,
    headline: "账户成本上升",
    summary: "消耗稳定，但成本需要关注。",
    confidence: 0.8,
    dataCutoffAt: "2026-08-19T03:00:00.000Z",
    evidence: [{ id: "account.cost", label: "模型改写标签", displayValue: "模型改写值" }],
    findings: [
      {
        severity: "warning" as const,
        title: "成本偏高",
        observation: "成本超过目标。",
        evidenceRefs: ["account.cost"],
      },
    ],
    actions: [
      {
        kind: "adjust_bid" as const,
        title: "降低出价",
        reason: "控制成本",
        targetKey: "account:account-alpha",
        evidenceRefs: ["account.cost"],
        currentValue: 10,
        proposedValue: 7,
      },
    ],
  };
}

function assembledContext(): AssembledAgentContext {
  return {
    session: { id: "session-alpha", pageContext: null },
    messages: [],
    objects: [
      {
        ref: { kind: "account", id: "account-alpha" },
        title: "测试账户",
        facts: [
          {
            evidenceId: "account.cost",
            label: "累计消耗",
            displayValue: "¥100.00",
            value: 100,
            metricKey: "cost",
            definition: "canonical_metrics.cost",
            dataCutoffAt: "2026-08-18T16:00:00.000Z",
          },
        ],
      },
    ],
    memories: [],
    evidenceIds: ["account.cost"],
    dataCutoffAt: "2026-08-18T16:00:00.000Z",
    promptContext: "{}",
  };
}
