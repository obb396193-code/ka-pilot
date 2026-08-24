import { createHash } from "node:crypto";

import { z } from "zod";

import type { MaterialExperimentMatrixResult } from "./material-experiment.js";
import {
  createMaterialReplicationLineage,
  MATERIAL_REPLICATION_LINEAGE_SCHEMA_VERSION,
  type MaterialReplicationLineage,
} from "./material-similarity.js";

const SAFE_ID = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/;
const SAFE_VERSION = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/;
const SAFE_SHA256 = /^[a-f0-9]{64}$/;
const MAX_TEXT_LENGTH = 4_000;
const MAX_VARIANTS = 20;

export const MATERIAL_DESIGN_BRIEF_SCHEMA_VERSION = "1";
export const MATERIAL_BRIEF_DELIVERY_SCHEMA_VERSION = "1";
export const MATERIAL_BRIEF_READINESS_SCHEMA_VERSION = "1";

export type MaterialDesignBriefErrorCode =
  | "invalid_brief"
  | "invalid_delivery"
  | "conflicting_delivery"
  | "invalid_experiment";

export class MaterialDesignBriefError extends Error {
  constructor(readonly code: MaterialDesignBriefErrorCode) {
    super(`Material design brief failed: ${code}`);
    this.name = "MaterialDesignBriefError";
  }
}

export const materialDesignDimensionSchema = z.enum([
  "hook",
  "selling_point",
  "audience",
  "rhythm",
  "cta",
  "visual_style",
]);

export type MaterialDesignDimension = z.infer<typeof materialDesignDimensionSchema>;

const textSchema = z.string().trim().min(1).max(MAX_TEXT_LENGTH);
const variantInputSchema = z.object({
  variantKey: z.string().regex(SAFE_ID),
  changeDimension: materialDesignDimensionSchema,
  hypothesis: textSchema,
  instruction: textSchema,
  keepDimensions: z.array(materialDesignDimensionSchema).min(1).max(5),
}).strict();

const briefInputSchema = z.object({
  briefId: z.string().regex(SAFE_ID),
  briefVersion: z.string().regex(SAFE_VERSION),
  productVersionId: z.string().regex(SAFE_ID),
  sourceMaterialVersionId: z.string().regex(SAFE_ID),
  sourceTeardownFingerprint: z.string().regex(SAFE_SHA256),
  sourceProfileFingerprint: z.string().regex(SAFE_SHA256),
  objective: textSchema,
  globalConstraints: z.array(textSchema).min(1).max(100),
  variants: z.array(variantInputSchema).min(1).max(MAX_VARIANTS),
  experimentPolicyFingerprint: z.string().regex(SAFE_SHA256),
  createdByUserId: z.string().regex(SAFE_ID),
  createdAt: z.string(),
}).strict();

const normalizedVariantSchema = variantInputSchema;
const briefBodySchema = z.object({
  schemaVersion: z.literal(MATERIAL_DESIGN_BRIEF_SCHEMA_VERSION),
  briefId: z.string().regex(SAFE_ID),
  briefVersion: z.string().regex(SAFE_VERSION),
  productVersionId: z.string().regex(SAFE_ID),
  sourceMaterialVersionId: z.string().regex(SAFE_ID),
  sourceTeardownFingerprint: z.string().regex(SAFE_SHA256),
  sourceProfileFingerprint: z.string().regex(SAFE_SHA256),
  objective: textSchema,
  globalConstraints: z.array(textSchema).min(1).max(100),
  variants: z.array(normalizedVariantSchema).min(1).max(MAX_VARIANTS),
  experimentPolicyFingerprint: z.string().regex(SAFE_SHA256),
  createdByUserId: z.string().regex(SAFE_ID),
  createdAt: z.string(),
}).strict();

const briefSchema = briefBodySchema.extend({
  fingerprint: z.string().regex(SAFE_SHA256),
}).strict();

