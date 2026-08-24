import { createHash } from "node:crypto";

import { z } from "zod";

export const INTERNAL_REPORT_PLAN_VERSION = "b6-internal-v1" as const;

export const REPORT_METRIC_KEYS = [
  "rowCount",
  "accountCount",
  "cost",
  "exposure",
  "click",
  "conversion",
  "realConversion",
  "cashCost",
  "costSpace",
  "wakeUv",
  "potentialUv",
  "anomalyRows",
  "ctr",
  "cvr",
  "realCpa",
  "cashCpa",
  "gap",
  "potentialRate",
  "biConversionRate",
] as const;

export const REPORT_DIMENSION_KEYS = ["account", "task", "biz"] as const;

export type ReportMetricKey = (typeof REPORT_METRIC_KEYS)[number];
export type ReportDimensionKey = (typeof REPORT_DIMENSION_KEYS)[number];

const identifierSchema = z
  .string()
  .trim()
  .regex(/^[a-z][a-z0-9_-]{1,63}$/, "component id must be a safe identifier");
const titleSchema = z.string().trim().min(1).max(100);
const filterValueSchema = z.string().trim().min(1).max(128);
const metricSchema = z.enum(REPORT_METRIC_KEYS);
const dimensionSchema = z.enum(REPORT_DIMENSION_KEYS);

function isValidDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const timestamp = Date.parse(`${value}T00:00:00.000Z`);
  return (
    Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === value
  );
}

const dateSchema = z
  .string()
  .refine(isValidDate, { message: "date must be a valid date in YYYY-MM-DD format" });

const filtersSchema = z
  .object({
    taskId: filterValueSchema.optional(),
    accountId: filterValueSchema.optional(),
    ownerUserId: filterValueSchema.optional(),
    media: filterValueSchema.optional(),
  })
  .strict();

const scopeSchema = z
  .object({
    dateFrom: dateSchema,
    dateTo: dateSchema,
    filters: filtersSchema.optional().default({}),
  })
  .strict()
  .refine((scope) => scope.dateFrom <= scope.dateTo, {
    message: "dateFrom must not be after dateTo",
    path: ["dateFrom"],
  });

const kpiComponentSchema = z
  .object({
    id: identifierSchema,
    title: titleSchema,
    kind: z.literal("kpi"),
    metric: metricSchema,
  })
  .strict();

const trendComponentSchema = z
  .object({
    id: identifierSchema,
    title: titleSchema,
    kind: z.literal("trend"),
    metric: metricSchema,
  })
  .strict();

const groupedComponentFields = {
  id: identifierSchema,
  title: titleSchema,
  dimension: dimensionSchema,
  metrics: z.array(metricSchema).min(1).max(8),
  limit: z.number().int().min(1).max(500).optional().default(20),
};

const tableComponentSchema = z
  .object({ ...groupedComponentFields, kind: z.literal("table") })
  .strict();
const barComponentSchema = z
  .object({ ...groupedComponentFields, kind: z.literal("bar") })
  .strict();

const componentSchema = z.discriminatedUnion("kind", [
  kpiComponentSchema,
  trendComponentSchema,
  tableComponentSchema,
  barComponentSchema,
]);

const reportExecutionPlanSchema = z
  .object({
    version: z.literal(INTERNAL_REPORT_PLAN_VERSION),
    title: titleSchema,
    scope: scopeSchema,
    components: z.array(componentSchema).min(1).max(24),
  })
  .strict()
  .superRefine((plan, context) => {
    const ids = new Set<string>();
    plan.components.forEach((component, index) => {
      if (ids.has(component.id)) {
        context.addIssue({
          code: "custom",
          message: "component ids must be unique",
          path: ["components", index, "id"],
        });
      }
      ids.add(component.id);

      if (component.kind === "table" || component.kind === "bar") {
        const metrics = new Set(component.metrics);
        if (metrics.size !== component.metrics.length) {
          context.addIssue({
            code: "custom",
            message: "component metrics must be unique",
            path: ["components", index, "metrics"],
          });
        }
      }
    });
  });

export type ReportExecutionPlan = z.infer<typeof reportExecutionPlanSchema>;
export type ReportComponent = ReportExecutionPlan["components"][number];

export function parseReportExecutionPlan(input: unknown): ReportExecutionPlan {
  return reportExecutionPlanSchema.parse(input);
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, canonicalize(child)]),
    );
  }
  return value;
}

export function fingerprintReportExecutionPlan(plan: ReportExecutionPlan): string {
  const parsed = parseReportExecutionPlan(plan);
  return createHash("sha256").update(JSON.stringify(canonicalize(parsed))).digest("hex");
}
