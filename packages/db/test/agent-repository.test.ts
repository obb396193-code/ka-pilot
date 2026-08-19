import { randomUUID } from "node:crypto";

import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Pool } from "pg";

import { AgentRepository } from "../src/agent-repository.js";
import { CredentialRepository } from "../src/credential-repository.js";
import { runMigrations } from "../src/migrate.js";

const databaseUrl =
  process.env.TEST_DATABASE_URL ?? "postgres://ka:ka@127.0.0.1:55432/ka";

describe("AgentRepository", () => {
  const pool = new Pool({ connectionString: databaseUrl, max: 8 });
  const repository = new AgentRepository(pool);
  let workspaceId: string;
  let otherWorkspaceId: string;
  let userId: string;
  let otherUserId: string;

  beforeAll(async () => {
    await runMigrations({ databaseUrl });
  });

  beforeEach(async () => {
    const suffix = randomUUID();
    const workspaces = await pool.query<{ id: string }>(
      "INSERT INTO workspaces (name) VALUES ($1), ($2) RETURNING id",
      [`agent-a-${suffix}`, `agent-b-${suffix}`],
    );
    workspaceId = workspaces.rows[0]!.id;
    otherWorkspaceId = workspaces.rows[1]!.id;
    const users = await pool.query<{ id: string }>(
      `INSERT INTO users (workspace_id, name, idealab_ak_ref)
       VALUES ($1, 'agent-owner', 'secret://users/owner/idealab'),
              ($1, 'agent-other', 'secret://users/other/idealab')
       RETURNING id`,
      [workspaceId],
    );
    userId = users.rows[0]!.id;
    otherUserId = users.rows[1]!.id;
  });

  it("creates a fresh session with no inherited page context and isolates user access", async () => {
    const session = await repository.createSession({ workspaceId, userId });
    expect(session.pageContext).toBeNull();
    await expect(
      repository.getSession({ workspaceId, userId: otherUserId, sessionId: session.id }),
    ).rejects.toThrow(/not found/);
    await expect(
      repository.getSession({ workspaceId: otherWorkspaceId, userId, sessionId: session.id }),
    ).rejects.toThrow(/not found/);
  });

  it("adds explicit context idempotently under concurrent requests", async () => {
    const session = await repository.createSession({ workspaceId, userId });
    const attempts = await Promise.all(
      Array.from({ length: 5 }, () =>
        repository.addContext({
          workspaceId,
          userId,
          sessionId: session.id,
          context: { kind: "account", id: "account-alpha" },
          addedBy: "user_select",
        }),
      ),
    );
    expect(attempts.filter((attempt) => !attempt.idempotent)).toHaveLength(1);
    expect(await repository.listContext({ workspaceId, userId, sessionId: session.id })).toEqual([
      expect.objectContaining({ objectType: "account", objectId: "account-alpha" }),
    ]);
    await expect(
      repository.removeContext({
        workspaceId,
        userId: otherUserId,
        sessionId: session.id,
        contextItemId: attempts[0]!.id,
      }),
    ).rejects.toThrow(/not found/);
  });

  it("returns only the current user's unexpired user memory", async () => {
    await repository.createMemory({
      workspaceId,
      userId,
      scope: "user",
      scopeId: userId,
      content: "优先看完整数据日",
      expireAt: "2026-08-20",
    });
    await repository.createMemory({
      workspaceId,
      userId,
      scope: "user",
      scopeId: userId,
      content: "已过期规则",
      expireAt: "2026-08-18",
    });
    await repository.createMemory({
      workspaceId,
      userId: otherUserId,
      scope: "user",
      scopeId: otherUserId,
      content: "其他用户的规则",
      expireAt: null,
    });

    const memories = await repository.listMemories({
      workspaceId,
      userId,
      scopes: [{ scope: "user", scopeId: userId }],
      asOf: "2026-08-19",
    });
    expect(memories.map((memory) => memory.content)).toEqual(["优先看完整数据日"]);
    await expect(
      repository.listMemories({
        workspaceId,
        userId,
        scopes: [{ scope: "user", scopeId: otherUserId }],
        asOf: "2026-08-19",
      }),
    ).rejects.toThrow(/user memory scope/);
  });

  it("stores the user message before starting a Run", async () => {
    const session = await repository.createSession({ workspaceId, userId });
    const started = await repository.startRunForUserMessage({
      workspaceId,
      userId,
      sessionId: session.id,
      kind: "chat",
      content: { type: "text", text: "分析测试账户" },
      startedAt: new Date("2026-08-19T10:00:00Z"),
    });
    expect(started.run).toMatchObject({ status: "running", kind: "chat", initiator: userId });
    expect(
      await repository.listMessages({ workspaceId, userId, sessionId: session.id }),
    ).toEqual([expect.objectContaining({ role: "user", content: { type: "text", text: "分析测试账户" } })]);
  });

  it("commits the assistant message and successful Run terminal state atomically", async () => {
    const session = await repository.createSession({ workspaceId, userId });
    const started = await repository.startRunForUserMessage({
      workspaceId,
      userId,
      sessionId: session.id,
      kind: "diagnosis",
      content: { type: "text", text: "诊断" },
      startedAt: new Date("2026-08-19T10:00:00Z"),
    });
    const completed = await repository.completeRun({
      workspaceId,
      userId,
      sessionId: session.id,
      runId: started.run.id,
      summary: "diagnosis_completed",
      assistantContent: { type: "text", text: "建议继续观察" },
      finishedAt: new Date("2026-08-19T10:00:05Z"),
    });
    expect(completed).toMatchObject({ status: "success", summary: "diagnosis_completed" });
    await expect(
      repository.completeRun({
        workspaceId,
        userId,
        sessionId: session.id,
        runId: started.run.id,
        summary: "duplicate",
        assistantContent: { type: "text", text: "不应重复" },
        finishedAt: new Date("2026-08-19T10:00:06Z"),
      }),
    ).rejects.toThrow(/running/);
    const messages = await repository.listMessages({ workspaceId, userId, sessionId: session.id });
    expect(messages.filter((message) => message.role === "assistant")).toHaveLength(1);
  });

  it("stores only a safe failure summary and a restricted raw-log reference", async () => {
    const session = await repository.createSession({ workspaceId, userId });
    const started = await repository.startRunForUserMessage({
      workspaceId,
      userId,
      sessionId: session.id,
      kind: "chat",
      content: { type: "text", text: "测试失败" },
      startedAt: new Date("2026-08-19T10:00:00Z"),
    });
    await expect(
      repository.failRun({
        workspaceId,
        userId,
        runId: started.run.id,
        summary: "Error: provider failed\n at secret.ts:1",
        rawLogRef: "https://example.invalid/log?token=secret",
        finishedAt: new Date("2026-08-19T10:00:05Z"),
      }),
    ).rejects.toThrow(/safe summary/);

    const failed = await repository.failRun({
      workspaceId,
      userId,
      runId: started.run.id,
      summary: "provider_unavailable",
      rawLogRef: "agent-log://runs/fake-run-id",
      finishedAt: new Date("2026-08-19T10:00:05Z"),
    });
    expect(failed).toMatchObject({
      status: "failed",
      summary: "provider_unavailable",
      rawLogRef: "agent-log://runs/fake-run-id",
    });
  });

  it("resolves only the IdeaLab secret reference for the authenticated user", async () => {
    const credentials = new CredentialRepository(pool);
    await expect(credentials.resolveIdeaLabSecretRef(workspaceId, userId)).resolves.toBe(
      "secret://users/owner/idealab",
    );
    await expect(
      credentials.resolveIdeaLabSecretRef(otherWorkspaceId, userId),
    ).resolves.toBeNull();
  });
});
