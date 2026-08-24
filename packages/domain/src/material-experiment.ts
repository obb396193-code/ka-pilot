import { createHash } from "node:crypto";

import { z } from "zod";

import { safeDivide } from "./metrics.js";
import type { RatioValue } from "./types.js";

const SAFE_ID = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/;
const SAFE_VERSION = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/;
const SAFE_SHA256 = /^[a-f0-9]{64}$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_FACTS = 10_000;
const MAX_CELLS = 1_000;
const MAX_COUNT = 1_000_000_000_000;
const MAX_COST = 1_000_000_000_000_000;
const WILSON_Z_95 = 1.959963984540054;

export const MATERIAL_EXPERIMENT_POLICY_SCHEMA_VERSION = "1";

export type MaterialExperimentErrorCode =
  | "invalid_policy"
  | "invalid_observation"
  | "conflicting_source_fact"
  | "resource_limit_exceeded";

export class MaterialExperimentError extends Error {
  constructor(readonly code: MaterialExperimentErrorCode) {
    super(`Material experiment failed: ${code}`);
    this.name = "MaterialExperimentError";
  }
}

const boundedCount = z.number().int().nonnegative().max(MAX_COUNT);
const positiveBoundedCount = z.number().int().positive().max(MAX_COUNT);

const policyInputSchema = z.object({
  policyVersion: z.string().regex(SAFE_VERSION),
  minActiveDays: positiveBoundedCount,
  minAccounts: positiveBoundedCount,
  minExposure: boundedCount,
  minClicks: boundedCount,
  minRealConversions: boundedCount,
  minCost: z.number().finite().nonnegative().max(MAX_COST),
  minCpaImprovementRate: z.number().finite().min(0).max(1),
  conversionRateDenominator: z.enum(["click", "exposure"]),
}).strict();

const policyBodySchema = policyInputSchema.extend({
  schemaVersion: z.literal(MATERIAL_EXPERIMENT_POLICY_SCHEMA_VERSION),
  confidenceLevel: z.literal(0.95),
}).strict();

const policySchema = policyBodySchema.extend({
  fingerprint: z.string().regex(SAFE_SHA256),
}).strict();

export type MaterialExperimentPolicyInput = z.infer<typeof policyInputSchema>;
export type MaterialExperimentPolicy = z.infer<typeof policySchema>;

export function createMaterialExperimentPolicy(
  input: MaterialExperimentPolicyInput,
): MaterialExperimentPolicy {
  const parsed = policyInputSchema.safeParse(input);
  if (!parsed.success) throw new MaterialExperimentError("invalid_policy");
  const body = {
    ...parsed.data,
    schemaVersion: MATERIAL_EXPERIMENT_POLICY_SCHEMA_VERSION as "1",
    confidenceLevel: 0.95 as const,
  };
  return deepFreeze({ ...body, fingerprint: hashCanonical(body) });
}

const observationSchema = z.object({
  sourceFactId: z.string().regex(SAFE_ID),
  productVersionId: z.string().regex(SAFE_ID),
  materialVersionId: z.string().regex(SAFE_ID),
  accountId: z.string().regex(SAFE_ID),
  dataDate: z.string().regex(ISO_DATE).refine(isCanonicalDate),
  exposure: boundedCount,
  click: boundedCount,
  realConversion: boundedCount,
  cost: z.number().finite().nonnegative().max(MAX_COST),
}).strict().superRefine((value, context) => {
  if (value.click > value.exposure) {
    context.addIssue({ code: "custom", message: "click exceeds exposure" });
  }
});

export type MaterialExperimentObservation = z.infer<typeof observationSchema>;

export type MaterialExperimentExclusionReason =
  | "insufficient_active_days"
  | "insufficient_accounts"
  | "insufficient_exposure"
  | "insufficient_clicks"
  | "insufficient_real_conversions"
  | "insufficient_cost"
  | "non_finite_real_cpa";

export interface WilsonInterval95 {
  readonly lower: number;
  readonly upper: number;
  readonly confidenceLevel: 0.95;
}

export interface MaterialExperimentCell {
  readonly productVersionId: string;
  readonly materialVersionId: string;
  readonly accountCount: number;
  readonly activeDayCount: number;
  readonly exposure: number;
  readonly click: number;
  readonly realConversion: number;
  readonly cost: number;
  readonly ctr: RatioValue;
  readonly inferenceRateDenominator: "click" | "exposure";
  readonly inferenceRate: RatioValue;
  readonly realCpa: RatioValue;
  readonly inferenceRateInterval95: WilsonInterval95 | null;
  readonly sampleStatus: "sufficient" | "insufficient";
  readonly exclusionReasons: readonly MaterialExperimentExclusionReason[];
  readonly fingerprint: string;
}

