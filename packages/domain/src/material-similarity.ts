import { createHash } from "node:crypto";

import { z } from "zod";

import {
  materialTeardownResultSchema,
  type MaterialTeardownResult,
  type MaterialTeardownVisualSummary,
} from "./material-teardown.js";

const SAFE_ID = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/;
const SAFE_SHA256 = /^[a-f0-9]{64}$/;
const SAFE_VERSION = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/;
const MAX_TOKENS = 512;
const MAX_LINEAGE_NOTE_LENGTH = 4_000;
const MIN_COMPONENT_COUNT = 3;
const MIN_COMPARABLE_WEIGHT = 0.5;

export const MATERIAL_SIMILARITY_PROFILE_VERSION = "1";
export const MATERIAL_REPLICATION_LINEAGE_SCHEMA_VERSION = "1";

export type MaterialSimilarityErrorCode =
  | "invalid_profile"
  | "invalid_comparison"
  | "invalid_lineage";

export class MaterialSimilarityError extends Error {
  constructor(readonly code: MaterialSimilarityErrorCode) {
    super(`Material similarity failed: ${code}`);
    this.name = "MaterialSimilarityError";
  }
}

const visualSummarySchema = z.object({
  hardCutCount: z.number().int().nonnegative().max(500),
  visualEventCount: z.number().int().nonnegative().max(500),
  averageShotLengthMs: z.number().finite().positive().max(24 * 60 * 60 * 1_000),
  hookVisualDensity: z.number().finite().min(0).max(1),
}).strict().superRefine((value, context) => {
  if (value.hardCutCount > value.visualEventCount) {
    context.addIssue({ code: "custom", message: "hard cuts exceed visual events" });
  }
});

const profileInputSchema = z.object({
  materialVersionId: z.string().regex(SAFE_ID),
  teardownFingerprint: z.string().regex(SAFE_SHA256),
  teardown: materialTeardownResultSchema,
  visualSummary: visualSummarySchema,
  profileVersion: z.literal(MATERIAL_SIMILARITY_PROFILE_VERSION).optional(),
}).strict();

const tokenSchema = z.string().min(1).max(128);
const tokenArraySchema = z.array(tokenSchema).max(MAX_TOKENS);
const roleSchema = z.enum(["hook", "problem", "body", "proof", "selling_point", "turn", "cta", "other"]);

const profileBodySchema = z.object({
  materialVersionId: z.string().regex(SAFE_ID),
  teardownFingerprint: z.string().regex(SAFE_SHA256),
  profileVersion: z.string().regex(SAFE_VERSION),
  hookKind: z.enum(["question", "visual", "benefit", "conflict", "other"]),
  semanticRoleSequence: z.array(roleSchema).min(1).max(500),
  textTokens: z.object({
    sellingPoints: tokenArraySchema,
    audiences: tokenArraySchema,
    rhythm: tokenArraySchema,
    cta: tokenArraySchema,
  }).strict(),
  visual: z.object({
    averageShotLengthMs: z.number().finite().positive(),
    hardCutDensity: z.number().finite().min(0).max(1),
    hookVisualDensity: z.number().finite().min(0).max(1),
  }).strict(),
}).strict();

const profileSchema = profileBodySchema.extend({
  fingerprint: z.string().regex(SAFE_SHA256),
}).strict();

export type MaterialSimilarityProfile = z.infer<typeof profileSchema>;

export interface MaterialSimilarityProfileInput {
  readonly materialVersionId: string;
  readonly teardownFingerprint: string;
  readonly teardown: MaterialTeardownResult;
  readonly visualSummary: MaterialTeardownVisualSummary;
  readonly profileVersion?: string;
}

export type MaterialSimilarityComponentKind =
  | "structure"
  | "hook"
  | "selling_points"
  | "audience"
  | "rhythm"
  | "cta";

export type MaterialSimilarityReasonCode =
  | "role_sequence_similarity"
  | "hook_kind_match"
  | "selling_point_token_overlap"
  | "audience_token_overlap"
  | "rhythm_text_and_visual_similarity"
  | "cta_token_overlap"
  | "missing_feature";

export interface MaterialSimilarityComponent {
  readonly kind: MaterialSimilarityComponentKind;
  readonly status: "compared" | "unavailable";
  readonly score: number | null;
  readonly baseWeight: number;
  readonly reasonCode: MaterialSimilarityReasonCode;
}

