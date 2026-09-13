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
    /**
     * v1.9.27 ④ 激励花费：个人源取启航「激励」字段；ka-data 没有这一列时是
     * `unsupported`（走 availability=missing + reason），**不是 0**。
     * 与 `costSpace`（成本空间）无关，前端不许混用——两者含义完全不同。
     *
     * **暂为 optional**：几十份冻结 fixture 是这字段存在之前从真响应导出的，转必填会把它们全判非法。
     * 但「optional」不等于「可以不发」——真实产出路径**恒发**它，由绊线
     * `new-metric-fields-emitted` 钉住；fixtures 重导之后再转必填（照 v1.5.1 ② 的先例）。
     */
    incentiveCost: canonicalMetricValueSchema.optional(),
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

/**
 * v1.9.45：四个键（`incentiveCost` 与三个 BI 值）对 **platform（个人）源转必填**。
 *
 * 为什么不直接把 schema 里的 `.optional()` 去掉：团队 `ka_data` 与 `reconcile` 那两条路
 * 本地连不上，硬转必填只会逼出假 fixture（arch v1.9.45 裁：豁免到 Q-041 ⑧ 落地）。
 * 所以「必填」落在**知道源是谁**的那一层——行 schema 仍然宽，规范化入口按源收紧。
 *
 * 「optional」从来不等于「可以不发」：漏发时页面只是静悄悄显「−」，
 * 而「后端没算」与「真没有数」在页面上长得一模一样。这个函数就是把那个区别变成一条错误。
 */
export function missingPlatformRowFields(row: unknown): string[] {
  if (row === null || typeof row !== "object") return [];
  const record = row as Record<string, unknown>;
  const missing: string[] = [];
  const metrics = record.metrics;
  if (metrics !== null && typeof metrics === "object" && !Object.hasOwn(metrics, "incentiveCost")) {
    missing.push("metrics.incentiveCost");
  }
  const assessment = record.assessment;
  // 只有带考核结论的行才有这三个值；趋势/明细行没有 assessment，不该被要求。
  if (assessment !== null && typeof assessment === "object" && Object.hasOwn(assessment, "costStatusReason")) {
    for (const field of ["biConv", "biCashCost", "overCost"]) {
      if (!Object.hasOwn(assessment, field)) missing.push(`assessment.${field}`);
    }
  }
  return missing;
}