export type MaterialExperimentConclusionStatus =
  | "insufficient_sample"
  | "insufficient_candidates"
  | "effect_too_small"
  | "intervals_overlap"
  | "separated_observation";

export interface MaterialExperimentConclusion {
  readonly status: MaterialExperimentConclusionStatus;
  readonly directionalLeaderMaterialVersionId: string | null;
  readonly observedLeaderMaterialVersionId: string | null;
  readonly cpaImprovementRate: number | null;
}

export interface ProductMaterialExperiment {
  readonly productVersionId: string;
  readonly cells: readonly MaterialExperimentCell[];
  readonly conclusion: MaterialExperimentConclusion;
  readonly fingerprint: string;
}

export interface MaterialExperimentMatrixResult {
  readonly policyFingerprint: string;
  readonly products: readonly ProductMaterialExperiment[];
  readonly fingerprint: string;
}

export interface MaterialExperimentMatrixInput {
  readonly policy: MaterialExperimentPolicy;
  readonly observations: readonly MaterialExperimentObservation[];
}

interface MutableCell {
  readonly productVersionId: string;
  readonly materialVersionId: string;
  readonly accounts: Set<string>;
  readonly activeDays: Set<string>;
  exposure: number;
  click: number;
  realConversion: number;
  cost: number;
}

export function analyzeMaterialExperimentMatrix(
  input: MaterialExperimentMatrixInput,
): MaterialExperimentMatrixResult {
  const policy = parseIntegrityCheckedPolicy(input.policy);
  const observations = parseAndDedupeObservations(input.observations, policy);
  const groups = aggregateCells(observations);
  const cells = [...groups.values()].map((group) => finalizeCell(group, policy));
  const products = buildProducts(cells, policy);
  const body = { policyFingerprint: policy.fingerprint, products };
  return deepFreeze({ ...body, fingerprint: hashCanonical(body) });
}

function parseIntegrityCheckedPolicy(input: unknown): MaterialExperimentPolicy {
  const parsed = policySchema.safeParse(input);
  if (!parsed.success) throw new MaterialExperimentError("invalid_policy");
  const { fingerprint, ...body } = parsed.data;
  if (hashCanonical(body) !== fingerprint) throw new MaterialExperimentError("invalid_policy");
  return parsed.data;
}

function parseAndDedupeObservations(
  input: readonly MaterialExperimentObservation[],
  policy: MaterialExperimentPolicy,
): MaterialExperimentObservation[] {
  const parsed = z.array(observationSchema).max(MAX_FACTS).safeParse(input);
  if (!parsed.success) {
    const code = input.length > MAX_FACTS ? "resource_limit_exceeded" : "invalid_observation";
    throw new MaterialExperimentError(code);
  }
  const byId = new Map<string, { canonical: string; observation: MaterialExperimentObservation }>();
  for (const observation of parsed.data) {
    if (observation.realConversion > inferenceTrials(observation, policy)) {
      throw new MaterialExperimentError("invalid_observation");
    }
    const canonical = canonicalObservation(observation);
    const current = byId.get(observation.sourceFactId);
    if (current !== undefined && current.canonical !== canonical) {
      throw new MaterialExperimentError("conflicting_source_fact");
    }
    byId.set(observation.sourceFactId, { canonical, observation });
  }
  return [...byId.values()]
    .sort((left, right) => compareText(left.observation.sourceFactId, right.observation.sourceFactId))
    .map(({ observation }) => observation);
}

function aggregateCells(observations: readonly MaterialExperimentObservation[]): Map<string, MutableCell> {
  const groups = new Map<string, MutableCell>();
  for (const observation of observations) {
    const key = JSON.stringify([observation.productVersionId, observation.materialVersionId]);
    const current = groups.get(key) ?? createMutableCell(observation);
    if (!groups.has(key)) {
      groups.set(key, current);
      if (groups.size > MAX_CELLS) throw new MaterialExperimentError("resource_limit_exceeded");
    }
    addObservation(current, observation);
  }
  return groups;
}