export interface MaterialSimilarityComparison {
  readonly status: "scored" | "insufficient_evidence";
  readonly score: number | null;
  readonly comparableComponentCount: number;
  readonly comparableBaseWeight: number;
  readonly components: readonly MaterialSimilarityComponent[];
  readonly missingComponents: readonly MaterialSimilarityComponentKind[];
  readonly comparedProfileFingerprints: readonly [string, string];
  readonly fingerprint: string;
}

const COMPONENT_SPECS = [
  { kind: "structure", baseWeight: 0.2, reasonCode: "role_sequence_similarity" },
  { kind: "hook", baseWeight: 0.15, reasonCode: "hook_kind_match" },
  { kind: "selling_points", baseWeight: 0.25, reasonCode: "selling_point_token_overlap" },
  { kind: "audience", baseWeight: 0.1, reasonCode: "audience_token_overlap" },
  { kind: "rhythm", baseWeight: 0.2, reasonCode: "rhythm_text_and_visual_similarity" },
  { kind: "cta", baseWeight: 0.1, reasonCode: "cta_token_overlap" },
] as const satisfies readonly {
  kind: MaterialSimilarityComponentKind;
  baseWeight: number;
  reasonCode: MaterialSimilarityReasonCode;
}[];

export function createMaterialSimilarityProfile(
  input: MaterialSimilarityProfileInput,
): MaterialSimilarityProfile {
  const parsed = profileInputSchema.safeParse(input);
  if (!parsed.success) throw new MaterialSimilarityError("invalid_profile");

  const { teardown, visualSummary } = parsed.data;
  const body = {
    materialVersionId: parsed.data.materialVersionId,
    teardownFingerprint: parsed.data.teardownFingerprint,
    profileVersion: parsed.data.profileVersion ?? MATERIAL_SIMILARITY_PROFILE_VERSION,
    hookKind: teardown.hook.kind,
    semanticRoleSequence: teardown.semanticSections.map(({ role }) => role),
    textTokens: {
      sellingPoints: tokenizeFeature(teardown.sellingPoints.map(({ text }) => text)),
      audiences: tokenizeFeature(teardown.audiences),
      rhythm: tokenizeFeature([teardown.rhythm.description]),
      cta: tokenizeFeature([teardown.cta.text]),
    },
    visual: {
      averageShotLengthMs: round4(visualSummary.averageShotLengthMs),
      hardCutDensity: round4(safeRatio(visualSummary.hardCutCount, visualSummary.visualEventCount)),
      hookVisualDensity: round4(visualSummary.hookVisualDensity),
    },
  };
  return deepFreeze({ ...body, fingerprint: hashCanonical(body) });
}

export function compareMaterialSimilarityProfiles(
  leftInput: MaterialSimilarityProfile,
  rightInput: MaterialSimilarityProfile,
): MaterialSimilarityComparison {
  const left = parseIntegrityCheckedProfile(leftInput);
  const right = parseIntegrityCheckedProfile(rightInput);
  if (left.profileVersion !== right.profileVersion) {
    throw new MaterialSimilarityError("invalid_comparison");
  }

  const components = COMPONENT_SPECS.map((spec) => scoreComponent(spec, left, right));
  const compared = components.filter(isComparedComponent);
  const comparableBaseWeight = round4(sum(compared.map(({ baseWeight }) => baseWeight)));
  const enoughEvidence = compared.length >= MIN_COMPONENT_COUNT && comparableBaseWeight >= MIN_COMPARABLE_WEIGHT;
  const score = enoughEvidence
    ? round4(sum(compared.map((item) => item.score * item.baseWeight)) / comparableBaseWeight)
    : null;
  const comparedProfileFingerprints = [...[left.fingerprint, right.fingerprint].sort()] as [string, string];
  const body = {
    status: enoughEvidence ? "scored" as const : "insufficient_evidence" as const,
    score,
    comparableComponentCount: compared.length,
    comparableBaseWeight,
    components,
    missingComponents: components
      .filter(({ status }) => status === "unavailable")
      .map(({ kind }) => kind),
    comparedProfileFingerprints,
  };
  return deepFreeze({ ...body, fingerprint: hashCanonical(body) });
}

