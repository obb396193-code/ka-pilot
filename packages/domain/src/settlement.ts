import { createHash } from "node:crypto";

import { z } from "zod";

const SAFE_ID = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/;
const SAFE_VERSION = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/;
const SAFE_KEY = /^[a-z][a-z0-9_]{0,63}$/;
const SAFE_SHA256 = /^[a-f0-9]{64}$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MAX_TEXT = 4_000;
const MAX_VALUE = 1_000_000_000_000_000;
const MAX_FIELDS = 50;
const MAX_CHECKS = 50;
const MAX_ROWS = 1_000;
const MAX_FACT_VALUES = 200;
const MAX_CORRECTIONS = 5_000;
const MAX_EXPRESSION_DEPTH = 12;
const MAX_EXPRESSION_NODES = 200;

export const SETTLEMENT_TEMPLATE_SCHEMA_VERSION = "1";
export const SETTLEMENT_PREVIEW_SCHEMA_VERSION = "1";
export const FROZEN_SETTLEMENT_SCHEMA_VERSION = "1";

export type SettlementErrorCode =
  | "invalid_template"
  | "invalid_facts"
  | "conflicting_fact"
  | "invalid_correction"
  | "conflicting_correction"
  | "invalid_preview"
  | "blocked_preview"
  | "invalid_confirmation"
  | "resource_limit_exceeded";

export class SettlementError extends Error {
  constructor(readonly code: SettlementErrorCode) {
    super(`Settlement failed: ${code}`);
    this.name = "SettlementError";
  }
}

export type SettlementValue = string | number | null;
export type SettlementValueType = "text" | "date" | "number" | "money" | "rate";

export type SettlementExpression =
  | { readonly kind: "field"; readonly fieldKey: string }
  | { readonly kind: "constant"; readonly value: number }
  | {
    readonly kind: "add" | "subtract" | "multiply" | "divide";
    readonly left: SettlementExpression;
    readonly right: SettlementExpression;
  };

export type SettlementFieldSource =
  | { readonly kind: "fact"; readonly factKey: string }
  | { readonly kind: "formula"; readonly expression: SettlementExpression };

export interface SettlementTemplateFieldInput {
  readonly fieldKey: string;
  readonly label: string;
  readonly order: number;
  readonly valueType: SettlementValueType;
  readonly aggregation: "none" | "sum";
  readonly source: SettlementFieldSource;
  readonly required: boolean;
  readonly allowCorrection: boolean;
}

export type SettlementTolerance =
  | { readonly mode: "absolute"; readonly amount: number }
  | { readonly mode: "relative"; readonly rate: number }
  | { readonly mode: "either"; readonly amount: number; readonly rate: number };

export interface SettlementTemplateCheckInput {
  readonly checkKey: string;
  readonly label: string;
  readonly order: number;
  readonly leftFieldKey: string;
  readonly rightFieldKey: string;
  readonly tolerance: SettlementTolerance;
  readonly severity: "block" | "warn";
}

export interface SettlementTemplateInput {
  readonly templateId: string;
  readonly templateVersion: string;
  readonly name: string;
  readonly currencyCode: string;
  readonly unitNote: string;
  readonly fields: readonly SettlementTemplateFieldInput[];
  readonly checks: readonly SettlementTemplateCheckInput[];
  readonly createdByUserId: string;
  readonly createdAt: string;
}

export interface SettlementTemplate extends SettlementTemplateInput {
  readonly schemaVersion: typeof SETTLEMENT_TEMPLATE_SCHEMA_VERSION;
  readonly fingerprint: string;
}

const textSchema = z.string().trim().min(1).max(MAX_TEXT);
const boundedNumberSchema = z.number().finite().min(-MAX_VALUE).max(MAX_VALUE);
const factSourceSchema = z.object({
  kind: z.literal("fact"),
  factKey: z.string().regex(SAFE_KEY),
}).strict();
const formulaSourceInputSchema = z.object({
  kind: z.literal("formula"),
  expression: z.unknown(),
}).strict();
const fieldInputSchema = z.object({
  fieldKey: z.string().regex(SAFE_KEY),
  label: textSchema,
  order: z.number().int().min(1).max(MAX_FIELDS),
  valueType: z.enum(["text", "date", "number", "money", "rate"]),
  aggregation: z.enum(["none", "sum"]),
  source: z.union([factSourceSchema, formulaSourceInputSchema]),
  required: z.boolean(),
  allowCorrection: z.boolean(),
}).strict();
const absoluteToleranceSchema = z.object({
  mode: z.literal("absolute"),
  amount: z.number().finite().nonnegative().max(MAX_VALUE),
}).strict();
const relativeToleranceSchema = z.object({
  mode: z.literal("relative"),
  rate: z.number().finite().nonnegative().max(1),
}).strict();
const eitherToleranceSchema = z.object({
  mode: z.literal("either"),
  amount: z.number().finite().nonnegative().max(MAX_VALUE),
  rate: z.number().finite().nonnegative().max(1),
}).strict();
const toleranceSchema = z.discriminatedUnion("mode", [
  absoluteToleranceSchema,
  relativeToleranceSchema,
  eitherToleranceSchema,
]);
const checkInputSchema = z.object({
  checkKey: z.string().regex(SAFE_KEY),
  label: textSchema,
  order: z.number().int().min(1).max(MAX_CHECKS),
  leftFieldKey: z.string().regex(SAFE_KEY),
  rightFieldKey: z.string().regex(SAFE_KEY),
  tolerance: toleranceSchema,
  severity: z.enum(["block", "warn"]),
}).strict();
const templateInputSchema = z.object({
  templateId: z.string().regex(SAFE_ID),
  templateVersion: z.string().regex(SAFE_VERSION),
  name: textSchema,
  currencyCode: z.string().regex(/^[A-Z]{3}$/),
  unitNote: textSchema,
  fields: z.array(fieldInputSchema).min(1).max(MAX_FIELDS),
  checks: z.array(checkInputSchema).max(MAX_CHECKS),
  createdByUserId: z.string().regex(SAFE_ID),
  createdAt: z.string(),
}).strict();

