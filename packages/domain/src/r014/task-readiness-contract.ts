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

/* ── S6b：系统可推导的就绪度 ───────────────────────────────────────── */

export interface TaskReadinessFacts {
  /** 任务下挂的账户数（task_accounts 去重三键）。 */
  accountCount: number;
  /** 余额 > 0 的账户数。 */
  rechargedCount: number;
  /** 至少有一个 unit 的账户数。 */
  builtCount: number;
  /** 余额不足的账户，用于 missing 明细。 */
  unfundedAccounts: readonly string[];
  /** 还没有 unit 的账户，用于 missing 明细。 */
  unbuiltAccounts: readonly string[];
}

/** 系统推不出来的三段：products / materials / strategy 目前没有任何数据源。 */
const WITHOUT_SYSTEM_SOURCE: readonly ReadinessDimension[] = ["products", "materials", "strategy"];

/**
 * 从库里真有的事实推六段就绪度。
 *
 * - `accounts` / `recharge` / `infra` 有源：分别看挂没挂户、有没有余额、有没有单元；
 * - `products` / `materials` / `strategy` **没有任何系统来源**（商品与素材的表要等 016，
 *   策略没有落点）→ ratio `undefined`、ready `false`、missing 写明「需人工确认」。
 *   **不把「没有数据源」算成 0 分**——0 分意味着「查过了，一个都没准备好」，那是两回事。
 * - 任务下一个户都没有时，recharge / infra 的分母是 0 → 同样 `undefined` 而不是 0。
 */
export function deriveSystemReadiness(
  facts: TaskReadinessFacts,
): Record<ReadinessDimension, SystemReadinessEntry> {
  const ratio = (numerator: number, denominator: number): RatioValue =>
    denominator <= 0 ? { value: null, state: "undefined" } : { value: numerator / denominator, state: "finite" };

  const accounts: SystemReadinessEntry = {
    ratio: facts.accountCount > 0 ? { value: 1, state: "finite" } : { value: 0, state: "finite" },
    ready: facts.accountCount > 0,
    missing: facts.accountCount > 0 ? [] : ["任务下还没有账户"],
  };
  const recharge: SystemReadinessEntry = {
    ratio: ratio(facts.rechargedCount, facts.accountCount),
    ready: facts.accountCount > 0 && facts.rechargedCount === facts.accountCount,
    missing: facts.unfundedAccounts.map((accountId) => `${accountId} 余额不足`),
  };
  const infra: SystemReadinessEntry = {
    ratio: ratio(facts.builtCount, facts.accountCount),
    ready: facts.accountCount > 0 && facts.builtCount === facts.accountCount,
    missing: facts.unbuiltAccounts.map((accountId) => `${accountId} 无单元`),
  };

  const result = { accounts, recharge, infra } as Record<ReadinessDimension, SystemReadinessEntry>;
  for (const dimension of WITHOUT_SYSTEM_SOURCE) {
    result[dimension] = {
      ratio: { value: null, state: "undefined" },
      ready: false,
      missing: ["无系统来源，需人工确认"],
    };
  }
  return result;
}
