import { lstat, readFile } from "node:fs/promises";

import type {
  WholeTextAsrTransport,
  WholeTextAsrTransportInput,
} from "./whole-text-cloud-asr.js";
import {
  WavAudioExtractorError,
  type ExtractedWavHandle,
  type WavAudioExtractorPort,
} from "./wav-audio-extractor.js";

const MAX_MEDIA_DURATION_MS = 24 * 60 * 60 * 1_000;
const MAX_TEXT_CHARACTERS = 200_000;
const DEFAULT_MAX_WAV_BYTES = 5 * 1024 * 1024;
const SAFE_SHA256 = /^[a-f0-9]{64}$/;
const RESPONSE_KEYS = new Set(["text", "usage"]);
const USAGE_KEYS = new Set([
  "prompt_tokens",
  "completion_tokens",
  "total_tokens",
  "cacheReadInputTokensCompatible",
]);

export type IdeaLabAsrTransportFailureReason =
  | "invalid_config"
  | "invalid_input"
  | "auth_failed"
  | "invalid_request"
  | "rate_limited"
  | "retryable_transport"
  | "invalid_response"
  | "cleanup_failed";

export class IdeaLabAsrTransportError extends Error {
  constructor(
    readonly reason: IdeaLabAsrTransportFailureReason,
    readonly httpStatus?: number,
  ) {
    super(`IdeaLab ASR transport failed: ${reason}`);
    this.name = "IdeaLabAsrTransportError";
  }
}

export interface IdeaLabAsrUsage {
  readonly promptTokens: number;
  readonly completionTokens: number;
  readonly totalTokens: number;
  readonly cacheReadInputTokensCompatible: number;
}

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

interface ParsedResponse {
  readonly text: string;
  readonly usage: IdeaLabAsrUsage;
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

  constructor(options: {
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
  }) {
    if (
      typeof options.extractor?.extract !== "function" ||
      typeof (options.fetchFn ?? fetch) !== "function" ||
      !safeEndpoint(options.endpoint) ||
      !safeApiKey(options.apiKey) ||
      !positiveInteger(options.maxWavBytes ?? DEFAULT_MAX_WAV_BYTES) ||
      !positiveInteger(options.maxResponseBytes) ||
      !positiveInteger(options.minTimeoutMs) ||
      !positiveInteger(options.maxTimeoutMs) ||
      options.minTimeoutMs > options.maxTimeoutMs ||
      !positiveFinite(options.timeoutMultiplier) ||
      options.timeoutMultiplier > 100 ||
      (options.now !== undefined && typeof options.now !== "function") ||
      (options.onObservation !== undefined && typeof options.onObservation !== "function")
    ) {
      throw new IdeaLabAsrTransportError("invalid_config");
    }
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
    validateTransportInput(input);
    const timeoutMs = computeIdeaLabTimeoutMs({
      durationMs: input.durationMs,
      minTimeoutMs: this.minTimeoutMs,
      maxTimeoutMs: this.maxTimeoutMs,
      timeoutMultiplier: this.timeoutMultiplier,
    });
    const startedAt = this.now();
    let wav: ExtractedWavHandle | undefined;
    let parsed: ParsedResponse | undefined;
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

  private async request(wav: ExtractedWavHandle, timeoutMs: number): Promise<ParsedResponse> {
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
    return parseResponse(await readBoundedJson(response, this.maxResponseBytes));
  }

  private observe(event: IdeaLabAsrObservation): void {
    try {
      this.onObservation?.(Object.freeze(event));
    } catch {
      // Observability must not change media processing outcome.
    }
  }
}

export function computeIdeaLabTimeoutMs(input: {
  readonly durationMs: number;
  readonly minTimeoutMs: number;
  readonly maxTimeoutMs: number;
  readonly timeoutMultiplier: number;
}): number {
  if (
    !positiveInteger(input.durationMs) ||
    !positiveInteger(input.minTimeoutMs) ||
    !positiveInteger(input.maxTimeoutMs) ||
    input.minTimeoutMs > input.maxTimeoutMs ||
    !positiveFinite(input.timeoutMultiplier)
  ) {
    throw new IdeaLabAsrTransportError("invalid_input");
  }
  return Math.min(
    input.maxTimeoutMs,
    Math.max(input.minTimeoutMs, Math.ceil(input.durationMs * input.timeoutMultiplier)),
  );
}

async function readVerifiedWav(handle: ExtractedWavHandle, maximumBytes: number): Promise<Buffer> {
  try {
    const value = await lstat(handle.path);
    if (
      !value.isFile() ||
      value.isSymbolicLink() ||
      !positiveInteger(value.size) ||
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

async function readBoundedJson(response: Response, maximumBytes: number): Promise<unknown> {
  if (response.body === null) throw new IdeaLabAsrTransportError("invalid_response", response.status);
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maximumBytes) {
        await reader.cancel();
        throw new IdeaLabAsrTransportError("invalid_response", response.status);
      }
      chunks.push(value);
    }
  } catch (error) {
    if (error instanceof IdeaLabAsrTransportError) throw error;
    throw new IdeaLabAsrTransportError("invalid_response", response.status);
  }
  const combined = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(combined)) as unknown;
  } catch {
    throw new IdeaLabAsrTransportError("invalid_response", response.status);
  }
}