const expressionFieldSchema = z.object({
  kind: z.literal("field"),
  fieldKey: z.string().regex(SAFE_KEY),
}).strict();
const expressionConstantSchema = z.object({
  kind: z.literal("constant"),
  value: boundedNumberSchema,
}).strict();
const expressionBinarySchema = z.object({
  kind: z.enum(["add", "subtract", "multiply", "divide"]),
  left: z.unknown(),
  right: z.unknown(),
}).strict();

export function createSettlementTemplate(
  input: SettlementTemplateInput,
  observedAt: string,
): SettlementTemplate {
  const parsed = templateInputSchema.safeParse(input);
  const createdAtMs = parsed.success ? parseCanonicalIso(parsed.data.createdAt) : null;
  const observedAtMs = parseCanonicalIso(observedAt);
  if (!parsed.success || createdAtMs === null || observedAtMs === null || createdAtMs > observedAtMs) {
    throw new SettlementError("invalid_template");
  }
  const fields = normalizeTemplateFields(parsed.data.fields);
  const checks = normalizeTemplateChecks(parsed.data.checks, fields);
  validateFormulaGraph(fields);
  const body = {
    schemaVersion: SETTLEMENT_TEMPLATE_SCHEMA_VERSION as "1",
    templateId: parsed.data.templateId,
    templateVersion: parsed.data.templateVersion,
    name: parsed.data.name,
    currencyCode: parsed.data.currencyCode,
    unitNote: parsed.data.unitNote,
    fields,
    checks,
    createdByUserId: parsed.data.createdByUserId,
    createdAt: parsed.data.createdAt,
  };
  return deepFreeze({ ...body, fingerprint: hashCanonical(body) });
}

function normalizeTemplateFields(
  inputs: readonly z.infer<typeof fieldInputSchema>[],
): SettlementTemplateFieldInput[] {
  if (!isUnique(inputs.map(({ fieldKey }) => fieldKey)) || !isUnique(inputs.map(({ order }) => order))) {
    throw new SettlementError("invalid_template");
  }
  return inputs.map((field) => {
    const source = field.source.kind === "fact"
      ? field.source
      : { kind: "formula" as const, expression: parseExpression(field.source.expression) };
    if (
      (source.kind === "formula" && !isNumericType(field.valueType)) ||
      (field.aggregation === "sum" && !isNumericType(field.valueType))
    ) {
      throw new SettlementError("invalid_template");
    }
    return { ...field, source };
  }).sort(compareOrdered);
}

function normalizeTemplateChecks(
  inputs: readonly z.infer<typeof checkInputSchema>[],
  fields: readonly SettlementTemplateFieldInput[],
): SettlementTemplateCheckInput[] {
  if (!isUnique(inputs.map(({ checkKey }) => checkKey)) || !isUnique(inputs.map(({ order }) => order))) {
    throw new SettlementError("invalid_template");
  }
  const fieldsByKey = new Map(fields.map((field) => [field.fieldKey, field]));
  for (const check of inputs) {
    const left = fieldsByKey.get(check.leftFieldKey);
    const right = fieldsByKey.get(check.rightFieldKey);
    if (
      left === undefined || right === undefined ||
      !isNumericType(left.valueType) || !isNumericType(right.valueType) ||
      check.leftFieldKey === check.rightFieldKey
    ) throw new SettlementError("invalid_template");
  }
  return [...inputs].sort(compareOrdered);
}

function parseExpression(input: unknown): SettlementExpression {
  const state = { nodes: 0 };
  return parseExpressionNode(input, 1, state);
}

function parseExpressionNode(
  input: unknown,
  depth: number,
  state: { nodes: number },
): SettlementExpression {
  state.nodes += 1;
  if (depth > MAX_EXPRESSION_DEPTH || state.nodes > MAX_EXPRESSION_NODES) {
    throw new SettlementError("invalid_template");
  }
  const field = expressionFieldSchema.safeParse(input);
  if (field.success) return field.data;
  const constant = expressionConstantSchema.safeParse(input);
  if (constant.success) return constant.data;
  const binary = expressionBinarySchema.safeParse(input);
  if (!binary.success) throw new SettlementError("invalid_template");
  return {
    kind: binary.data.kind,
    left: parseExpressionNode(binary.data.left, depth + 1, state),
    right: parseExpressionNode(binary.data.right, depth + 1, state),
  };
}

function validateFormulaGraph(fields: readonly SettlementTemplateFieldInput[]): void {
  const byKey = new Map(fields.map((field) => [field.fieldKey, field]));
  const dependencies = new Map<string, readonly string[]>();
  for (const field of fields) {
    if (field.source.kind !== "formula") continue;
    const references = [...collectExpressionReferences(field.source.expression)].sort(compareText);
    for (const reference of references) {
      const target = byKey.get(reference);
      if (target === undefined || !isNumericType(target.valueType)) {
        throw new SettlementError("invalid_template");
      }
    }
    dependencies.set(field.fieldKey, references);
  }
  assertAcyclicDependencies(dependencies);
}

function collectExpressionReferences(expression: SettlementExpression, target = new Set<string>()): Set<string> {
  if (expression.kind === "field") target.add(expression.fieldKey);
  if (expression.kind !== "field" && expression.kind !== "constant") {
    collectExpressionReferences(expression.left, target);
    collectExpressionReferences(expression.right, target);
  }
  return target;
}

