import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  IdeaLabAsrTransport,
  IdeaLabAsrTransportError,
  computeIdeaLabTimeoutMs,
  type IdeaLabAsrObservation,
} from "../src/materials/idealab-asr-transport.js";
import type {
  ExtractedWavHandle,
  WavAudioExtractorPort,
} from "../src/materials/wav-audio-extractor.js";

const roots: string[] = [];
const API_KEY = "secret-ak-value";
const ENDPOINT = "https://idealab.alibaba-inc.com/api/openai/v1/audio/transcriptions";
const input = {
  mediaHandle: "/private/tmp/opaque-source.media",
  mediaContentSha256: "a".repeat(64),
  durationMs: 20_800,
  providerId: "idealab-audio",
  model: "whisper",
  profileVersion: "b".repeat(64),
};

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function audioHandle(options: { releaseError?: boolean } = {}): Promise<ExtractedWavHandle> {
  const root = await mkdtemp(join(tmpdir(), "ka-idealab-transport-"));
  roots.push(root);
  const path = join(root, "audio.wav");
  const bytes = Buffer.from("RIFF-test-audio");
  await writeFile(path, bytes);
  let released = false;
  return {
    path,
    byteLength: bytes.byteLength,
    async release() {
      released = true;
      if (options.releaseError === true) throw new Error("secret cleanup path");
    },
    get released() {
      return released;
    },
  } as ExtractedWavHandle;
}

function successResponse(overrides: Record<string, unknown> = {}): Response {
  return new Response(JSON.stringify({
    text: "感谢观看",
    usage: {
      prompt_tokens: 7,
      completion_tokens: 0,
      total_tokens: 7,
      cacheReadInputTokensCompatible: 0,
    },
    ...overrides,
  }), { status: 200, headers: { "content-type": "application/json" } });
}

function transport(options: {
  fetchFn?: typeof fetch;
  extractor?: WavAudioExtractorPort;
  observations?: IdeaLabAsrObservation[];
  releaseError?: boolean;
  maxResponseBytes?: number;
} = {}) {
  let handle: ExtractedWavHandle | undefined;
  const extractor = options.extractor ?? {
    async extract() {
      handle = await audioHandle(
        options.releaseError === undefined ? {} : { releaseError: options.releaseError },
      );
      return handle;
    },
  };
  const observations = options.observations ?? [];
  return {
    instance: new IdeaLabAsrTransport({
      extractor,
      fetchFn: options.fetchFn ?? vi.fn(async () => successResponse()),
      endpoint: ENDPOINT,
      apiKey: API_KEY,
      maxResponseBytes: options.maxResponseBytes ?? 64 * 1024,
      minTimeoutMs: 30_000,
      maxTimeoutMs: 180_000,
      timeoutMultiplier: 3,
      now: (() => {
        let value = 1_000;
        return () => (value += 25);
      })(),
      onObservation: (event) => observations.push(event),
    }),
    observations,
    handle: () => handle,
  };
}

