import { z } from "zod";

import { canonicalMetricValueSchema, metricValue, type CanonicalMetricValue } from "../metric-value.js";

// v1.5.1 ① 账户池管道：九态固定顺序，点卡即 poolStatus 筛选。
export const poolStatusSchema = z.enum([
  "available", "assigned", "pending_open", "pending_recharge", "pending_build",
  "in_delivery", "paused", "closed", "abnormal",
]);
export type PoolStatus = z.infer<typeof poolStatusSchema>;

/** 顺序即产品语义（库存→投放→终止），前端按此排卡，不按字母序。 */
export const POOL_STATUS_ORDER: readonly PoolStatus[] = poolStatusSchema.options;

export const poolStatusSourceSchema = z.enum(["system", "manual"]);

export const pipelineStageSchema = z.object({
  poolStatus: poolStatusSchema,
  count: z.number().int().nonnegative(),
  deltaVsYesterday: canonicalMetricValueSchema,
}).strict();
export type PipelineStage = z.infer<typeof pipelineStageSchema>;

export const accountPipelineSchema = z.object({
  stages: z.array(pipelineStageSchema).length(POOL_STATUS_ORDER.length),
  asOf: z.string().datetime({ offset: true }),
}).strict().superRefine((value, context) => {
  const order = value.stages.map((stage) => stage.poolStatus);
  if (order.join(",") !== POOL_STATUS_ORDER.join(",")) {
    context.addIssue({ code: "custom", message: "pipeline stages must keep the frozen nine-state order", path: ["stages"] });
  }
});
export type AccountPipeline = z.infer<typeof accountPipelineSchema>;

/**
 * 把「每态多少户」补成九态齐全的管道。
 *
 * `deltaVsYesterday` 由调用方给：**没有 pool_status 历史源时必须传 missing，不能传 0**——
 * 0 的意思是「昨天到今天没变」，missing 的意思是「不知道昨天什么样」，两者在页面上是两回事。
 */
export function buildAccountPipeline(
  counts: Partial<Record<PoolStatus, number>>,
  asOf: string,
  deltaVsYesterday: (status: PoolStatus) => CanonicalMetricValue = () => metricValue(null),
): AccountPipeline {
  return accountPipelineSchema.parse({
    stages: POOL_STATUS_ORDER.map((poolStatus) => ({
      poolStatus,
      count: counts[poolStatus] ?? 0,
      deltaVsYesterday: deltaVsYesterday(poolStatus),
    })),
    asOf,
  });
}
