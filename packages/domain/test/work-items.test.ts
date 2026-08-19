import { describe, expect, it } from "vitest";

import {
  assertWorkItemTransition,
  decideDuplicate,
  severityRank,
  workItemDedupeKey,
} from "../src/work-items.js";

describe("work item state transitions", () => {
  it("supports the normal open to processing to done path", () => {
    const processing = assertWorkItemTransition("open", "start_processing");
    expect(processing).toBe("processing");
    expect(assertWorkItemTransition(processing, "complete")).toBe("done");
  });

  it.each([
    ["ignore", "ignored"],
    ["reject", "rejected"],
    ["escalate", "escalated"],
    ["mark_external_handled", "external_handled"],
  ] as const)("allows %s from an active work item", (action, expected) => {
    expect(assertWorkItemTransition("open", action)).toBe(expected);
    expect(assertWorkItemTransition("processing", action)).toBe(expected);
  });

  it("allows an escalated item to be taken over and completed", () => {
    expect(assertWorkItemTransition("escalated", "start_processing")).toBe("processing");
    expect(assertWorkItemTransition("escalated", "complete")).toBe("done");
  });

  it.each(["done", "ignored", "expired", "external_handled", "rejected"] as const)(
    "protects terminal status %s from ordinary processing",
    (status) => {
      expect(() => assertWorkItemTransition(status, "start_processing")).toThrow(
        /invalid work item transition/,
      );
    },
  );
});

describe("work item deduplication", () => {
  it("uses workspace, rule and account in the deterministic key", () => {
    const base = { workspaceId: "workspace-a", ruleId: 7, accountId: "account-1" };
    expect(workItemDedupeKey(base)).toBe(workItemDedupeKey(base));
    expect(workItemDedupeKey(base)).not.toBe(
      workItemDedupeKey({ ...base, workspaceId: "workspace-b" }),
    );
    expect(workItemDedupeKey(base)).not.toBe(
      workItemDedupeKey({ ...base, ruleId: "7:account-1" }),
    );
  });

  it("upgrades only when the incoming severity is higher", () => {
    expect(decideDuplicate("P1", "P0")).toBe("upgrade");
    expect(decideDuplicate("P1", "P1")).toBe("merge");
    expect(decideDuplicate("P1", "P2")).toBe("merge");
    expect(decideDuplicate("opportunity", "P2")).toBe("upgrade");
  });

  it("uses an explicit total severity order", () => {
    expect((["opportunity", "P2", "P1", "P0"] as const).map(severityRank)).toEqual([
      0, 1, 2, 3,
    ]);
  });
});