function createMutableCell(observation: MaterialExperimentObservation): MutableCell {
  return {
    productVersionId: observation.productVersionId,
    materialVersionId: observation.materialVersionId,
    accounts: new Set<string>(),
    activeDays: new Set<string>(),
    exposure: 0,
    click: 0,
    realConversion: 0,
    cost: 0,
  };
}

function addObservation(target: MutableCell, observation: MaterialExperimentObservation): void {
  target.accounts.add(observation.accountId);
  target.activeDays.add(observation.dataDate);
  target.exposure = addBoundedCount(target.exposure, observation.exposure);
  target.click = addBoundedCount(target.click, observation.click);
  target.realConversion = addBoundedCount(target.realConversion, observation.realConversion);
  target.cost = addBoundedCost(target.cost, observation.cost);
}

function finalizeCell(
  group: MutableCell,
  policy: MaterialExperimentPolicy,
): MaterialExperimentCell {
  const ctr = roundedRatio(safeDivide(group.click, group.exposure));
  const trials = inferenceTrials(group, policy);
  const inferenceRate = roundedRatio(safeDivide(group.realConversion, trials));
  const realCpa = roundedRatio(safeDivide(group.cost, group.realConversion, {
    infiniteWhenPositiveNumerator: true,
  }));
  const values = {
    accountCount: group.accounts.size,
    activeDayCount: group.activeDays.size,
    exposure: group.exposure,
    click: group.click,
    realConversion: group.realConversion,
    cost: round6(group.cost),
    realCpa,
  };
  const exclusionReasons = sampleExclusionReasons(values, policy);
  const body = {
    productVersionId: group.productVersionId,
    materialVersionId: group.materialVersionId,
    accountCount: values.accountCount,
    activeDayCount: values.activeDayCount,
    exposure: values.exposure,
    click: values.click,
    realConversion: values.realConversion,
    cost: values.cost,
    ctr,
    inferenceRateDenominator: policy.conversionRateDenominator,
    inferenceRate,
    realCpa,
    inferenceRateInterval95: wilsonInterval95(group.realConversion, trials),
    sampleStatus: exclusionReasons.length === 0 ? "sufficient" as const : "insufficient" as const,
    exclusionReasons,
  };
  return deepFreeze({ ...body, fingerprint: hashCanonical(body) });
}

function sampleExclusionReasons(
  values: Pick<MaterialExperimentCell,
    "accountCount" | "activeDayCount" | "exposure" | "click" | "realConversion" | "cost" | "realCpa">,
  policy: MaterialExperimentPolicy,
): MaterialExperimentExclusionReason[] {
  const reasons: MaterialExperimentExclusionReason[] = [];
  if (values.activeDayCount < policy.minActiveDays) reasons.push("insufficient_active_days");
  if (values.accountCount < policy.minAccounts) reasons.push("insufficient_accounts");
  if (values.exposure < policy.minExposure) reasons.push("insufficient_exposure");
  if (values.click < policy.minClicks) reasons.push("insufficient_clicks");
  if (values.realConversion < policy.minRealConversions) reasons.push("insufficient_real_conversions");
  if (values.cost < policy.minCost) reasons.push("insufficient_cost");
  if (values.realCpa.state !== "finite") reasons.push("non_finite_real_cpa");
  return reasons;
}

function buildProducts(
  cells: readonly MaterialExperimentCell[],
  policy: MaterialExperimentPolicy,
): ProductMaterialExperiment[] {
  const grouped = new Map<string, MaterialExperimentCell[]>();
  for (const cell of cells) {
    const productCells = grouped.get(cell.productVersionId) ?? [];
    productCells.push(cell);
    grouped.set(cell.productVersionId, productCells);
  }
  return [...grouped.entries()]
    .sort(([left], [right]) => compareText(left, right))
    .map(([productVersionId, productCells]) => finalizeProduct(productVersionId, productCells, policy));
}

function finalizeProduct(
  productVersionId: string,
  inputCells: readonly MaterialExperimentCell[],
  policy: MaterialExperimentPolicy,
): ProductMaterialExperiment {
  const cells = [...inputCells].sort((left, right) => compareText(
    left.materialVersionId,
    right.materialVersionId,
  ));
  const conclusion = concludeProduct(cells, policy);
  const body = { productVersionId, cells, conclusion };
  return deepFreeze({ ...body, fingerprint: hashCanonical(body) });
}