export type MaterialDesignVariantInput = z.input<typeof variantInputSchema>;
export type MaterialDesignVariant = z.infer<typeof normalizedVariantSchema>;
export type MaterialDesignBriefInput = z.input<typeof briefInputSchema>;
export type MaterialDesignBrief = z.infer<typeof briefSchema>;

export function createMaterialDesignBrief(
  input: MaterialDesignBriefInput,
  observedAt: string,
): MaterialDesignBrief {
  const parsed = briefInputSchema.safeParse(input);
  const createdAtMs = parsed.success ? parseCanonicalIso(parsed.data.createdAt) : null;
  const observedAtMs = parseCanonicalIso(observedAt);
  if (!parsed.success || createdAtMs === null || observedAtMs === null || createdAtMs > observedAtMs) {
    throw new MaterialDesignBriefError("invalid_brief");
  }

  const globalConstraints = normalizeUniqueText(parsed.data.globalConstraints, "invalid_brief");
  const variants = parsed.data.variants.map(normalizeVariant).sort((left, right) =>
    compareText(left.variantKey, right.variantKey),
  );
  if (!isUnique(variants.map(({ variantKey }) => variantKey))) {
    throw new MaterialDesignBriefError("invalid_brief");
  }

  const body = {
    schemaVersion: MATERIAL_DESIGN_BRIEF_SCHEMA_VERSION as "1",
    briefId: parsed.data.briefId,
    briefVersion: parsed.data.briefVersion,
    productVersionId: parsed.data.productVersionId,
    sourceMaterialVersionId: parsed.data.sourceMaterialVersionId,
    sourceTeardownFingerprint: parsed.data.sourceTeardownFingerprint,
    sourceProfileFingerprint: parsed.data.sourceProfileFingerprint,
    objective: parsed.data.objective,
    globalConstraints,
    variants,
    experimentPolicyFingerprint: parsed.data.experimentPolicyFingerprint,
    createdByUserId: parsed.data.createdByUserId,
    createdAt: parsed.data.createdAt,
  };
  return deepFreeze({ ...body, fingerprint: hashCanonical(body) });
}

function normalizeVariant(input: z.infer<typeof variantInputSchema>): MaterialDesignVariant {
  const keepDimensions = [...input.keepDimensions].sort(compareText);
  if (!isUnique(keepDimensions) || keepDimensions.includes(input.changeDimension)) {
    throw new MaterialDesignBriefError("invalid_brief");
  }
  return { ...input, keepDimensions };
}

const deliveryInputSchema = z.object({
  variantKey: z.string().regex(SAFE_ID),
  lineage: z.unknown(),
  deliveredAt: z.string(),
}).strict();

export interface MaterialBriefDeliveryInput {
  readonly variantKey: string;
  readonly lineage: MaterialReplicationLineage;
  readonly deliveredAt: string;
}

const normalizedDeliverySchema = z.object({
  variantKey: z.string().regex(SAFE_ID),
  derivedMaterialVersionId: z.string().regex(SAFE_ID),
  lineageFingerprint: z.string().regex(SAFE_SHA256),
  deliveredAt: z.string(),
}).strict();

export type MaterialBriefDelivery = z.infer<typeof normalizedDeliverySchema>;

const deliverySetBodySchema = z.object({
  schemaVersion: z.literal(MATERIAL_BRIEF_DELIVERY_SCHEMA_VERSION),
  briefFingerprint: z.string().regex(SAFE_SHA256),
  deliveries: z.array(normalizedDeliverySchema).max(MAX_VARIANTS),
}).strict();

const deliverySetSchema = deliverySetBodySchema.extend({
  fingerprint: z.string().regex(SAFE_SHA256),
}).strict();

export type MaterialBriefDeliverySet = z.infer<typeof deliverySetSchema>;

