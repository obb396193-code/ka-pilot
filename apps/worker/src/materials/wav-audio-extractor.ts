import { lstat, mkdtemp, rm } from "node:fs/promises";
import { dirname, isAbsolute, join } from "node:path";

import type { MediaProcessRunner } from "./media-process-runner.js";

const DEFAULT_MAX_WAV_BYTES = 5 * 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 5 * 60_000;
const MAX_MEDIA_HANDLE_CHARS = 4_096;
const PROCESS_OUTPUT_BUDGET = 64 * 1024;

export type WavAudioExtractorFailureReason =
  | "invalid_config"
  | "invalid_input"
  | "ffmpeg_failed"
  | "invalid_output"
  | "cleanup_failed";

export class WavAudioExtractorError extends Error {
  constructor(readonly reason: WavAudioExtractorFailureReason) {
    super(`WAV audio extraction failed: ${reason}`);
    this.name = "WavAudioExtractorError";
  }
}

export interface ExtractedWavHandle {
  readonly path: string;
  readonly byteLength: number;
  release(): Promise<void>;
}

export interface WavAudioExtractorPort {
  extract(input: { readonly mediaHandle: string }): Promise<ExtractedWavHandle>;
}

export class FfmpegWavAudioExtractor implements WavAudioExtractorPort {
  private readonly runner: MediaProcessRunner;
  private readonly maxWavBytes: number;
  private readonly timeoutMs: number;

  constructor(options: {
    readonly runner: MediaProcessRunner;
    readonly maxWavBytes?: number;
    readonly timeoutMs?: number;
  }) {
    if (typeof options.runner?.run !== "function") throw invalidConfig();
    this.runner = options.runner;
    this.maxWavBytes = positiveInteger(options.maxWavBytes ?? DEFAULT_MAX_WAV_BYTES);
    this.timeoutMs = positiveInteger(options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  }

  async extract(input: { readonly mediaHandle: string }): Promise<ExtractedWavHandle> {
    const mediaHandle = await validateInput(input.mediaHandle);
    let taskRoot: string | undefined;
    try {
      taskRoot = await mkdtemp(join(dirname(mediaHandle), ".ka-asr-wav-"));
      const outputPath = join(taskRoot, "audio.wav");
      const result = await this.runner.run({
        binary: "ffmpeg",
        args: [
          "-hide_banner", "-loglevel", "error", "-nostdin", "-y",
          "-i", mediaHandle,
          "-vn", "-ar", "16000", "-ac", "1", "-c:a", "pcm_s16le",
          outputPath,
        ],
        timeoutMs: this.timeoutMs,
        maxOutputBytes: PROCESS_OUTPUT_BUDGET,
      });
      if (processFailed(result)) {
        throw new WavAudioExtractorError("ffmpeg_failed");
      }
      const output = await safeOutputStat(outputPath);
      if (!output.isFile() || output.isSymbolicLink() || output.size <= 0 || output.size > this.maxWavBytes) {
        throw new WavAudioExtractorError("invalid_output");
      }
      return createHandle(taskRoot, outputPath, output.size);
    } catch (error) {
      if (taskRoot !== undefined) await removeAfterFailure(taskRoot);
      if (error instanceof WavAudioExtractorError) throw error;
      throw new WavAudioExtractorError("ffmpeg_failed");
    }
  }
}

function processFailed(result: {
  readonly exitCode: number | null;
  readonly timedOut: boolean;
  readonly outputTruncated?: boolean;
}): boolean {
  return result.exitCode !== 0 || result.timedOut || result.outputTruncated === true;
}

async function validateInput(value: unknown): Promise<string> {
  if (
    typeof value !== "string" ||
    value.trim() === "" ||
    value.length > MAX_MEDIA_HANDLE_CHARS ||
    value.includes("\0") ||
    !isAbsolute(value)
  ) {
    throw new WavAudioExtractorError("invalid_input");
  }
  try {
    const source = await lstat(value);
    if (!source.isFile() || source.isSymbolicLink()) throw new Error("unsafe input");
  } catch {
    throw new WavAudioExtractorError("invalid_input");
  }
  return value;
}

async function safeOutputStat(value: string) {
  try {
    return await lstat(value);
  } catch {
    throw new WavAudioExtractorError("invalid_output");
  }
}

function createHandle(taskRoot: string, path: string, byteLength: number): ExtractedWavHandle {
  let releasePromise: Promise<void> | undefined;
  return Object.freeze({
    path,
    byteLength,
    release(): Promise<void> {
      releasePromise ??= rm(taskRoot, { recursive: true, force: false }).catch(() => {
        throw new WavAudioExtractorError("cleanup_failed");
      });
      return releasePromise;
    },
  });
}

async function removeAfterFailure(taskRoot: string): Promise<void> {
  try {
    await rm(taskRoot, { recursive: true, force: true });
  } catch {
    // Preserve the primary sanitized failure. Cleanup is retried by the task sandbox lifecycle.
  }
}

function positiveInteger(value: number): number {
  if (!Number.isSafeInteger(value) || value <= 0) throw invalidConfig();
  return value;
}

function invalidConfig(): WavAudioExtractorError {
  return new WavAudioExtractorError("invalid_config");
}