function parseResponse(value: unknown): ParsedResponse {
  const response = strictRecord(value, RESPONSE_KEYS);
  const text = safeText(response.text);
  const usage = strictRecord(response.usage, USAGE_KEYS);
  const parsedUsage = Object.freeze({
    promptTokens: nonnegativeInteger(usage.prompt_tokens),
    completionTokens: nonnegativeInteger(usage.completion_tokens),
    totalTokens: nonnegativeInteger(usage.total_tokens),
    cacheReadInputTokensCompatible: nonnegativeInteger(usage.cacheReadInputTokensCompatible),
  });
  if (parsedUsage.totalTokens < parsedUsage.promptTokens + parsedUsage.completionTokens) {
    throw new IdeaLabAsrTransportError("invalid_response");
  }
  return Object.freeze({ text, usage: parsedUsage });
}

function strictRecord(value: unknown, allowedKeys: ReadonlySet<string>): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new IdeaLabAsrTransportError("invalid_response");
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new IdeaLabAsrTransportError("invalid_response");
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = Object.keys(descriptors);
  if (
    keys.length !== allowedKeys.size ||
    keys.some((key) => !allowedKeys.has(key)) ||
    keys.some((key) => descriptors[key]?.get !== undefined || descriptors[key]?.set !== undefined)
  ) {
    throw new IdeaLabAsrTransportError("invalid_response");
  }
  return value as Record<string, unknown>;
}

function safeText(value: unknown): string {
  if (typeof value !== "string") throw new IdeaLabAsrTransportError("invalid_response");
  const text = value.trim();
  if (text === "" || text.length > MAX_TEXT_CHARACTERS || hasUnsafeControlCharacter(text)) {
    throw new IdeaLabAsrTransportError("invalid_response");
  }
  return text;
}

function validateTransportInput(input: WholeTextAsrTransportInput): void {
  if (
    input.providerId !== "idealab-audio" ||
    input.model !== "whisper" ||
    !SAFE_SHA256.test(input.profileVersion) ||
    !SAFE_SHA256.test(input.mediaContentSha256) ||
    typeof input.mediaHandle !== "string" ||
    input.mediaHandle.trim() === "" ||
    input.mediaHandle.includes("\0") ||
    !positiveInteger(input.durationMs) ||
    input.durationMs > MAX_MEDIA_DURATION_MS
  ) {
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

function safeEndpoint(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && !url.search && !url.hash;
  } catch {
    return false;
  }
}

function safeApiKey(value: unknown): value is string {
  return typeof value === "string" && /^[\x21-\x7e]{1,4096}$/.test(value);
}

function positiveInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) > 0;
}

function positiveFinite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function nonnegativeInteger(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new IdeaLabAsrTransportError("invalid_response");
  }
  return value as number;
}

function safeElapsed(startedAt: number, endedAt: number): number {
  if (!Number.isFinite(startedAt) || !Number.isFinite(endedAt) || endedAt < startedAt) return 0;
  return Math.floor(endedAt - startedAt);
}

function hasUnsafeControlCharacter(value: string): boolean {
  for (const character of value) {
    const code = character.charCodeAt(0);
    if (code < 32 && ![9, 10, 13].includes(code)) return true;
  }
  return false;
}