export function normalizeMaterialBriefDeliveries(
  briefInput: MaterialDesignBrief,
  inputs: readonly MaterialBriefDeliveryInput[],
  observedAt: string,
): MaterialBriefDeliverySet {
  const brief = parseIntegrityCheckedBrief(briefInput);
  const parsedInputs = z.array(deliveryInputSchema).max(MAX_VARIANTS).safeParse(inputs);
  const observedAtMs = parseCanonicalIso(observedAt);
  if (!parsedInputs.success || observedAtMs === null) {
    throw new MaterialDesignBriefError("invalid_delivery");
  }

  const variantKeys = new Set(brief.variants.map(({ variantKey }) => variantKey));
  const byVariant = new Map<string, MaterialBriefDelivery>();
  const derivedOwners = new Map<string, string>();
  for (const input of parsedInputs.data) {
    const delivery = normalizeDelivery(input, brief, variantKeys, observedAtMs);
    registerDelivery(delivery, byVariant, derivedOwners);
  }

  const deliveries = [...byVariant.values()].sort((left, right) => compareText(left.variantKey, right.variantKey));
  const body = {
    schemaVersion: MATERIAL_BRIEF_DELIVERY_SCHEMA_VERSION as "1",
    briefFingerprint: brief.fingerprint,
    deliveries,
  };
  return deepFreeze({ ...body, fingerprint: hashCanonical(body) });
}

function normalizeDelivery(
  input: z.infer<typeof deliveryInputSchema>,
  brief: MaterialDesignBrief,
  variantKeys: ReadonlySet<string>,
  observedAtMs: number,
): MaterialBriefDelivery {
  if (!variantKeys.has(input.variantKey)) throw new MaterialDesignBriefError("invalid_delivery");
  const deliveredAtMs = parseCanonicalIso(input.deliveredAt);
  if (deliveredAtMs === null || deliveredAtMs > observedAtMs || deliveredAtMs < Date.parse(brief.createdAt)) {
    throw new MaterialDesignBriefError("invalid_delivery");
  }
  const lineage = parseLineage(input.lineage, input.deliveredAt);
  if (
    lineage.sourceMaterialVersionId !== brief.sourceMaterialVersionId ||
    lineage.sourceTeardownFingerprint !== brief.sourceTeardownFingerprint
  ) throw new MaterialDesignBriefError("invalid_delivery");
  return {
    variantKey: input.variantKey,
    derivedMaterialVersionId: lineage.derivedMaterialVersionId,
    lineageFingerprint: lineage.fingerprint,
    deliveredAt: input.deliveredAt,
  };
}

function registerDelivery(
  delivery: MaterialBriefDelivery,
  byVariant: Map<string, MaterialBriefDelivery>,
  derivedOwners: Map<string, string>,
): void {
  const current = byVariant.get(delivery.variantKey);
  if (current !== undefined && hashCanonical(current) !== hashCanonical(delivery)) {
    throw new MaterialDesignBriefError("conflicting_delivery");
  }
  const owner = derivedOwners.get(delivery.derivedMaterialVersionId);
  if (owner !== undefined && owner !== delivery.variantKey) {
    throw new MaterialDesignBriefError("conflicting_delivery");
  }
  byVariant.set(delivery.variantKey, delivery);
  derivedOwners.set(delivery.derivedMaterialVersionId, delivery.variantKey);
}

function parseLineage(input: unknown, observedAt: string): MaterialReplicationLineage {
  if (input === null || typeof input !== "object") throw new MaterialDesignBriefError("invalid_delivery");
  const candidate = input as Partial<MaterialReplicationLineage>;
  if (candidate.schemaVersion !== MATERIAL_REPLICATION_LINEAGE_SCHEMA_VERSION) {
    throw new MaterialDesignBriefError("invalid_delivery");
  }
  try {
    const recreated = createMaterialReplicationLineage({
      sourceMaterialVersionId: candidate.sourceMaterialVersionId as string,
      derivedMaterialVersionId: candidate.derivedMaterialVersionId as string,
      method: candidate.method as MaterialReplicationLineage["method"],
      sourceTeardownFingerprint: candidate.sourceTeardownFingerprint as string,
      createdByUserId: candidate.createdByUserId as string,
      createdAt: candidate.createdAt as string,
      ...(candidate.note === undefined ? {} : { note: candidate.note }),
    }, observedAt);
    if (recreated.fingerprint !== candidate.fingerprint || Object.keys(candidate).length !== Object.keys(recreated).length) {
      throw new MaterialDesignBriefError("invalid_delivery");
    }
    return recreated;
  } catch (error) {
    if (error instanceof MaterialDesignBriefError) throw error;
    throw new MaterialDesignBriefError("invalid_delivery");
  }
}

