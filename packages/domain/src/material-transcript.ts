import { createHash } from "node:crypto";

export type TranscriptSource = "platform_caption" | "cloud_asr";
export type TranscriptTimingPrecision = "segment" | "whole_video";
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
  readonly timingPrecision: TranscriptTimingPrecision;
}

export interface TranscriptTimeline {
  readonly durationMs: number;
  readonly source: TranscriptSource;
  readonly timingPrecision: TranscriptTimingPrecision;
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
  timingPrecision?: TranscriptTimingPrecision;
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
const MAX_WHOLE_TEXT = 200_000;
const MAX_TOTAL_TEXT = 2_000_000;
const SAFE_SHA256 = /^[a-f0-9]{64}$/;
const SEGMENT_KEYS = new Set(["startMs", "endMs", "text"]);
const WHOLE_TEXT_KEYS = new Set(["kind", "text"]);

export class MaterialTranscriptError extends Error {
  constructor(readonly code: MaterialTranscriptErrorCode) {
    super(`Material transcript failed: ${code}`);
    this.name = "MaterialTranscriptError";
  }
}

export function parseTranscriptTimeline(input: ParseTranscriptTimelineInput): TranscriptTimeline {
  const durationMs = positiveBoundedInteger(input.durationMs, MAX_DURATION_MS);
  const source = parseSource(input.source);
  const timingPrecision = parseTimingPrecision(input.timingPrecision ?? "segment");
  const segments = parseTranscriptSegments(input.segments, durationMs, source, timingPrecision);
  assertWholeVideoTimeline(timingPrecision, segments, durationMs);
  const base = { durationMs, source, timingPrecision, segments: Object.freeze(segments) };
  return Object.freeze({
    ...base,
    fingerprint: hashTimeline(base),
  });
}

function parseTranscriptSegments(
  value: unknown,
  durationMs: number,
  source: TranscriptSource,
  timingPrecision: TranscriptTimingPrecision,
): TranscriptSegment[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_SEGMENTS) {
    throw invalidTranscript();
  }
  let totalTextLength = 0;
  let previousEndMs = 0;
  return value.map((item): TranscriptSegment => {
    const record = safeSegmentRecord(item);
    const startMs = nonnegativeInteger(record.startMs);
    const endMs = positiveBoundedInteger(record.endMs, durationMs);
    const text = safeText(record.text);
    if (startMs < previousEndMs || startMs >= endMs) throw invalidTranscript();
    previousEndMs = endMs;
    totalTextLength += text.length;
    if (totalTextLength > MAX_TOTAL_TEXT) throw invalidTranscript();
    return Object.freeze({ startMs, endMs, text, source, timingPrecision });
  });
}

function assertWholeVideoTimeline(
  timingPrecision: TranscriptTimingPrecision,
  segments: readonly TranscriptSegment[],
  durationMs: number,
): void {
  if (
    timingPrecision === "whole_video" &&
    (segments.length !== 1 || segments[0]?.startMs !== 0 || segments[0]?.endMs !== durationMs)
  ) {
    throw invalidTranscript();
  }
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
    timeline = isWholeTextOutput(cloudOutput)
      ? parseWholeTextTimeline(cloudOutput, durationMs)
      : parseTranscriptTimeline({
          durationMs,
          source: "cloud_asr",
          timingPrecision: "segment",
          segments: cloudOutput,
        });
  } catch {
    throw new MaterialTranscriptError("cloud_asr_invalid");
  }
  return withPlatformStatus(timeline, platformStatus.status);
}

export function fingerprintTranscriptTimeline(
  timeline: Pick<TranscriptTimeline, "durationMs" | "source" | "timingPrecision" | "segments">,
): string {
  return hashTimeline({
    durationMs: timeline.durationMs,
    source: timeline.source,
    timingPrecision: timeline.timingPrecision,
    segments: timeline.segments.map(({ startMs, endMs, text, source, timingPrecision }) => ({
      startMs,
      endMs,
      text,
      source,
      timingPrecision,
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
        timingPrecision: "segment",
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
    timingPrecision: timeline.timingPrecision,
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

function parseTimingPrecision(value: unknown): TranscriptTimingPrecision {
  if (value !== "segment" && value !== "whole_video") throw invalidTranscript();
  return value;
}

function isWholeTextOutput(value: unknown): boolean {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return false;
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = Object.keys(descriptors);
  return (
    keys.length === WHOLE_TEXT_KEYS.size &&
    keys.every((key) => WHOLE_TEXT_KEYS.has(key)) &&
    keys.every((key) => descriptors[key]?.get === undefined && descriptors[key]?.set === undefined) &&
    descriptors.kind?.value === "whole_text"
  );
}

function parseWholeTextTimeline(value: unknown, durationMs: number): TranscriptTimeline {
  if (!isWholeTextOutput(value)) throw invalidTranscript();
  const record = value as Record<string, unknown>;
  const text = safeBoundedText(record.text, MAX_WHOLE_TEXT);
  return parseTranscriptTimeline({
    durationMs,
    source: "cloud_asr",
    timingPrecision: "whole_video",
    segments: [{ startMs: 0, endMs: durationMs, text }],
  });
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
  return safeBoundedText(value, MAX_SEGMENT_TEXT);
}

function safeBoundedText(value: unknown, maximumLength: number): string {
  if (typeof value !== "string") throw invalidTranscript();
  const text = value.trim();
  if (text === "" || text.length > maximumLength || hasUnsafeControlCharacter(text)) {
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
  timingPrecision: TranscriptTimingPrecision;
  segments: readonly Pick<TranscriptSegment, "startMs" | "endMs" | "text" | "source" | "timingPrecision">[];
}): string {
  return createHash("sha256").update(JSON.stringify({
    durationMs: value.durationMs,
    source: value.source,
    timingPrecision: value.timingPrecision,
    segments: value.segments.map(({ startMs, endMs, text, source, timingPrecision }) => ({
      startMs,
      endMs,
      text,
      source,
      timingPrecision,
    })),
  })).digest("hex");
}

function invalidTranscript(): MaterialTranscriptError {
  return new MaterialTranscriptError("invalid_transcript");
}
