import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  EMPTY_RULE_SCOPE, alertRuleScopeSchema, ruleScopeBinding, sopProgress, taskBindingsSchema,
  type TaskScopeFacts,
} from "../../src/r014/task-bindings-contract.js";

const fixture = JSON.parse(readFileSync(
  new URL("../../../contract/fixtures/rules/bindings-fixture-task-ready.json", import.meta.url), "utf8",
)) as { data: unknown };

const TASK: TaskScopeFacts = {
  taskId: "fixture-task-ready",
  bizName: "AAC",
  accounts: [{ media: "KUAISHOU", accountId: "account-1" }],
};

describe("v1.7.3 / v1.9 ⑨ task bindings", () => {
  it("parses the frozen fixture", () => {
    const parsed = taskBindingsSchema.parse(fixture.data);
    expect(parsed.rules.map((rule) => rule.ruleId)).toEqual([3, 7]);
    expect(parsed.workflows[0]!.lastRun?.status).toBe("success");
    expect(parsed.sop?.progress).toEqual({ value: 0.8, state: "finite" });
  });

  it("allows a null boundAt while the 018 column has not landed", () => {
    const parsed = taskBindingsSchema.parse(fixture.data) as { rules: { boundAt: string | null }[] };
    expect(() => taskBindingsSchema.parse({
      ...(fixture.data as object),
      rules: parsed.rules.map((rule) => ({ ...rule, boundAt: null })),
    })).not.toThrow();
  });

  it("treats an all-empty scope as global and therefore NOT a binding", () => {
    // 全局规则对每个任务都成立；列进「本任务的绑定」就是用全局规则冒充绑定。
    expect(ruleScopeBinding(EMPTY_RULE_SCOPE, TASK)).toBeNull();
    expect(ruleScopeBinding(alertRuleScopeSchema.parse({}), TASK)).toBeNull();
  });

  it("binds at task level by task id or business name, and at account level by account", () => {
    expect(ruleScopeBinding({ ...EMPTY_RULE_SCOPE, taskIds: ["fixture-task-ready"] }, TASK)).toBe("task");
    expect(ruleScopeBinding({ ...EMPTY_RULE_SCOPE, bizNames: ["AAC"] }, TASK)).toBe("task");
    expect(ruleScopeBinding(
      { ...EMPTY_RULE_SCOPE, accountScopes: [{ media: "KUAISHOU", accountId: "account-1" }] }, TASK,
    )).toBe("account");
    // task 级优先于 account 级：同时命中时报告更高的那一层。
    expect(ruleScopeBinding({
      taskIds: ["fixture-task-ready"], bizNames: [], accountScopes: [{ media: "KUAISHOU", accountId: "account-1" }],
    }, TASK)).toBe("task");
  });

  it("does not bind on another task, another business or another account", () => {
    expect(ruleScopeBinding({ ...EMPTY_RULE_SCOPE, taskIds: ["other-task"] }, TASK)).toBeNull();
    expect(ruleScopeBinding({ ...EMPTY_RULE_SCOPE, bizNames: ["BBB"] }, TASK)).toBeNull();
    expect(ruleScopeBinding(
      { ...EMPTY_RULE_SCOPE, accountScopes: [{ media: "KUAISHOU", accountId: "account-9" }] }, TASK,
    )).toBeNull();
    // 同号跨媒体不算命中。
    expect(ruleScopeBinding(
      { ...EMPTY_RULE_SCOPE, accountScopes: [{ media: "DOUYIN", accountId: "account-1" }] }, TASK,
    )).toBeNull();
    expect(ruleScopeBinding({ ...EMPTY_RULE_SCOPE, bizNames: ["AAC"] }, { ...TASK, bizName: null })).toBeNull();
  });

  it("reports SOP progress as undefined when the graph has no nodes, never as zero", () => {
    expect(sopProgress(0, 0)).toEqual({ value: null, state: "undefined" });
    expect(sopProgress(4, 5)).toEqual({ value: 0.8, state: "finite" });
    expect(sopProgress(0, 5)).toEqual({ value: 0, state: "finite" });
    // 事件比节点还多说明有重跑，进度封顶 1 而不是超过 1。
    expect(sopProgress(9, 5)).toEqual({ value: 1, state: "finite" });
  });
});