const lineageInputSchema = z.object({
  sourceMaterialVersionId: z.string().regex(SAFE_ID),
  derivedMaterialVersionId: z.string().regex(SAFE_ID),
  method: z.enum(["script_rewrite", "structure_adaptation", "visual_remake", "mixed"]),
  sourceTeardownFingerprint: z.string().regex(SAFE_SHA256),
  createdByUserId: z.string().regex(SAFE_ID),
  createdAt: z.string(),
  note: z.string().trim().min(1).max(MAX_LINEAGE_NOTE_LENGTH).optional(),
}).strict();

export type MaterialReplicationMethod = z.infer<typeof lineageInputSchema>["method"];

export interface MaterialReplicationLineageInput {
  readonly sourceMaterialVersionId: string;
  readonly derivedMaterialVersionId: string;
  readonly method: MaterialReplicationMethod;
  readonly sourceTeardownFingerprint: string;
  readonly createdByUserId: string;
  readonly createdAt: string;
  readonly note?: string;
}

export interface MaterialReplicationLineage extends MaterialReplicationLineageInput {
  readonly schemaVersion: typeof MATERIAL_REPLICATION_LINEAGE_SCHEMA_VERSION;
  readonly fingerprint: string;
}

export function createMaterialReplicationLineage(
  input: MaterialReplicationLineageInput,
  observedAt: string,
): MaterialReplicationLineage {
  const parsed = lineageInputSchema.safeParse(input);
  const createdAtMs = parsed.success ? parseCanonicalIso(parsed.data.createdAt) : null;
  const observedAtMs = parseCanonicalIso(observedAt);
  if (
    !parsed.success ||
    createdAtMs === null ||
    observedAtMs === null ||
    createdAtMs > observedAtMs ||
    parsed.data.sourceMaterialVersionId === parsed.data.derivedMaterialVersionId
  ) {
    throw new MaterialSimilarityError("invalid_lineage");
  }
  const body: Omit<MaterialReplicationLineage, "fingerprint"> = {
    schemaVersion: MATERIAL_REPLICATION_LINEAGE_SCHEMA_VERSION,
    sourceMaterialVersionId: parsed.data.sourceMaterialVersionId,
    derivedMaterialVersionId: parsed.data.derivedMaterialVersionId,
    method: parsed.data.method,
    sourceTeardownFingerprint: parsed.data.sourceTeardownFingerprint,
    createdByUserId: parsed.data.createdByUserId,
    createdAt: parsed.data.createdAt,
    ...(parsed.data.note === undefined ? {} : { note: parsed.data.note }),
  };
  return deepFreeze({ ...body, fingerprint: hashCanonical(body) });
}

function parseIntegrityCheckedProfile(input: unknown): MaterialSimilarityProfile {
  const parsed = profileSchema.safeParse(input);
  if (!parsed.success) throw new MaterialSimilarityError("invalid_comparison");
  const { fingerprint, ...body } = parsed.data;
  if (!hasCanonicalCollections(body) || hashCanonical(body) !== fingerprint) {
    throw new MaterialSimilarityError("invalid_comparison");
  }
  return parsed.data;
}

function hasCanonicalCollections(body: z.infer<typeof profileBodySchema>): boolean {
  return [
    body.textTokens.sellingPoints,
    body.textTokens.audiences,
    body.textTokens.rhythm,
    body.textTokens.cta,
  ].every(isSortedUnique);
}

function isSortedUnique(values: readonly string[]): boolean {
  return values.every((value, index) => index === 0 || (values[index - 1] as string) < value);
}

function scoreComponent(
  spec: (typeof COMPONENT_SPECS)[number],
  left: MaterialSimilarityProfile,
  right: MaterialSimilarityProfile,
): MaterialSimilarityComponent {
  const score = componentScore(spec.kind, left, right);
  if (score === null) {
    return { ...spec, status: "unavailable", score: null, reasonCode: "missing_feature" };
  }
  return { ...spec, status: "compared", score: round4(score) };
}

function componentScore(
  kind: MaterialSimilarityComponentKind,
  left: MaterialSimilarityProfile,
  right: MaterialSimilarityProfile,
): number | null {
  switch (kind) {
    case "structure":
      return sequenceSimilarity(left.semanticRoleSequence, right.semanticRoleSequence);
    case "hook":
      return scoreHook(left, right);
    case "selling_points":
      return scoreTokensWithRole(left, right, "sellingPoints", "selling_point");
    case "audience":
      return scoreTokenSets(left.textTokens.audiences, right.textTokens.audiences);
    case "rhythm":
      return scoreRhythm(left, right);
    case "cta":
      return scoreTokensWithRole(left, right, "cta", "cta");
  }
}

