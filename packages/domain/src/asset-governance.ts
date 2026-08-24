import { createHash } from "node:crypto";

import { z } from "zod";

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/;
const SAFE_VERSION = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const SAFE_EVIDENCE = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$/;
const SHA256 = /^[a-f0-9]{64}$/;
const MAX_TEXT = 4_000;
const MAX_MAINTAINERS = 50;
const MAX_SCOPES = 100;
const MAX_DEPENDENCIES = 200;
const MAX_VALIDATIONS = 1_000;
const MAX_EVENTS = 20;
const MAX_USAGE_FACTS = 10_000;

export const ASSET_GOVERNANCE_SCHEMA_VERSION = "1";
export const ASSET_GOVERNANCE_SUMMARY_SCHEMA_VERSION = "1";
export const GOVERNED_ASSET_TYPES = [
  "report",
  "workflow",
  "strategy",
  "object_group",
  "knowledge",
] as const;
export const ASSET_LIFECYCLE_STATES = [
  "draft",
  "shared",
  "verified",
  "official",
  "deprecated",
] as const;
export const ASSET_DEPENDENCY_TYPES = [
  "data_source",
  "field",
  "capability",
  "permission",
  "asset",
] as const;

export type GovernedAssetType = (typeof GOVERNED_ASSET_TYPES)[number];
export type AssetLifecycleState = (typeof ASSET_LIFECYCLE_STATES)[number];
export type AssetDependencyType = (typeof ASSET_DEPENDENCY_TYPES)[number];
export type AssetGovernanceErrorCode =
  | "invalid_asset"
  | "invalid_validation"
  | "conflicting_validation"
  | "invalid_transition"
  | "conflicting_transition"
  | "missing_passed_validation"
  | "invalid_usage"
  | "conflicting_usage";

export class AssetGovernanceError extends Error {
  constructor(readonly code: AssetGovernanceErrorCode) {
    super(`Asset governance failed: ${code}`);
    this.name = "AssetGovernanceError";
  }
}

const uuidSchema = z.string().uuid().transform((value) => value.toLowerCase());
const idSchema = z.string().regex(SAFE_ID);
const versionSchema = z.string().regex(SAFE_VERSION);
const textSchema = z.string().trim().min(1).max(MAX_TEXT);
const assetTypeSchema = z.enum(GOVERNED_ASSET_TYPES);
const lifecycleStateSchema = z.enum(ASSET_LIFECYCLE_STATES);

const assetReferenceSchema = z.object({
  assetType: assetTypeSchema,
  assetId: idSchema,
  versionId: idSchema,
}).strict();

export type GovernedAssetReference = z.infer<typeof assetReferenceSchema>;

const applicabilitySchema = z.object({
  dimension: idSchema,
  value: idSchema,
}).strict();

export type GovernedAssetApplicability = z.infer<typeof applicabilitySchema>;

const dependencySchema = z.object({
  dependencyType: z.enum(ASSET_DEPENDENCY_TYPES),
  dependencyId: idSchema,
  version: versionSchema.optional(),
}).strict();

export type GovernedAssetDependency = z.infer<typeof dependencySchema>;

const originSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("original") }).strict(),
  z.object({ kind: z.literal("copied"), source: assetReferenceSchema }).strict(),
  z.object({ kind: z.literal("new_version"), source: assetReferenceSchema }).strict(),
]);

export type GovernedAssetOrigin = z.infer<typeof originSchema>;

const versionInputSchema = z.object({
  workspaceId: uuidSchema,
  assetId: idSchema,
  versionId: idSchema,
  versionNumber: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
  assetType: assetTypeSchema,
  definitionFingerprint: z.string().regex(SHA256),
  ownerUserId: uuidSchema,
  maintainerUserIds: z.array(uuidSchema).min(1).max(MAX_MAINTAINERS),
  applicability: z.array(applicabilitySchema).min(1).max(MAX_SCOPES),
  dependencies: z.array(dependencySchema).max(MAX_DEPENDENCIES),
  origin: originSchema,
  changeSummary: textSchema,
  createdAt: z.string(),
}).strict();

export type GovernedAssetVersionInput = z.input<typeof versionInputSchema>;

