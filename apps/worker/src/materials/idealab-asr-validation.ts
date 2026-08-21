import { IdeaLabAsrTransportError } from "./idealab-asr-errors.js";
import type { WholeTextAsrTransportInput } from "./whole-text-cloud-asr.js";

const MAX_MEDIA_DURATION_MS = 24 * 60 * 60 * 1_000;
const SAFE_SHA256 = /^[a-f0-9]{64}$/;

export function computeIdeaLabTimeoutMs(input: {
  readonly durationMs: number;
  readonly minTimeoutMs: number;
  readonly maxTimeoutMs: number;
  readonly timeoutMultiplier: number;
}): number {
  if (
    !isPositiveInteger(input.durationMs) ||
    !isPositiveInteger(input.minTimeoutMs) ||
    !isPositiveInteger(input.maxTimeoutMs) ||
    input.minTimeoutMs > input.maxTimeoutMs ||
    !isPositiveFinite(input.timeoutMultiplier)
  ) {
    throw new IdeaLabAsrTransportError("invalid_input");
  }
  return Math.min(
    input.maxTimeoutMs,
    Math.max(input.minTimeoutMs, Math.ceil(input.durationMs * input.timeoutMultiplier)),
  );
}

export function assertIdeaLabTransportInput(input: WholeTextAsrTransportInput): void {
  if (
    input.providerId !== "idealab-audio" ||
    input.model !== "whisper" ||
    !SAFE_SHA256.test(input.profileVersion) ||
    !SAFE_SHA256.test(input.mediaContentSha256) ||
    typeof input.mediaHandle !== "string" ||
    input.mediaHandle.trim() === "" ||
    input.mediaHandle.includes("\0") ||
    !isPositiveInteger(input.durationMs) ||
    input.durationMs > MAX_MEDIA_DURATION_MS
  ) {
    throw new IdeaLabAsrTransportError("invalid_input");
  }
}

export function isSafeIdeaLabEndpoint(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && !url.search && !url.hash;
  } catch {
    return false;
  }
}

export function isSafeIdeaLabApiKey(value: unknown): value is string {
  return typeof value === "string" && /^[\x21-\x7e]{1,4096}$/.test(value);
}

export function isPositiveInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) > 0;
}

export function isPositiveFinite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}
