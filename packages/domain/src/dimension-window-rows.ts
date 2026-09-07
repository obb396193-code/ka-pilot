import { z } from "zod";
import { canonicalMetricSetSchema } from "./data-query-base-rows.js";
import { refineWindowMetricAssessment, windowAssessmentSchema } from "./summary-window.js";

const dimensionFields = {
  key: z.string().min(1).nullable(),
  label: z.string().nullable(),
  metrics: canonicalMetricSetSchema,
  assessment: windowAssessmentSchema,
  anomaly: z.boolean(),
};

const groupedRowSchema = z.object(dimensionFields).strict().superRefine(refineWindowMetricAssessment);
const agentTypeRowSchema = z.object({
  ...dimensionFields,
  agent_type: z.enum(["agency", "self"]),
  agency_name: z.string().min(1).optional(),
}).strict().superRefine(refineWindowMetricAssessment);
export const accountDimensionWindowRowSchema = z.object({
  ...dimensionFields,
  key: z.string().min(1),
  media: z.string().regex(/^[A-Z0-9_]{1,32}$/),
  accountId: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/),
}).strict().superRefine(refineWindowMetricAssessment).superRefine((row, context) => {
  if (row.key !== `${row.media}:${row.accountId}`) {
    context.addIssue({ code: "custom", path: ["key"], message: "Account dimension key must preserve media and accountId" });
  }
});

/** Row-only boundary. Not an authorization check, source capability registry or full response envelope.
 * workspaceId comes from the trusted source/session boundary, never from a displayed dimension key.
 * 10,000 rows is the bounded canonical result; sources still must prove they were not hard-cap truncated.
 */
export const dimensionWindowRowsSchema = z.union([
  z.object({ dimension: z.literal("account"), rows: z.array(accountDimensionWindowRowSchema).max(10000) }).strict(),
  z.object({ dimension: z.literal("agent_type"), rows: z.array(agentTypeRowSchema).max(10000) }).strict(),
  z.object({
    dimension: z.enum(["task", "biz", "resource_position", "bid_tool", "ubp", "deduction_range"]),
    rows: z.array(groupedRowSchema).max(10000),
  }).strict(),
]).superRefine((value, context) => {
  const seen = new Set<string | null>();
  for (const [index, row] of value.rows.entries()) {
    if (seen.has(row.key)) {
      context.addIssue({ code: "custom", path: ["rows", index, "key"], message: "Duplicate dimension group" });
    }
    seen.add(row.key);
  }
});

export type DimensionWindowRows = z.infer<typeof dimensionWindowRowsSchema>;
