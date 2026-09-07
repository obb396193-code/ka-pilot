import { z } from "zod";

// v1.5 1.8 早报 / 3.10 定时推的生成记录（表 report_runs）。
// 铁律：数据未就绪只落 pending_data，**绝不生成一份看起来正常的假早报**。
export const reportRunKindSchema = z.enum(["daily_brief", "report_schedule"]);
export const reportRunStatusSchema = z.enum(["pending_data", "running", "ready", "failed"]);
export type ReportRunStatus = z.infer<typeof reportRunStatusSchema>;

export const reportRunRefSchema = z.union([
  z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }).strict(),
  z.object({
    subscriptionId: z.string().uuid(),
    viewId: z.string().uuid().optional(),
    reportConfigId: z.string().uuid().optional(),
  }).strict().refine(
    (ref) => (ref.viewId === undefined) !== (ref.reportConfigId === undefined),
    { message: "a scheduled run points at exactly one of viewId or reportConfigId" },
  ),
]);
export type ReportRunRef = z.infer<typeof reportRunRefSchema>;

export const reportRunSchema = z.object({
  runId: z.string().uuid(),
  kind: reportRunKindSchema,
  ref: reportRunRefSchema,
  status: reportRunStatusSchema,
  dataAsOf: z.string().datetime({ offset: true }).nullable(),
  outputRef: z.string().min(1).nullable(),
  error: z.string().min(1).nullable(),
  createdAt: z.string().datetime({ offset: true }),
  finishedAt: z.string().datetime({ offset: true }).nullable(),
}).strict().superRefine((value, context) => {
  if (value.status === "ready" && value.outputRef === null) {
    context.addIssue({ code: "custom", message: "a ready run must carry its output", path: ["outputRef"] });
  }
  if (value.status === "failed" && value.error === null) {
    context.addIssue({ code: "custom", message: "a failed run must carry its error", path: ["error"] });
  }
  if (value.status !== "failed" && value.error !== null) {
    context.addIssue({ code: "custom", message: "only a failed run may carry an error", path: ["error"] });
  }
  // pending_data = 源数据还没到，什么都没算出来；有产物就说明它其实不是 pending。
  if (value.status === "pending_data" && (value.outputRef !== null || value.dataAsOf !== null)) {
    context.addIssue({ code: "custom", message: "a pending_data run must not carry output or a data cutoff", path: ["status"] });
  }
  if ((value.status === "ready" || value.status === "failed") === (value.finishedAt === null)) {
    context.addIssue({ code: "custom", message: "finishedAt must be set exactly on terminal runs", path: ["finishedAt"] });
  }
});
export type ReportRun = z.infer<typeof reportRunSchema>;

/* ── 1.8 早报响应（GET /reports/daily-brief?date=） ─────────────────── */

export const dailyBriefStatusSchema = z.enum(["ready", "pending_data", "failed"]);
export const dailyBriefPushStatusSchema = z.enum(["not_sent", "sent", "failed"]);

export const dailyBriefSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  status: dailyBriefStatusSchema,
  generatedAt: z.string().datetime({ offset: true }).nullable(),
  dataAsOf: z.string().datetime({ offset: true }).nullable(),
  sections: z.array(z.object({ key: z.string().min(1) }).loose()),
  queueSummary: z.object({
    p0: z.number().int().nonnegative(),
    p1: z.number().int().nonnegative(),
    opportunity: z.number().int().nonnegative(),
    coverage: z.record(z.string(), z.unknown()),
  }).strict().nullable(),
  pushStatus: dailyBriefPushStatusSchema,
  reason: z.string().min(1).optional(),
}).strict().superRefine((value, context) => {
  if (value.status === "ready") {
    if (value.generatedAt === null || value.dataAsOf === null || value.queueSummary === null) {
      context.addIssue({ code: "custom", message: "a ready brief must carry generatedAt, dataAsOf and queueSummary", path: ["status"] });
    }
    return;
  }
  // 未就绪的早报必须是空的：没有生成时间、没有数据时点、没有队列摘要、没有段落。
  if (value.generatedAt !== null || value.dataAsOf !== null || value.queueSummary !== null || value.sections.length > 0) {
    context.addIssue({
      code: "custom",
      message: `a ${value.status} brief must stay empty rather than look generated`,
      path: ["status"],
    });
  }
});
export type DailyBrief = z.infer<typeof dailyBriefSchema>;
