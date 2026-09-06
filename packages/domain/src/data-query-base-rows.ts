import { z } from "zod";
import { canonicalMetricValueSchema } from "./metric-value.js";

const finiteNumber = z.number().finite();
const nullableFiniteNumber = finiteNumber.nullable();
export const calendarDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
  }, "date must be a real calendar date");

export const ratioValueSchema = z
  .object({
    value: nullableFiniteNumber,
    state: z.enum(["finite", "infinite", "undefined"]),
  })
  .strict()
  .superRefine((ratio, context) => {
    if (ratio.state === "finite" && ratio.value === null) {
      context.addIssue({
        code: "custom",
        path: ["value"],
        message: "finite ratios require a finite value",
      });
    }
    if (ratio.state !== "finite" && ratio.value !== null) {
      context.addIssue({
        code: "custom",
        path: ["value"],
        message: `${ratio.state} ratios cannot carry a numeric value`,
      });
    }
  });

export const canonicalRatioSetSchema = z
  .object({
    ctr: ratioValueSchema,
    cvr: ratioValueSchema,
    realCpa: ratioValueSchema,
    cashCpa: ratioValueSchema,
    gap: ratioValueSchema,
    potentialRate: ratioValueSchema,
    biConversionRate: ratioValueSchema,
  })
  .strict();

export const canonicalMetricSetSchema = z
  .object({
    cost: canonicalMetricValueSchema,
    exposure: canonicalMetricValueSchema,
    click: canonicalMetricValueSchema,
    conversion: canonicalMetricValueSchema,
    realConversion: canonicalMetricValueSchema,
    cashCost: canonicalMetricValueSchema,
    costSpace: canonicalMetricValueSchema,
    wakeUv: canonicalMetricValueSchema,
    potentialUv: canonicalMetricValueSchema,
    ratios: canonicalRatioSetSchema,
  })
  .strict();

export const accountSummaryRowSchema = z
  .object({
    rowCount: z.number().int().nonnegative(),
    accountCount: z.number().int().nonnegative(),
    anomalyRows: z.number().int().nonnegative().nullable(),
    metrics: canonicalMetricSetSchema,
  })
  .strict();

export const relatedTaskRowSchema = z
  .object({
    taskId: z.string().min(1),
    taskName: z.string().nullable(),
    bizName: z.string().nullable(),
  })
  .strict();

export const accountDailyMetricSetSchema = canonicalMetricSetSchema.extend({
  budget: canonicalMetricValueSchema,
  budgetUsageRate: canonicalMetricValueSchema,
  deductionRate: canonicalMetricValueSchema,
  mainAdCostProportion: canonicalMetricValueSchema,
  assessmentPrice: canonicalMetricValueSchema,
}).strict();

export const accountDailyRowSchema = z
  .object({
    workspaceId: z.string().uuid(),
    media: z.string().min(1),
    accountId: z.string().min(1),
    accountName: z.string().nullable(),
    ownerUserId: z.string().nullable(),
    ds: calendarDateSchema,
    metrics: accountDailyMetricSetSchema,
    dataAnomaly: z.boolean().nullable(),
    computedAt: z.string().datetime({ offset: true }).nullable(),
    tasks: z.array(relatedTaskRowSchema),
  })
  .strict();

export const accountAnomalyRowSchema = accountDailyRowSchema.extend({
  dataAnomaly: z.literal(true),
}).strict();

export type AccountSummaryRow = z.infer<typeof accountSummaryRowSchema>;
export type AccountDailyRow = z.infer<typeof accountDailyRowSchema>;
