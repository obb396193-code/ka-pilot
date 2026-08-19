import { describe, expect, it } from "vitest";

import {
  appendAgentRunEvent,
  createAgentRunEvent,
  hasVisibleAgentOutput,
  isVisibleAgentRunEvent,
} from "../src/agent-events.js";

describe("Agent run events", () => {
  it("accepts a contiguous event sequence and identifies visible output", () => {
    const started = createAgentRunEvent({
      seq: 1,
      at: "2026-08-19T10:00:00.000Z",
      kind: "status",
      payload: { phase: "started" },
    });
    const delta = createAgentRunEvent({
      seq: 2,
      at: "2026-08-19T10:00:00.100Z",
      kind: "delta",
      payload: { text: "正在分析" },
    });

    const events = appendAgentRunEvent(appendAgentRunEvent([], started), delta);
    expect(isVisibleAgentRunEvent(started)).toBe(false);
    expect(isVisibleAgentRunEvent(delta)).toBe(true);
    expect(hasVisibleAgentOutput(events)).toBe(true);
  });

  it("rejects gaps, timestamp rollback and appends after a terminal event", () => {
    const started = event(1, "status", "2026-08-19T10:00:00.000Z");
    expect(() => appendAgentRunEvent([started], event(3, "delta"))).toThrow(/sequence/);
    expect(() =>
      appendAgentRunEvent([started], event(2, "delta", "2026-08-19T09:59:59.000Z")),
    ).toThrow(/timestamp/);

    const done = event(2, "done");
    expect(() => appendAgentRunEvent([started, done], event(3, "delta"))).toThrow(/terminal/);
  });

  it.each([
    { authorization: "Bearer top-secret" },
    { nested: { apiKey: "sk-example" } },
    { credential: { value: "must-not-leak" } },
    { text: "token=mul_example" },
  ])("rejects unsafe event payloads", (payload) => {
    expect(() =>
      createAgentRunEvent({
        seq: 1,
        at: "2026-08-19T10:00:00.000Z",
        kind: "status",
        payload,
      }),
    ).toThrow(/unsafe/i);
  });
});

function event(
  seq: number,
  kind: "status" | "delta" | "done",
  at = `2026-08-19T10:00:0${seq}.000Z`,
) {
  return createAgentRunEvent({ seq, at, kind, payload: { value: kind } });
}
