import { describe, expect, it, vi } from "vitest";

import {
  WholeTextCloudAsrAdapter,
  WholeTextCloudAsrError,
  type WholeTextAsrTransport,
} from "../src/materials/whole-text-cloud-asr.js";

const PROFILE_VERSION = "a".repeat(64);

function adapter(transport: WholeTextAsrTransport) {
  return new WholeTextCloudAsrAdapter({
    transport,
    providerId: "idealab-audio",
    model: "whisper-1",
    profileVersion: PROFILE_VERSION,
  });
}

const input = {
  mediaHandle: "/private/tmp/opaque-media-handle",
  mediaContentSha256: "b".repeat(64),
  durationMs: 12_345,
};

describe("WholeTextCloudAsrAdapter", () => {
  it("calls the configured transport once for the whole video", async () => {
    const transcribe = vi.fn(async () => ({ text: "  第一段。\n第二段。  " }));

    const result = await adapter({ transcribe }).transcribe(input);

    expect(transcribe).toHaveBeenCalledTimes(1);
    expect(transcribe).toHaveBeenCalledWith({
      ...input,
      providerId: "idealab-audio",
      model: "whisper-1",
      profileVersion: PROFILE_VERSION,
    });
    expect(result).toEqual({ kind: "whole_text", text: "第一段。\n第二段。" });
    expect(Object.isFrozen(result)).toBe(true);
  });

  it("rejects malformed or oversized provider output", async () => {
    await expect(adapter({ transcribe: async () => ({ result: "文本" }) }).transcribe(input))
      .rejects.toMatchObject({ reason: "invalid_output" });
    await expect(adapter({ transcribe: async () => ({ text: "x".repeat(200_001) }) }).transcribe(input))
      .rejects.toMatchObject({ reason: "invalid_output" });
    await expect(adapter({ transcribe: async () => ({ text: "" }) }).transcribe(input))
      .rejects.toBeInstanceOf(WholeTextCloudAsrError);
  });

  it("sanitizes transport failures without leaking media handles or credentials", async () => {
    const instance = adapter({
      transcribe: async () => {
        throw new Error("Bearer secret /private/tmp/opaque-media-handle");
      },
    });

    let error: unknown;
    try {
      await instance.transcribe(input);
    } catch (caught) {
      error = caught;
    }
    expect(error).toMatchObject({ reason: "transport_failed" });
    expect(String(error)).not.toContain("secret");
    expect(String(error)).not.toContain("opaque-media-handle");
  });

  it("fails closed on unsafe configuration before invoking the transport", async () => {
    const transcribe = vi.fn(async () => ({ text: "文本" }));

    expect(() => new WholeTextCloudAsrAdapter({
      transport: { transcribe },
      providerId: "",
      model: "whisper-1",
      profileVersion: PROFILE_VERSION,
    })).toThrowError(WholeTextCloudAsrError);
    expect(transcribe).not.toHaveBeenCalled();
  });
});
