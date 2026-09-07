import { z } from "zod";
import { canonicalMetricSetSchema } from "./data-query-base-rows.js";
import { dimensionTypeSchema } from "./dimension-window-rows.js";
import { aggregateWindowMetrics, queryWindowSchema, refineWindowMetricAssessment, windowAssessmentSchema } from "./summary-window.js";
import { computeKaDailyWindowAssessment, computeWindowAssessment, dailyAssessmentInputSchema, kaDailyAssessmentInputSchema } from "./window-assessment.js";
import type { CanonicalMetricValue } from "./metric-value.js";

const axisSchema = z.object({ key: z.string().min(1).nullable(), label: z.string().nullable() }).strict();
const axes = { a: axisSchema, b: axisSchema };
export const pivotWindowRowSchema = z.object({ ...axes, metrics: canonicalMetricSetSchema, assessment: windowAssessmentSchema })
  .strict().superRefine(refineWindowMetricAssessment);
const dimensions = { dimA: dimensionTypeSchema, dimB: dimensionTypeSchema };

/** Row projection only. Capability, source health, coverage, and authorization are separate boundaries. */
export const pivotWindowRowsSchema = z.object({
  queryId: z.literal("account.pivot2"), rowSchemaVersion: z.literal("account.pivot2/v1"),
  ...dimensions, rows: z.array(pivotWindowRowSchema).max(10000),
}).strict().superRefine((value, ctx) => {
  const seen = new Set<string>(), labels = new Map<string, string | null>();
  for (const [index, row] of value.rows.entries()) {
    const pair = JSON.stringify([row.a.key, row.b.key]);
    if (seen.has(pair)) ctx.addIssue({ code: "custom", path: ["rows", index], message: "Duplicate pivot cell" });
    seen.add(pair);
    for (const [side, dimension] of [["a", value.dimA], ["b", value.dimB]] as const) {
      const axis = row[side], labelKey = JSON.stringify([dimension, axis.key]);
      if (labels.has(labelKey) && labels.get(labelKey) !== axis.label) {
        ctx.addIssue({ code: "custom", path: ["rows", index, side], message: "Conflicting dimension label" });
      }
      labels.set(labelKey, axis.label);
      if (dimension === "account" && (axis.key === null || !/^[A-Z0-9_]{1,32}:[A-Za-z0-9_-]{1,128}$/.test(axis.key))) {
        ctx.addIssue({ code: "custom", path: ["rows", index, side, "key"], message: "Account axis requires media and accountId" });
      }
    }
    if (value.dimA === value.dimB && row.a.key !== row.b.key) {
      ctx.addIssue({ code: "custom", path: ["rows", index], message: "Same dimension axes must agree" });
    }
  }
});
export type PivotWindowRows = z.infer<typeof pivotWindowRowsSchema>;

const tupleSchema = z.object({ media: z.string().regex(/^[A-Z0-9_]{1,32}$/), accountId: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/) }).strict();
const memberFields = { ...tupleSchema.shape, workspaceId: z.string().uuid(), metrics: canonicalMetricSetSchema };
const historyMember = z.object({ ...memberFields, assessment: dailyAssessmentInputSchema }).strict();
const dailyMember = z.object({ ...memberFields, assessment: kaDailyAssessmentInputSchema }).strict();
const inputFields = { ...dimensions, workspaceId: z.string().uuid(), granularity: z.literal("account_day"),
  accounts: z.array(tupleSchema).max(1000), window: queryWindowSchema };
const inputSchema = z.discriminatedUnion("source", [
  z.object({ ...inputFields, source: z.literal("history"),
    cells: z.array(z.object({ ...axes, members: z.array(historyMember).min(1).max(10000) }).strict()).max(10000) }).strict(),
  z.object({ ...inputFields, source: z.literal("ka_daily"),
    cells: z.array(z.object({ ...axes, members: z.array(dailyMember).min(1).max(10000) }).strict()).max(10000) }).strict(),
]);
function invalid(): never { throw new Error("Invalid pivot account-day evidence"); }
function equal(a: CanonicalMetricValue, b: CanonicalMetricValue): boolean {
  return a.availability === b.availability && a.value === b.value;
}
function bounded(raw: unknown): void {
  if (!raw || typeof raw !== "object" || !("cells" in raw) || !Array.isArray(raw.cells) || raw.cells.length > 10000) return invalid();
  let count = 0;
  for (const cell of raw.cells) {
    if (!cell || typeof cell !== "object" || !Array.isArray(cell.members)) return invalid();
    count += cell.members.length;
    if (count > 10000) return invalid();
  }
}

/** Exact disjoint account-day partition, not a join of preaggregated dimension tables.
 * The trusted reader supplies all expected members, including explicit missing rows,
 * and verifies that labels/assignments came from the same DB snapshot. Account-day
 * granularity must not be reused for adgroup-level allocation without another model.
 */
export function aggregatePivotWindow(raw: unknown): PivotWindowRows & { warnings: string[] } {
  bounded(raw);
  const input = inputSchema.parse(raw), seen = new Set<string>(), allowed = new Set<string>();
  const days = (Date.parse(`${input.window.to}T00:00:00Z`) - Date.parse(`${input.window.from}T00:00:00Z`)) / 86400000 + 1;
  if (days > 31 || input.accounts.length * days > 10000) return invalid();
  for (const account of input.accounts) {
    const key = JSON.stringify([account.media, account.accountId]);
    if (allowed.has(key)) return invalid();
    allowed.add(key);
  }
  const warnings = new Set<string>();
  const rows = input.cells.map(cell => {
    for (const member of cell.members) {
      const ds = member.assessment.ds, key = JSON.stringify([member.media, member.accountId, ds]);
      if (member.workspaceId !== input.workspaceId || !allowed.has(JSON.stringify([member.media, member.accountId])) ||
        ds < input.window.from || ds > input.window.to || seen.has(key) ||
        !equal(member.metrics.cashCost, member.assessment.cashCost) ||
        !equal(member.metrics.realConversion, member.assessment.realConversion)) return invalid();
      for (const [axis, dimension] of [[cell.a, input.dimA], [cell.b, input.dimB]] as const) {
        if (dimension === "account" && axis.key !== `${member.media}:${member.accountId}`) return invalid();
      }
      seen.add(key);
    }
    const assessmentInputs = cell.members.map(member => member.assessment);
    let result: ReturnType<typeof computeWindowAssessment>;
    if (input.source === "history") result = computeWindowAssessment(assessmentInputs);
    else {
      const daily = computeKaDailyWindowAssessment(assessmentInputs);
      for (const warning of daily.warnings) warnings.add(warning);
      result = daily;
    }
    return { a: cell.a, b: cell.b,
      metrics: { ...aggregateWindowMetrics(cell.members.map(member => member.metrics)), costSpace: result.costSpace },
      assessment: result.assessment };
  });
  if (seen.size !== allowed.size * days) return invalid();
  return { ...pivotWindowRowsSchema.parse({ queryId: "account.pivot2", rowSchemaVersion: "account.pivot2/v1",
    dimA: input.dimA, dimB: input.dimB, rows }), warnings: [...warnings] };
}
