import { describe, expect, it } from "vitest";

import {
  aggregateExecutionResult,
  assertChangeSetConfirmable,
  buildReverseItems,
  executionDirective,
  transitionChangeSet,
  verifyCurrentValues,
  type ChangeSetItemSnapshot,
} from "../src/changesets.js";

const items: ChangeSetItemSnapshot[] = [
  {
    id: 1,
    targetType: "unit",
    targetId: "unit-1",
    field: "bid",
    fromValue: { type: "number" as const, value: 30 },
    toValue: { type: "number" as const, value: 27 },
    itemStatus: "pending",
    failReason: null,
  },
  {
    id: 2,
    targetType: "unit",
    targetId: "unit-2",
    field: "budget",
    fromValue: { type: "number" as const, value: 1000 },
    toValue: { type: "number" as const, value: 800 },
    itemStatus: "pending",
    failReason: null,
  },
];

describe("changeset transitions", () => {
  it("supports the safe execution path", () => {
    expect(transitionChangeSet("draft", "confirm")).toBe("confirmed");
    expect(transitionChangeSet("confirmed", "send")).toBe("sent");
    expect(transitionChangeSet("sent", "start_execution")).toBe("executing");
    expect(transitionChangeSet("executing", "complete_partial")).toBe("partial");
  });

  it("protects terminal states and does not allow failed retries without a contract", () => {
    expect(() => transitionChangeSet("success", "send")).toThrow(/invalid changeset transition/);
    expect(() => transitionChangeSet("failed", "send")).toThrow(/invalid changeset transition/);
  });

  it("allows UNKNOWN to be resolved only by reconciliation", () => {
    expect(transitionChangeSet("executing", "mark_unknown")).toBe("unknown");
    expect(transitionChangeSet("unknown", "reconcile_success")).toBe("success");
    expect(() => transitionChangeSet("unknown", "send")).toThrow(/invalid changeset transition/);
  });
});

describe("confirmation guards", () => {
  it("treats TTL equality as expired", () => {
    const at = new Date("2026-08-19T10:00:00Z");
    expect(() => assertChangeSetConfirmable({ status: "draft", ttlExpireAt: at, now: at })).toThrow(
      /expired/,
    );
  });

  it("requires draft status and a future TTL", () => {
    expect(() =>
      assertChangeSetConfirmable({
        status: "confirmed",
        ttlExpireAt: new Date("2026-08-19T11:00:00Z"),
        now: new Date("2026-08-19T10:00:00Z"),
      }),
    ).toThrow(/must be draft/);
    expect(
      assertChangeSetConfirmable({
        status: "draft",
        ttlExpireAt: new Date("2026-08-19T11:00:00Z"),
        now: new Date("2026-08-19T10:00:00Z"),
      }),
    ).toBeUndefined();
  });

  it("reports every changed or missing current value", () => {
    const verification = verifyCurrentValues(items, [
      { targetType: "unit", targetId: "unit-1", field: "bid", value: { type: "number" as const, value: 31 } },
    ]);
    expect(verification.ok).toBe(false);
    expect(verification.conflicts).toEqual([
      expect.objectContaining({ itemId: 1, expected: { type: "number" as const, value: 30 }, actual: { type: "number" as const, value: 31 }, kind: "changed" }),
      expect.objectContaining({ itemId: 2, expected: { type: "number" as const, value: 1000 }, actual: null, kind: "missing" }),
    ]);
  });
});

describe("execution result", () => {
  it("aggregates success, failure, partial and unknown", () => {
    expect(aggregateExecutionResult([{ itemId: 1, status: "success" }])).toBe("success");
    expect(aggregateExecutionResult([{ itemId: 1, status: "failed" }])).toBe("failed");
    expect(
      aggregateExecutionResult([
        { itemId: 1, status: "success" },
        { itemId: 2, status: "failed" },
      ]),
    ).toBe("partial");
    expect(
      aggregateExecutionResult([
        { itemId: 1, status: "success" },
        { itemId: 2, status: "unknown" },
      ]),
    ).toBe("unknown");
  });

  it("never executes UNKNOWN or a terminal changeset blindly", () => {
    expect(executionDirective("confirmed")).toBe("execute");
    expect(executionDirective("unknown")).toBe("reconcile_required");
    expect(executionDirective("executing")).toBe("reconcile_required");
    expect(executionDirective("success")).toBe("skip_terminal");
    expect(executionDirective("draft")).toBe("not_ready");
  });

  it("builds reverse items from successful items only", () => {
    const reversed = buildReverseItems([
      { ...items[0]!, itemStatus: "success" },
      { ...items[1]!, itemStatus: "failed" },
    ]);
    expect(reversed).toEqual([
      {
        targetType: "unit",
        targetId: "unit-1",
        field: "bid",
        fromValue: { type: "number" as const, value: 27 },
        toValue: { type: "number" as const, value: 30 },
      },
    ]);
  });
});