function assertAcyclicDependencies(dependencies: ReadonlyMap<string, readonly string[]>): void {
  const complete = new Set<string>();
  const visiting = new Set<string>();
  const visit = (fieldKey: string): void => {
    if (complete.has(fieldKey)) return;
    if (visiting.has(fieldKey)) throw new SettlementError("invalid_template");
    visiting.add(fieldKey);
    for (const dependency of dependencies.get(fieldKey) ?? []) {
      if (dependencies.has(dependency)) visit(dependency);
    }
    visiting.delete(fieldKey);
    complete.add(fieldKey);
  };
  for (const fieldKey of dependencies.keys()) visit(fieldKey);
}

const scalarSchema = z.union([boundedNumberSchema, z.string().min(1).max(MAX_TEXT), z.null()]);
const factSchema = z.object({
  sourceFactId: z.string().regex(SAFE_ID),
  rowKey: z.string().regex(SAFE_ID),
  values: z.record(z.string().regex(SAFE_KEY), scalarSchema),
}).strict();
const correctionSchema = z.object({
  correctionId: z.string().regex(SAFE_ID),
  rowKey: z.string().regex(SAFE_ID),
  fieldKey: z.string().regex(SAFE_KEY),
  fromValue: scalarSchema,
  toValue: scalarSchema,
  reason: textSchema,
  correctedByUserId: z.string().regex(SAFE_ID),
  correctedAt: z.string(),
  evidenceRef: z.string().regex(SAFE_ID).optional(),
}).strict();

export type SettlementFact = z.infer<typeof factSchema>;
export type SettlementCorrection = z.infer<typeof correctionSchema>;

export interface SettlementPreviewInput {
  readonly runId: string;
  readonly template: SettlementTemplate;
  readonly periodStart: string;
  readonly periodEnd: string;
  readonly scopeId: string;
  readonly dataBasis: "offline_settlement";
  readonly dataCutoffAt: string;
  readonly facts: readonly SettlementFact[];
  readonly corrections: readonly SettlementCorrection[];
  readonly generatedAt: string;
}

export type SettlementIssueCode =
  | "missing_required"
  | "invalid_field_value"
  | "undefined_formula"
  | "check_mismatch"
  | "check_undefined";

export interface SettlementIssue {
  readonly code: SettlementIssueCode;
  readonly severity: "block" | "warn";
  readonly rowKey: string;
  readonly fieldKey: string | null;
  readonly checkKey: string | null;
}

export interface SettlementPreviewField {
  readonly fieldKey: string;
  readonly value: SettlementValue;
  readonly source: "fact" | "formula" | "correction";
  readonly correctionId?: string;
}

export interface SettlementCheckResult {
  readonly checkKey: string;
  readonly status: "matched" | "mismatch" | "undefined";
  readonly difference: number | null;
  readonly relativeDifference: number | null;
  readonly severity: "block" | "warn";
}

export interface SettlementPreviewRow {
  readonly rowKey: string;
  readonly sourceFactId: string;
  readonly fields: readonly SettlementPreviewField[];
  readonly checks: readonly SettlementCheckResult[];
  readonly fingerprint: string;
}

export interface SettlementPreviewTotal {
  readonly fieldKey: string;
  readonly value: number | null;
}

export interface SettlementPreview {
  readonly schemaVersion: typeof SETTLEMENT_PREVIEW_SCHEMA_VERSION;
  readonly runId: string;
  readonly templateFingerprint: string;
  readonly templateSnapshot: SettlementTemplate;
  readonly periodStart: string;
  readonly periodEnd: string;
  readonly scopeId: string;
  readonly dataBasis: "offline_settlement";
  readonly dataCutoffAt: string;
  readonly generatedAt: string;
  readonly factsFingerprint: string;
  readonly correctionsFingerprint: string;
  readonly appliedCorrections: readonly SettlementCorrection[];
  readonly rows: readonly SettlementPreviewRow[];
  readonly totals: readonly SettlementPreviewTotal[];
  readonly issues: readonly SettlementIssue[];
  readonly status: "blocked" | "ready_to_freeze";
  readonly fingerprint: string;
}

const previewInputSchema = z.object({
  runId: z.string().regex(SAFE_ID),
  template: z.unknown(),
  periodStart: z.string(),
  periodEnd: z.string(),
  scopeId: z.string().regex(SAFE_ID),
  dataBasis: z.literal("offline_settlement"),
  dataCutoffAt: z.string(),
  facts: z.array(z.unknown()),
  corrections: z.array(z.unknown()),
  generatedAt: z.string(),
}).strict();

export function previewSettlement(input: SettlementPreviewInput, observedAt: string): SettlementPreview {
  const parsed = previewInputSchema.safeParse(input);
  if (!parsed.success) throw new SettlementError("invalid_facts");
  const times = parsePreviewTimes(parsed.data, observedAt);
  const template = parseIntegrityCheckedTemplate(parsed.data.template);
  const facts = normalizeFacts(parsed.data.facts);
  const corrections = normalizeCorrections(parsed.data.corrections, times);
  const rows = buildPreviewRows(template, facts, corrections);
  const publicRows = rows.map(toPreviewRow);
  const issues = rows.flatMap(collectRowIssues).sort(compareIssue);
  const body = {
    schemaVersion: SETTLEMENT_PREVIEW_SCHEMA_VERSION as "1",
    runId: parsed.data.runId,
    templateFingerprint: template.fingerprint,
    templateSnapshot: template,
    periodStart: times.periodStart,
    periodEnd: times.periodEnd,
    scopeId: parsed.data.scopeId,
    dataBasis: parsed.data.dataBasis,
    dataCutoffAt: parsed.data.dataCutoffAt,
    generatedAt: parsed.data.generatedAt,
    factsFingerprint: hashCanonical(facts),
    correctionsFingerprint: hashCanonical(corrections),
    appliedCorrections: corrections,
    rows: publicRows,
    totals: calculateTotals(template.fields, publicRows),
    issues,
    status: issues.some(({ severity }) => severity === "block") ? "blocked" as const : "ready_to_freeze" as const,
  };
  return deepFreeze({ ...body, fingerprint: hashCanonical(body) });
}

