import { createHash } from "node:crypto";

import { z } from "zod";

import { WORKFLOW_BLOCK_REASONS } from "./workflow-runtime.js";

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/;
const SAFE_EVIDENCE = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$/;
const SHA256 = /^[a-f0-9]{64}$/;
const MAX_CHECKS = WORKFLOW_BLOCK_REASONS.length;

export const WORKFLOW_TRIGGER_DIAGNOSTIC_SCHEMA_VERSION = "1";
export const WORKFLOW_TRIGGER_DIAGNOSTIC_STATUSES = ["eligible", "blocked", "incomplete"] as const;
export const WORKFLOW_TRIGGER_CHECK_OUTCOMES = ["passed", "blocked", "not_evaluated"] as const;
export const WORKFLOW_TRIGGER_NEXT_ACTIONS = [
  "inspect_trigger",
  "refresh_data",
  "wait_for_sample",
  "wait_until",
  "wait_next_window",
  "resolve_conflict",
  "request_permission",
  "review_confirmation",
  "restore_capability",
  "repair_version",
  "resume_manually",
  "no_action",
] as const;

export type WorkflowTriggerDiagnosticErrorCode = "invalid_evaluation" | "invalid_diagnostic";

export class WorkflowTriggerDiagnosticError extends Error {
  constructor(readonly code: WorkflowTriggerDiagnosticErrorCode) {
    super(`Workflow trigger diagnostic failed: ${code}`);
    this.name = "WorkflowTriggerDiagnosticError";
  }
}

const uuidSchema = z.string().uuid().transform((value) => value.toLowerCase());
const idSchema = z.string().regex(SAFE_ID);
const reasonSchema = z.enum(WORKFLOW_BLOCK_REASONS);
const checkSchema = z.object({
  order: z.number().int().min(1).max(MAX_CHECKS),
  reasonCode: reasonSchema,
  outcome: z.enum(WORKFLOW_TRIGGER_CHECK_OUTCOMES),
  checkedAt: z.string(),
  evidenceRefs: z.array(z.string().regex(SAFE_EVIDENCE)).max(20),
  retryAt: z.string().optional(),
}).strict();

const evaluationInputSchema = z.object({
  evaluationId: idSchema,
  workspaceId: uuidSchema,
  workflowId: idSchema,
  workflowVersionId: idSchema,
  triggerId: idSchema,
  evaluatedAt: z.string(),
  dataCutoffAt: z.string().optional(),
  checks: z.array(checkSchema).min(1).max(MAX_CHECKS),
}).strict();

export type WorkflowTriggerEvaluationInput = z.input<typeof evaluationInputSchema>;

const blockingCheckSchema = checkSchema.extend({
  outcome: z.literal("blocked"),
  nextActionCode: z.enum(WORKFLOW_TRIGGER_NEXT_ACTIONS),
}).strict();

export type WorkflowTriggerBlockingCheck = z.infer<typeof blockingCheckSchema>;

const diagnosticBodySchema = evaluationInputSchema.extend({
  schemaVersion: z.literal(WORKFLOW_TRIGGER_DIAGNOSTIC_SCHEMA_VERSION),
  status: z.enum(WORKFLOW_TRIGGER_DIAGNOSTIC_STATUSES),
  blockingChecks: z.array(blockingCheckSchema).max(MAX_CHECKS),
  primaryBlocker: blockingCheckSchema.nullable(),
}).strict();

const diagnosticSchema = diagnosticBodySchema.extend({
  fingerprint: z.string().regex(SHA256),
}).strict();

export type WorkflowTriggerDiagnostic = z.infer<typeof diagnosticSchema>;

const NEXT_ACTION_BY_REASON: Record<(typeof WORKFLOW_BLOCK_REASONS)[number], (typeof WORKFLOW_TRIGGER_NEXT_ACTIONS)[number]> = {
  trigger_not_received: "inspect_trigger",
  data_not_ready: "refresh_data",
  insufficient_sample: "wait_for_sample",
  cooldown_active: "wait_until",
  daily_limit_reached: "wait_next_window",
  conflict_active: "resolve_conflict",
  permission_denied: "request_permission",
  waiting_confirmation: "review_confirmation",
  capability_unavailable: "restore_capability",
  version_invalid: "repair_version",
  manual_pause: "resume_manually",
  condition_false: "no_action",
};