function concludeProduct(
  cells: readonly MaterialExperimentCell[],
  policy: MaterialExperimentPolicy,
): MaterialExperimentConclusion {
  const eligible = cells.filter(isComparableCell).sort(compareByCpaThenIdentity);
  if (eligible.length === 0) return emptyConclusion("insufficient_sample");
  if (eligible.length === 1) return emptyConclusion("insufficient_candidates");

  const leader = eligible[0] as ComparableCell;
  const runnerUp = eligible[1] as ComparableCell;
  const cpaImprovementRate = improvementRate(leader.realCpa.value, runnerUp.realCpa.value);
  const directionalLeaderMaterialVersionId = leader.materialVersionId;
  if (cpaImprovementRate < policy.minCpaImprovementRate) {
    return {
      status: "effect_too_small",
      directionalLeaderMaterialVersionId,
      observedLeaderMaterialVersionId: null,
      cpaImprovementRate,
    };
  }
  const separated = eligible.slice(1).every((candidate) =>
    leader.inferenceRateInterval95.lower > candidate.inferenceRateInterval95.upper,
  );
  return {
    status: separated ? "separated_observation" : "intervals_overlap",
    directionalLeaderMaterialVersionId,
    observedLeaderMaterialVersionId: separated ? directionalLeaderMaterialVersionId : null,
    cpaImprovementRate,
  };
}

type ComparableCell = MaterialExperimentCell & {
  readonly realCpa: { readonly state: "finite"; readonly value: number };
  readonly inferenceRateInterval95: WilsonInterval95;
};

function isComparableCell(cell: MaterialExperimentCell): cell is ComparableCell {
  return cell.sampleStatus === "sufficient" &&
    cell.realCpa.state === "finite" &&
    cell.realCpa.value !== null &&
    cell.inferenceRateInterval95 !== null;
}

function compareByCpaThenIdentity(left: ComparableCell, right: ComparableCell): number {
  return left.realCpa.value - right.realCpa.value || compareText(
    left.materialVersionId,
    right.materialVersionId,
  );
}

function emptyConclusion(
  status: "insufficient_sample" | "insufficient_candidates",
): MaterialExperimentConclusion {
  return {
    status,
    directionalLeaderMaterialVersionId: null,
    observedLeaderMaterialVersionId: null,
    cpaImprovementRate: null,
  };
}

function improvementRate(leaderCpa: number, runnerUpCpa: number): number {
  if (runnerUpCpa === 0) return 0;
  return round6((runnerUpCpa - leaderCpa) / runnerUpCpa);
}

function inferenceTrials(
  value: Pick<MaterialExperimentObservation, "click" | "exposure">,
  policy: Pick<MaterialExperimentPolicy, "conversionRateDenominator">,
): number {
  return policy.conversionRateDenominator === "click" ? value.click : value.exposure;
}

function wilsonInterval95(successes: number, trials: number): WilsonInterval95 | null {
  if (trials === 0) return null;
  const proportion = successes / trials;
  const zSquared = WILSON_Z_95 ** 2;
  const denominator = 1 + zSquared / trials;
  const center = (proportion + zSquared / (2 * trials)) / denominator;
  const margin = WILSON_Z_95 * Math.sqrt(
    (proportion * (1 - proportion) + zSquared / (4 * trials)) / trials,
  ) / denominator;
  return {
    lower: round6(Math.max(0, center - margin)),
    upper: round6(Math.min(1, center + margin)),
    confidenceLevel: 0.95,
  };
}

function roundedRatio(value: RatioValue): RatioValue {
  return value.state === "finite" && value.value !== null
    ? { state: "finite", value: round6(value.value) }
    : value;
}

function addBoundedCount(left: number, right: number): number {
  const total = left + right;
  if (!Number.isSafeInteger(total) || total > MAX_COUNT) {
    throw new MaterialExperimentError("resource_limit_exceeded");
  }
  return total;
}

function addBoundedCost(left: number, right: number): number {
  const total = left + right;
  if (!Number.isFinite(total) || total > MAX_COST) {
    throw new MaterialExperimentError("resource_limit_exceeded");
  }
  return total;
}

function canonicalObservation(value: MaterialExperimentObservation): string {
  return JSON.stringify({
    sourceFactId: value.sourceFactId,
    productVersionId: value.productVersionId,
    materialVersionId: value.materialVersionId,
    accountId: value.accountId,
    dataDate: value.dataDate,
    exposure: value.exposure,
    click: value.click,
    realConversion: value.realConversion,
    cost: value.cost,
  });
}

function isCanonicalDate(value: string): boolean {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function round6(value: number): number {
  return Math.round((value + Number.EPSILON) * 1_000_000) / 1_000_000;
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