export type MaterialBriefBacktestStatus = "awaiting_delivery" | "awaiting_sample" | "ready";

export interface MaterialBriefBacktestReadinessInput {
  readonly brief: MaterialDesignBrief;
  readonly deliverySet: MaterialBriefDeliverySet;
  readonly experiment: MaterialExperimentMatrixResult;
}

export interface MaterialBriefBacktestReadiness {
  readonly schemaVersion: typeof MATERIAL_BRIEF_READINESS_SCHEMA_VERSION;
  readonly briefFingerprint: string;
  readonly deliverySetFingerprint: string;
  readonly experimentFingerprint: string | null;
  readonly status: MaterialBriefBacktestStatus;
  readonly missingVariantKeys: readonly string[];
  readonly insufficientMaterialVersionIds: readonly string[];
  readonly fingerprint: string;
}

export function assessMaterialBriefBacktestReadiness(
  input: MaterialBriefBacktestReadinessInput,
): MaterialBriefBacktestReadiness {
  const brief = parseIntegrityCheckedBrief(input.brief);
  const deliverySet = parseIntegrityCheckedDeliverySet(input.deliverySet, brief);
  const delivered = new Set(deliverySet.deliveries.map(({ variantKey }) => variantKey));
  const missingVariantKeys = brief.variants
    .map(({ variantKey }) => variantKey)
    .filter((variantKey) => !delivered.has(variantKey));
  if (missingVariantKeys.length > 0) {
    return createReadiness({
      briefFingerprint: brief.fingerprint,
      deliverySetFingerprint: deliverySet.fingerprint,
      experimentFingerprint: null,
      status: "awaiting_delivery",
      missingVariantKeys,
      insufficientMaterialVersionIds: [],
    });
  }

  const experiment = parseIntegrityCheckedExperiment(input.experiment);
  if (experiment.policyFingerprint !== brief.experimentPolicyFingerprint) {
    throw new MaterialDesignBriefError("invalid_experiment");
  }
  const products = experiment.products.filter(({ productVersionId }) => productVersionId === brief.productVersionId);
  if (products.length > 1) throw new MaterialDesignBriefError("invalid_experiment");
  const product = products[0];
  const sampleStatusByMaterial = new Map<string, "sufficient" | "insufficient">();
  for (const cell of product?.cells ?? []) {
    if (sampleStatusByMaterial.has(cell.materialVersionId)) {
      throw new MaterialDesignBriefError("invalid_experiment");
    }
    sampleStatusByMaterial.set(cell.materialVersionId, cell.sampleStatus);
  }
  const insufficientMaterialVersionIds = deliverySet.deliveries
    .map(({ derivedMaterialVersionId }) => derivedMaterialVersionId)
    .filter((materialVersionId) => sampleStatusByMaterial.get(materialVersionId) !== "sufficient")
    .sort(compareText);
  return createReadiness({
    briefFingerprint: brief.fingerprint,
    deliverySetFingerprint: deliverySet.fingerprint,
    experimentFingerprint: experiment.fingerprint,
    status: insufficientMaterialVersionIds.length === 0 ? "ready" : "awaiting_sample",
    missingVariantKeys: [],
    insufficientMaterialVersionIds,
  });
}