const validationInputSchema = z.object({
  validationId: idSchema,
  assetVersionId: idSchema,
  definitionFingerprint: z.string().regex(SHA256),
  outcome: z.enum(["passed", "failed"]),
  successfulRuns: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).optional(),
  totalRuns: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER).optional(),
  businessEffect: textSchema.optional(),
  evidenceRefs: z.array(z.string().regex(SAFE_EVIDENCE)).min(1).max(100),
  validatedByUserId: uuidSchema,
  validatedAt: z.string(),
}).strict();

export type AssetValidationInput = z.input<typeof validationInputSchema>;

const validationSchema = validationInputSchema.extend({
  successRate: z.number().finite().min(0).max(1).nullable(),
}).strict();

export type AssetValidation = z.infer<typeof validationSchema>;

const transitionInputSchema = z.object({
  eventId: idSchema,
  toState: z.enum(["shared", "verified", "official", "deprecated"]),
  changedByUserId: uuidSchema,
  changedAt: z.string(),
  reason: textSchema.optional(),
  replacement: assetReferenceSchema.optional(),
}).strict();

export type AssetLifecycleTransitionInput = z.input<typeof transitionInputSchema>;

const lifecycleEventSchema = transitionInputSchema.extend({
  fromState: lifecycleStateSchema,
}).strict();

export type AssetLifecycleEvent = z.infer<typeof lifecycleEventSchema>;

const deprecationSchema = z.object({
  reason: textSchema,
  deprecatedAt: z.string(),
  deprecatedByUserId: uuidSchema,
  replacement: assetReferenceSchema.optional(),
}).strict();

export type AssetDeprecation = z.infer<typeof deprecationSchema>;

const versionBodySchema = versionInputSchema.extend({
  schemaVersion: z.literal(ASSET_GOVERNANCE_SCHEMA_VERSION),
  state: lifecycleStateSchema,
  validations: z.array(validationSchema).max(MAX_VALIDATIONS),
  lifecycleEvents: z.array(lifecycleEventSchema).max(MAX_EVENTS),
  deprecation: deprecationSchema.optional(),
}).strict();

const versionSchemaWithFingerprint = versionBodySchema.extend({
  fingerprint: z.string().regex(SHA256),
}).strict();

export type GovernedAssetVersion = z.infer<typeof versionSchemaWithFingerprint>;

const usageInputSchema = z.object({
  usageId: idSchema,
  assetVersionId: idSchema,
  definitionFingerprint: z.string().regex(SHA256),
  userId: uuidSchema,
  usedAt: z.string(),
}).strict();

export type AssetUsageFactInput = z.input<typeof usageInputSchema>;

const usageSummarySchema = z.object({
  userCount: z.number().int().min(0),
  usageCount: z.number().int().min(0),
  lastUsedAt: z.string().nullable(),
}).strict();

const governanceSummaryBodySchema = z.object({
  schemaVersion: z.literal(ASSET_GOVERNANCE_SUMMARY_SCHEMA_VERSION),
  assetFingerprint: z.string().regex(SHA256),
  workspaceId: uuidSchema,
  assetId: idSchema,
  versionId: idSchema,
  versionNumber: z.number().int().min(1),
  assetType: assetTypeSchema,
  state: lifecycleStateSchema,
  ownerUserId: uuidSchema,
  maintainerUserIds: z.array(uuidSchema),
  applicability: z.array(applicabilitySchema),
  dependencies: z.array(dependencySchema),
  origin: originSchema,
  changeSummary: textSchema,
  definitionFingerprint: z.string().regex(SHA256),
  createdAt: z.string(),
  latestValidation: validationSchema.nullable(),
  usage: usageSummarySchema,
  deprecation: deprecationSchema.nullable(),
}).strict();

export type AssetGovernanceSummary = z.infer<typeof governanceSummaryBodySchema> & {
  readonly fingerprint: string;
};

