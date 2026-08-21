import { writeFile } from "node:fs/promises";

import { describe, expect, it, vi } from "vitest";

import type { IdeaLabAsrObservation } from "../src/materials/idealab-asr-transport.js";
import {
  IDEALAB_ASR_PROFILE_VERSION,
  createIdeaLabWholeTextAsr,
} from "../src/materials/idealab-asr-factory.js";
import type {
  MediaProcessInvocation,
  MediaProcessRunner,
  MediaProcessResult,
} from "../src/materials/media-process-runner.js";

const SHA256 = "a".repeat(64);

class WavWritingRunner implements MediaProcessRunner {
  readonly invocations: MediaProcessInvocation[] = [];

  async run(invocation: MediaProcessInvocation): Promise<MediaProcessResult> {
    this.invocations.push(invocation);
    const outputPath = invocation.args.at(-1);
    if (outputPath === undefined) throw new Error("missing output");
    await writeFile(outputPath, "RIFF-factory-test");
    return {
      exitCode: 0,
      stdout: "",
      stderr: "",
      timedOut: false,
      outputTruncated: false,
    };
  }
}

describe("createIdeaLabWholeTextAsr", () => {
  it("assembles the verified provider profile and keeps usage outside domain output", async () => {
    const runner = new WavWritingRunner();
    const observations: IdeaLabAsrObservation[] = [];
    const fetchFn = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      const form = init?.body;
      expect(form).toBeInstanceOf(FormData);
      expect(form instanceof FormData ? form.get("model") : undefined).toBe("whisper");
      return new Response(JSON.stringify({
        text: "好",
        usage: {
          prompt_tokens: 7,
          completion_tokens: 0,
          total_tokens: 7,
          cacheReadInputTokensCompatible: 0,
        },
      }), { headers: { "content-type": "application/json" } });
    });

    const asr = createIdeaLabWholeTextAsr({
      config: {
        endpoint: "https://idealab.alibaba-inc.com/api/openai/v1/audio/transcriptions",
        apiKey: "k".repeat(32),
        maxWavBytes: 5 * 1024 * 1024,
        maxResponseBytes: 64 * 1024,
        minTimeoutMs: 30_000,
        maxTimeoutMs: 180_000,
        timeoutMultiplier: 3,
      },
      runner,
      fetchFn,
      onObservation: (event) => observations.push(event),
    });

    const output = await asr.transcribe({
      mediaContentSha256: SHA256,
      mediaHandle: import.meta.filename,
      durationMs: 20_800,
    });
    expect(output).toEqual({ kind: "whole_text", text: "好" });
    expect(fetchFn).toHaveBeenCalledOnce();
    expect(runner.invocations).toHaveLength(1);
    expect(observations).toEqual([expect.objectContaining({
      outcome: "success",
      providerId: "idealab-audio",
      model: "whisper",
      textCharacters: 1,
      usage: {
        promptTokens: 7,
        completionTokens: 0,
        totalTokens: 7,
        cacheReadInputTokensCompatible: 0,
      },
    })]);
    expect(output).not.toBeNull();
    expect(typeof output).toBe("object");
    expect(Object.keys(output as object)).toEqual(["kind", "text"]);
  });

  it("exposes a stable SHA-256 profile version", () => {
    expect(IDEALAB_ASR_PROFILE_VERSION).toMatch(/^[a-f0-9]{64}$/);
    expect(IDEALAB_ASR_PROFILE_VERSION).toBe(
      "c0155d81ac5cc940326f22825dff8367cb00f157a38fb4c41c3d018c12c60f4c",
    );
  });
});
