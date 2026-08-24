import { createHash } from "node:crypto";

import { z } from "zod";

import {
  parseTranscriptTimeline,
  type TranscriptSource,
  type TranscriptTimingPrecision,
  type TranscriptTimeline,
} from "./material-transcript.js";

const MAX_DURATION_MS = 24 * 60 * 60 * 1_000;
const MAX_SHOTS = 500;
const SAFE_SHA256 = /^[a-f0-9]{64}$/;
const SAFE_VERSION = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/;
const SAFE_EVIDENCE_ID = /^(?:transcript|shot)-\d{4}$/;
const SAFE_ARTIFACT_SEGMENT = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/;

export const MATERIAL_TEARDOWN_SCHEMA_VERSION = "2";

export type MaterialTeardownErrorCode =
  | "invalid_evidence"
  | "invalid_result"
  | "invalid_analysis_identity";

export class MaterialTeardownError extends Error {
  constructor(readonly code: MaterialTeardownErrorCode) {
    super(`Material teardown failed: ${code}`);
    this.name = "MaterialTeardownError";
  }
}

const mediaSchema = z.object({
  contentSha256: z.string().regex(SAFE_SHA256),
  durationMs: z.number().int().positive().max(MAX_DURATION_MS),
  width: z.number().int().positive().max(16_384),
  height: z.number().int().positive().max(16_384),
}).strict();

const readyFrameSchema = z.object({
  index: z.number().int().nonnegative().max(MAX_SHOTS - 1),
  status: z.literal("ready"),
  artifactRef: z.string().min(1).max(1_024),
}).strict();

const placeholderFrameSchema = z.object({
  index: z.number().int().nonnegative().max(MAX_SHOTS - 1),
  status: z.literal("placeholder"),
  reason: z.enum(["frame_extract_failed", "frame_budget_exceeded"]),
}).strict();

const shotSchema = z.object({
  startMs: z.number().int().nonnegative().max(MAX_DURATION_MS),
  endMs: z.number().int().positive().max(MAX_DURATION_MS),
  frame: z.union([readyFrameSchema, placeholderFrameSchema]),
}).strict();

const visualSummarySchema = z.object({
  hardCutCount: z.number().int().nonnegative().max(MAX_SHOTS),
  visualEventCount: z.number().int().nonnegative().max(MAX_SHOTS),
  averageShotLengthMs: z.number().finite().positive().max(MAX_DURATION_MS),
  hookVisualDensity: z.number().finite().min(0).max(1),
}).strict();

const evidenceInputSchema = z.object({
  media: mediaSchema,
  transcript: z.custom<TranscriptTimeline>(),
  shots: z.array(shotSchema).min(1).max(MAX_SHOTS),
  visualSummary: visualSummarySchema,
  promptVersion: z.string().regex(SAFE_VERSION),
  schemaVersion: z.string().regex(SAFE_VERSION),
}).strict();

export type MaterialTeardownMedia = z.infer<typeof mediaSchema>;
export type MaterialTeardownFrame = z.infer<typeof readyFrameSchema> | z.infer<typeof placeholderFrameSchema>;
export type MaterialTeardownVisualSummary = z.infer<typeof visualSummarySchema>;

export interface MaterialTeardownEvidenceInput {
  readonly media: MaterialTeardownMedia;
  readonly transcript: TranscriptTimeline;
  /** Runtime boundary: frame variants and paths are validated after parsing. */
  readonly shots: readonly unknown[];
  readonly visualSummary: MaterialTeardownVisualSummary;
  readonly promptVersion: string;
  readonly schemaVersion: string;
}

export interface MaterialTranscriptEvidence {
  readonly id: string;
  readonly startMs: number;
  readonly endMs: number;
  readonly text: string;
  readonly source: TranscriptSource;
  readonly timingPrecision: TranscriptTimingPrecision;
}

export interface MaterialShotEvidence {
  readonly id: string;
  readonly startMs: number;
  readonly endMs: number;
  readonly frame: MaterialTeardownFrame;
}

