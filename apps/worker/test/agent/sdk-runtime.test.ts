import { describe, expect, it, vi } from "vitest";

import { ClaudeAgentRuntime } from "../../src/agent/sdk/runtime.js";
import { createKaMcpBundle } from "../../src/agent/sdk/tools.js";
import type { QueryFactory } from "../../src/agent/sdk/runtime.js";

const auth = { workspaceId: "workspace-alpha", userId: "user-alpha", runId: "run-alpha" };

describe("ClaudeAgentRuntime", () => {
  it("streams normalized events and reads structured output only from the final result", async () => {
    const close = vi.fn();
    const factory: QueryFactory = vi.fn((params) => {
      params.options?.stderr?.("Authorization: Bearer should-be-redacted");
      return iterable(
        [
          {
            type: "stream_event",
            event: {
              type: "content_block_delta",
              delta: { type: "text_delta", text: "诊断完成" },
            },
          },
          {
            type: "result",
            subtype: "success",
            is_error: false,
            result: "诊断完成",
            structured_output: { status: "ok" },
            usage: { input_tokens: 20, output_tokens: 8 },
            total_cost_usd: 0.03,
          },
        ],
        close,
      );
    });
    const diagnostics: string[] = [];
    const events: unknown[] = [];
    const runtime = new ClaudeAgentRuntime({ queryFactory: factory, onDiagnostic: (line) => diagnostics.push(line) });
    const result = await runtime.execute(runtimeInput(), (event) => {
      events.push(event);
    });

    expect(result).toMatchObject({
      outcome: "success",
      finalText: "诊断完成",
      structuredOutput: { status: "ok" },
      estimatedCostUsd: 0.03,
    });
    expect(events).toEqual([
      expect.objectContaining({ kind: "delta" }),
      expect.objectContaining({ kind: "usage" }),
      expect.objectContaining({ kind: "done" }),
    ]);
    expect(diagnostics.join(" ")).not.toContain("should-be-redacted");
    expect(diagnostics.join(" ")).toContain("[REDACTED]");
    expect(close).toHaveBeenCalledOnce();
    const call = vi.mocked(factory).mock.calls[0]![0];
    expect(call.options?.outputFormat).toEqual({
      type: "json_schema",
      schema: { type: "object", properties: { status: { type: "string" } } },
    });
  });

  it("aborts and closes a query at the total timeout", async () => {
    const close = vi.fn();
    const factory: QueryFactory = (params) => ({
      close,
      async *[Symbol.asyncIterator]() {
        await new Promise<void>((_resolve, reject) => {
          params.options?.abortController?.signal.addEventListener(
            "abort",
            () => reject(new Error("aborted by test")),
            { once: true },
          );
        });
        yield { type: "system", subtype: "unreachable" };
      },
    });
    const runtime = new ClaudeAgentRuntime({ queryFactory: factory });
    const result = await runtime.execute(runtimeInput({ timeoutMs: 5 }), () => undefined);
    expect(result).toMatchObject({ outcome: "error", code: "timeout" });
    expect(close).toHaveBeenCalledOnce();
  });
});

function runtimeInput(overrides: Record<string, unknown> = {}) {
  return {
    prompt: "诊断测试账户",
    systemPrompt: "You are the KA operating assistant.",
    provider: {
      providerId: "idealab-primary",
      model: "model-alpha",
      profileVersion: "profile-v1",
      protocol: "openai_chat_completions" as const,
    },
    gateway: {
      baseUrl: "http://127.0.0.1:3456",
      clientKey: "gateway-client-key-safe-for-localhost",
      credentialEnvelope: "kae1.encrypted-token",
      binding: { ...auth, providerId: "idealab-primary", model: "model-alpha" },
    },
    mcp: createKaMcpBundle({ auth, definitions: [] }),
    cwd: "/private/tmp/ka-agent-cwd",
    home: "/private/tmp/ka-agent-home",
    tmpDir: "/private/tmp/ka-agent-tmp",
    path: "/usr/bin:/bin",
    maxTurns: 5,
    maxBudgetUsd: 0.75,
    timeoutMs: 45_000,
    toolTimeoutMs: 15_000,
    outputJsonSchema: { type: "object", properties: { status: { type: "string" } } },
    ...overrides,
  };
}

function iterable(messages: unknown[], close: () => void) {
  return {
    close,
    async *[Symbol.asyncIterator]() {
      for (const message of messages) yield message;
    },
  };
}