export function createGovernedAssetVersion(
  input: GovernedAssetVersionInput,
  observedAt: string,
): GovernedAssetVersion {
  const parsed = versionInputSchema.safeParse(input);
  const observedAtMs = parseCanonicalIso(observedAt);
  if (!parsed.success || observedAtMs === null) throw invalidAsset();
  const createdAtMs = parseCanonicalIso(parsed.data.createdAt);
  if (createdAtMs === null || createdAtMs > observedAtMs) throw invalidAsset();

  const normalized = normalizeVersionInput(parsed.data);
  validateVersionRelations(normalized);
  const body = {
    schemaVersion: ASSET_GOVERNANCE_SCHEMA_VERSION as "1",
    ...normalized,
    state: "draft" as const,
    validations: [] as AssetValidation[],
    lifecycleEvents: [] as AssetLifecycleEvent[],
  };
  return freezeVersion(body);
}

export function recordAssetValidation(
  assetInput: GovernedAssetVersion,
  input: AssetValidationInput,
  observedAt: string,
): GovernedAssetVersion {
  const asset = parseAsset(assetInput);
  const parsed = validationInputSchema.safeParse(input);
  const observedAtMs = parseCanonicalIso(observedAt);
  if (!parsed.success || observedAtMs === null) throw invalidValidation();
  assertObservedAt(asset, observedAtMs, "invalid_validation");
  if (asset.state === "deprecated") throw invalidValidation();
  const validation = normalizeValidation(parsed.data, asset, observedAtMs);
  const existing = asset.validations.find(({ validationId }) => validationId === validation.validationId);
  if (existing !== undefined) {
    if (canonicalJson(existing) === canonicalJson(validation)) return asset;
    throw new AssetGovernanceError("conflicting_validation");
  }
  const validations = [...asset.validations, validation].sort(compareValidation);
  return freezeVersion(versionBody(asset, { validations }));
}

export function transitionGovernedAsset(
  assetInput: GovernedAssetVersion,
  input: AssetLifecycleTransitionInput,
  observedAt: string,
): GovernedAssetVersion {
  const asset = parseAsset(assetInput);
  const parsed = transitionInputSchema.safeParse(input);
  const observedAtMs = parseCanonicalIso(observedAt);
  if (!parsed.success || observedAtMs === null) throw invalidTransition();
  assertObservedAt(asset, observedAtMs, "invalid_transition");
  const normalized = normalizeTransitionInput(parsed.data);
  const existing = asset.lifecycleEvents.find(({ eventId }) => eventId === normalized.eventId);
  if (existing !== undefined) {
    if (transitionMatches(existing, normalized)) return asset;
    throw new AssetGovernanceError("conflicting_transition");
  }
  validateTransition(asset, normalized, observedAtMs);
  const event: AssetLifecycleEvent = { fromState: asset.state, ...normalized };
  const deprecation = normalized.toState === "deprecated"
    ? {
        reason: normalized.reason!,
        deprecatedAt: normalized.changedAt,
        deprecatedByUserId: normalized.changedByUserId,
        ...(normalized.replacement === undefined ? {} : { replacement: normalized.replacement }),
      }
    : asset.deprecation;
  return freezeVersion(versionBody(asset, {
    state: normalized.toState,
    lifecycleEvents: [...asset.lifecycleEvents, event],
    ...(deprecation === undefined ? {} : { deprecation }),
  }));
}

export function buildAssetGovernanceSummary(
  assetInput: GovernedAssetVersion,
  usageInputs: readonly AssetUsageFactInput[],
  observedAt: string,
): AssetGovernanceSummary {
  const asset = parseAsset(assetInput);
  const observedAtMs = parseCanonicalIso(observedAt);
  const parsed = z.array(usageInputSchema).max(MAX_USAGE_FACTS).safeParse(usageInputs);
  if (!parsed.success || observedAtMs === null) throw invalidUsage();
  assertObservedAt(asset, observedAtMs, "invalid_usage");
  const usage = summarizeUsage(parsed.data, asset, observedAtMs);
  const latestValidation = asset.validations.length === 0
    ? null
    : asset.validations[asset.validations.length - 1]!;
  const body = {
    schemaVersion: ASSET_GOVERNANCE_SUMMARY_SCHEMA_VERSION as "1",
    assetFingerprint: asset.fingerprint,
    workspaceId: asset.workspaceId,
    assetId: asset.assetId,
    versionId: asset.versionId,
    versionNumber: asset.versionNumber,
    assetType: asset.assetType,
    state: asset.state,
    ownerUserId: asset.ownerUserId,
    maintainerUserIds: asset.maintainerUserIds,
    applicability: asset.applicability,
    dependencies: asset.dependencies,
    origin: asset.origin,
    changeSummary: asset.changeSummary,
    definitionFingerprint: asset.definitionFingerprint,
    createdAt: asset.createdAt,
    latestValidation,
    usage,
    deprecation: asset.deprecation ?? null,
  };
  const checked = governanceSummaryBodySchema.safeParse(body);
  if (!checked.success) throw invalidAsset();
  return deepFreeze({ ...checked.data, fingerprint: hashCanonical(checked.data) });
}

