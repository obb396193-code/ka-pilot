import { describe, expect, it } from "vitest";

import {
  assessProviderReadiness,
  requiredProviderCapabilities,
  type ProviderCapabilitySnapshot,
} from "../src/agent-provider.js";

describe("Agent provider capability policy", () => {
  it("defines scenario-specific capability requirements", () => {
    expect(requiredProviderCapabilities("chat")).toEqual([
      "connectivity",
      "streaming",
      "toolCalling",
      "abort",
    ]);
    expect(requiredProviderCapabilities("diagnosis")).toEqual([
      "connectivity",
      "structuredOutput",
      "abort",
    ]);
  });

  it("fails closed unless the provider is healthy and every required probe passed", () => {
    expect(assessProviderReadiness(snapshot({ state: "unknown" }), "chat")).toMatchObject({
      eligible: false,
      reasons: ["provider_state_unknown"],
    });
    expect(
      assessProviderReadiness(
        snapshot({ capabilities: { structuredOutput: false } }),
        "diagnosis",
      ),
    ).toEqual({ eligible: false, reasons: ["missing_structuredOutput"] });
    expect(assessProviderReadiness(snapshot(), "chat")).toEqual({
      eligible: true,
      reasons: [],
    });
  });

  it.each(["probing", "degraded", "blocked"] as const)(
    "does not route a %s provider as healthy",
    (state) => {
      expect(assessProviderReadiness(snapshot({ state }), "chat").eligible).toBe(false);
    },
  );
});

function snapshot(
  overrides: Omit<Partial<ProviderCapabilitySnapshot>, "capabilities"> & {
    capabilities?: Partial<ProviderCapabilitySnapshot["capabilities"]>;
  } = {},
): ProviderCapabilitySnapshot {
  return {
    providerId: "provider-a",
    model: "model-a",
    state: overrides.state ?? "healthy",
    checkedAt: "2026-08-19T10:00:00.000Z",
    version: "profile-v1",
    capabilities: {
      connectivity: true,
      streaming: true,
      toolCalling: true,
      structuredOutput: true,
      abort: true,
      ...overrides.capabilities,
    },
  };
}
