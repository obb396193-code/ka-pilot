import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  WorkflowTriggerDiagnosticError,
  buildWorkflowTriggerDiagnostic,
  parseWorkflowTriggerDiagnostic,
  type WorkflowTriggerEvaluationInput,
} from "../src/workflow-trigger-diagnostic.js";

const workspaceId = "10000000-0000-4000-8000-000000000001";

function input(overrides: Partial<WorkflowTriggerEvaluationInput> = {}): WorkflowTriggerEvaluationInput {
  return {
    evaluationId: "evaluation-001",
    workspaceId,
    workflowId: "workflow-001",
    workflowVersionId: "workflow-001-v3",
    triggerId: "hourly-scan",
    evaluatedAt: "2026-08-21T02:00:00.000Z",
    dataCutoffAt: "2026-08-21T01:55:00.000Z",
    checks: [
      {
        order: 1,
        reasonCode: "data_not_ready",
        outcome: "passed",
        checkedAt: "2026-08-21T01:59:00.000Z",
        evidenceRefs: ["health:latest"],
      },
      {
        order: 2,
        reasonCode: "insufficient_sample",
        outcome: "blocked",
        checkedAt: "2026-08-21T01:59:30.000Z",
        evidenceRefs: ["sample:account-day"],
        retryAt: "2026-08-21T03:00:00.000Z",
      },
      {
        order: 3,
        reasonCode: "cooldown_active",
        outcome: "not_evaluated",
        checkedAt: "2026-08-21T01:59:31.000Z",
        evidenceRefs: [],
      },
    ],
    ...overrides,
  };
}

