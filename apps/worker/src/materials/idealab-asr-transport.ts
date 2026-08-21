import { lstat, readFile } from "node:fs/promises";

import type {
  WholeTextAsrTransport,
  WholeTextAsrTransportInput,
} from "./whole-text-cloud-asr.js";
import {
  IdeaLabAsrTransportError,
  type IdeaLabAsrTransportFailureReason,
} from "./idealab-asr-errors.js";
import {
  parseIdeaLabAsrResponse,
  readBoundedIdeaLabJson,
  type IdeaLabAsrUsage,
  type ParsedIdeaLabAsrResponse,
} from "./idealab-asr-response.js";
import {
  assertIdeaLabTransportInput,
  computeIdeaLabTimeoutMs,
  isPositiveFinite,
  isPositiveInteger,
  isSafeIdeaLabApiKey,
  isSafeIdeaLabEndpoint,
} from "./idealab-asr-validation.js";
import {
  WavAudioExtractorError,
  type ExtractedWavHandle,
  type WavAudioExtractorPort,
} from "./wav-audio-extractor.js";

const DEFAULT_MAX_WAV_BYTES = 5 * 1024 * 1024;

export { IdeaLabAsrTransportError } from "./idealab-asr-errors.js";
export type { IdeaLabAsrTransportFailureReason } from "./idealab-asr-errors.js";
export type { IdeaLabAsrUsage } from "./idealab-asr-response.js";
export { computeIdeaLabTimeoutMs } from "./idealab-asr-validation.js";

export type IdeaLabAsrObservation = Readonly<{
  outcome: "success" | "failure";
  providerId: "idealab-audio";
  model: "whisper";
  durationMs: number;
  timeoutMs: number;
  elapsedMs: number;
  audioBytes?: number;
  httpStatus?: number;
  reason?: IdeaLabAsrTransportFailureReason;
  textCharacters?: number;
  usage?: IdeaLabAsrUsage;
}>;

interface IdeaLabAsrTransportOptions {
  readonly extractor: WavAudioExtractorPort;
  readonly fetchFn?: typeof fetch;
  readonly endpoint: string;
  readonly apiKey: string;
  readonly maxWavBytes?: number;
  readonly maxResponseBytes: number;
  readonly minTimeoutMs: number;
  readonly maxTimeoutMs: number;
  readonly timeoutMultiplier: number;
  readonly now?: () => number;
  readonly onObservation?: (event: IdeaLabAsrObservation) => void;
}

export class IdeaLabAsrTransport implements WholeTextAsrTransport {
  private readonly extractor: WavAudioExtractorPort;
  private readonly fetchFn: typeof fetch;
  private readonly endpoint: string;
  private readonly apiKey: string;
  private readonly maxWavBytes: number;
  private readonly maxResponseBytes: number;
  private readonly minTimeoutMs: number;
  private readonly maxTimeoutMs: number;
  private readonly timeoutMultiplier: number;
  private readonly now: () => number;
  private readonly onObservation: ((event: IdeaLabAsrObservation) => void) | undefined;

  constructor(options: IdeaLabAsrTransportOptions) {
    assertValidOptions(options);
    this.extractor = options.extractor;
    this.fetchFn = options.fetchFn ?? fetch;
    this.endpoint = options.endpoint;
    this.apiKey = options.apiKey;
    this.maxWavBytes = options.maxWavBytes ?? DEFAULT_MAX_WAV_BYTES;
    this.maxResponseBytes = options.maxResponseBytes;
    this.minTimeoutMs = options.minTimeoutMs;
    this.maxTimeoutMs = options.maxTimeoutMs;
    this.timeoutMultiplier = options.timeoutMultiplier;
    this.now = options.now ?? Date.now;
    this.onObservation = options.onObservation;
  }

  async transcribe(input: WholeTextAsrTransportInput): Promise<Readonly<{ text: string }>> {
    assertIdeaLabTransportInput(input);
    const timeoutMs = computeIdeaLabTimeoutMs({
      durationMs: input.durationMs,
      minTimeoutMs: this.minTimeoutMs,
      maxTimeoutMs: this.maxTimeoutMs,
      timeoutMultiplier: this.timeoutMultiplier,
    });
    const startedAt = this.now();
    let wav: ExtractedWavHandle | undefined;
    let parsed: ParsedIdeaLabAsrResponse | undefined;
    let failure: IdeaLabAsrTransportError | undefined;
    try {
      wav = await this.extractor.extract({ mediaHandle: input.mediaHandle });
      parsed = await this.request(wav, timeoutMs);
    } catch (error) {
      failure = normalizeFailure(error);
    }
    if (wav !== undefined) {
      try {
        await wav.release();
      } catch {
        failure ??= new IdeaLabAsrTransportError("cleanup_failed");
      }
    }
    const elapsedMs = safeElapsed(startedAt, this.now());
    if (failure !== undefined) {
      this.observe({
        outcome: "failure",
        providerId: "idealab-audio",
        model: "whisper",
        durationMs: input.durationMs,
        timeoutMs,
        elapsedMs,
        ...(wav === undefined ? {} : { audioBytes: wav.byteLength }),
        ...(failure.httpStatus === undefined ? {} : { httpStatus: failure.httpStatus }),
        reason: failure.reason,
      });
      throw failure;
    }
    if (parsed === undefined || wav === undefined) {
      throw new IdeaLabAsrTransportError("invalid_response");
    }
    this.observe({
      outcome: "success",
      providerId: "idealab-audio",
      model: "whisper",
      durationMs: input.durationMs,
      timeoutMs,
      elapsedMs,
      audioBytes: wav.byteLength,
      textCharacters: parsed.text.length,
      usage: parsed.usage,
    });
    return Object.freeze({ text: parsed.text });
  }

