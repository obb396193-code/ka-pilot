import { z } from "zod";
import { safeDivide } from "./metrics.js";
import type { RatioValue } from "./types.js";

/** Ordinary metrics use three states. Source health and ratio zero-denominators are separate contracts. */
export const canonicalMetricValueSchema = z.discriminatedUnion("availability", [
  z.object({ value: z.number().finite(), availability: z.literal("available") }).strict(),
  z.object({ value: z.null(), availability: z.literal("missing") }).strict(),
  z.object({ value: z.null(), availability: z.literal("error") }).strict(),
  /**
   * v1.9.27 ⑤ `pending` =「这个数还没到」（BI 类指标在 08:30–11:10 之间、T-1 还没回）。
   * 与 `missing`「这次查下来就是没有」不是一回事：混成同一个「−」，人分不清
   * 是再等一会儿还是永远不会有。前端镜像（apps/web canonical-query-rows）已按同形。
   */
  z.object({ value: z.null(), availability: z.literal("pending") }).strict(),
  /**
   * v1.9.35（老板拍板 B）`partial` = **部分合计**：窗口里有账户日缺数，返回的是「有数那部分的和」。
   * 它是**唯一带着真值的非 available 态**——正因为有值，前端才能显「不完整的合计」
   * 而不是一屏「−」；也正因为不完整，任何判定（达标/超成本）都必须挂起。
   * 只出现在**窗口聚合**上：账户日原始行、`account.table` 单日行不会是 partial。
   */
  z.object({ value: z.number().finite(), availability: z.literal("partial") }).strict(),
]);
export type CanonicalMetricValue = z.infer<typeof canonicalMetricValueSchema>;

/** Call after source-specific numeric decoding; invalid present fields must never silently become null. */
export function metricValue(input: unknown): CanonicalMetricValue {
  if (input === null || input === undefined) return { value: null, availability: "missing" };
  return canonicalMetricValueSchema.parse({ value: input, availability: "available" });
}

/** The caller supplies the complete expected member set, including absent account-days. */
export function sumMetricValues(values: readonly CanonicalMetricValue[]): CanonicalMetricValue {
  const parsed = values.map((value) => canonicalMetricValueSchema.parse(value));
  if (parsed.length === 0 || parsed.some((value) => value.availability !== "available")) {
    return metricValue(null);
  }
  return metricValue(parsed.reduce((sum, value) => sum + (value.value as number), 0));
}

/**
 * v1.9.35 窗口聚合专用的「部分合计」：缺几个账户日就把**有数的那部分**加起来，标 `partial`。
 *
 * 与 `sumMetricValues` 并存而**不是替换它**：账户日原始行、单日行的语义不变——
 * 那两处「缺一个就整体缺」是对的，一行的和本来就该要么完整要么没有。
 * 只有窗口聚合才有「给一半也有用」这回事（老板拍板 B：一屏「−」比不完整的数更没用）。
 *
 * 三态：全齐 `available` / 一个都没有 `missing` / 有一部分 `partial`（带真值）。
 * `partial` 成员参与求和时按它自己的值算，结果仍是 `partial`——不完整传递下去，不会中途变完整。
 */
export function sumMetricValuesPartial(values: readonly CanonicalMetricValue[]): CanonicalMetricValue {
  const parsed = values.map((value) => canonicalMetricValueSchema.parse(value));
  const usable = parsed.filter((value) => value.availability === "available" || value.availability === "partial");
  if (usable.length === 0) return metricValue(null);
  const total = usable.reduce((sum, value) => sum + (value.value as number), 0);
  if (!Number.isFinite(total)) throw new Error("Partial sum exceeds finite range");
  const complete = usable.length === parsed.length && parsed.every((value) => value.availability === "available");
  return canonicalMetricValueSchema.parse({
    value: total, availability: complete ? "available" : "partial",
  });
}

/** 这个值能不能拿来下判定：`partial` 不行——它是「一部分」，不是结论。 */
export function isCompleteMetric(value: CanonicalMetricValue): boolean {
  return value.availability === "available";
}

export function divideMetricValues(
  numerator: CanonicalMetricValue,
  denominator: CanonicalMetricValue,
  options: { infiniteWhenPositiveNumerator?: boolean } = {},
): RatioValue {
  const a = canonicalMetricValueSchema.parse(numerator);
  const b = canonicalMetricValueSchema.parse(denominator);
  const result = safeDivide(a.value, b.value, options);
  if (result.state === "finite" && !Number.isFinite(result.value)) {
    throw new Error("Metric ratio exceeds finite range");
  }
  return result;
}
