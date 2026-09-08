import { z } from "zod";
import type { RuleEvaluation } from "@ka/domain";
import type { RuleCandidate } from "./types.js";

const identifier = z.string().min(1).max(256)
  .refine(value => value === value.trim() && [...value].every(char => char.charCodeAt(0) >= 32 && char.charCodeAt(0) !== 127), "Invalid identifier");
const ruleCode = z.enum(["over_cost_ramp", "zero_delivery", "spend_cliff"]);
const outcome = z.enum(["matched", "not_matched", "insufficient_data"]);
const scalar = z.union([z.number().finite(), z.boolean(), z.string().max(4096)]);
const evaluationSchema = z.object({
  ruleCode, outcome, severity: z.enum(["P0", "P1", "P2"]),
  trace: z.array(z.object({
    condition: z.string().min(1).max(256), outcome,
    actual: scalar.nullable().optional(), expected: scalar.optional(),
    reason: z.string().min(1).max(4096),
  }).strict()).min(1).max(128),
}).strict();

// Internal provider boundary, not an authorization substitute or public DTO.
// Readiness and facts retain their own domain validation and missing-data semantics.
const candidateSchema = z.object({
  candidateId: identifier, workspaceId: identifier, media: identifier, accountId: identifier,
  taskId: identifier.nullish(), ruleId: z.union([identifier, z.number().int().nonnegative()]),
  title: z.string().min(1).max(4096), evidenceSnapshot: z.record(z.string(), z.unknown()),
  readiness: z.unknown(), isQuietHours: z.boolean(), quietHoursEnd: z.date().optional(),
  ruleCode, facts: z.record(z.string(), z.unknown()),
}).strict();

export function snapshotCandidateBatch(value: unknown): unknown[] {
  if (!Array.isArray(value) || value.length > 10_000) throw new Error("Invalid rule candidate batch");
  try { return structuredClone(value); }
  catch { throw new Error("Invalid rule candidate batch"); }
}

export function parseCandidate(value: unknown): RuleCandidate {
  return candidateSchema.parse(value) as RuleCandidate;
}

export function failureCandidateId(value: unknown): string {
  if (typeof value !== "object" || value === null || !("candidateId" in value)) return "invalid_candidate";
  const parsed = identifier.safeParse(value.candidateId);
  return parsed.success ? parsed.data : "invalid_candidate";
}

export function parseEvaluation(value: unknown, expectedRuleCode: RuleCandidate["ruleCode"]): RuleEvaluation {
  const result = evaluationSchema.parse(value);
  if (result.ruleCode !== expectedRuleCode) throw new Error("Invalid rule evaluation");
  return { ...result, trace: result.trace.map(({ actual, expected, ...trace }) => ({
    ...trace, ...(actual === undefined ? {} : { actual }), ...(expected === undefined ? {} : { expected }),
  })) };
}

export const workItemSinkResultSchema = z.object({
  disposition: z.enum(["created", "upgraded", "merged"]), workItemId: identifier,
}).strict();
export const alertSinkResultSchema = z.enum(["enqueued", "duplicate"]);

export class CandidateWorkspaceMismatch extends Error {
  constructor() { super("Rule candidate workspace mismatch"); }
}

export function safeCandidateFailure(error: unknown): string {
  return error instanceof CandidateWorkspaceMismatch ? error.message : "Rule candidate processing failed";
}