function parseIntegrityCheckedBrief(input: unknown): MaterialDesignBrief {
  const parsed = briefSchema.safeParse(input);
  if (!parsed.success) throw new MaterialDesignBriefError("invalid_brief");
  const { fingerprint, ...body } = parsed.data;
  if (
    hashCanonical(body) !== fingerprint ||
    parseCanonicalIso(body.createdAt) === null ||
    !isSortedUnique(body.globalConstraints) ||
    !isSortedUnique(body.variants.map(({ variantKey }) => variantKey)) ||
    body.variants.some(({ keepDimensions, changeDimension }) =>
      !isSortedUnique(keepDimensions) || keepDimensions.includes(changeDimension),
    )
  ) throw new MaterialDesignBriefError("invalid_brief");
  return parsed.data;
}

function parseIntegrityCheckedDeliverySet(input: unknown, brief: MaterialDesignBrief): MaterialBriefDeliverySet {
  const parsed = deliverySetSchema.safeParse(input);
  if (!parsed.success) throw new MaterialDesignBriefError("invalid_delivery");
  const { fingerprint, ...body } = parsed.data;
  const variantKeys = body.deliveries.map(({ variantKey }) => variantKey);
  const materialIds = body.deliveries.map(({ derivedMaterialVersionId }) => derivedMaterialVersionId);
  const allowedVariantKeys = new Set(brief.variants.map(({ variantKey }) => variantKey));
  if (
    body.briefFingerprint !== brief.fingerprint ||
    hashCanonical(body) !== fingerprint ||
    !isSortedUnique(variantKeys) ||
    !isUnique(materialIds) ||
    variantKeys.some((variantKey) => !allowedVariantKeys.has(variantKey)) ||
    body.deliveries.some(({ deliveredAt }) => parseCanonicalIso(deliveredAt) === null)
  ) throw new MaterialDesignBriefError("invalid_delivery");
  return parsed.data;
}

const experimentCellSchema = z.object({
  materialVersionId: z.string().regex(SAFE_ID),
  sampleStatus: z.enum(["sufficient", "insufficient"]),
}).passthrough();
const experimentProductSchema = z.object({
  productVersionId: z.string().regex(SAFE_ID),
  cells: z.array(experimentCellSchema).max(1_000),
}).passthrough();
const experimentSchema = z.object({
  policyFingerprint: z.string().regex(SAFE_SHA256),
  products: z.array(experimentProductSchema).max(1_000),
  fingerprint: z.string().regex(SAFE_SHA256),
}).strict();

function parseIntegrityCheckedExperiment(input: unknown): MaterialExperimentMatrixResult {
  const parsed = experimentSchema.safeParse(input);
  if (!parsed.success) throw new MaterialDesignBriefError("invalid_experiment");
  const candidate = input as MaterialExperimentMatrixResult;
  const { fingerprint, ...body } = candidate;
  const productIds = candidate.products.map(({ productVersionId }) => productVersionId);
  const hasDuplicateCells = candidate.products.some(({ cells }) =>
    !isUnique(cells.map(({ materialVersionId }) => materialVersionId)),
  );
  if (hashCanonical(body) !== fingerprint || !isUnique(productIds) || hasDuplicateCells) {
    throw new MaterialDesignBriefError("invalid_experiment");
  }
  return candidate;
}

function createReadiness(
  input: Omit<MaterialBriefBacktestReadiness, "schemaVersion" | "fingerprint">,
): MaterialBriefBacktestReadiness {
  const body = { schemaVersion: MATERIAL_BRIEF_READINESS_SCHEMA_VERSION as "1", ...input };
  return deepFreeze({ ...body, fingerprint: hashCanonical(body) });
}

function normalizeUniqueText(values: readonly string[], code: "invalid_brief"): string[] {
  const normalized = [...values].sort(compareText);
  if (!isUnique(normalized)) throw new MaterialDesignBriefError(code);
  return normalized;
}

function parseCanonicalIso(value: string): number | null {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return null;
  return new Date(parsed).toISOString() === value ? parsed : null;
}

function isUnique(values: readonly string[]): boolean {
  return new Set(values).size === values.length;
}

function isSortedUnique(values: readonly string[]): boolean {
  return values.every((value, index) => index === 0 || (values[index - 1] as string) < value);
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
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
