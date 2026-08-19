import { describe, expect, it } from "vitest";

import { decideProviderFallback } from "../../src/agent/provider/fallback.js";
import type { ProviderCandidate } from "../../src/agent/provider/types.js";

const candidates: ProviderCandidate[] = [
  { providerId: "primary", model: "model-a", profileVersion: "v1", protocol: "anthropic_messages" },
  { providerId: "secondary", model: "model-b", profileVersion: "v2", protocol: "openai_chat_completions" },
];

describe("Provider fallback boundary", () => {
  it.each(["rate_limited", "server_error", "timeout"] as const)(
    "moves to the next candidate on %s before visible output",
    (failure) => {
      expect(
        decideProviderFallback({ candidates, currentIndex: 0, events: [], failure }),
      ).toEqual({ action: "fallback", nextIndex: 1, next: candidates[1] });
    },
  );

  it.each(["delta", "tool"] as const)(
    "never replays after the first %s event",
    (kind) => {
      expect(
        decideProviderFallback({
          candidates,
          currentIndex: 0,
          events: [{ seq: 1, at: "2026-08-19T10:00:00.000Z", kind, payload: {} }],
          failure: "server_error",
        }),
      ).toEqual({ action: "stop", reason: "output_committed" });
    },
  );

  it("does not fallback on auth/input failures or after the candidate chain ends", () => {
    expect(
      decideProviderFallback({ candidates, currentIndex: 0, events: [], failure: "auth_error" }),
    ).toEqual({ action: "stop", reason: "failure_not_retryable" });
    expect(
      decideProviderFallback({ candidates, currentIndex: 1, events: [], failure: "timeout" }),
    ).toEqual({ action: "stop", reason: "no_fallback_candidate" });
  });
});