interface PreviewTimes {
  readonly periodStart: string;
  readonly periodEnd: string;
  readonly dataCutoffAtMs: number;
  readonly generatedAtMs: number;
}

function parsePreviewTimes(
  input: { periodStart: string; periodEnd: string; dataCutoffAt: string; generatedAt: string },
  observedAt: string,
): PreviewTimes {
  const periodStartMs = parseCanonicalDate(input.periodStart);
  const periodEndMs = parseCanonicalDate(input.periodEnd);
  const dataCutoffAtMs = parseCanonicalIso(input.dataCutoffAt);
  const generatedAtMs = parseCanonicalIso(input.generatedAt);
  const observedAtMs = parseCanonicalIso(observedAt);
  if (
    periodStartMs === null || periodEndMs === null || periodStartMs > periodEndMs ||
    dataCutoffAtMs === null || generatedAtMs === null || observedAtMs === null ||
    dataCutoffAtMs < periodEndMs ||
    dataCutoffAtMs > generatedAtMs || generatedAtMs > observedAtMs
  ) throw new SettlementError("invalid_facts");
  return { periodStart: input.periodStart, periodEnd: input.periodEnd, dataCutoffAtMs, generatedAtMs };
}

function normalizeFacts(inputs: readonly unknown[]): SettlementFact[] {
  if (inputs.length === 0) throw new SettlementError("invalid_facts");
  if (inputs.length > MAX_ROWS) throw new SettlementError("resource_limit_exceeded");
  const parsed = z.array(factSchema).safeParse(inputs);
  if (!parsed.success) throw new SettlementError("invalid_facts");
  const byId = new Map<string, SettlementFact>();
  for (const fact of parsed.data) {
    if (Object.keys(fact.values).length > MAX_FACT_VALUES) throw new SettlementError("resource_limit_exceeded");
    const normalized = { ...fact, values: sortRecord(fact.values) };
    const current = byId.get(fact.sourceFactId);
    if (current !== undefined && hashCanonical(current) !== hashCanonical(normalized)) {
      throw new SettlementError("conflicting_fact");
    }
    byId.set(fact.sourceFactId, normalized);
  }
  const facts = [...byId.values()].sort((left, right) => compareText(left.rowKey, right.rowKey));
  if (!isUnique(facts.map(({ rowKey }) => rowKey))) throw new SettlementError("conflicting_fact");
  return facts;
}

function normalizeCorrections(inputs: readonly unknown[], times: PreviewTimes): SettlementCorrection[] {
  if (inputs.length > MAX_CORRECTIONS) throw new SettlementError("resource_limit_exceeded");
  const parsed = z.array(correctionSchema).safeParse(inputs);
  if (!parsed.success) throw new SettlementError("invalid_correction");
  const byId = new Map<string, SettlementCorrection>();
  for (const correction of parsed.data) {
    const correctedAtMs = parseCanonicalIso(correction.correctedAt);
    if (
      correctedAtMs === null || correctedAtMs < times.dataCutoffAtMs ||
      correctedAtMs > times.generatedAtMs
    ) throw new SettlementError("invalid_correction");
    const current = byId.get(correction.correctionId);
    if (current !== undefined && hashCanonical(current) !== hashCanonical(correction)) {
      throw new SettlementError("conflicting_correction");
    }
    byId.set(correction.correctionId, correction);
  }
  return [...byId.values()].sort((left, right) =>
    compareText(left.correctedAt, right.correctedAt) || compareText(left.correctionId, right.correctionId),
  );
}

interface BuiltPreviewRow extends SettlementPreviewRow {
  readonly issues: readonly SettlementIssue[];
}

function toPreviewRow(row: BuiltPreviewRow): SettlementPreviewRow {
  return {
    rowKey: row.rowKey,
    sourceFactId: row.sourceFactId,
    fields: row.fields,
    checks: row.checks,
    fingerprint: row.fingerprint,
  };
}

interface OverrideValue {
  readonly value: SettlementValue;
  readonly correctionId: string;
}

function buildPreviewRows(
  template: SettlementTemplate,
  facts: readonly SettlementFact[],
  corrections: readonly SettlementCorrection[],
): BuiltPreviewRow[] {
  const factsByRow = new Map(facts.map((fact) => [fact.rowKey, fact]));
  const fieldByKey = new Map(template.fields.map((field) => [field.fieldKey, field]));
  const overridesByRow = new Map<string, Map<string, OverrideValue>>();
  for (const correction of corrections) {
    applyCorrection(correction, template, factsByRow, fieldByKey, overridesByRow);
  }
  return facts.map((fact) => finalizePreviewRow(
    template,
    fact,
    fieldByKey,
    overridesByRow.get(fact.rowKey) ?? new Map(),
  ));
}

