import { createAgentRunEvent, type AgentRunEvent } from "@ka/domain";
import { describe, expect, it, vi } from "vitest";

import {
  AgentOrchestrator,
  type AgentEventSink,
  type AgentOrchestratorRepository,
  type AgentRuntimePort,
} from "../../src/agent/orchestrator.js";
import type { AssembledAgentContext } from "../../src/agent/context-assembler.js";
import { AgentDiagnosisService } from "../../src/agent/diagnosis-service.js";
import type { ProviderCandidate } from "../../src/agent/provider/types.js";

const primary: ProviderCandidate = {
  providerId: "primary",
  model: "model-a",
  profileVersion: "v1",
  protocol: "anthropic_messages",
};
const fallback: ProviderCandidate = {
  providerId: "fallback",
  model: "model-b",
  profileVersion: "v2",
  protocol: "openai_chat_completions",
};

describe("AgentOrchestrator", () => {
  it("persists the user message first and retries a timeout only before visible output", async () => {
    const harness = createHarness();
    harness.runtime.execute
      .mockImplementationOnce(async (_input, emit) => {
        await emit(rawEvent(1, "error", { code: "timeout" }));
        return { outcome: "error", code: "timeout", estimatedCostUsd: 0, unknownMessageCount: 0 };
      })
      .mockImplementationOnce(async (_input, emit) => {
        await emit(rawEvent(1, "delta", { text: "已完成" }));
        return {
          outcome: "success",
          finalText: "已完成",
          structuredOutput: undefined,
          estimatedCostUsd: 0.01,
          unknownMessageCount: 0,
        };
      });

    const result = await harness.orchestrator.run(runInput("chat"));

    expect(result).toMatchObject({ outcome: "success", providerId: "fallback", usedFallback: true });
    expect(harness.repository.startRunForUserMessage.mock.invocationCallOrder[0]).toBeLessThan(
      harness.assembler.assemble.mock.invocationCallOrder[0]!,
    );
    expect(harness.credentials.resolve).toHaveBeenCalledTimes(2);
    expect(harness.repository.completeRun).toHaveBeenCalledWith(expect.objectContaining({
      runId: "run-alpha",
      summary: "chat_completed",
      assistantContent: expect.objectContaining({ text: "已完成", providerId: "fallback" }),
    }));
    expect(harness.events.map((event) => event.kind)).toEqual([
      "status",
      "status",
      "status",
      "status",
      "status",
      "delta",
      "done",
    ]);
    expect(harness.events.map((event) => event.seq)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(harness.events.some((event) => event.kind === "error")).toBe(false);
  });

  it("never replays another provider after a text delta has been exposed", async () => {
    const harness = createHarness();
    harness.runtime.execute.mockImplementationOnce(async (_input, emit) => {
      await emit(rawEvent(1, "delta", { text: "部分结果" }));
      await emit(rawEvent(2, "error", { code: "server_error" }));
      return {
        outcome: "error",
        code: "server_error",
        estimatedCostUsd: 0,
        unknownMessageCount: 0,
      };
    });

    const result = await harness.orchestrator.run(runInput("chat"));

    expect(result).toMatchObject({ outcome: "failed", code: "server_error" });
    expect(harness.runtime.execute).toHaveBeenCalledTimes(1);
    expect(harness.credentials.resolve).toHaveBeenCalledTimes(1);
    expect(harness.repository.failRun).toHaveBeenCalledWith(expect.objectContaining({
      summary: "agent_failed_server_error",
    }));
    expect(harness.events.map((event) => event.kind).at(-1)).toBe("error");
  });

  it("converts invalid diagnosis output to a persisted deterministic fallback", async () => {
    const harness = createHarness();
    harness.runtime.execute.mockResolvedValue({
      outcome: "success",
      finalText: "untrusted",
      structuredOutput: { status: "ok", fabricated: true },
      estimatedCostUsd: 0,
      unknownMessageCount: 0,
    });

    const result = await harness.orchestrator.run(runInput("diagnosis"));

    expect(result).toMatchObject({ outcome: "success", usedFallback: true });
    expect(harness.repository.completeRun).toHaveBeenCalledWith(expect.objectContaining({
      summary: "diagnosis_fallback_invalid_output",
      assistantContent: expect.objectContaining({
        diagnosis: expect.objectContaining({ status: "fallback", fallbackReason: "invalid_output" }),
      }),
    }));
    expect(harness.events.filter((event) => event.kind === "delta")).toEqual([
      expect.objectContaining({ payload: expect.objectContaining({ text: expect.stringContaining("规则兜底") }) }),
    ]);
  });

  it("returns a diagnosis fallback without resolving a secret when no provider is capable", async () => {
    const harness = createHarness({ candidates: [] });

    const result = await harness.orchestrator.run(runInput("diagnosis"));

    expect(result).toMatchObject({ outcome: "success", providerId: null, usedFallback: true });
    expect(harness.credentials.resolve).not.toHaveBeenCalled();
    expect(harness.runtime.execute).not.toHaveBeenCalled();
    expect(harness.repository.completeRun).toHaveBeenCalledWith(expect.objectContaining({
      summary: "diagnosis_fallback_capability_missing",
    }));
  });
});

function createHarness(options: { candidates?: ProviderCandidate[] } = {}) {
  const repository = {
    startRunForUserMessage: vi.fn(async () => ({
      message: { id: 1 },
      run: { id: "run-alpha", startedAt: new Date("2026-08-19T04:00:00.000Z") },
    })),
    completeRun: vi.fn(async (input) => input),
    failRun: vi.fn(async (input) => input),
  } satisfies AgentOrchestratorRepository;
  const assembler = { assemble: vi.fn(async () => assembledContext()) };
  const candidates = options.candidates ?? [primary, fallback];
  const router = {
    route: vi.fn(async () => ({
      taskKind: "chat" as const,
      selected: candidates[0] ?? null,
      candidates,
      rejected: [],
    })),
  };
  const credentials = { resolve: vi.fn(async ({ providerId }) => `private-${providerId}`) };
  const runtime = { execute: vi.fn() } as unknown as AgentRuntimePort & {
    execute: ReturnType<typeof vi.fn>;
  };
  const events: AgentRunEvent[] = [];
  const eventSink: AgentEventSink = {
    append: vi.fn(async ({ event }) => {
      events.push(event);
    }),
  };
  const orchestrator = new AgentOrchestrator({
    repository,
    contextAssembler: assembler,
    diagnosis: new AgentDiagnosisService(),
    router,
    credentials,
    runtime,
    tools: { definitions: vi.fn(async () => []) },
    eventSink,
    runLogs: { persistFailure: vi.fn(async () => "agent-log://run-alpha/error.json") },
    gateway: {
      baseUrl: "http://127.0.0.1:3456",
      clientKey: "local-gateway-client-key-that-is-long",
      envelopeKey: Buffer.alloc(32, 7).toString("base64"),
    },
    runtimeOptions: {
      cwd: "/private/tmp/ka-agent-cwd",
      home: "/private/tmp/ka-agent-home",
      tmpDir: "/private/tmp/ka-agent-tmp",
      path: "/usr/bin:/bin",
      maxTurns: 5,
      maxBudgetUsd: 0.5,
      timeoutMs: 20_000,
      toolTimeoutMs: 5_000,
    },
    now: () => new Date("2026-08-19T04:00:00.000Z"),
  });
  return { orchestrator, repository, assembler, router, credentials, runtime, events };
}

function runInput(kind: "chat" | "diagnosis") {
  return {
    workspaceId: "workspace-alpha",
    userId: "user-alpha",
    sessionId: "session-alpha",
    kind,
    prompt: "分析测试账户",
    recentlyFailedTargetKeys: [],
  };
}

function assembledContext(): AssembledAgentContext {
  return {
    session: { id: "session-alpha", pageContext: null },
    messages: [],
    objects: [],
    memories: [],
    evidenceIds: [],
    dataCutoffAt: "2026-08-18T16:00:00.000Z",
    promptContext: "{}",
  };
}

function rawEvent(seq: number, kind: AgentRunEvent["kind"], payload: Record<string, unknown>) {
  return createAgentRunEvent({
    seq,
    kind,
    payload,
    at: "2026-08-19T04:00:00.000Z",
  });
}
