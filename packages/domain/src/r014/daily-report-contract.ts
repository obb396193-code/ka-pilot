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