  private async request(
    wav: ExtractedWavHandle,
    timeoutMs: number,
  ): Promise<ParsedIdeaLabAsrResponse> {
    const bytes = await readVerifiedWav(wav, this.maxWavBytes);
    const form = new FormData();
    form.set("file", new Blob([Uint8Array.from(bytes)], { type: "audio/wav" }), "audio.wav");
    form.set("model", "whisper");
    form.set("response_format", "json");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let response: Response;
    try {
      response = await this.fetchFn(this.endpoint, {
        method: "POST",
        redirect: "error",
        headers: { authorization: `Bearer ${this.apiKey}` },
        body: form,
        signal: controller.signal,
      });
    } catch {
      throw new IdeaLabAsrTransportError("retryable_transport");
    } finally {
      clearTimeout(timer);
    }
    if (!response.ok) throw classifyHttpStatus(response.status);
    const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
    if (!contentType.includes("application/json")) {
      throw new IdeaLabAsrTransportError("invalid_response", response.status);
    }
    return parseIdeaLabAsrResponse(
      await readBoundedIdeaLabJson(response, this.maxResponseBytes),
    );
  }

  private observe(event: IdeaLabAsrObservation): void {
    try {
      this.onObservation?.(Object.freeze(event));
    } catch {
      // Observability must not change media processing outcome.
    }
  }
}

function assertValidOptions(options: IdeaLabAsrTransportOptions): void {
  assertCoreOptions(options);
  assertBudgetOptions(options);
  assertOptionalHooks(options);
}

function assertCoreOptions(options: IdeaLabAsrTransportOptions): void {
  if (
    typeof options.extractor?.extract !== "function" ||
    typeof (options.fetchFn ?? fetch) !== "function" ||
    !isSafeIdeaLabEndpoint(options.endpoint) ||
    !isSafeIdeaLabApiKey(options.apiKey)
  ) {
    throw new IdeaLabAsrTransportError("invalid_config");
  }
}

function assertBudgetOptions(options: IdeaLabAsrTransportOptions): void {
  if (
    !isPositiveInteger(options.maxWavBytes ?? DEFAULT_MAX_WAV_BYTES) ||
    !isPositiveInteger(options.maxResponseBytes) ||
    !isPositiveInteger(options.minTimeoutMs) ||
    !isPositiveInteger(options.maxTimeoutMs) ||
    options.minTimeoutMs > options.maxTimeoutMs ||
    !isPositiveFinite(options.timeoutMultiplier) ||
    options.timeoutMultiplier > 100
  ) {
    throw new IdeaLabAsrTransportError("invalid_config");
  }
}

function assertOptionalHooks(options: IdeaLabAsrTransportOptions): void {
  if (
    (options.now !== undefined && typeof options.now !== "function") ||
    (options.onObservation !== undefined && typeof options.onObservation !== "function")
  ) {
    throw new IdeaLabAsrTransportError("invalid_config");
  }
}

async function readVerifiedWav(handle: ExtractedWavHandle, maximumBytes: number): Promise<Buffer> {
  try {
    const value = await lstat(handle.path);
    if (
      !value.isFile() ||
      value.isSymbolicLink() ||
      !isPositiveInteger(value.size) ||
      value.size > maximumBytes ||
      value.size !== handle.byteLength
    ) {
      throw new Error("invalid WAV");
    }
    const bytes = await readFile(handle.path);
    if (bytes.byteLength !== value.size) throw new Error("WAV changed");
    return bytes;
  } catch {
    throw new IdeaLabAsrTransportError("invalid_input");
  }
}

function normalizeFailure(error: unknown): IdeaLabAsrTransportError {
  if (error instanceof IdeaLabAsrTransportError) return error;
  if (error instanceof WavAudioExtractorError) {
    return new IdeaLabAsrTransportError(
      error.reason === "cleanup_failed" ? "cleanup_failed" : "invalid_input",
    );
  }
  return new IdeaLabAsrTransportError("retryable_transport");
}

function classifyHttpStatus(status: number): IdeaLabAsrTransportError {
  if (status === 401 || status === 403) return new IdeaLabAsrTransportError("auth_failed", status);
  if (status === 429) return new IdeaLabAsrTransportError("rate_limited", status);
  if (status >= 500 && status <= 599) {
    return new IdeaLabAsrTransportError("retryable_transport", status);
  }
  if (status >= 400 && status <= 499) {
    return new IdeaLabAsrTransportError("invalid_request", status);
  }
  return new IdeaLabAsrTransportError("invalid_response", status);
}

function safeElapsed(startedAt: number, endedAt: number): number {
  if (!Number.isFinite(startedAt) || !Number.isFinite(endedAt) || endedAt < startedAt) return 0;
  return Math.floor(endedAt - startedAt);
}