function normalizeVersionInput(input: z.infer<typeof versionInputSchema>) {
  return {
    ...input,
    maintainerUserIds: [...new Set(input.maintainerUserIds)].sort(compareText),
    applicability: [...input.applicability].sort((left, right) =>
      compareText(applicabilityKey(left), applicabilityKey(right))),
    dependencies: [...input.dependencies].sort((left, right) =>
      compareText(dependencyKey(left), dependencyKey(right))),
  };
}

function validateVersionRelations(input: ReturnType<typeof normalizeVersionInput>): void {
  validateVersionCollections(input);
  validateVersionOrigin(input);
}

function validateVersionCollections(input: ReturnType<typeof normalizeVersionInput>): void {
  const hasSelfDependency = input.dependencies.some((dependency) =>
    dependency.dependencyType === "asset" && dependency.dependencyId === input.assetId);
  if (!input.maintainerUserIds.includes(input.ownerUserId)) throw invalidAsset();
  if (!isUnique(input.applicability.map(applicabilityKey))) throw invalidAsset();
  if (!isUnique(input.dependencies.map(dependencyKey))) throw invalidAsset();
  if (hasSelfDependency) throw invalidAsset();
}

function validateVersionOrigin(input: ReturnType<typeof normalizeVersionInput>): void {
  if (input.origin.kind === "original") {
    if (input.versionNumber !== 1) throw invalidAsset();
    return;
  }
  if (sameAssetVersion(input.origin.source, input)) throw invalidAsset();
  if (input.origin.source.assetType !== input.assetType) throw invalidAsset();
  if (input.origin.kind === "copied" && input.versionNumber !== 1) throw invalidAsset();
  if (input.origin.kind === "new_version") validateNewVersionOrigin(input);
}

function validateNewVersionOrigin(input: ReturnType<typeof normalizeVersionInput>): void {
  if (input.origin.kind !== "new_version") return;
  if (input.versionNumber <= 1 || input.origin.source.assetId !== input.assetId) throw invalidAsset();
}

function normalizeValidation(
  input: z.infer<typeof validationInputSchema>,
  asset: GovernedAssetVersion,
  observedAtMs: number,
): AssetValidation {
  const validatedAtMs = parseCanonicalIso(input.validatedAt);
  const quantitative = input.successfulRuns !== undefined || input.totalRuns !== undefined;
  if (isInvalidValidationTime(validatedAtMs, asset, observedAtMs)) throw invalidValidation();
  if (isInvalidValidationBinding(input, asset)) throw invalidValidation();
  if (isInvalidValidationEvidence(input, quantitative)) throw invalidValidation();
  const evidenceRefs = [...input.evidenceRefs].sort(compareText);
  if (!isUnique(evidenceRefs)) throw invalidValidation();
  return {
    ...input,
    evidenceRefs,
    successRate: quantitative ? input.successfulRuns! / input.totalRuns! : null,
  };
}

function isInvalidValidationTime(
  validatedAtMs: number | null,
  asset: GovernedAssetVersion,
  observedAtMs: number,
): boolean {
  if (validatedAtMs === null) return true;
  return validatedAtMs < Date.parse(asset.createdAt) || validatedAtMs > observedAtMs;
}

function isInvalidValidationBinding(
  input: z.infer<typeof validationInputSchema>,
  asset: GovernedAssetVersion,
): boolean {
  return input.assetVersionId !== asset.versionId ||
    input.definitionFingerprint !== asset.definitionFingerprint;
}

function isInvalidValidationEvidence(
  input: z.infer<typeof validationInputSchema>,
  quantitative: boolean,
): boolean {
  if (!quantitative) return input.businessEffect === undefined;
  if (input.successfulRuns === undefined || input.totalRuns === undefined) return true;
  return input.successfulRuns > input.totalRuns;
}