export function buildWorkflowTriggerDiagnostic(
  input: WorkflowTriggerEvaluationInput,
  observedAt: string,
): WorkflowTriggerDiagnostic {
  const parsed = evaluationInputSchema.safeParse(input);
  const observedAtMs = parseCanonicalIso(observedAt);
  if (!parsed.success || observedAtMs === null) throw invalidEvaluation();
  const evaluation = normalizeEvaluation(parsed.data, observedAtMs);
  const blockingChecks = evaluation.checks
    .filter((check): check is typeof check & { outcome: "blocked" } => check.outcome === "blocked")
    .map(toBlockingCheck);
  const status = blockingChecks.length > 0
    ? "blocked"
    : evaluation.checks.some(({ outcome }) => outcome === "not_evaluated")
      ? "incomplete"
      : "eligible";
  const body = {
    schemaVersion: WORKFLOW_TRIGGER_DIAGNOSTIC_SCHEMA_VERSION as "1",
    ...evaluation,
    status,
    blockingChecks,
    primaryBlocker: blockingChecks[0] ?? null,
  };
  const checked = diagnosticBodySchema.safeParse(body);
  if (!checked.success) throw invalidEvaluation();
  return deepFreeze({ ...checked.data, fingerprint: hashCanonical(checked.data) });
}

export function parseWorkflowTriggerDiagnostic(input: unknown): WorkflowTriggerDiagnostic {
  const parsed = diagnosticSchema.safeParse(input);
  if (!parsed.success) throw invalidDiagnostic();
  const { fingerprint, ...body } = parsed.data;
  if (hashCanonical(body) !== fingerprint) throw invalidDiagnostic();
  let rebuilt: WorkflowTriggerDiagnostic;
  try {
    rebuilt = buildWorkflowTriggerDiagnostic(body, body.evaluatedAt);
  } catch {
    throw invalidDiagnostic();
  }
  if (canonicalJson(rebuilt) !== canonicalJson(parsed.data)) throw invalidDiagnostic();
  return deepFreeze(parsed.data);
}

function normalizeEvaluation(
  input: z.infer<typeof evaluationInputSchema>,
  observedAtMs: number,
) {
  const evaluatedAtMs = parseCanonicalIso(input.evaluatedAt);
  const cutoffAtMs = input.dataCutoffAt === undefined ? null : parseCanonicalIso(input.dataCutoffAt);
  if (evaluatedAtMs === null || evaluatedAtMs > observedAtMs) throw invalidEvaluation();
  if (input.dataCutoffAt !== undefined && (cutoffAtMs === null || cutoffAtMs > evaluatedAtMs)) {
    throw invalidEvaluation();
  }
  const checks = input.checks.map((check) => normalizeCheck(check, evaluatedAtMs)).sort((a, b) => a.order - b.order);
  if (!isUnique(checks.map(({ reasonCode }) => reasonCode))) throw invalidEvaluation();
  if (checks.some(({ order }, index) => order !== index + 1)) throw invalidEvaluation();
  return {
    ...input,
    checks,
  };
}

function normalizeCheck(check: z.infer<typeof checkSchema>, evaluatedAtMs: number) {
  const checkedAtMs = parseCanonicalIso(check.checkedAt);
  const retryAtMs = check.retryAt === undefined ? null : parseCanonicalIso(check.retryAt);
  if (checkedAtMs === null || checkedAtMs > evaluatedAtMs) throw invalidEvaluation();
  validateCheckOutcome(check);
  validateRetryAt(check.retryAt, retryAtMs, evaluatedAtMs);
  const evidenceRefs = [...check.evidenceRefs].sort(compareText);
  if (!isUnique(evidenceRefs)) throw invalidEvaluation();
  return { ...check, evidenceRefs };
}

function validateCheckOutcome(check: z.infer<typeof checkSchema>): void {
  if (check.outcome === "blocked" && check.evidenceRefs.length === 0) throw invalidEvaluation();
  if (check.outcome !== "blocked" && check.retryAt !== undefined) throw invalidEvaluation();
}

function validateRetryAt(
  retryAt: string | undefined,
  retryAtMs: number | null,
  evaluatedAtMs: number,
): void {
  if (retryAt === undefined) return;
  if (retryAtMs === null || retryAtMs <= evaluatedAtMs) throw invalidEvaluation();
}

function toBlockingCheck(
  check: z.infer<typeof checkSchema> & { outcome: "blocked" },
): WorkflowTriggerBlockingCheck {
  return {
    ...check,
    nextActionCode: NEXT_ACTION_BY_REASON[check.reasonCode],
  };
}

function parseCanonicalIso(value: string): number | null {
  const time = Date.parse(value);
  if (!Number.isFinite(time) || new Date(time).toISOString() !== value) return null;
  return time;
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function isUnique(values: readonly unknown[]): boolean {
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

function invalidEvaluation(): WorkflowTriggerDiagnosticError {
  return new WorkflowTriggerDiagnosticError("invalid_evaluation");
}

function invalidDiagnostic(): WorkflowTriggerDiagnosticError {
  return new WorkflowTriggerDiagnosticError("invalid_diagnostic");
}
