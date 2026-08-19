import { describe, expect, it } from "vitest";

import {
  applyDiagnosisSafety,
  buildFallbackDiagnosis,
  parseAgentDiagnosis,
  renderDiagnosisMarkdown,
  type AgentDiagnosis,
} from "../src/agent-diagnosis.js";

describe("Agent diagnosis schema and safety", () => {
  it("parses a structured diagnosis and validates evidence references", () => {
    expect(parseAgentDiagnosis(diagnosis()).status).toBe("ok");
    expect(() =>
      parseAgentDiagnosis(
        diagnosis({
          findings: [
            {
              severity: "warning",
              title: "成本升高",
              observation: "需要继续观察",
              evidenceRefs: ["missing-evidence"],
            },
          ],
        }),
      ),
    ).toThrow(/evidence/i);
  });

  it("downgrades unsafe bid and budget changes to investigation", () => {
    const result = applyDiagnosisSafety(
      parseAgentDiagnosis(
        diagnosis({
          actions: [
            changeAction("adjust_bid", "unit:alpha:bid", 100, 121),
            changeAction("adjust_budget", "account:alpha:budget", 100, 151),
          ],
        }),
      ),
      { recentlyFailedTargetKeys: [] },
    );

    expect(result.actions).toEqual([
      expect.objectContaining({ kind: "investigate", blockedReason: "bid_change_exceeds_20pct" }),
      expect.objectContaining({
        kind: "investigate",
        blockedReason: "budget_change_exceeds_50pct",
      }),
    ]);
  });

  it("downgrades a previously failed target even when the change is within limits", () => {
    const targetKey = "unit:alpha:bid";
    const result = applyDiagnosisSafety(
      parseAgentDiagnosis(diagnosis({ actions: [changeAction("adjust_bid", targetKey, 100, 95)] })),
      { recentlyFailedTargetKeys: [targetKey] },
    );
    expect(result.actions[0]).toMatchObject({
      kind: "investigate",
      blockedReason: "recent_execution_failure",
    });
  });

  it("renders Markdown deterministically from the structured result", () => {
    const parsed = parseAgentDiagnosis(diagnosis());
    const first = renderDiagnosisMarkdown(parsed);
    expect(renderDiagnosisMarkdown(parsed)).toBe(first);
    expect(first).toContain("成本升高");
    expect(first).toContain("消耗：100 元");
    expect(first).not.toContain("121");
  });

  it.each(["invalid_output", "timeout", "capability_missing"] as const)(
    "builds an explicit %s fallback instead of pretending the model succeeded",
    (reason) => {
      expect(buildFallbackDiagnosis({ reason, dataCutoffAt: "2026-08-19T10:00:00.000Z" })).toEqual(
        expect.objectContaining({ status: "fallback", fallbackReason: reason, actions: [] }),
      );
    },
  );

  it("rejects non-finite action numbers", () => {
    expect(() =>
      parseAgentDiagnosis(
        diagnosis({ actions: [changeAction("adjust_bid", "unit:alpha:bid", 100, Number.NaN)] }),
      ),
    ).toThrow();
  });
});

function diagnosis(overrides: Partial<AgentDiagnosis> = {}): AgentDiagnosis {
  return {
    status: "ok",
    headline: "账户需要观察",
    summary: "成本有上行迹象",
    confidence: 0.8,
    dataCutoffAt: "2026-08-19T10:00:00.000Z",
    evidence: [{ id: "cost", label: "消耗", displayValue: "100 元" }],
    findings: [
      {
        severity: "warning",
        title: "成本升高",
        observation: "当前只建议观察",
        evidenceRefs: ["cost"],
      },
    ],
    actions: [],
    ...overrides,
  };
}

function changeAction(
  kind: "adjust_bid" | "adjust_budget",
  targetKey: string,
  currentValue: number,
  proposedValue: number,
): AgentDiagnosis["actions"][number] {
  return {
    kind,
    title: kind === "adjust_bid" ? "调整出价" : "调整预算",
    reason: "基于成本表现",
    targetKey,
    currentValue,
    proposedValue,
    evidenceRefs: ["cost"],
  };
}
