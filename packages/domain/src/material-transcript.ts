import { createHash } from "node:crypto";

export type TranscriptSource = "platform_caption" | "cloud_asr";
export type PlatformCaptionStatus = "accepted" | "missing" | "invalid";
export type MaterialTranscriptErrorCode =
  | "invalid_transcript"
  | "blocked_transcript_provider"
  | "cloud_asr_failed"
  | "cloud_asr_invalid";

export interface TranscriptSegment {
  readonly startMs: number;
  readonly endMs: number;
  readonly text: string;
  readonly source: TranscriptSource;
}

export interface TranscriptTimeline {
  readonly durationMs: number;
  readonly source: TranscriptSource;
  readonly segments: readonly TranscriptSegment[];
  readonly fingerprint: string;
}

export interface TranscriptResolution extends TranscriptTimeline {
  readonly platformCaptionStatus: PlatformCaptionStatus;
}

export interface CloudAsrPort {
  transcribe(input: {
    mediaContentSha256: string;
    mediaHandle: string;
    durationMs: number;
  }): Promise<unknown>;
}

export interface ParseTranscriptTimelineInput {
  durationMs: number;
  source: TranscriptSource;
  segments: unknown;
}

export interface ResolveTranscriptTimelineInput {
  durationMs: number;
  mediaContentSha256: string;
  mediaHandle: string;
  platformSegments?: unknown;
  cloudAsr?: CloudAsrPort;
}

const MAX_DURATION_MS = 24 * 60 * 60 * 1_000;
const MAX_SEGMENTS = 10_000;
const MAX_SEGMENT_TEXT = 4_000;
const MAX_TOTAL_TEXT = 2_000_000;
const SAFE_SHA256 = /^[a-f0-9]{64}$/;
const SEGMENT_KEYS = new Set(["startMs", "endMs", "text"]);

export class MaterialTranscriptError extends Error {
  constructor(readonly code: MaterialTranscriptErrorCode) {
    super(`Material transcript failed: ${code}`);
    this.name = "MaterialTranscriptError";
  }
}

export function parseTranscriptTimeline(input: ParseTranscriptTimelineInput): TranscriptTimeline {
  const durationMs = positiveBoundedInteger(input.durationMs, MAX_DURATION_MS);
  const source = parseSource(input.source);
  if (!Array.isArray(input.segments) || input.segments.length === 0 || input.segments.length > MAX_SEGMENTS) {
    throw invalidTranscript();
  }

  let totalTextLength = 0;
  let previousEndMs = 0;
  const segments = input.segments.map((value): TranscriptSegment => {
    const record = safeSegmentRecord(value);
    const startMs = nonnegativeInteger(record.startMs);
    const endMs = positiveBoundedInteger(record.endMs, durationMs);
    const text = safeText(record.text);
    if (startMs < previousEndMs || startMs >= endMs) throw invalidTranscript();
    previousEndMs = endMs;
    totalTextLength += text.length;
    if (totalTextLength > MAX_TOTAL_TEXT) throw invalidTranscript();
    return Object.freeze({ startMs, endMs, text, source });
  });

  const base = { durationMs, source, segments: Object.freeze(segments) };
  return Object.freeze({
    ...base,
    fingerprint: hashTimeline(base),
  });
}

export async function resolveTranscriptTimeline(
  input: ResolveTranscriptTimelineInput,
): Promise<TranscriptResolution> {
  const durationMs = assertMediaIdentity(input);
  const platformStatus = platformCaptionStatus(input.platformSegments, durationMs);
  if (platformStatus.status === "accepted") {
    return withPlatformStatus(platformStatus.timeline, "accepted");
  }
  if (input.cloudAsr === undefined) {
    throw new MaterialTranscriptError("blocked_transcript_provider");
  }

  let cloudOutput: unknown;
  try {
    cloudOutput = await input.cloudAsr.transcribe({
      mediaContentSha256: input.mediaContentSha256,
      mediaHandle: input.mediaHandle,
      durationMs,
    });
  } catch {
    throw new MaterialTranscriptError("cloud_asr_failed");
  }

  let timeline: TranscriptTimeline;
  try {
    timeline = parseTranscriptTimeline({
      durationMs,
      source: "cloud_asr",
      segments: cloudOutput,
    });
  } catch {
    throw new MaterialTranscriptError("cloud_asr_invalid");
  }
  return withPlatformStatus(timeline, platformStatus.status);
}

