import { describe, expect, it } from "vitest";

import { MemoryProviderCapabilityStore } from "../../src/agent/provider/capability-store.js";
import {
  ProviderRouter,
  providerProfileVersion,
} from "../../src/agent/provider/router.js";
import type { ProviderProfile } from "../../src/agent/provider/types.js";

describe("ProviderRouter", () => {
  it("rejects duplicate profiles and invalid default models", () => {
    const store = new MemoryProviderCapabilityStore();
    expect(() => new ProviderRouter([profile("same"), profile("same")], store)).toThrow(/duplicate/i);
    expect(
      () => new ProviderRouter([profile("broken", { defaultModel: "missing" })], store),
    ).toThrow(/defaultModel/);
  });

  it("selects only an enabled, task-compatible and fully healthy provider", async () => {
    const store = new MemoryProviderCapabilityStore();
    const disabled = profile("disabled", { enabled: false });
    const diagnosisOnly = profile("diagnosis-only", { taskKinds: ["diagnosis"] });
    const healthy = profile("healthy");
    await store.save(snapshot(healthy));
    const decision = await new ProviderRouter([disabled, diagnosisOnly, healthy], store).route({
      taskKind: "chat",
    });

    expect(decision.selected).toMatchObject({ providerId: "healthy", model: "model-a" });
    expect(decision.candidates.map((candidate) => candidate.providerId)).toEqual(["healthy"]);
    expect(decision.rejected).toEqual([
      expect.objectContaining({ providerId: "disabled", reasons: ["provider_disabled"] }),
      expect.objectContaining({ providerId: "diagnosis-only", reasons: ["task_not_supported"] }),
    ]);
  });

  it("fails closed for missing, stale, degraded and capability-incomplete probes", async () => {
    const store = new MemoryProviderCapabilityStore();
    const missing = profile("missing");
    const degraded = profile("degraded");
    const incomplete = profile("incomplete");
    await store.save(snapshot(degraded, { state: "degraded" }));
    await store.save(
      snapshot(incomplete, { capabilities: { structuredOutput: false } }),
    );
    const decision = await new ProviderRouter([missing, degraded, incomplete], store).route({
      taskKind: "diagnosis",
    });
    expect(decision.selected).toBeNull();
    expect(decision.rejected).toEqual([
      expect.objectContaining({ providerId: "missing", reasons: ["capability_not_probed"] }),
      expect.objectContaining({ providerId: "degraded", reasons: ["provider_state_degraded"] }),
      expect.objectContaining({ providerId: "incomplete", reasons: ["missing_structuredOutput"] }),
    ]);
  });

  it("honors a preferred provider then returns its healthy fallback chain", async () => {
    const store = new MemoryProviderCapabilityStore();
    const first = profile("first");
    const preferred = profile("preferred", { fallbackProviderIds: ["first"] });
    await store.save(snapshot(first));
    await store.save(snapshot(preferred));
    const decision = await new ProviderRouter([first, preferred], store).route({
      taskKind: "chat",
      preferredProviderId: "preferred",
    });
    expect(decision.candidates.map((candidate) => candidate.providerId)).toEqual([
      "preferred",
      "first",
    ]);
  });

  it("does not silently replace an unknown explicitly selected provider", async () => {
    const store = new MemoryProviderCapabilityStore();
    const available = profile("available");
    await store.save(snapshot(available));
    const decision = await new ProviderRouter([available], store).route({
      taskKind: "chat",
      preferredProviderId: "missing-provider",
    });
    expect(decision).toMatchObject({
      selected: null,
      candidates: [],
      rejected: [
        { providerId: "missing-provider", reasons: ["preferred_provider_not_found"] },
      ],
    });
  });
});

function profile(id: string, overrides: Partial<ProviderProfile> = {}): ProviderProfile {
  return {
    id,
    protocol: "openai_chat_completions",
    baseUrl: "https://provider.example/v1",
    models: ["model-a"],
    defaultModel: "model-a",
    enabled: true,
    taskKinds: ["chat", "diagnosis", "background"],
    fallbackProviderIds: [],
    ...overrides,
  };
}

function snapshot(
  provider: ProviderProfile,
  overrides: {
    state?: "healthy" | "degraded";
    capabilities?: Partial<{
      connectivity: boolean;
      streaming: boolean;
      toolCalling: boolean;
      structuredOutput: boolean;
      abort: boolean;
    }>;
  } = {},
) {
  return {
    providerId: provider.id,
    model: provider.defaultModel,
    state: overrides.state ?? "healthy",
    checkedAt: "2026-08-19T10:00:00.000Z",
    version: providerProfileVersion(provider),
    capabilities: {
      connectivity: true,
      streaming: true,
      toolCalling: true,
      structuredOutput: true,
      abort: true,
      ...overrides.capabilities,
    },
  } as const;
}
