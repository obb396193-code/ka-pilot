import { describe, expect, it } from "vitest";

import { parseAgentContextRefs } from "../src/agent-context.js";

describe("Agent explicit context", () => {
  it("accepts explicit object references without inventing page state", () => {
    expect(
      parseAgentContextRefs([
        { kind: "task", id: "task-alpha", label: "测试任务" },
        { kind: "account", id: "account-alpha", snapshotVersion: "2026-08-19" },
      ]),
    ).toEqual([
      { kind: "task", id: "task-alpha", label: "测试任务" },
      { kind: "account", id: "account-alpha", snapshotVersion: "2026-08-19" },
    ]);
  });

  it("rejects duplicate references and unknown secret-shaped fields", () => {
    expect(() =>
      parseAgentContextRefs([
        { kind: "account", id: "account-alpha" },
        { kind: "account", id: "account-alpha" },
      ]),
    ).toThrow(/Duplicate/);
    expect(() =>
      parseAgentContextRefs([{ kind: "account", id: "account-alpha", token: "not-allowed" }]),
    ).toThrow();
  });
});
