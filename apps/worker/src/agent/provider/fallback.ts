import type { AgentRunEvent } from "@ka/domain";

import type { ProviderFallbackInput } from "./types.js";

const RETRYABLE_FAILURES = new Set(["rate_limited", "server_error", "timeout"]);

export function decideProviderFallback(input: ProviderFallbackInput):
  | { action: "fallback"; nextIndex: number; next: ProviderFallbackInput["candidates"][number] }
  | { action: "stop"; reason: "output_committed" | "failure_not_retryable" | "no_fallback_candidate" } {
  assertCurrentIndex(input.currentIndex, input.candidates.length);
  if (hasCommittedOutput(input.events)) {
    return { action: "stop", reason: "output_committed" };
  }
  if (!RETRYABLE_FAILURES.has(input.failure)) {
    return { action: "stop", reason: "failure_not_retryable" };
  }
  const nextIndex = input.currentIndex + 1;
  const next = input.candidates[nextIndex];
  return next === undefined
    ? { action: "stop", reason: "no_fallback_candidate" }
    : { action: "fallback", nextIndex, next };
}

function hasCommittedOutput(events: readonly AgentRunEvent[]): boolean {
  return events.some((event) => event.kind === "delta" || event.kind === "tool");
}

function assertCurrentIndex(index: number, candidateCount: number): void {
  if (!Number.isSafeInteger(index) || index < 0 || index >= candidateCount) {
    throw new Error("Provider fallback current index is outside the candidate chain");
  }
}
