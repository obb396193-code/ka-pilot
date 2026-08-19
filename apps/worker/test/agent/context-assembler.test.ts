import { describe, expect, it, vi } from "vitest";

import {
  AgentContextAssembler,
  type AgentContextRepository,
  type ContextObjectResolver,
} from "../../src/agent/context-assembler.js";

const auth = {
  workspaceId: "workspace-alpha",
  userId: "user-alpha",
  sessionId: "session-alpha",
};

describe("AgentContextAssembler", () => {
  it("reauthenticates and assembles bounded history, explicit objects, facts and live memory", async () => {
    const repository = repositoryStub();
    const resolver: ContextObjectResolver = {
      resolve: vi.fn(async ({ ref }) => ({
        ref,
        title: ref.kind === "task" ? "测试任务" : "测试账户",
        facts: [
          {
            evidenceId: `${ref.kind}.cost`,
            label: "累计消耗",
            displayValue: "¥100.00",
            value: 100,
            metricKey: "cost",
            definition: "canonical_metrics.cost 按任务有效账户关系汇总",
            dataCutoffAt: "2026-08-18T16:00:00.000Z",
          },
        ],
      })),
    };
    const assembler = new AgentContextAssembler(repository, resolver, { maxMessages: 2 });

    const result = await assembler.assemble({
      ...auth,
      asOf: new Date("2026-08-19T04:00:00.000Z"),
    });

    expect(repository.getSession).toHaveBeenCalledWith(auth);
    expect(repository.listMessages).toHaveBeenCalledWith(auth);
    expect(repository.listContext).toHaveBeenCalledWith(auth);
    expect(repository.listMemories).toHaveBeenCalledWith({
      workspaceId: auth.workspaceId,
      userId: auth.userId,
      asOf: "2026-08-19",
      scopes: [
        { scope: "user", scopeId: "user-alpha" },
        { scope: "task", scopeId: "task-alpha" },
        { scope: "account", scopeId: "account-alpha" },
      ],
    });
    expect(result.messages.map((message) => message.content)).toEqual([
      { text: "第二条" },
      { text: "第三条" },
    ]);
    expect(result.objects).toHaveLength(2);
    expect(result.memories.map((memory) => memory.content)).toEqual(["用户偏好", "任务规则"]);
    expect(result.evidenceIds).toEqual(["task.cost", "account.cost"]);
    expect(result.dataCutoffAt).toBe("2026-08-18T16:00:00.000Z");
    expect(result.promptContext).toContain("canonical_metrics.cost");
    expect(result.promptContext).not.toContain("expired rule");
  });

  it("rejects numeric facts without a metric definition", async () => {
    const repository = repositoryStub();
    const resolver: ContextObjectResolver = {
      resolve: async ({ ref }) => ({
        ref,
        title: "测试任务",
        facts: [
          {
            evidenceId: "task.cost",
            label: "累计消耗",
            displayValue: "¥100.00",
            value: 100,
            dataCutoffAt: "2026-08-18T16:00:00.000Z",
          },
        ],
      }),
    };

    await expect(new AgentContextAssembler(repository, resolver).assemble({
      ...auth,
      asOf: new Date("2026-08-19T04:00:00.000Z"),
    })).rejects.toThrow("Numeric Agent facts require a metric definition");
  });

  it("rejects duplicate evidence ids across selected objects", async () => {
    const repository = repositoryStub();
    const resolver: ContextObjectResolver = {
      resolve: async ({ ref }) => ({
        ref,
        title: "对象",
        facts: [
          {
            evidenceId: "duplicate.cost",
            label: "消耗",
            displayValue: "100",
            value: "100",
            dataCutoffAt: "2026-08-18T16:00:00.000Z",
          },
        ],
      }),
    };

    await expect(new AgentContextAssembler(repository, resolver).assemble({
      ...auth,
      asOf: new Date("2026-08-19T04:00:00.000Z"),
    })).rejects.toThrow("Duplicate Agent evidence id");
  });
});

function repositoryStub(): AgentContextRepository & Record<string, ReturnType<typeof vi.fn>> {
  return {
    getSession: vi.fn(async () => ({
      id: auth.sessionId,
      workspaceId: auth.workspaceId,
      userId: auth.userId,
      pageContext: { route: "/tasks/task-alpha" },
      createdAt: new Date("2026-08-19T03:00:00.000Z"),
    })),
    listMessages: vi.fn(async () => [
      { id: 1, sessionId: auth.sessionId, role: "user" as const, content: { text: "第一条" }, at: new Date() },
      { id: 2, sessionId: auth.sessionId, role: "assistant" as const, content: { text: "第二条" }, at: new Date() },
      { id: 3, sessionId: auth.sessionId, role: "user" as const, content: { text: "第三条" }, at: new Date() },
    ]),
    listContext: vi.fn(async () => [
      { id: 1, sessionId: auth.sessionId, objectType: "task" as const, objectId: "task-alpha", addedBy: "user_select" as const },
      { id: 2, sessionId: auth.sessionId, objectType: "account" as const, objectId: "account-alpha", addedBy: "page" as const },
    ]),
    listMemories: vi.fn(async () => [
      { id: 1, workspaceId: auth.workspaceId, scope: "user" as const, scopeId: auth.userId, content: "用户偏好", expireAt: null, createdBy: auth.userId, createdAt: new Date() },
      { id: 2, workspaceId: auth.workspaceId, scope: "task" as const, scopeId: "task-alpha", content: "任务规则", expireAt: "2026-08-20", createdBy: auth.userId, createdAt: new Date() },
    ]),
  };
}