function applyCorrection(
  correction: SettlementCorrection,
  template: SettlementTemplate,
  factsByRow: ReadonlyMap<string, SettlementFact>,
  fieldByKey: ReadonlyMap<string, SettlementTemplateFieldInput>,
  overridesByRow: Map<string, Map<string, OverrideValue>>,
): void {
  const fact = factsByRow.get(correction.rowKey);
  const field = fieldByKey.get(correction.fieldKey);
  if (fact === undefined || field === undefined || !field.allowCorrection) {
    throw new SettlementError("invalid_correction");
  }
  const overrides = overridesByRow.get(fact.rowKey) ?? new Map<string, OverrideValue>();
  const current = evaluateFields(template, fact, fieldByKey, overrides).fieldsByKey.get(field.fieldKey)?.value;
  if (!equalValue(current, correction.fromValue) || !isValueCompatible(field.valueType, correction.toValue)) {
    throw new SettlementError("invalid_correction");
  }
  overrides.set(field.fieldKey, { value: correction.toValue, correctionId: correction.correctionId });
  overridesByRow.set(fact.rowKey, overrides);
}

function finalizePreviewRow(
  template: SettlementTemplate,
  fact: SettlementFact,
  fieldByKey: ReadonlyMap<string, SettlementTemplateFieldInput>,
  overrides: ReadonlyMap<string, OverrideValue>,
): BuiltPreviewRow {
  const evaluated = evaluateFields(template, fact, fieldByKey, overrides);
  const checked = evaluateChecks(template.checks, fact.rowKey, evaluated.fieldsByKey);
  const body = {
    rowKey: fact.rowKey,
    sourceFactId: fact.sourceFactId,
    fields: template.fields.map(({ fieldKey }) => evaluated.fieldsByKey.get(fieldKey) as SettlementPreviewField),
    checks: checked.results,
  };
  return deepFreeze({
    ...body,
    fingerprint: hashCanonical(body),
    issues: [...evaluated.issues, ...checked.issues],
  });
}

interface EvaluatedFields {
  readonly fieldsByKey: ReadonlyMap<string, SettlementPreviewField>;
  readonly issues: readonly SettlementIssue[];
}

function evaluateFields(
  template: SettlementTemplate,
  fact: SettlementFact,
  fieldByKey: ReadonlyMap<string, SettlementTemplateFieldInput>,
  overrides: ReadonlyMap<string, OverrideValue>,
): EvaluatedFields {
  const values = new Map<string, SettlementPreviewField>();
  const issues: SettlementIssue[] = [];
  const evaluateField = (fieldKey: string): SettlementPreviewField => {
    const cached = values.get(fieldKey);
    if (cached !== undefined) return cached;
    const field = fieldByKey.get(fieldKey) as SettlementTemplateFieldInput;
    const override = overrides.get(fieldKey);
    const result = override === undefined
      ? evaluateBaseField(field, fact, evaluateField, issues)
      : { fieldKey, value: override.value, source: "correction" as const, correctionId: override.correctionId };
    values.set(fieldKey, result);
    return result;
  };
  for (const field of template.fields) evaluateField(field.fieldKey);
  for (const field of template.fields) {
    if (field.required && values.get(field.fieldKey)?.value === null) {
      issues.push(issue("missing_required", "block", fact.rowKey, field.fieldKey, null));
    }
  }
  return { fieldsByKey: values, issues: dedupeIssues(issues) };
}

function evaluateBaseField(
  field: SettlementTemplateFieldInput,
  fact: SettlementFact,
  evaluateField: (fieldKey: string) => SettlementPreviewField,
  issues: SettlementIssue[],
): SettlementPreviewField {
  if (field.source.kind === "fact") {
    const raw = fact.values[field.source.factKey] ?? null;
    const value = isValueCompatible(field.valueType, raw) ? raw : null;
    if (raw !== null && value === null) {
      issues.push(issue("invalid_field_value", "block", fact.rowKey, field.fieldKey, null));
    }
    return { fieldKey: field.fieldKey, value, source: "fact" };
  }
  const value = evaluateExpression(field.source.expression, evaluateField);
  if (value === null) {
    issues.push(issue(
      "undefined_formula",
      field.required ? "block" : "warn",
      fact.rowKey,
      field.fieldKey,
      null,
    ));
  }
  return { fieldKey: field.fieldKey, value, source: "formula" };
}

function evaluateExpression(
  expression: SettlementExpression,
  evaluateField: (fieldKey: string) => SettlementPreviewField,
): number | null {
  if (expression.kind === "constant") return expression.value;
  if (expression.kind === "field") {
    const value = evaluateField(expression.fieldKey).value;
    return typeof value === "number" ? value : null;
  }
  const left = evaluateExpression(expression.left, evaluateField);
  const right = evaluateExpression(expression.right, evaluateField);
  if (left === null || right === null || (expression.kind === "divide" && right === 0)) return null;
  const value = calculateBinary(expression.kind, left, right);
  return Number.isFinite(value) && Math.abs(value) <= MAX_VALUE ? round12(value) : null;
}

function calculateBinary(kind: "add" | "subtract" | "multiply" | "divide", left: number, right: number): number {
  switch (kind) {
    case "add": return left + right;
    case "subtract": return left - right;
    case "multiply": return left * right;
    case "divide": return left / right;
  }
}

function evaluateChecks(
  checks: readonly SettlementTemplateCheckInput[],
  rowKey: string,
  fieldsByKey: ReadonlyMap<string, SettlementPreviewField>,
): { results: SettlementCheckResult[]; issues: SettlementIssue[] } {
  const issues: SettlementIssue[] = [];
  const results = checks.map((check): SettlementCheckResult => {
    const left = fieldsByKey.get(check.leftFieldKey)?.value;
    const right = fieldsByKey.get(check.rightFieldKey)?.value;
    if (typeof left !== "number" || typeof right !== "number") {
      issues.push(issue("check_undefined", check.severity, rowKey, null, check.checkKey));
      return { checkKey: check.checkKey, status: "undefined", difference: null, relativeDifference: null, severity: check.severity };
    }
    const difference = round12(left - right);
    const relativeDifference = right === 0
      ? difference === 0 ? 0 : null
      : round12(Math.abs(difference) / Math.abs(right));
    const matched = isWithinTolerance(difference, relativeDifference, check.tolerance);
    if (!matched) issues.push(issue("check_mismatch", check.severity, rowKey, null, check.checkKey));
    return {
      checkKey: check.checkKey,
      status: matched ? "matched" : "mismatch",
      difference,
      relativeDifference,
      severity: check.severity,
    };
  });
  return { results, issues };
}