export interface MaterialTeardownEvidence {
  readonly media: MaterialTeardownMedia;
  readonly transcriptEvidence: readonly MaterialTranscriptEvidence[];
  readonly shotEvidence: readonly MaterialShotEvidence[];
  readonly visualSummary: MaterialTeardownVisualSummary;
  readonly promptVersion: string;
  readonly schemaVersion: string;
  readonly fingerprint: string;
}

const evidenceReferenceSchema = z.string().regex(SAFE_EVIDENCE_ID);
const evidenceReferencesSchema = z.array(evidenceReferenceSchema).min(1).max(50);
const boundedText = z.string().trim().min(1).max(4_000);

const teardownSegmentSchema = z.object({
  startMs: z.number().int().nonnegative().max(MAX_DURATION_MS),
  endMs: z.number().int().positive().max(MAX_DURATION_MS),
  role: z.enum(["hook", "body", "proof", "cta", "other"]),
  description: boundedText,
  evidenceIds: evidenceReferencesSchema,
}).strict();

const semanticSectionSchema = z.object({
  order: z.number().int().positive().max(MAX_SHOTS),
  role: z.enum(["hook", "problem", "body", "proof", "selling_point", "turn", "cta", "other"]),
  title: boundedText,
  description: boundedText,
  evidenceIds: evidenceReferencesSchema,
}).strict();

export const materialTeardownResultSchema = z.object({
  alignmentStatus: z.enum(["exact_transcript_timing", "unavailable_whole_video"]),
  summary: boundedText,
  hook: z.object({
    kind: z.enum(["question", "visual", "benefit", "conflict", "other"]),
    text: boundedText,
    evidenceIds: evidenceReferencesSchema,
  }).strict(),
  sellingPoints: z.array(z.object({
    text: boundedText,
    evidenceIds: evidenceReferencesSchema,
  }).strict()).max(50),
  audiences: z.array(boundedText).max(50),
  rhythm: z.object({
    description: boundedText,
    evidenceIds: evidenceReferencesSchema,
  }).strict(),
  cta: z.object({
    text: boundedText,
    evidenceIds: evidenceReferencesSchema,
  }).strict(),
  semanticSections: z.array(semanticSectionSchema).min(1).max(MAX_SHOTS),
  segments: z.array(teardownSegmentSchema).max(MAX_SHOTS),
  replicationSuggestions: z.array(boundedText).max(50),
  uncertainties: z.array(boundedText).max(50),
}).strict();

export type MaterialTeardownResult = z.infer<typeof materialTeardownResultSchema>;

export function createMaterialTeardownEvidence(
  input: MaterialTeardownEvidenceInput,
): MaterialTeardownEvidence {
  const parsed = evidenceInputSchema.safeParse(input);
  if (!parsed.success) throw new MaterialTeardownError("invalid_evidence");

  const { media, shots, visualSummary, promptVersion, schemaVersion } = parsed.data;
  let transcript: TranscriptTimeline;
  try {
    transcript = parseTranscriptTimeline({
      durationMs: input.transcript.durationMs,
      source: input.transcript.source,
      timingPrecision: input.transcript.timingPrecision,
      segments: input.transcript.segments.map(({ startMs, endMs, text }) => ({
        startMs,
        endMs,
        text,
      })),
    });
  } catch {
    throw new MaterialTeardownError("invalid_evidence");
  }
  if (transcript.durationMs !== media.durationMs) {
    throw new MaterialTeardownError("invalid_evidence");
  }
  validateShots(shots, media.durationMs);

  const transcriptEvidence = transcript.segments.map((segment, index) => ({
    id: formatEvidenceId("transcript", index),
    startMs: segment.startMs,
    endMs: segment.endMs,
    text: segment.text,
    source: segment.source,
    timingPrecision: segment.timingPrecision,
  }));
  const shotEvidence = shots.map((shot, index) => ({
    id: formatEvidenceId("shot", index),
    startMs: shot.startMs,
    endMs: shot.endMs,
    frame: shot.frame,
  }));
  const canonical = {
    media,
    transcriptEvidence,
    shotEvidence,
    visualSummary,
    promptVersion,
    schemaVersion,
  };
  return deepFreeze({
    ...canonical,
    fingerprint: sha256(canonicalEvidenceJson(canonical)),
  });
}

