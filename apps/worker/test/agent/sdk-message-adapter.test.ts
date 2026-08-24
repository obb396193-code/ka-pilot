import { describe, expect, it } from "vitest";

import { SdkMessageAdapter } from "../../src/agent/sdk/message-adapter.js";

describe("Claude SDK message adapter", () => {
  it("normalizes text, tool lifecycle, usage and terminal messages", () => {
    const adapter = new SdkMessageAdapter(() => new Date("2026-08-19T10:00:00.000Z"));
    expect(
      adapter.adapt({
        type: "stream_event",
        event: { type: "content_block_delta", delta: { type: "text_delta", text: "正在分析" } },
      }),
    ).toEqual([
      expect.objectContaining({ seq: 1, kind: "delta", payload: { text: "正在分析" } }),
    ]);
    expect(
      adapter.adapt({
        type: "stream_event",
        event: {
          type: "content_block_start",
          index: 2,
          content_block: { type: "tool_use", id: "tool-alpha", name: "mcp__ka__query_metrics" },
        },
      }),
    ).toEqual([
      expect.objectContaining({
        seq: 2,
        kind: "tool",
        payload: { phase: "start", id: "tool-alpha", name: "mcp__ka__query_metrics" },
      }),
    ]);
    expect(
      adapter.adapt({ type: "stream_event", event: { type: "content_block_stop", index: 2 } }),
    ).toEqual([
      expect.objectContaining({
        seq: 3,
        kind: "tool",
        payload: { phase: "stop", id: "tool-alpha", name: "mcp__ka__query_metrics" },
      }),
    ]);
    expect(
      adapter.adapt({
        type: "result",
        subtype: "success",
        is_error: false,
        result: "完成",
        total_cost_usd: 0.02,
        usage: { input_tokens: 10, output_tokens: 5 },
      }),
    ).toEqual([
      expect.objectContaining({
        seq: 4,
        kind: "usage",
        payload: { inputCount: 10, outputCount: 5, estimatedCostUsd: 0.02 },
      }),
      expect.objectContaining({ seq: 5, kind: "done", payload: { outcome: "success" } }),
    ]);
  });

  it("emits only safe error codes and counts unknown SDK messages", () => {
    const adapter = new SdkMessageAdapter(() => new Date("2026-08-19T10:00:00.000Z"));
    expect(adapter.adapt({ type: "future_sdk_event", secret: "ignored" })).toEqual([]);
    expect(adapter.unknownMessageCount).toBe(1);
    expect(
      adapter.adapt({
        type: "result",
        subtype: "error_max_turns",
        is_error: true,
        errors: ["Bearer must-not-leak"],
        usage: {},
        total_cost_usd: 0,
      }),
    ).toEqual([
      expect.objectContaining({
        kind: "error",
        payload: { code: "error_max_turns" },
      }),
    ]);
  });
});