function scoreHook(left: MaterialSimilarityProfile, right: MaterialSimilarityProfile): number | null {
  if (
    left.hookKind === "other" ||
    right.hookKind === "other" ||
    !left.semanticRoleSequence.includes("hook") ||
    !right.semanticRoleSequence.includes("hook")
  ) return null;
  return left.hookKind === right.hookKind ? 1 : 0;
}

function scoreTokensWithRole(
  left: MaterialSimilarityProfile,
  right: MaterialSimilarityProfile,
  key: "sellingPoints" | "cta",
  role: "selling_point" | "cta",
): number | null {
  if (!left.semanticRoleSequence.includes(role) || !right.semanticRoleSequence.includes(role)) return null;
  return scoreTokenSets(left.textTokens[key], right.textTokens[key]);
}

function scoreTokenSets(left: readonly string[], right: readonly string[]): number | null {
  if (left.length === 0 || right.length === 0) return null;
  const leftSet = new Set(left);
  const rightSet = new Set(right);
  const intersection = [...leftSet].filter((token) => rightSet.has(token)).length;
  return intersection / new Set([...leftSet, ...rightSet]).size;
}

function scoreRhythm(left: MaterialSimilarityProfile, right: MaterialSimilarityProfile): number {
  const textScore = scoreTokenSets(left.textTokens.rhythm, right.textTokens.rhythm) ?? 0;
  const shotLengthScore = ratioSimilarity(left.visual.averageShotLengthMs, right.visual.averageShotLengthMs);
  const hardCutScore = distanceSimilarity(left.visual.hardCutDensity, right.visual.hardCutDensity);
  const hookDensityScore = distanceSimilarity(left.visual.hookVisualDensity, right.visual.hookVisualDensity);
  return (textScore + shotLengthScore + hardCutScore + hookDensityScore) / 4;
}

function sequenceSimilarity(left: readonly string[], right: readonly string[]): number {
  const rows = Array.from({ length: left.length + 1 }, () => Array<number>(right.length + 1).fill(0));
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      rows[leftIndex]![rightIndex] = left[leftIndex - 1] === right[rightIndex - 1]
        ? (rows[leftIndex - 1]![rightIndex - 1] as number) + 1
        : Math.max(rows[leftIndex - 1]![rightIndex] as number, rows[leftIndex]![rightIndex - 1] as number);
    }
  }
  return (rows[left.length]![right.length] as number) / Math.max(left.length, right.length);
}

function tokenizeFeature(values: readonly string[]): string[] {
  const tokens = new Set<string>();
  for (const value of values) {
    for (const segment of value.normalize("NFKC").toLowerCase().match(/[\p{Script=Han}]+|[\p{Letter}\p{Number}]+/gu) ?? []) {
      addSegmentTokens(tokens, segment);
    }
  }
  return [...tokens].sort().slice(0, MAX_TOKENS);
}

function addSegmentTokens(tokens: Set<string>, segment: string): void {
  const characters = [...segment];
  const containsHan = /\p{Script=Han}/u.test(segment);
  const width = containsHan ? 2 : 3;
  if (!containsHan) tokens.add(segment);
  if (characters.length <= width) {
    tokens.add(segment);
    return;
  }
  for (let index = 0; index <= characters.length - width; index += 1) {
    tokens.add(characters.slice(index, index + width).join(""));
  }
}

function ratioSimilarity(left: number, right: number): number {
  return Math.min(left, right) / Math.max(left, right);
}

function distanceSimilarity(left: number, right: number): number {
  return Math.max(0, 1 - Math.abs(left - right));
}

function safeRatio(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : numerator / denominator;
}

function parseCanonicalIso(value: string): number | null {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return null;
  return new Date(parsed).toISOString() === value ? parsed : null;
}

function isComparedComponent(
  component: MaterialSimilarityComponent,
): component is MaterialSimilarityComponent & { status: "compared"; score: number } {
  return component.status === "compared" && component.score !== null;
}

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function round4(value: number): number {
  return Math.round((value + Number.EPSILON) * 10_000) / 10_000;
}

function hashCanonical(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    Object.values(value).forEach((entry) => deepFreeze(entry));
  }
  return value;
}