export function parseMaterialTeardownResult(
  input: unknown,
  evidence: MaterialTeardownEvidence,
): MaterialTeardownResult {
  const parsed = materialTeardownResultSchema.safeParse(input);
  if (!parsed.success) throw new MaterialTeardownError("invalid_result");

  const allowedIds = new Set([
    ...evidence.transcriptEvidence.map(({ id }) => id),
    ...evidence.shotEvidence.map(({ id }) => id),
  ]);
  for (const evidenceId of collectEvidenceIds(parsed.data)) {
    if (!allowedIds.has(evidenceId)) throw new MaterialTeardownError("invalid_result");
  }
  validateSemanticSections(parsed.data.semanticSections, evidence);
  validateResultTimingPrecision(parsed.data, evidence);
  return deepFreeze(parsed.data);
}

export function materialTeardownJsonSchema(): Record<string, unknown> {
  return z.toJSONSchema(materialTeardownResultSchema) as Record<string, unknown>;
}

export function fingerprintMaterialTeardownAnalysis(input: {
  readonly evidenceFingerprint: string;
  readonly promptVersion: string;
  readonly schemaVersion: string;
  readonly providerId: string;
  readonly model: string;
  readonly profileVersion: string;
}): string {
  if (
    !SAFE_SHA256.test(input.evidenceFingerprint) ||
    !SAFE_SHA256.test(input.profileVersion) ||
    ![input.promptVersion, input.schemaVersion, input.providerId, input.model].every(
      (value) => SAFE_VERSION.test(value),
    )
  ) {
    throw new MaterialTeardownError("invalid_analysis_identity");
  }
  return sha256(JSON.stringify({
    evidenceFingerprint: input.evidenceFingerprint,
    promptVersion: input.promptVersion,
    schemaVersion: input.schemaVersion,
    providerId: input.providerId,
    model: input.model,
    profileVersion: input.profileVersion,
  }));
}

function validateShots(shots: z.infer<typeof shotSchema>[], durationMs: number): void {
  let expectedStartMs = 0;
  shots.forEach((shot, index) => {
    if (
      shot.startMs !== expectedStartMs ||
      shot.endMs <= shot.startMs ||
      shot.endMs > durationMs ||
      shot.frame.index !== index ||
      (shot.frame.status === "ready" && !isSafeArtifactRef(shot.frame.artifactRef))
    ) {
      throw new MaterialTeardownError("invalid_evidence");
    }
    expectedStartMs = shot.endMs;
  });
  if (expectedStartMs !== durationMs) throw new MaterialTeardownError("invalid_evidence");
}

function validateResultSegments(
  segments: MaterialTeardownResult["segments"],
  durationMs: number,
): void {
  let expectedStartMs = 0;
  for (const segment of segments) {
    if (
      segment.startMs !== expectedStartMs ||
      segment.endMs <= segment.startMs ||
      segment.endMs > durationMs
    ) {
      throw new MaterialTeardownError("invalid_result");
    }
    expectedStartMs = segment.endMs;
  }
  if (expectedStartMs !== durationMs) throw new MaterialTeardownError("invalid_result");
}

function validateResultTimingPrecision(
  result: MaterialTeardownResult,
  evidence: MaterialTeardownEvidence,
): void {
  const wholeVideoTranscript = evidence.transcriptEvidence.some(
    ({ timingPrecision }) => timingPrecision === "whole_video",
  );
  const expectedStatus = wholeVideoTranscript
    ? "unavailable_whole_video"
    : "exact_transcript_timing";
  if (result.alignmentStatus !== expectedStatus) {
    throw new MaterialTeardownError("invalid_result");
  }
  if (wholeVideoTranscript) {
    if (evidence.transcriptEvidence.length !== 1 || result.segments.length !== 0) {
      throw new MaterialTeardownError("invalid_result");
    }
    return;
  }
  if (result.segments.length === 0) throw new MaterialTeardownError("invalid_result");
  validateResultSegments(result.segments, evidence.media.durationMs);
  validateTimedSegmentEvidence(result.segments, evidence);
}

