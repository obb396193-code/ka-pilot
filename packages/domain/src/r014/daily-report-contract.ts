import { z } from "zod";

import { canonicalMetricValueSchema } from "../metric-value.js";

// v1.5 1.8 / 3.10 日报（D7）。fixture reports/daily-v1.json 即契约：
// 它冻的是**形状**（13 个模块的 key 与 title、各自带什么字段），行数据由实现填。
const ratioValueSchema = z.object({
  value: z.number().finite().nullable(),
  state: z.enum(["finite", "infinite", "undefined"]),
}).strict();

/** 13 个模块的顺序与标题逐字取自 fixture；顺序即阅读顺序，不许重排。 */
export const DAILY_REPORT_MODULES = [
  { key: "executive_summary", title: "管理摘要" },
  { key: "overview", title: "大盘" },
  { key: "dim_task", title: "按任务" },
  { key: "dim_biz", title: "按业务" },
  { key: "dim_account", title: "按账户" },
  { key: "dim_agent", title: "代理/自投" },
  { key: "dim_resource_position", title: "资源位" },
  { key: "dim_bid_tool", title: "出价工具" },
  { key: "dim_ubp", title: "UBP" },
  { key: "dim_deduction", title: "扣量区间" },
  { key: "deduction_analysis", title: "扣量分析" },
  { key: "health", title: "健康度" },
  { key: "cost_tiers", title: "消耗分层" },
] as const;

export type DailyReportModuleKey = typeof DAILY_REPORT_MODULES[number]["key"];

const moduleBase = { key: z.string().min(1), title: z.string().min(1) };

export const dailyReportModuleSchema = z.union([
  z.object({
    ...moduleBase,
    key: z.literal("executive_summary"),
    cards: z.object({
      cost: canonicalMetricValueSchema,
      cashCost: canonicalMetricValueSchema,
      realConversion: canonicalMetricValueSchema,
      cashCpa: ratioValueSchema,
      onTargetRate: ratioValueSchema,
      costSpace: canonicalMetricValueSchema,
    }).strict(),
    /** 只放真实发生的异常（来自 open 工作项），**不生成措辞**。 */
    anomalies: z.array(z.string().min(1)),
  }).strict(),
  z.object({ ...moduleBase, key: z.literal("overview"), trend: z.array(z.unknown()) }).strict(),
  z.object({ ...moduleBase, key: z.literal("health"), status: z.string().min(1) }).strict(),
  z.object({
    ...moduleBase,
    rows: z.array(z.unknown()),
    /**
     * `true` = 这个维度**当前无法提供**（源未接入），不是「查过了没有数据」。
     * 空 rows 加 `unsupported:false` 才表示「查了，确实没有」——两者在页面上必须分得开。
     */
    unsupported: z.boolean().optional(),
  }).strict(),
]);
export type DailyReportModule = z.infer<typeof dailyReportModuleSchema>;

export const dailyDeliverySchema = z.object({
  status: z.enum(["not_sent", "queued", "sent", "failed"]),
  at: z.string().datetime({ offset: true }).nullable(),
  target: z.string().min(1).nullable(),
}).strict().superRefine((delivery, context) => {
  // v1.7.4 G8：没送出去就没有送达时间与目标，反过来也一样。
  if ((delivery.status === "sent") !== (delivery.at !== null)) {
    context.addIssue({ code: "custom", message: "a sent delivery must carry its timestamp and nothing else may", path: ["at"] });
  }
});
export type DailyDelivery = z.infer<typeof dailyDeliverySchema>;

export const dailyReportSchema = z.object({
  schema: z.literal("daily-report/v1"),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  role: z.string().min(1),
  dataAsOf: z.string().datetime({ offset: true }).nullable(),
  modules: z.array(dailyReportModuleSchema).length(DAILY_REPORT_MODULES.length),
  /** 布尔只表示「这个动作可用」，不表示已经做过（v1.7.4 G8）。 */
  actions: z.object({ pushDingtalk: z.boolean(), exportPdf: z.boolean() }).strict(),
  delivery: dailyDeliverySchema,
}).strict().superRefine((report, context) => {
  const expected = DAILY_REPORT_MODULES.map((module) => module.key).join(",");
  if (report.modules.map((module) => module.key).join(",") !== expected) {
    context.addIssue({ code: "custom", message: "modules must keep the frozen order and key set", path: ["modules"] });
  }
});
export type DailyReport = z.infer<typeof dailyReportSchema>;

/** 源未接入的维度模块：空 rows + `unsupported:true`，**不编行**。 */
export function unsupportedModule(key: DailyReportModuleKey): DailyReportModule {
  const definition = DAILY_REPORT_MODULES.find((module) => module.key === key);
  if (definition === undefined) throw new Error(`unknown daily report module: ${key}`);
  return dailyReportModuleSchema.parse({ ...definition, rows: [], unsupported: true });
}

/**
 * v1.9.2：按解析维度归并账户行。**不查库、不重算指标**——把已经按账户聚好的行
 * 按该账户的维度值合并而已，所以和六卡、dim_account 天然同源。
 *
 * 解析不出该维度的账户归入「未标注」桶：这是 v1.7.9 对 agent_type 定的口径
 * （无标记的显「未标注」），不是丢掉，也不是硬塞进某个真实取值里。
 */
export const UNLABELLED_DIMENSION = "未标注";

export function groupRowsByDimension<Row extends { key: string; metrics: Record<string, number | null> }>(
  rows: readonly Row[],
  valueOf: (row: Row) => string | null,
): { key: string; label: string; metrics: Record<string, number | null> }[] {
  const buckets = new Map<string, { key: string; label: string; metrics: Record<string, number | null> }>();
  // null 是「没有数据」不是 0。整组都没数据的指标必须留 null——两个 null 相加得 0，
  // 就是把「不知道」变成了「确实是零」。所以单独记「这一格见过真值没有」。
  const seenValue = new Map<string, Set<string>>();

  for (const row of rows) {
    const value = valueOf(row) ?? UNLABELLED_DIMENSION;
    const bucket = buckets.get(value) ?? { key: value, label: value, metrics: {} };
    const seen = seenValue.get(value) ?? new Set<string>();
    for (const [metric, amount] of Object.entries(row.metrics)) {
      if (amount === null) {
        if (!(metric in bucket.metrics)) bucket.metrics[metric] = null;
        continue;
      }
      bucket.metrics[metric] = (seen.has(metric) ? bucket.metrics[metric] ?? 0 : 0) + amount;
      seen.add(metric);
    }
    seenValue.set(value, seen);
    buckets.set(value, bucket);
  }
  return [...buckets.values()].sort((left, right) =>
    (right.metrics.cost ?? 0) - (left.metrics.cost ?? 0) || left.key.localeCompare(right.key));
}