function normalizeTransitionInput(input: z.infer<typeof transitionInputSchema>) {
  return {
    eventId: input.eventId,
    toState: input.toState,
    changedByUserId: input.changedByUserId,
    changedAt: input.changedAt,
    ...(input.reason === undefined ? {} : { reason: input.reason }),
    ...(input.replacement === undefined ? {} : { replacement: input.replacement }),
  };
}

function validateTransition(
  asset: GovernedAssetVersion,
  input: ReturnType<typeof normalizeTransitionInput>,
  observedAtMs: number,
): void {
  const changedAtMs = parseCanonicalIso(input.changedAt);
  const lastEventAt = asset.lifecycleEvents.at(-1)?.changedAt ?? asset.createdAt;
  const expected = nextState(asset.state);
  if (isInvalidTransitionTarget(changedAtMs, lastEventAt, observedAtMs, input.toState, expected)) {
    throw invalidTransition();
  }
  validateTransitionMetadata(asset, input);
  validateVerificationTransition(asset, input, changedAtMs!);
}

function isInvalidTransitionTarget(
  changedAtMs: number | null,
  lastEventAt: string,
  observedAtMs: number,
  toState: AssetLifecycleState,
  expected: AssetLifecycleState | null,
): boolean {
  if (changedAtMs === null) return true;
  return changedAtMs < Date.parse(lastEventAt) || changedAtMs > observedAtMs || toState !== expected;
}

function validateTransitionMetadata(
  asset: GovernedAssetVersion,
  input: ReturnType<typeof normalizeTransitionInput>,
): void {
  if (input.toState !== "deprecated") {
    if (input.reason !== undefined || input.replacement !== undefined) throw invalidTransition();
    return;
  }
  if (input.reason === undefined) throw invalidTransition();
  if (input.replacement !== undefined && sameAssetVersion(input.replacement, asset)) {
    throw invalidTransition();
  }
}

function validateVerificationTransition(
  asset: GovernedAssetVersion,
  input: ReturnType<typeof normalizeTransitionInput>,
  changedAtMs: number,
): void {
  if (input.toState !== "verified") return;
  const latest = asset.validations.at(-1);
  const valid = latest !== undefined &&
    latest.outcome === "passed" &&
    latest.definitionFingerprint === asset.definitionFingerprint &&
    Date.parse(latest.validatedAt) <= changedAtMs;
  if (!valid) throw new AssetGovernanceError("missing_passed_validation");
}

function summarizeUsage(
  inputs: readonly z.infer<typeof usageInputSchema>[],
  asset: GovernedAssetVersion,
  observedAtMs: number,
) {
  const byId = new Map<string, z.infer<typeof usageInputSchema>>();
  for (const input of inputs) {
    if (isInvalidUsage(input, asset, observedAtMs)) throw invalidUsage();
    const existing = byId.get(input.usageId);
    if (existing !== undefined && canonicalJson(existing) !== canonicalJson(input)) {
      throw new AssetGovernanceError("conflicting_usage");
    }
    byId.set(input.usageId, input);
  }
  const facts = [...byId.values()].sort((left, right) =>
    compareText(`${left.usedAt}:${left.usageId}`, `${right.usedAt}:${right.usageId}`));
  return {
    userCount: new Set(facts.map(({ userId }) => userId)).size,
    usageCount: facts.length,
    lastUsedAt: facts.at(-1)?.usedAt ?? null,
  };
}

function isInvalidUsage(
  input: z.infer<typeof usageInputSchema>,
  asset: GovernedAssetVersion,
  observedAtMs: number,
): boolean {
  const usedAtMs = parseCanonicalIso(input.usedAt);
  if (usedAtMs === null) return true;
  const invalidTime = usedAtMs < Date.parse(asset.createdAt) || usedAtMs > observedAtMs;
  const invalidBinding = input.assetVersionId !== asset.versionId ||
    input.definitionFingerprint !== asset.definitionFingerprint;
  return invalidTime || invalidBinding;
}

