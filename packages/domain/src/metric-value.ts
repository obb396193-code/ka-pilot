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