describe("workflow trigger diagnostic", () => {
  it("builds a stable blocked diagnostic with primary reason and next action", () => {
    const first = buildWorkflowTriggerDiagnostic(input(), "2026-08-21T02:01:00.000Z");
    const secondInput = input();
    const second = buildWorkflowTriggerDiagnostic({
      ...secondInput,
      checks: [...secondInput.checks].reverse(),
    }, "2026-08-21T02:01:00.000Z");
    expect(second).toEqual(first);
    expect(first.status).toBe("blocked");
    expect(first.primaryBlocker).toMatchObject({
      reasonCode: "insufficient_sample",
      nextActionCode: "wait_for_sample",
      retryAt: "2026-08-21T03:00:00.000Z",
    });
    expect(first.blockingChecks).toHaveLength(1);
    expect(Object.isFrozen(first.checks)).toBe(true);
  });

  it("returns eligible only when every configured gate passed", () => {
    const value = input();
    const diagnostic = buildWorkflowTriggerDiagnostic({
      ...value,
      checks: value.checks.slice(0, 1),
    }, "2026-08-21T02:01:00.000Z");
    expect(diagnostic.status).toBe("eligible");
    expect(diagnostic.primaryBlocker).toBeNull();
  });

  it("returns incomplete when no gate blocked but evaluation did not finish", () => {
    const value = input();
    const diagnostic = buildWorkflowTriggerDiagnostic({
      ...value,
      checks: [value.checks[0]!, { ...value.checks[2]!, order: 2 }],
    }, "2026-08-21T02:01:00.000Z");
    expect(diagnostic.status).toBe("incomplete");
    expect(diagnostic.primaryBlocker).toBeNull();
  });

  it("keeps all blockers but selects the earliest configured gate as primary", () => {
    const value = input();
    const diagnostic = buildWorkflowTriggerDiagnostic({
      ...value,
      checks: [
        { ...value.checks[1]!, order: 2 },
        {
          order: 1,
          reasonCode: "data_not_ready",
          outcome: "blocked",
          checkedAt: "2026-08-21T01:59:00.000Z",
          evidenceRefs: ["health:stale"],
          retryAt: "2026-08-21T02:10:00.000Z",
        },
      ],
    }, "2026-08-21T02:01:00.000Z");
    expect(diagnostic.blockingChecks.map(({ reasonCode }) => reasonCode))
      .toEqual(["data_not_ready", "insufficient_sample"]);
    expect(diagnostic.primaryBlocker?.nextActionCode).toBe("refresh_data");
  });

  it.each([
    { workspaceId: "bad" },
    { evaluationId: "../bad" },
    { evaluatedAt: "2026-08-21 02:00:00" },
    { dataCutoffAt: "2026-08-21T02:10:00.000Z" },
    { checks: [] },
    { checks: [{ ...input().checks[0]!, order: 2 }] },
    { checks: [input().checks[0]!, { ...input().checks[0]!, order: 2 }] },
  ])("rejects malformed or ambiguous evaluation input %#", (overrides) => {
    expect(() => buildWorkflowTriggerDiagnostic(
      input(overrides as Partial<WorkflowTriggerEvaluationInput>),
      "2026-08-21T02:01:00.000Z",
    )).toThrowError(new WorkflowTriggerDiagnosticError("invalid_evaluation"));
  });

  it("requires navigation evidence for a blocked gate", () => {
    const value = input();
    expect(() => buildWorkflowTriggerDiagnostic({
      ...value,
      checks: [{ ...value.checks[1]!, order: 1, evidenceRefs: [] }],
    }, "2026-08-21T02:01:00.000Z")).toThrowError(
      new WorkflowTriggerDiagnosticError("invalid_evaluation"),
    );
  });

  it("rejects stale or meaningless retry timestamps", () => {
    const value = input();
    expect(() => buildWorkflowTriggerDiagnostic({
      ...value,
      checks: [{ ...value.checks[1]!, order: 1, retryAt: value.evaluatedAt }],
    }, "2026-08-21T02:01:00.000Z")).toThrowError(
      new WorkflowTriggerDiagnosticError("invalid_evaluation"),
    );
    expect(() => buildWorkflowTriggerDiagnostic({
      ...value,
      checks: [{ ...value.checks[0]!, retryAt: "2026-08-21T03:00:00.000Z" }],
    }, "2026-08-21T02:01:00.000Z")).toThrowError(
      new WorkflowTriggerDiagnosticError("invalid_evaluation"),
    );
  });

  it("rejects future checks and observations before evaluation completion", () => {
    const value = input();
    expect(() => buildWorkflowTriggerDiagnostic({
      ...value,
      checks: [{ ...value.checks[0]!, checkedAt: "2026-08-21T02:00:01.000Z" }],
    }, "2026-08-21T02:01:00.000Z")).toThrowError(
      new WorkflowTriggerDiagnosticError("invalid_evaluation"),
    );
    expect(() => buildWorkflowTriggerDiagnostic(value, "2026-08-21T01:59:59.000Z"))
      .toThrowError(new WorkflowTriggerDiagnosticError("invalid_evaluation"));
  });

  it("maps every stable workflow blocker to an explicit next action", () => {
    const reasons = [
      "trigger_not_received", "data_not_ready", "insufficient_sample", "cooldown_active",
      "daily_limit_reached", "conflict_active", "permission_denied", "waiting_confirmation",
      "capability_unavailable", "version_invalid", "manual_pause", "condition_false",
    ] as const;
    for (const reasonCode of reasons) {
      const diagnostic = buildWorkflowTriggerDiagnostic({
        ...input(),
        checks: [{
          order: 1,
          reasonCode,
          outcome: "blocked",
          checkedAt: "2026-08-21T01:59:00.000Z",
          evidenceRefs: [`evidence:${reasonCode}`],
        }],
      }, "2026-08-21T02:01:00.000Z");
      expect(diagnostic.primaryBlocker?.nextActionCode).toBeTruthy();
    }
  });

  it("detects semantic tampering even after the outer fingerprint is recomputed", () => {
    const diagnostic = structuredClone(
      buildWorkflowTriggerDiagnostic(input(), "2026-08-21T02:01:00.000Z"),
    );
    diagnostic.primaryBlocker!.nextActionCode = "request_permission";
    diagnostic.fingerprint = fingerprintWithoutOuterHash(diagnostic);
    expect(() => parseWorkflowTriggerDiagnostic(diagnostic)).toThrowError(
      new WorkflowTriggerDiagnosticError("invalid_diagnostic"),
    );
  });
});

function fingerprintWithoutOuterHash(value: Record<string, unknown>): string {
  const body = Object.fromEntries(Object.entries(value).filter(([key]) => key !== "fingerprint"));
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