function parseAsset(input: GovernedAssetVersion): GovernedAssetVersion {
  const parsed = versionSchemaWithFingerprint.safeParse(input);
  if (!parsed.success) throw invalidAsset();
  const asset = parsed.data;
  const { fingerprint, ...body } = asset;
  if (hashCanonical(body) !== fingerprint) throw invalidAsset();
  validateAssetSemantics(asset);
  return deepFreeze(asset);
}

function validateAssetSemantics(asset: GovernedAssetVersion): void {
  validateStoredVersionNormalization(asset);
  validateStoredLifecycle(asset);
  validateStoredValidations(asset);
  validateStoredDeprecation(asset);
}

function validateStoredVersionNormalization(asset: GovernedAssetVersion): void {
  const normalized = normalizeVersionInput(asset);
  validateVersionRelations(normalized);
  if (
    canonicalJson(normalized.maintainerUserIds) !== canonicalJson(asset.maintainerUserIds) ||
    canonicalJson(normalized.applicability) !== canonicalJson(asset.applicability) ||
    canonicalJson(normalized.dependencies) !== canonicalJson(asset.dependencies)
  ) throw invalidAsset();
}

function validateStoredLifecycle(asset: GovernedAssetVersion): void {
  let state: AssetLifecycleState = "draft";
  let lastAt = asset.createdAt;
  const eventIds = new Set<string>();
  for (const event of asset.lifecycleEvents) {
    if (
      eventIds.has(event.eventId) ||
      event.fromState !== state ||
      event.toState !== nextState(state) ||
      parseCanonicalIso(event.changedAt) === null ||
      Date.parse(event.changedAt) < Date.parse(lastAt) ||
      !isStoredTransitionSemanticallyValid(asset, event)
    ) throw invalidAsset();
    eventIds.add(event.eventId);
    state = event.toState;
    lastAt = event.changedAt;
  }
  if (state !== asset.state) throw invalidAsset();
}

function isStoredTransitionSemanticallyValid(
  asset: GovernedAssetVersion,
  event: AssetLifecycleEvent,
): boolean {
  if (event.toState !== "deprecated" && (event.reason !== undefined || event.replacement !== undefined)) {
    return false;
  }
  if (event.toState === "deprecated") {
    if (event.reason === undefined) return false;
    if (event.replacement !== undefined && sameAssetVersion(event.replacement, asset)) return false;
  }
  if (event.toState !== "verified") return true;
  const eligible = asset.validations.filter(({ validatedAt }) =>
    Date.parse(validatedAt) <= Date.parse(event.changedAt));
  return eligible.at(-1)?.outcome === "passed";
}

function validateStoredValidations(asset: GovernedAssetVersion): void {
  const ids = new Set<string>();
  let previous = "";
  for (const validation of asset.validations) {
    if (ids.has(validation.validationId)) throw invalidAsset();
    const normalized = normalizeValidation(validation, asset, Number.POSITIVE_INFINITY);
    if (canonicalJson(normalized) !== canonicalJson(validation)) throw invalidAsset();
    const key = `${validation.validatedAt}:${validation.validationId}`;
    if (previous !== "" && compareText(previous, key) > 0) throw invalidAsset();
    ids.add(validation.validationId);
    previous = key;
  }
}

function validateStoredDeprecation(asset: GovernedAssetVersion): void {
  if (asset.state !== "deprecated") {
    if (asset.deprecation !== undefined) throw invalidAsset();
    return;
  }
  const last = asset.lifecycleEvents.at(-1);
  if (last?.toState !== "deprecated" || asset.deprecation === undefined) throw invalidAsset();
  if (!deprecationMatchesEvent(asset.deprecation, last)) throw invalidAsset();
}

function deprecationMatchesEvent(
  deprecation: AssetDeprecation,
  event: AssetLifecycleEvent,
): boolean {
  const sameCore = deprecation.reason === event.reason &&
    deprecation.deprecatedAt === event.changedAt &&
    deprecation.deprecatedByUserId === event.changedByUserId;
  const sameReplacement = canonicalJson(deprecation.replacement ?? null) ===
    canonicalJson(event.replacement ?? null);
  return sameCore && sameReplacement;
}