function validateSemanticSections(
  sections: MaterialTeardownResult["semanticSections"],
  evidence: MaterialTeardownEvidence,
): void {
  sections.forEach((section, index) => {
    if (section.order !== index + 1) throw new MaterialTeardownError("invalid_result");
  });
  const wholeVideoTranscript = evidence.transcriptEvidence.some(
    ({ timingPrecision }) => timingPrecision === "whole_video",
  );
  const transcriptIds = new Set(evidence.transcriptEvidence.map(({ id }) => id));
  if (sections.some(({ evidenceIds }) => !evidenceIds.some((id) => transcriptIds.has(id)))) {
    throw new MaterialTeardownError("invalid_result");
  }
  if (
    wholeVideoTranscript &&
    sections.some(({ evidenceIds }) => evidenceIds.some((id) => !transcriptIds.has(id)))
  ) throw new MaterialTeardownError("invalid_result");
}

function validateTimedSegmentEvidence(
  segments: MaterialTeardownResult["segments"],
  evidence: MaterialTeardownEvidence,
): void {
  const transcriptIds = new Set(evidence.transcriptEvidence.map(({ id }) => id));
  const intervals = new Map([
    ...evidence.transcriptEvidence.map(({ id, startMs, endMs }) => [id, { startMs, endMs }] as const),
    ...evidence.shotEvidence.map(({ id, startMs, endMs }) => [id, { startMs, endMs }] as const),
  ]);
  for (const segment of segments) {
    if (!segment.evidenceIds.some((id) => transcriptIds.has(id))) {
      throw new MaterialTeardownError("invalid_result");
    }
    if (segment.evidenceIds.some((id) => {
      const interval = intervals.get(id);
      return interval === undefined || interval.startMs >= segment.endMs || interval.endMs <= segment.startMs;
    })) throw new MaterialTeardownError("invalid_result");
  }
}

function collectEvidenceIds(result: MaterialTeardownResult): string[] {
  return [
    ...result.hook.evidenceIds,
    ...result.sellingPoints.flatMap(({ evidenceIds }) => evidenceIds),
    ...result.rhythm.evidenceIds,
    ...result.cta.evidenceIds,
    ...result.semanticSections.flatMap(({ evidenceIds }) => evidenceIds),
    ...result.segments.flatMap(({ evidenceIds }) => evidenceIds),
  ];
}

function isSafeArtifactRef(value: string): boolean {
  if (value.startsWith("/") || value.includes("\\") || value.includes("//")) return false;
  const parts = value.split("/");
  return parts.length > 0 && parts.every(
    (part) => part !== "." && part !== ".." && SAFE_ARTIFACT_SEGMENT.test(part),
  );
}

function formatEvidenceId(kind: "transcript" | "shot", index: number): string {
  return `${kind}-${index.toString().padStart(4, "0")}`;
}

function canonicalEvidenceJson(value: Omit<MaterialTeardownEvidence, "fingerprint">): string {
  return JSON.stringify({
    media: {
      contentSha256: value.media.contentSha256,
      durationMs: value.media.durationMs,
      width: value.media.width,
      height: value.media.height,
    },
    transcriptEvidence: value.transcriptEvidence.map(({
      id,
      startMs,
      endMs,
      text,
      source,
      timingPrecision,
    }) => ({
      id,
      startMs,
      endMs,
      text,
      source,
      timingPrecision,
    })),
    shotEvidence: value.shotEvidence.map(({ id, startMs, endMs, frame }) => ({
      id,
      startMs,
      endMs,
      frame: frame.status === "ready"
        ? { index: frame.index, status: frame.status, artifactRef: frame.artifactRef }
        : { index: frame.index, status: frame.status, reason: frame.reason },
    })),
    visualSummary: {
      hardCutCount: value.visualSummary.hardCutCount,
      visualEventCount: value.visualSummary.visualEventCount,
      averageShotLengthMs: value.visualSummary.averageShotLengthMs,
      hookVisualDensity: value.visualSummary.hookVisualDensity,
    },
    promptVersion: value.promptVersion,
    schemaVersion: value.schemaVersion,
  });
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}
