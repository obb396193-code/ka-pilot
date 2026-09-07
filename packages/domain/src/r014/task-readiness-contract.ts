import { z } from "zod";

import type { RatioValue } from "../types.js";

// v1.5.1 ② 投放任务就绪度六段。系统推导 + 人工可覆盖，覆盖只改 ready 与 source，
// ratio / missing 仍是系统算出来的事实（fixture tasks/list-v151.json 即此形：
// materials 是 manual 且 ready=false，同时带着系统算的 0.5 与 missing）。
export const readinessDimensionSchema = z.enum([
  "accounts", "recharge", "products", "materials", "strategy", "infra",
]);
export type ReadinessDimension = z.infer<typeof readinessDimensionSchema>;
export const READINESS_DIMENSIONS: readonly ReadinessDimension[] = readinessDimensionSchema.options;

const ratioValueSchema = z.object({
  value: z.number().finite().nullable(),
  state: z.enum(["finite", "infinite", "undefined"]),
}).strict();

export const readinessEntrySchema = z.object({
  ratio: ratioValueSchema,
  ready: z.boolean(),
  source: z.enum(["system", "manual"]),
  missing: z.array(z.string()),
}).strict();
export type ReadinessEntry = z.infer<typeof readinessEntrySchema>;

export const taskReadinessSchema = z.object({
  accounts: readinessEntrySchema,
  recharge: readinessEntrySchema,
  products: readinessEntrySchema,
  materials: readinessEntrySchema,
  strategy: readinessEntrySchema,
  infra: readinessEntrySchema,
}).strict();
export type TaskReadiness = z.infer<typeof taskReadinessSchema>;

export interface ReadinessOverride { dimension: ReadinessDimension; ready: boolean }

/** 系统推导出的一段：只有 ratio / ready / missing，source 由本函数决定。 */
export type SystemReadinessEntry = Omit<ReadinessEntry, "source">;

/**
 * 人工勾选覆盖系统判断：只翻 `ready` 并把 source 记成 manual，
 * **不动 ratio 与 missing**——那是系统观测到的事实，不能被人工勾选抹掉。
 */
export function mergeReadiness(
  system: Record<ReadinessDimension, SystemReadinessEntry>,
  overrides: readonly ReadinessOverride[],
): TaskReadiness {
  const byDimension = new Map(overrides.map((override) => [override.dimension, override]));
  const merged = Object.fromEntries(READINESS_DIMENSIONS.map((dimension) => {
    const base = system[dimension];
    const override = byDimension.get(dimension);
    return [dimension, readinessEntrySchema.parse({
      ratio: base.ratio,
      ready: override === undefined ? base.ready : override.ready,
      source: override === undefined ? "system" : "manual",
      missing: base.missing,
    })];
  }));
  return taskReadinessSchema.parse(merged);
}

/**
 * `overall` = 六段 ratio 的算术平均（用 fixture 的六个值反解得到：4.97/6 ≈ 0.83）。
 * 任一段 ratio 不是 finite → overall undefined，**不拿 0 顶替缺数那一段**。
 * 不做四舍五入：契约没有精度约定，格式化归前端。
 */
export function overallReadiness(readiness: TaskReadiness): RatioValue {
  const ratios = READINESS_DIMENSIONS.map((dimension) => readiness[dimension].ratio);
  if (ratios.some((ratio) => ratio.state !== "finite" || ratio.value === null)) {
    return { value: null, state: "undefined" };
  }
  const total = ratios.reduce((sum, ratio) => sum + (ratio.value as number), 0);
  return { value: total / ratios.length, state: "finite" };
}
