import { describe, expect, it, vi } from "vitest";

import { MemoryProviderCapabilityStore } from "../../src/agent/provider/capability-store.js";
import { ProviderProbeService } from "../../src/agent/provider/probe-service.js";
import { providerProfileVersion } from "../../src/agent/provider/router.js";
import type { ProviderProbeInput, ProviderProfile } from "../../src/agent/provider/types.js";

const provider: ProviderProfile = {
  id: "provider-a",
  protocol: "anthropic_messages",
  baseUrl: "https://provider.example",
  models: ["model-a"],
  defaultModel: "model-a",
  enabled: true,
  taskKinds: ["chat", "diagnosis"],
  fallbackProviderIds: [],
};

describe("ProviderProbeService", () => {
  it("probes every production capability and persists a healthy snapshot", async () => {
    const store = new MemoryProviderCapabilityStore();
    const probe = vi.fn(async (input: ProviderProbeInput) => {
      void input;
      return true;
    });
    const result = await new ProviderProbeService(store, { probe }, {
      now: () => new Date("2026-08-19T10:00:00.000Z"),
      timeoutMs: 100,
    }).probe(provider, "model-a");

    expect(probe.mock.calls.map(([input]) => input.capability).sort()).toEqual([
      "abort",
      "connectivity",
      "streaming",
      "structuredOutput",
      "toolCalling",
    ]);
    expect(result).toMatchObject({ state: "healthy" });
    await expect(store.get(provider.id, "model-a", providerProfileVersion(provider))).resolves.toEqual(
      result,
    );
  });

  it("marks connectivity failure blocked and partial capability failure degraded", async () => {
    const blockedStore = new MemoryProviderCapabilityStore();
    const blocked = await new ProviderProbeService(blockedStore, {
      probe: async ({ capability }) => capability !== "connectivity",
    }).probe(provider, "model-a");
    expect(blocked.state).toBe("blocked");

    const degradedStore = new MemoryProviderCapabilityStore();
    const degraded = await new ProviderProbeService(degradedStore, {
      probe: async ({ capability }) => capability !== "structuredOutput",
    }).probe(provider, "model-a");
    expect(degraded).toMatchObject({
      state: "degraded",
      capabilities: { connectivity: true, structuredOutput: false },
    });
  });

  it("treats timeout as a failed probe and does not reuse a stale profile version", async () => {
    const store = new MemoryProviderCapabilityStore();
    const service = new ProviderProbeService(
      store,
      {
        probe: ({ capability, signal }) =>
          capability === "streaming"
            ? new Promise<boolean>((_resolve, reject) => {
                signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
              })
            : Promise.resolve(true),
      },
      { timeoutMs: 5 },
    );
    const result = await service.probe(provider, "model-a");
    expect(result.capabilities.streaming).toBe(false);
    const changed = { ...provider, baseUrl: "https://provider-v2.example" };
    await expect(store.get(provider.id, "model-a", providerProfileVersion(changed))).resolves.toBeNull();
  });
});
