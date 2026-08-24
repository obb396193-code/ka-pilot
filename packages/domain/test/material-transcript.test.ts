import { describe, expect, it, vi } from "vitest";

import {
  MaterialTranscriptError,
  fingerprintTranscriptTimeline,
  parseTranscriptTimeline,
  resolveTranscriptTimeline,
} from "../src/material-transcript.js";

const sha = "a".repeat(64);

function segments() {
  return [
    { startMs: 0, endMs: 1_000, text: "前三秒钩子" },
    { startMs: 1_000, endMs: 2_500, text: "核心卖点" },
  ];
}

describe("material transcript", () => {
  it("uses valid platform captions without invoking cloud ASR", async () => {
    const cloudAsr = { transcribe: vi.fn() };

    const result = await resolveTranscriptTimeline({
      durationMs: 3_000,
      mediaContentSha256: sha,
      mediaHandle: "media-handle",
      platformSegments: segments(),
      cloudAsr,
    });

    expect(result.source).toBe("platform_caption");
    expect(result.timingPrecision).toBe("segment");
    expect(result.platformCaptionStatus).toBe("accepted");
    expect(result.segments).toHaveLength(2);
    expect(cloudAsr.transcribe).not.toHaveBeenCalled();
  });

  it("falls back once to cloud ASR when platform captions are missing", async () => {
    const cloudAsr = { transcribe: vi.fn().mockResolvedValue(segments()) };

    const result = await resolveTranscriptTimeline({
      durationMs: 3_000,
      mediaContentSha256: sha,
      mediaHandle: "media-handle",
      cloudAsr,
    });

    expect(result.source).toBe("cloud_asr");
    expect(result.timingPrecision).toBe("segment");
    expect(result.platformCaptionStatus).toBe("missing");
    expect(cloudAsr.transcribe).toHaveBeenCalledOnce();
    expect(cloudAsr.transcribe).toHaveBeenCalledWith({
      mediaContentSha256: sha,
      mediaHandle: "media-handle",
      durationMs: 3_000,
    });
  });

  it("accepts one whole-text cloud response without inventing sentence timestamps", async () => {
    const cloudAsr = {
      transcribe: vi.fn().mockResolvedValue({
        kind: "whole_text",
        text: "前三秒提出问题，随后说明核心卖点，最后引导行动。",
      }),
    };

    const result = await resolveTranscriptTimeline({
      durationMs: 30_000,
      mediaContentSha256: sha,
      mediaHandle: "media-handle",
      cloudAsr,
    });

    expect(cloudAsr.transcribe).toHaveBeenCalledOnce();
    expect(result).toMatchObject({
      source: "cloud_asr",
      timingPrecision: "whole_video",
      platformCaptionStatus: "missing",
      segments: [{
        startMs: 0,
        endMs: 30_000,
        timingPrecision: "whole_video",
        text: "前三秒提出问题，随后说明核心卖点，最后引导行动。",
      }],
    });
  });

  it("falls back to cloud ASR when supplied platform captions are invalid", async () => {
    const cloudAsr = { transcribe: vi.fn().mockResolvedValue(segments()) };

    const result = await resolveTranscriptTimeline({
      durationMs: 3_000,
      mediaContentSha256: sha,
      mediaHandle: "media-handle",
      platformSegments: [{ startMs: 2_000, endMs: 4_000, text: "越界" }],
      cloudAsr,
    });

    expect(result.source).toBe("cloud_asr");
    expect(result.platformCaptionStatus).toBe("invalid");
    expect(cloudAsr.transcribe).toHaveBeenCalledOnce();
  });

  it("blocks instead of silently using local ASR when no cloud provider exists", async () => {
    await expect(resolveTranscriptTimeline({
      durationMs: 3_000,
      mediaContentSha256: sha,
      mediaHandle: "media-handle",
    })).rejects.toMatchObject({
      code: "blocked_transcript_provider",
    });
  });

  it("maps cloud transport failures to a stable safe code", async () => {
    const cloudAsr = {
      transcribe: vi.fn().mockRejectedValue(new Error("failed for /tmp/private-media.mp4")),
    };

    let error: unknown;
    try {
      await resolveTranscriptTimeline({
        durationMs: 3_000,
        mediaContentSha256: sha,
        mediaHandle: "media-handle",
        cloudAsr,
      });
    } catch (caught) {
      error = caught;
    }

    expect(error).toMatchObject({ code: "cloud_asr_failed" });
    expect(String(error)).not.toContain("private-media");
  });

  it("rejects invalid cloud output without exposing transcript text", async () => {
    const cloudAsr = {
      transcribe: vi.fn().mockResolvedValue([
        { startMs: 0, endMs: 3_001, text: "confidential spoken sentence" },
      ]),
    };

    let error: unknown;
    try {
      await resolveTranscriptTimeline({
        durationMs: 3_000,
        mediaContentSha256: sha,
        mediaHandle: "media-handle",
        cloudAsr,
      });
    } catch (caught) {
      error = caught;
    }

    expect(error).toMatchObject({ code: "cloud_asr_invalid" });
    expect(String(error)).not.toContain("confidential spoken sentence");
  });

  it.each([
    ["overlap", [
      { startMs: 0, endMs: 1_500, text: "a" },
      { startMs: 1_000, endMs: 2_000, text: "b" },
    ]],
    ["unsorted", [
      { startMs: 1_000, endMs: 2_000, text: "a" },
      { startMs: 0, endMs: 500, text: "b" },
    ]],
    ["empty text", [{ startMs: 0, endMs: 1_000, text: "  " }]],
    ["fractional time", [{ startMs: 0.5, endMs: 1_000, text: "a" }]],
    ["out of duration", [{ startMs: 0, endMs: 3_001, text: "a" }]],
  ])("rejects %s timelines", (_label, value) => {
    expect(() => parseTranscriptTimeline({
      durationMs: 3_000,
      source: "platform_caption",
      segments: value,
    })).toThrow(MaterialTranscriptError);
  });

  it("rejects accessor-backed segment objects", () => {
    const unsafe = Object.create(null) as Record<string, unknown>;
    Object.defineProperties(unsafe, {
      startMs: { value: 0, enumerable: true },
      endMs: { value: 1_000, enumerable: true },
      text: { get: () => "hidden", enumerable: true },
    });

    expect(() => parseTranscriptTimeline({
      durationMs: 3_000,
      source: "platform_caption",
      segments: [unsafe],
    })).toThrow(MaterialTranscriptError);
  });

  it("enforces segment and text budgets", () => {
    expect(() => parseTranscriptTimeline({
      durationMs: 20_001,
      source: "platform_caption",
      segments: Array.from({ length: 10_001 }, (_, index) => ({
        startMs: index * 2,
        endMs: index * 2 + 1,
        text: "x",
      })),
    })).toThrow(MaterialTranscriptError);

    expect(() => parseTranscriptTimeline({
      durationMs: 5_000,
      source: "platform_caption",
      segments: [{ startMs: 0, endMs: 1_000, text: "x".repeat(4_001) }],
    })).toThrow(MaterialTranscriptError);
  });

  it("creates stable fingerprints while preserving array order", () => {
    const first = parseTranscriptTimeline({
      durationMs: 3_000,
      source: "platform_caption",
      segments: segments(),
    });
    const second = parseTranscriptTimeline({
      source: "platform_caption",
      segments: segments().map(({ text, endMs, startMs }) => ({ text, endMs, startMs })),
      durationMs: 3_000,
    });

    expect(fingerprintTranscriptTimeline(first)).toBe(fingerprintTranscriptTimeline(second));
    expect(first.fingerprint).toBe(second.fingerprint);
    expect(first.segments).not.toBe(segments());
  });

  it("includes timing precision in the stable fingerprint", () => {
    const segmented = parseTranscriptTimeline({
      durationMs: 3_000,
      source: "cloud_asr",
      timingPrecision: "segment",
      segments: [{ startMs: 0, endMs: 3_000, text: "完整文案" }],
    });
    const wholeVideo = parseTranscriptTimeline({
      durationMs: 3_000,
      source: "cloud_asr",
      timingPrecision: "whole_video",
      segments: [{ startMs: 0, endMs: 3_000, text: "完整文案" }],
    });

    expect(segmented.fingerprint).not.toBe(wholeVideo.fingerprint);
  });

  it.each([
    { kind: "whole_text", text: "" },
    { kind: "whole_text", text: "x", extra: true },
    { kind: "wrong", text: "x" },
  ])("rejects malformed whole-text cloud output %#", async (output) => {
    const cloudAsr = { transcribe: vi.fn().mockResolvedValue(output) };

    await expect(resolveTranscriptTimeline({
      durationMs: 3_000,
      mediaContentSha256: sha,
      mediaHandle: "media-handle",
      cloudAsr,
    })).rejects.toMatchObject({ code: "cloud_asr_invalid" });
  });

  it("rejects accessor-backed whole-text output without reading it", async () => {
    const getter = vi.fn(() => "hidden transcript");
    const unsafe = Object.create(null) as Record<string, unknown>;
    Object.defineProperties(unsafe, {
      kind: { value: "whole_text", enumerable: true },
      text: { get: getter, enumerable: true },
    });
    const cloudAsr = { transcribe: vi.fn().mockResolvedValue(unsafe) };

    await expect(resolveTranscriptTimeline({
      durationMs: 3_000,
      mediaContentSha256: sha,
      mediaHandle: "media-handle",
      cloudAsr,
    })).rejects.toMatchObject({ code: "cloud_asr_invalid" });
    expect(getter).not.toHaveBeenCalled();
  });

  it("rejects prototype-bearing whole-text output", async () => {
    class ProviderResponse {
      kind = "whole_text";
      text = "hidden transcript";
    }
    const cloudAsr = { transcribe: vi.fn().mockResolvedValue(new ProviderResponse()) };

    await expect(resolveTranscriptTimeline({
      durationMs: 3_000,
      mediaContentSha256: sha,
      mediaHandle: "media-handle",
      cloudAsr,
    })).rejects.toMatchObject({ code: "cloud_asr_invalid" });
  });

  it("accepts only the two explicit remote transcript sources", () => {
    expect(() => parseTranscriptTimeline({
      durationMs: 3_000,
      source: "local_asr" as "platform_caption",
      segments: segments(),
    })).toThrow(MaterialTranscriptError);
  });
});