describe("IdeaLabAsrTransport", () => {
  it("posts the verified multipart contract and normalizes text plus numeric usage", async () => {
    const fetchFn = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      expect(String(url)).toBe(ENDPOINT);
      expect(init?.method).toBe("POST");
      expect(init?.redirect).toBe("error");
      expect(new Headers(init?.headers).get("authorization")).toBe(`Bearer ${API_KEY}`);
      expect(init?.signal).toBeInstanceOf(AbortSignal);
      const body = init?.body;
      expect(body).toBeInstanceOf(FormData);
      const form = body as FormData;
      expect(form.get("model")).toBe("whisper");
      expect(form.get("response_format")).toBe("json");
      const file = form.get("file");
      expect(file).toBeInstanceOf(Blob);
      expect((file as Blob).type).toBe("audio/wav");
      expect((file as Blob).size).toBe(15);
      return successResponse();
    });
    const context = transport({ fetchFn });

    await expect(context.instance.transcribe(input)).resolves.toEqual({ text: "感谢观看" });

    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect((context.handle() as ExtractedWavHandle & { released: boolean }).released).toBe(true);
    expect(context.observations).toEqual([{
      outcome: "success",
      providerId: "idealab-audio",
      model: "whisper",
      durationMs: 20_800,
      timeoutMs: 62_400,
      elapsedMs: 25,
      audioBytes: 15,
      textCharacters: 4,
      usage: {
        promptTokens: 7,
        completionTokens: 0,
        totalTokens: 7,
        cacheReadInputTokensCompatible: 0,
      },
    }]);
    expect(JSON.stringify(context.observations)).not.toContain("感谢观看");
    expect(JSON.stringify(context.observations)).not.toContain(API_KEY);
    expect(JSON.stringify(context.observations)).not.toContain("opaque-source");
  });

  it.each([
    { durationMs: 1_000, expected: 30_000 },
    { durationMs: 20_800, expected: 62_400 },
    { durationMs: 120_000, expected: 180_000 },
  ])("bounds timeout for $durationMs ms of audio", ({ durationMs, expected }) => {
    expect(computeIdeaLabTimeoutMs({
      durationMs,
      minTimeoutMs: 30_000,
      maxTimeoutMs: 180_000,
      timeoutMultiplier: 3,
    })).toBe(expected);
  });

  it.each([
    { status: 400, reason: "invalid_request" },
    { status: 401, reason: "auth_failed" },
    { status: 403, reason: "auth_failed" },
    { status: 429, reason: "rate_limited" },
    { status: 500, reason: "retryable_transport" },
    { status: 503, reason: "retryable_transport" },
  ] as const)("classifies HTTP $status as $reason without retrying", async ({ status, reason }) => {
    const fetchFn = vi.fn(async () => new Response("provider secret body", { status }));
    const context = transport({ fetchFn });

    await expect(context.instance.transcribe(input)).rejects.toMatchObject({ reason });
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect((context.handle() as ExtractedWavHandle & { released: boolean }).released).toBe(true);
    expect(context.observations.at(-1)).toMatchObject({ outcome: "failure", reason, httpStatus: status });
    expect(JSON.stringify(context.observations)).not.toContain("provider secret body");
  });

  it("classifies network failures as retryable and sanitizes the original cause", async () => {
    const fetchFn = vi.fn(async () => {
      throw new Error(`Bearer ${API_KEY} ${input.mediaHandle}`);
    });
    const context = transport({ fetchFn });

    let error: unknown;
    try {
      await context.instance.transcribe(input);
    } catch (caught) {
      error = caught;
    }
    expect(error).toMatchObject({ reason: "retryable_transport" });
    expect(String(error)).not.toContain(API_KEY);
    expect(String(error)).not.toContain(input.mediaHandle);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it.each([
    { label: "invalid JSON", response: () => new Response("not-json", { status: 200 }) },
    { label: "an empty text", response: () => successResponse({ text: "" }) },
    { label: "an extra top-level field", response: () => successResponse({ requestId: "unexpected" }) },
    { label: "invalid usage", response: () => successResponse({ usage: { total_tokens: -1 } }) },
  ])("fails closed on $label", async ({ response }) => {
    const context = transport({ fetchFn: vi.fn(async () => response()) });
    await expect(context.instance.transcribe(input)).rejects.toMatchObject({ reason: "invalid_response" });
  });

  it("stops reading a response that exceeds the configured byte budget", async () => {
    const context = transport({
      maxResponseBytes: 16,
      fetchFn: vi.fn(async () => successResponse()),
    });
    await expect(context.instance.transcribe(input)).rejects.toMatchObject({ reason: "invalid_response" });
  });

  it("reports cleanup failure after success but preserves an earlier request failure", async () => {
    const success = transport({ releaseError: true });
    await expect(success.instance.transcribe(input)).rejects.toMatchObject({ reason: "cleanup_failed" });

    const requestFailure = transport({
      releaseError: true,
      fetchFn: vi.fn(async () => new Response("bad", { status: 400 })),
    });
    await expect(requestFailure.instance.transcribe(input)).rejects.toMatchObject({ reason: "invalid_request" });
  });

  it("rejects unsafe configuration and unsupported model before extraction", async () => {
    const extract = vi.fn(async () => audioHandle());
    expect(() => new IdeaLabAsrTransport({
      extractor: { extract },
      endpoint: "http://idealab.invalid/asr",
      apiKey: API_KEY,
      maxResponseBytes: 1024,
      minTimeoutMs: 30_000,
      maxTimeoutMs: 10_000,
      timeoutMultiplier: 3,
    })).toThrow(IdeaLabAsrTransportError);

    const context = transport({ extractor: { extract } });
    await expect(context.instance.transcribe({ ...input, model: "whisper-1" }))
      .rejects.toMatchObject({ reason: "invalid_input" });
    expect(extract).not.toHaveBeenCalled();
  });
});
