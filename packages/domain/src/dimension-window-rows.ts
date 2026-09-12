import { z } from "zod";
import { canonicalMetricSetSchema } from "./data-query-base-rows.js";
import { refineWindowMetricAssessment, windowAssessmentSchema } from "./summary-window.js";
import { dimensionSourceSummarySchema, namedDimensionTypeSchema } from "./named-dimension.js";

const dimensionFields = {
  key: z.string().min(1).nullable(),
  label: z.string().nullable(),
  metrics: canonicalMetricSetSchema,
  assessment: windowAssessmentSchema,
  anomaly: z.boolean(),
};
/** 固定维度枚举。`segment:<key>` 不在这里——它是「按某个清洗段分析」，段名由规则决定，不能写死。 */
export const fixedDimensionTypeSchema = z.enum(["account", "task", "biz", "agent_type", "resource_position", "bid_tool", "ubp", "deduction_range", "optimizer", "goal", "placement"]);

/**
 * v1.9.34 ⑩（Q-041 ⑦）：维度开放到**任意清洗段** —— `segment:<key>`。
 * 老板要的是「每个渠道昵称清洗出的每个字段都能拿来做分析和透视」，
 * 段名来自各媒体自己的命名规则，所以只能约束形状不能枚举取值：
 * key 与规则段 key 同形（字母数字下划线），长度与段 key 一致。
 */
export const dimensionTypeSchema = z.union([
  fixedDimensionTypeSchema,
  z.string().regex(/^segment:[A-Za-z0-9_]{1,64}$/),
]);

/** `segment:<key>` → `<key>`；固定维度返回 null。判定只此一处，别在各处自己切字符串。 */
export function segmentDimensionKey(dimension: unknown): string | null {
  if (typeof dimension !== "string" || !dimension.startsWith("segment:")) return null;
  const key = dimension.slice("segment:".length);
  return /^[A-Za-z0-9_]{1,64}$/.test(key) ? key : null;
}

const groupedRowSchema = z.object(dimensionFields).strict().superRefine(refineWindowMetricAssessment);
export const groupedDimensionWindowRowSchema = groupedRowSchema;
export const namedDimensionWindowRowSchema = dimensionSourceSummarySchema.safeExtend(dimensionFields).superRefine(refineWindowMetricAssessment);
const agentTypeRowSchema = z.object({
  ...dimensionFields,
  // v1.7.9：代理/自投只有账户级 custom_tags，OS 实测大量账户无匹配 → 无标记归 unknown（显「未标注」），不猜不填默认值。
  agent_type: z.enum(["agency", "self", "unknown"]),
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
export const dimensionWindowRowSchema = z.union([accountDimensionWindowRowSchema, agentTypeRowSchema, groupedRowSchema, namedDimensionWindowRowSchema]);

/** Row-only boundary. Not an authorization check, source capability registry or full response envelope.
 * workspaceId comes from the trusted source/session boundary, never from a displayed dimension key.
 * 10,000 rows is the bounded canonical result; sources still must prove they were not hard-cap truncated.
 */
export const dimensionWindowRowsSchema = z.union([
  z.object({ dimension: namedDimensionTypeSchema, rows: namedDimensionWindowRowSchema.array().max(10000) }).strict(),
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