export function fingerprintTranscriptTimeline(
  timeline: Pick<TranscriptTimeline, "durationMs" | "source" | "segments">,
): string {
  return hashTimeline({
    durationMs: timeline.durationMs,
    source: timeline.source,
    segments: timeline.segments.map(({ startMs, endMs, text, source }) => ({
      startMs,
      endMs,
      text,
      source,
    })),
  });
}

function platformCaptionStatus(
  value: unknown,
  durationMs: number,
): { status: PlatformCaptionStatus; timeline?: TranscriptTimeline } {
  if (value === undefined || value === null || (Array.isArray(value) && value.length === 0)) {
    return { status: "missing" };
  }
  try {
    return {
      status: "accepted",
      timeline: parseTranscriptTimeline({
        durationMs,
        source: "platform_caption",
        segments: value,
      }),
    };
  } catch {
    return { status: "invalid" };
  }
}

function withPlatformStatus(
  timeline: TranscriptTimeline | undefined,
  platformCaptionStatus: PlatformCaptionStatus,
): TranscriptResolution {
  if (timeline === undefined) throw invalidTranscript();
  return Object.freeze({
    durationMs: timeline.durationMs,
    source: timeline.source,
    segments: timeline.segments,
    fingerprint: timeline.fingerprint,
    platformCaptionStatus,
  });
}

function assertMediaIdentity(input: ResolveTranscriptTimelineInput): number {
  const durationMs = positiveBoundedInteger(input.durationMs, MAX_DURATION_MS);
  if (
    typeof input.mediaContentSha256 !== "string" ||
    !SAFE_SHA256.test(input.mediaContentSha256) ||
    typeof input.mediaHandle !== "string" ||
    input.mediaHandle.trim() === "" ||
    input.mediaHandle.length > 4_096
  ) {
    throw invalidTranscript();
  }
  return durationMs;
}

function parseSource(value: unknown): TranscriptSource {
  if (value !== "platform_caption" && value !== "cloud_asr") throw invalidTranscript();
  return value;
}

function safeSegmentRecord(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw invalidTranscript();
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) throw invalidTranscript();
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = Object.keys(descriptors);
  if (
    keys.length !== SEGMENT_KEYS.size ||
    keys.some((key) => !SEGMENT_KEYS.has(key)) ||
    keys.some((key) => descriptors[key]?.get !== undefined || descriptors[key]?.set !== undefined)
  ) {
    throw invalidTranscript();
  }
  return value as Record<string, unknown>;
}

function nonnegativeInteger(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) throw invalidTranscript();
  return value as number;
}

function positiveBoundedInteger(value: unknown, maximum: number): number {
  if (!Number.isSafeInteger(value) || (value as number) <= 0 || (value as number) > maximum) {
    throw invalidTranscript();
  }
  return value as number;
}

function safeText(value: unknown): string {
  if (typeof value !== "string") throw invalidTranscript();
  const text = value.trim();
  if (text === "" || text.length > MAX_SEGMENT_TEXT || hasUnsafeControlCharacter(text)) {
    throw invalidTranscript();
  }
  return text;
}

function hasUnsafeControlCharacter(value: string): boolean {
  for (const character of value) {
    const code = character.charCodeAt(0);
    if (code < 32 && ![9, 10, 13].includes(code)) return true;
  }
  return false;
}

function hashTimeline(value: {
  durationMs: number;
  source: TranscriptSource;
  segments: readonly Pick<TranscriptSegment, "startMs" | "endMs" | "text" | "source">[];
}): string {
  return createHash("sha256").update(JSON.stringify({
    durationMs: value.durationMs,
    source: value.source,
    segments: value.segments.map(({ startMs, endMs, text, source }) => ({
      startMs,
      endMs,
      text,
      source,
    })),
  })).digest("hex");
}

function invalidTranscript(): MaterialTranscriptError {
  return new MaterialTranscriptError("invalid_transcript");
}