function isWithinTolerance(
  difference: number,
  relativeDifference: number | null,
  tolerance: SettlementTolerance,
): boolean {
  const absoluteMatch = Math.abs(difference) <= ("amount" in tolerance ? tolerance.amount : -1);
  const relativeMatch = relativeDifference !== null && relativeDifference <= ("rate" in tolerance ? tolerance.rate : -1);
  if (tolerance.mode === "absolute") return absoluteMatch;
  if (tolerance.mode === "relative") return relativeMatch;
  return absoluteMatch || relativeMatch;
}

function collectRowIssues(row: BuiltPreviewRow): SettlementIssue[] {
  return [...row.issues];
}

function calculateTotals(
  fields: readonly SettlementTemplateFieldInput[],
  rows: readonly { readonly fields: readonly { readonly fieldKey: string; readonly value: SettlementValue }[] }[],
): SettlementPreviewTotal[] {
  return fields.filter(({ aggregation }) => aggregation === "sum").map(({ fieldKey }) => {
    const values = rows.map((row) => row.fields.find((field) => field.fieldKey === fieldKey)?.value);
    if (values.some((value) => typeof value !== "number")) return { fieldKey, value: null };
    const total = (values as number[]).reduce((sum, value) => sum + value, 0);
    if (!Number.isFinite(total) || Math.abs(total) > MAX_VALUE) {
      throw new SettlementError("resource_limit_exceeded");
    }
    return {
      fieldKey,
      value: round12(total),
    };
  });
}

function issue(
  code: SettlementIssueCode,
  severity: "block" | "warn",
  rowKey: string,
  fieldKey: string | null,
  checkKey: string | null,
): SettlementIssue {
  return { code, severity, rowKey, fieldKey, checkKey };
}

const previewFieldSchema = z.object({
  fieldKey: z.string().regex(SAFE_KEY),
  value: scalarSchema,
  source: z.enum(["fact", "formula", "correction"]),
  correctionId: z.string().regex(SAFE_ID).optional(),
}).strict();
const checkResultSchema = z.object({
  checkKey: z.string().regex(SAFE_KEY),
  status: z.enum(["matched", "mismatch", "undefined"]),
  difference: boundedNumberSchema.nullable(),
  relativeDifference: z.number().finite().nonnegative().max(MAX_VALUE).nullable(),
  severity: z.enum(["block", "warn"]),
}).strict();
const issueSchema = z.object({
  code: z.enum(["missing_required", "invalid_field_value", "undefined_formula", "check_mismatch", "check_undefined"]),
  severity: z.enum(["block", "warn"]),
  rowKey: z.string().regex(SAFE_ID),
  fieldKey: z.string().regex(SAFE_KEY).nullable(),
  checkKey: z.string().regex(SAFE_KEY).nullable(),
}).strict();
const previewRowSchema = z.object({
  rowKey: z.string().regex(SAFE_ID),
  sourceFactId: z.string().regex(SAFE_ID),
  fields: z.array(previewFieldSchema).max(MAX_FIELDS),
  checks: z.array(checkResultSchema).max(MAX_CHECKS),
  fingerprint: z.string().regex(SAFE_SHA256),
}).strict();
const previewTotalSchema = z.object({
  fieldKey: z.string().regex(SAFE_KEY),
  value: boundedNumberSchema.nullable(),
}).strict();
const previewBodySchema = z.object({
  schemaVersion: z.literal(SETTLEMENT_PREVIEW_SCHEMA_VERSION),
  runId: z.string().regex(SAFE_ID),
  templateFingerprint: z.string().regex(SAFE_SHA256),
  templateSnapshot: z.unknown(),
  periodStart: z.string(),
  periodEnd: z.string(),
  scopeId: z.string().regex(SAFE_ID),
  dataBasis: z.literal("offline_settlement"),
  dataCutoffAt: z.string(),
  generatedAt: z.string(),
  factsFingerprint: z.string().regex(SAFE_SHA256),
  correctionsFingerprint: z.string().regex(SAFE_SHA256),
  appliedCorrections: z.array(correctionSchema).max(MAX_CORRECTIONS),
  rows: z.array(previewRowSchema).min(1).max(MAX_ROWS),
  totals: z.array(previewTotalSchema).max(MAX_FIELDS),
  issues: z.array(issueSchema),
  status: z.enum(["blocked", "ready_to_freeze"]),
}).strict();
const previewSchema = previewBodySchema.extend({ fingerprint: z.string().regex(SAFE_SHA256) }).strict();

export interface SettlementConfirmation {
  readonly confirmedByUserId: string;
  readonly confirmedAt: string;
}

