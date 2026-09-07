import { z } from "zod";
import { canonicalMetricValueSchema } from "./metric-value.js";
import { ratioValueSchema } from "./data-query-base-rows.js";

const volumeSchema = z.object({
  cost: canonicalMetricValueSchema, cashCost: canonicalMetricValueSchema,
  conversion: canonicalMetricValueSchema, realConversion: canonicalMetricValueSchema,
}).strict();
const volumeKeys = ["cost", "cashCost", "conversion", "realConversion"] as const;
function issue(ctx: z.RefinementCtx, path: (string | number)[], message: string): void {
  ctx.addIssue({ code: "custom", path, message });
}

export const accountHourlyRowSchema = z.object({
  media: z.string().regex(/^[A-Z0-9_]{1,32}$/),
  accountId: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/),
  hh: z.number().int().min(0).max(24),
  cumulative: volumeSchema, delta: volumeSchema,
  ratios: z.object({ cashCpa: ratioValueSchema, realCpa: ratioValueSchema }).strict(),
  velocity: z.object({ costPerHour: canonicalMetricValueSchema }).strict(),
  projectedDayCost: canonicalMetricValueSchema,
  budgetUsage: ratioValueSchema,
  lastSyncAt: z.string().datetime({ offset: true }).nullable(),
}).strict().superRefine((row, ctx) => {
  for (const field of volumeKeys) {
    if (row.cumulative[field].availability !== "available" && row.delta[field].availability === "available") {
      issue(ctx, ["delta", field], "A delta requires its current cumulative value");
    }
  }
  for (const [ratio, numerator] of [["cashCpa", "cashCost"], ["realCpa", "cost"]] as const) {
    if ((row.cumulative[numerator].availability !== "available" || row.cumulative.realConversion.availability !== "available") &&
      row.ratios[ratio].state !== "undefined") {
      issue(ctx, ["ratios", ratio], "Missing CPA inputs require an undefined ratio");
    }
    if (row.cumulative.realConversion.value === 0 && row.ratios[ratio].state === "finite") {
      issue(ctx, ["ratios", ratio], "Zero denominator cannot produce a finite CPA");
    }
  }
});

function hourKey(row: { media: string; accountId: string; hh: number }, hh = row.hh): string {
  return JSON.stringify([row.media, row.accountId, hh]);
}
export const accountHourlyRowsSchema = z.array(accountHourlyRowSchema).max(10000).superRefine((rows, ctx) => {
  const indexed = new Map<string, z.infer<typeof accountHourlyRowSchema>>();
  for (const [index, row] of rows.entries()) {
    const key = hourKey(row);
    if (indexed.has(key)) issue(ctx, [index], "Duplicate media/account/hour");
    indexed.set(key, row);
  }
  for (const [index, row] of rows.entries()) {
    // hh=24 is an explicit whole-day observation, not a 25th one-hour interval.
    if (row.hh === 0 || row.hh === 24) continue;
    const previous = indexed.get(hourKey(row, row.hh - 1));
    // A selected interval can omit the predecessor the reader used. Absence from
    // this projection is not evidence of a missing upstream observation.
    if (!previous) continue;
    for (const field of volumeKeys) {
      if (previous.cumulative[field].availability !== "available" && row.delta[field].availability === "available") {
        issue(ctx, [index, "delta", field], "A known missing predecessor cannot produce an available delta");
      }
    }
  }
});

export const accountGapRowSchema = z.object({
  group: z.object({ key: z.string().min(1).nullable(), label: z.string().nullable() }).strict(),
  conversion: canonicalMetricValueSchema, realConversion: canonicalMetricValueSchema,
  gap: ratioValueSchema, preDeductionGap: ratioValueSchema, deductionRate: ratioValueSchema,
  gapStatus: z.enum(["normal", "high", "missing"]),
}).strict().superRefine((row, ctx) => {
  if (row.conversion.availability !== "available" || row.realConversion.availability !== "available") {
    if (row.gap.state !== "undefined") issue(ctx, ["gap"], "Missing conversion inputs cannot produce a gap");
    if (row.gapStatus !== "missing") issue(ctx, ["gapStatus"], "Missing inputs cannot be classified normal or high");
  }
  if (row.gap.state === "undefined" && row.gapStatus !== "missing") {
    issue(ctx, ["gapStatus"], "Undefined gap cannot be classified normal or high");
  }
  if (row.realConversion.value === 0 && row.gap.state === "finite") {
    issue(ctx, ["gap"], "Zero denominator cannot produce a finite gap");
  }
});
export const accountGapRowsSchema = z.array(accountGapRowSchema).max(10000).superRefine((rows, ctx) => {
  const seen = new Set<string | null>();
  for (const [index, row] of rows.entries()) {
    if (seen.has(row.group.key)) issue(ctx, [index, "group", "key"], "Duplicate gap group");
    seen.add(row.group.key);
  }
});

/** A versioned row projection only: not a source envelope, authorization proof,
 * availability claim, arithmetic/rule evaluator or Query Registry admission.
 * Readers must prove full scope/coverage and enforce the exact 16 MiB transport cap.
 */
export const operationalQueryRowsSchema = z.discriminatedUnion("queryId", [
  z.object({ queryId: z.literal("account.hourly"), rowSchemaVersion: z.literal("account.hourly/v1"), rows: accountHourlyRowsSchema }).strict(),
  z.object({ queryId: z.literal("account.gap"), rowSchemaVersion: z.literal("account.gap/v1"),
    groupBy: z.enum(["account", "task", "biz"]), rows: accountGapRowsSchema }).strict(),
]);
export type AccountHourlyRow = z.infer<typeof accountHourlyRowSchema>;
export type AccountGapRow = z.infer<typeof accountGapRowSchema>;
export type OperationalQueryRows = z.infer<typeof operationalQueryRowsSchema>;