function versionBody(
  asset: GovernedAssetVersion,
  changes: Partial<Omit<GovernedAssetVersion, "fingerprint">>,
) {
  return {
    schemaVersion: asset.schemaVersion,
    workspaceId: asset.workspaceId,
    assetId: asset.assetId,
    versionId: asset.versionId,
    versionNumber: asset.versionNumber,
    assetType: asset.assetType,
    definitionFingerprint: asset.definitionFingerprint,
    ownerUserId: asset.ownerUserId,
    maintainerUserIds: asset.maintainerUserIds,
    applicability: asset.applicability,
    dependencies: asset.dependencies,
    origin: asset.origin,
    changeSummary: asset.changeSummary,
    createdAt: asset.createdAt,
    state: asset.state,
    validations: asset.validations,
    lifecycleEvents: asset.lifecycleEvents,
    ...(asset.deprecation === undefined ? {} : { deprecation: asset.deprecation }),
    ...changes,
  };
}

function freezeVersion(body: z.input<typeof versionBodySchema>): GovernedAssetVersion {
  const parsed = versionBodySchema.safeParse(body);
  if (!parsed.success) throw invalidAsset();
  return deepFreeze({ ...parsed.data, fingerprint: hashCanonical(parsed.data) });
}

function nextState(state: AssetLifecycleState): AssetLifecycleState | null {
  const index = ASSET_LIFECYCLE_STATES.indexOf(state);
  return ASSET_LIFECYCLE_STATES[index + 1] ?? null;
}

function transitionMatches(
  existing: AssetLifecycleEvent,
  input: ReturnType<typeof normalizeTransitionInput>,
): boolean {
  const stored = {
    eventId: existing.eventId,
    toState: existing.toState,
    changedByUserId: existing.changedByUserId,
    changedAt: existing.changedAt,
    ...(existing.reason === undefined ? {} : { reason: existing.reason }),
    ...(existing.replacement === undefined ? {} : { replacement: existing.replacement }),
  };
  return canonicalJson(stored) === canonicalJson(input);
}

function compareValidation(left: AssetValidation, right: AssetValidation): number {
  return compareText(`${left.validatedAt}:${left.validationId}`, `${right.validatedAt}:${right.validationId}`);
}

function applicabilityKey(input: GovernedAssetApplicability): string {
  return `${input.dimension}:${input.value}`;
}

function dependencyKey(input: GovernedAssetDependency): string {
  return `${input.dependencyType}:${input.dependencyId}:${input.version ?? ""}`;
}

function sameAssetVersion(
  reference: GovernedAssetReference,
  asset: Pick<GovernedAssetVersionInput, "assetType" | "assetId" | "versionId">,
): boolean {
  return reference.assetType === asset.assetType &&
    reference.assetId === asset.assetId &&
    reference.versionId === asset.versionId;
}

function parseCanonicalIso(value: string): number | null {
  const time = Date.parse(value);
  if (!Number.isFinite(time) || new Date(time).toISOString() !== value) return null;
  return time;
}

function assertObservedAt(
  asset: GovernedAssetVersion,
  observedAtMs: number,
  code: "invalid_validation" | "invalid_transition" | "invalid_usage",
): void {
  const latestTimes = [
    asset.createdAt,
    ...asset.validations.map(({ validatedAt }) => validatedAt),
    ...asset.lifecycleEvents.map(({ changedAt }) => changedAt),
  ];
  if (latestTimes.some((value) => Date.parse(value) > observedAtMs)) {
    throw new AssetGovernanceError(code);
  }
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function isUnique(values: readonly string[]): boolean {
  return new Set(values).size === values.length;
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(sortCanonical(value));
}

function sortCanonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortCanonical);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => compareText(left, right))
      .map(([key, item]) => [key, sortCanonical(item)]));
  }
  return value;
}

function hashCanonical(value: unknown): string {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const item of Object.values(value as Record<string, unknown>)) deepFreeze(item);
  }
  return value;
}

function invalidAsset(): AssetGovernanceError {
  return new AssetGovernanceError("invalid_asset");
}

function invalidValidation(): AssetGovernanceError {
  return new AssetGovernanceError("invalid_validation");
}

function invalidTransition(): AssetGovernanceError {
  return new AssetGovernanceError("invalid_transition");
}

function invalidUsage(): AssetGovernanceError {
  return new AssetGovernanceError("invalid_usage");
}