export interface FrozenSettlement {
  readonly schemaVersion: typeof FROZEN_SETTLEMENT_SCHEMA_VERSION;
  readonly status: "frozen";
  readonly runId: string;
  readonly previewFingerprint: string;
  readonly templateFingerprint: string;
  readonly templateSnapshot: SettlementTemplate;
  readonly periodStart: string;
  readonly periodEnd: string;
  readonly scopeId: string;
  readonly dataBasis: "offline_settlement";
  readonly dataCutoffAt: string;
  readonly generatedAt: string;
  readonly factsFingerprint: string;
  readonly correctionsFingerprint: string;
  readonly appliedCorrections: readonly SettlementCorrection[];
  readonly rows: readonly SettlementPreviewRow[];
  readonly totals: readonly SettlementPreviewTotal[];
  readonly issues: readonly SettlementIssue[];
  readonly confirmedByUserId: string;
  readonly confirmedAt: string;
  readonly fingerprint: string;
}

const confirmationSchema = z.object({
  confirmedByUserId: z.string().regex(SAFE_ID),
  confirmedAt: z.string(),
}).strict();

export function freezeSettlementPreview(
  previewInput: SettlementPreview,
  confirmationInput: SettlementConfirmation,
  observedAt: string,
): FrozenSettlement {
  const preview = parseIntegrityCheckedPreview(previewInput);
  if (preview.status !== "ready_to_freeze") throw new SettlementError("blocked_preview");
  const confirmation = confirmationSchema.safeParse(confirmationInput);
  const confirmedAtMs = confirmation.success ? parseCanonicalIso(confirmation.data.confirmedAt) : null;
  const generatedAtMs = parseCanonicalIso(preview.generatedAt);
  const observedAtMs = parseCanonicalIso(observedAt);
  if (
    !confirmation.success || confirmedAtMs === null || generatedAtMs === null || observedAtMs === null ||
    confirmedAtMs < generatedAtMs || confirmedAtMs > observedAtMs
  ) throw new SettlementError("invalid_confirmation");
  const body = {
    schemaVersion: FROZEN_SETTLEMENT_SCHEMA_VERSION as "1",
    status: "frozen" as const,
    runId: preview.runId,
    previewFingerprint: preview.fingerprint,
    templateFingerprint: preview.templateFingerprint,
    templateSnapshot: preview.templateSnapshot,
    periodStart: preview.periodStart,
    periodEnd: preview.periodEnd,
    scopeId: preview.scopeId,
    dataBasis: preview.dataBasis,
    dataCutoffAt: preview.dataCutoffAt,
    generatedAt: preview.generatedAt,
    factsFingerprint: preview.factsFingerprint,
    correctionsFingerprint: preview.correctionsFingerprint,
    appliedCorrections: preview.appliedCorrections,
    rows: preview.rows,
    totals: preview.totals,
    issues: preview.issues,
    confirmedByUserId: confirmation.data.confirmedByUserId,
    confirmedAt: confirmation.data.confirmedAt,
  };
  return deepFreeze({ ...body, fingerprint: hashCanonical(body) });
}

const storedTemplateSchema = templateInputSchema.extend({
  schemaVersion: z.literal(SETTLEMENT_TEMPLATE_SCHEMA_VERSION),
  fingerprint: z.string().regex(SAFE_SHA256),
}).strict();

function parseIntegrityCheckedTemplate(input: unknown): SettlementTemplate {
  const parsed = storedTemplateSchema.safeParse(input);
  if (!parsed.success) throw new SettlementError("invalid_template");
  const templateInput: SettlementTemplateInput = {
    templateId: parsed.data.templateId,
    templateVersion: parsed.data.templateVersion,
    name: parsed.data.name,
    currencyCode: parsed.data.currencyCode,
    unitNote: parsed.data.unitNote,
    fields: parsed.data.fields as readonly SettlementTemplateFieldInput[],
    checks: parsed.data.checks,
    createdByUserId: parsed.data.createdByUserId,
    createdAt: parsed.data.createdAt,
  };
  const recreated = createSettlementTemplate(templateInput, parsed.data.createdAt);
  if (recreated.fingerprint !== parsed.data.fingerprint || hashCanonical(recreated) !== hashCanonical(parsed.data)) {
    throw new SettlementError("invalid_template");
  }
  return recreated;
}

function parseIntegrityCheckedPreview(input: unknown): SettlementPreview {
  const parsed = previewSchema.safeParse(input);
  if (!parsed.success) throw new SettlementError("invalid_preview");
  const { fingerprint, ...body } = parsed.data;
  const template = parseIntegrityCheckedTemplate(body.templateSnapshot);
  const hasBlockingIssue = body.issues.some(({ severity }) => severity === "block");
  const valid = [
    hashCanonical(body) === fingerprint,
    template.fingerprint === body.templateFingerprint,
    isSortedUnique(body.rows.map(({ rowKey }) => rowKey)),
    isUnique(body.totals.map(({ fieldKey }) => fieldKey)),
    arePreviewRowsValid(body.rows),
    isPreviewContentConsistent(template, body),
    isPreviewTimelineValid(body),
    arePreviewCorrectionsValid(body),
    (body.status === "blocked") === hasBlockingIssue,
  ].every(Boolean);
  if (!valid) throw new SettlementError("invalid_preview");
  return input as SettlementPreview;
}

function isPreviewContentConsistent(
  template: SettlementTemplate,
  body: z.infer<typeof previewBodySchema>,
): boolean {
  const expectedFieldKeys = template.fields.map(({ fieldKey }) => fieldKey);
  const expectedCheckKeys = template.checks.map(({ checkKey }) => checkKey);
  const rowShapesValid = body.rows.every((row) =>
    equalStringArrays(row.fields.map(({ fieldKey }) => fieldKey), expectedFieldKeys) &&
    equalStringArrays(row.checks.map(({ checkKey }) => checkKey), expectedCheckKeys) &&
    row.fields.every((field, index) => isPreviewFieldCompatible(field, template.fields[index] as SettlementTemplateFieldInput)),
  );
  if (!rowShapesValid) return false;
  const expectedTotals = calculateTotals(template.fields, body.rows);
  return hashCanonical(expectedTotals) === hashCanonical(body.totals) &&
    areCheckResultsConsistent(template, body.rows);
}

