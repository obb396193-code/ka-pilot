import { AgentOrchestrator } from "../../src/agent/orchestrator.js";
import { createAgentBackend } from "../../src/agent/index.js";
import { MemoryProviderCapabilityStore } from "../../src/agent/provider/capability-store.js";
import { describe, expect, it, vi } from "vitest";

describe("Agent backend factory", () => {
  it("composes the internal backend without starting it or changing the existing job consumer", () => {
    const backend = createAgentBackend({
      pool: {} as never,
      contextResolver: { resolve: vi.fn() },
      capabilityStore: new MemoryProviderCapabilityStore(),
      providerProfiles: [
        {
          id: "provider-alpha",
          protocol: "anthropic_messages",
          baseUrl: "https://provider.example",
          models: ["model-alpha"],
          defaultModel: "model-alpha",
          enabled: true,
          taskKinds: ["chat", "diagnosis"],
          fallbackProviderIds: [],
        },
      ],
      credentials: { resolve: vi.fn() },
      tools: { definitions: vi.fn(async () => []) },
      eventSink: { append: vi.fn(async () => undefined) },
      runLogs: { persistFailure: vi.fn(async () => null) },
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
    });

    expect(backend).toBeInstanceOf(AgentOrchestrator);
  });
});
