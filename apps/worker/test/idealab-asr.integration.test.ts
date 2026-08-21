import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import { createIdeaLabWholeTextAsr } from "../src/materials/idealab-asr-factory.js";

const DEFAULT_ENDPOINT =
  "https://idealab.alibaba-inc.com/api/openai/v1/audio/transcriptions";
const smoke = readSmokeInput(process.env);

describe("IdeaLab ASR opt-in smoke", () => {
  it.runIf(smoke !== null)(
    "returns a non-empty whole-video transcript without printing provider data",
    async () => {
      const input = smoke!;
      const bytes = await readFile(input.mediaPath);
      const asr = createIdeaLabWholeTextAsr({
        config: {
          endpoint: input.endpoint,
          apiKey: input.apiKey,
          maxWavBytes: 5 * 1024 * 1024,
          maxResponseBytes: 64 * 1024,
          minTimeoutMs: 30_000,
          maxTimeoutMs: 180_000,
          timeoutMultiplier: 3,
        },
      });
      const output = await asr.transcribe({
        mediaContentSha256: createHash("sha256").update(bytes).digest("hex"),
        mediaHandle: input.mediaPath,
        durationMs: input.durationMs,
      });
      expect(output).toMatchObject({ kind: "whole_text" });
      expect((output as { text?: unknown }).text).toEqual(expect.any(String));
      expect((output as { text: string }).text.length).toBeGreaterThan(0);
    },
    240_000,
  );
});

function readSmokeInput(environment: NodeJS.ProcessEnv): Readonly<{
  apiKey: string;
  endpoint: string;
  mediaPath: string;
  durationMs: number;
}> | null {
  const apiKey = environment.IDEALAB_AK?.trim();
  const mediaPath = environment.IDEALAB_ASR_SMOKE_MEDIA_PATH?.trim();
  if (
    environment.IDEALAB_ASR_SMOKE !== "true" ||
    apiKey === undefined ||
    apiKey.length < 16 ||
    mediaPath === undefined ||
    !existsSync(mediaPath)
  ) {
    return null;
  }
  const durationMs = Number(environment.IDEALAB_ASR_SMOKE_DURATION_MS ?? "60000");
  if (!Number.isSafeInteger(durationMs) || durationMs <= 0) return null;
  return Object.freeze({
    apiKey,
    endpoint: environment.IDEALAB_ASR_ENDPOINT?.trim() || DEFAULT_ENDPOINT,
    mediaPath,
    durationMs,
  });
}