function isPreviewFieldCompatible(
  field: z.infer<typeof previewFieldSchema>,
  definition: SettlementTemplateFieldInput,
): boolean {
  const sourceValid = field.source === "correction" || field.source === definition.source.kind;
  const correctionLinkValid = field.source === "correction"
    ? field.correctionId !== undefined
    : field.correctionId === undefined;
  return sourceValid && correctionLinkValid && isValueCompatible(definition.valueType, field.value);
}

function areCheckResultsConsistent(
  template: SettlementTemplate,
  rows: readonly z.infer<typeof previewRowSchema>[],
): boolean {
  return rows.every((row) => {
    const fields = new Map(row.fields.map((field) => [field.fieldKey, field as SettlementPreviewField]));
    const expected = evaluateChecks(template.checks, row.rowKey, fields).results;
    return hashCanonical(expected) === hashCanonical(row.checks);
  });
}

function arePreviewRowsValid(rows: z.infer<typeof previewRowSchema>[]): boolean {
  return rows.every((row) => {
    const { fingerprint, ...body } = row;
    return hashCanonical(body) === fingerprint &&
      isUnique(row.fields.map(({ fieldKey }) => fieldKey)) &&
      isUnique(row.checks.map(({ checkKey }) => checkKey));
  });
}

function isPreviewTimelineValid(body: z.infer<typeof previewBodySchema>): boolean {
  const periodStartMs = parseCanonicalDate(body.periodStart);
  const periodEndMs = parseCanonicalDate(body.periodEnd);
  const dataCutoffAtMs = parseCanonicalIso(body.dataCutoffAt);
  const generatedAtMs = parseCanonicalIso(body.generatedAt);
  return periodStartMs !== null && periodEndMs !== null && periodStartMs <= periodEndMs &&
    dataCutoffAtMs !== null && generatedAtMs !== null && dataCutoffAtMs >= periodEndMs &&
    dataCutoffAtMs <= generatedAtMs;
}

function arePreviewCorrectionsValid(body: z.infer<typeof previewBodySchema>): boolean {
  const dataCutoffAtMs = parseCanonicalIso(body.dataCutoffAt) as number;
  const generatedAtMs = parseCanonicalIso(body.generatedAt) as number;
  return hashCanonical(body.appliedCorrections) === body.correctionsFingerprint &&
    isUnique(body.appliedCorrections.map(({ correctionId }) => correctionId)) &&
    body.appliedCorrections.every(({ correctedAt }) => {
      const correctedAtMs = parseCanonicalIso(correctedAt);
      return correctedAtMs !== null && correctedAtMs >= dataCutoffAtMs && correctedAtMs <= generatedAtMs;
    });
}

function isValueCompatible(type: SettlementValueType, value: SettlementValue | undefined): value is SettlementValue {
  if (value === null) return true;
  if (type === "text") return typeof value === "string" && value.length > 0 && value.length <= MAX_TEXT;
  if (type === "date") return typeof value === "string" && parseCanonicalDate(value) !== null;
  return typeof value === "number" && Number.isFinite(value) && Math.abs(value) <= MAX_VALUE;
}

function isNumericType(type: SettlementValueType): boolean {
  return type === "number" || type === "money" || type === "rate";
}

function parseCanonicalDate(value: string): number | null {
  if (!DATE_PATTERN.test(value)) return null;
  const parsed = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed) && new Date(parsed).toISOString().slice(0, 10) === value ? parsed : null;
}

function parseCanonicalIso(value: string): number | null {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return null;
  return new Date(parsed).toISOString() === value ? parsed : null;
}

function compareOrdered(left: { order: number; fieldKey?: string; checkKey?: string }, right: { order: number; fieldKey?: string; checkKey?: string }): number {
  return left.order - right.order || compareText(left.fieldKey ?? left.checkKey ?? "", right.fieldKey ?? right.checkKey ?? "");
}

function compareIssue(left: SettlementIssue, right: SettlementIssue): number {
  return compareText(left.rowKey, right.rowKey) ||
    compareText(left.fieldKey ?? "", right.fieldKey ?? "") ||
    compareText(left.checkKey ?? "", right.checkKey ?? "") ||
    compareText(left.code, right.code);
}

function dedupeIssues(issues: readonly SettlementIssue[]): SettlementIssue[] {
  const byFingerprint = new Map(issues.map((value) => [hashCanonical(value), value]));
  return [...byFingerprint.values()].sort(compareIssue);
}

function equalValue(left: SettlementValue | undefined, right: SettlementValue): boolean {
  return left === right;
}

function sortRecord<T>(record: Readonly<Record<string, T>>): Record<string, T> {
  return Object.fromEntries(Object.entries(record).sort(([left], [right]) => compareText(left, right)));
}

function isUnique<T>(values: readonly T[]): boolean {
  return new Set(values).size === values.length;
}

function isSortedUnique(values: readonly string[]): boolean {
  return values.every((value, index) => index === 0 || (values[index - 1] as string) < value);
}

function equalStringArrays(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function round12(value: number): number {
  const rounded = Math.round((value + Number.EPSILON) * 1_000_000_000_000) / 1_000_000_000_000;
  return Object.is(rounded, -0) ? 0 : rounded;
}

function hashCanonical(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(canonicalize(value))).digest("hex");
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => compareText(left, right))
        .map(([key, child]) => [key, canonicalize(child)]),
    );
  }
  return value;
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    Object.values(value).forEach((entry) => deepFreeze(entry));
  }
  return value;
}
