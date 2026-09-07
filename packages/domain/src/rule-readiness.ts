import { z } from "zod";

const availability = z.enum(["available", "missing", "error"]);
export const ruleReadinessSchema = z.object({
  initialFullDone: z.boolean(),
  source: z.object({
    kind: z.enum(["realtime", "offline"]),
    dataAsOf: z.date().nullable(),
    freshnessMaxHours: z.number().finite().positive().optional(),
  }).strict(),
  requiredMetrics: z.record(z.string().min(1).max(128), availability)
    .refine((metrics) => Object.keys(metrics).length > 0 && Object.keys(metrics).length <= 128, "Expected referenced metric set"),
  availabilityPolicy: z.enum(["suppress", "evaluate_available_only"]).optional(),
}).strict();
export type RuleReadiness = z.infer<typeof ruleReadinessSchema>;
export type RuleCoverageState = "checked" | "pending" | "undeterminable";
export interface RuleReadinessDecision {
  coverage: RuleCoverageState;
  reason: "ok" | "INITIAL_FULL_PENDING" | "SOURCE_STALE" | "METRIC_MISSING";
  leaves: Array<{ metric: string; availability: "available" | "missing" | "error" }>;
}

/** Internal trusted provider evidence, not a browser/HTTP DTO or freshness inferred from request time. */
export function assessRuleReadiness(input: unknown, now: Date): RuleReadinessDecision {
  const checkedNow = z.date().parse(now);
  const evidence = ruleReadinessSchema.parse(input);
  const leaves = Object.entries(evidence.requiredMetrics).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
    .map(([metric, state]) => ({ metric, availability: state }));
  if (!evidence.initialFullDone) return { coverage: "pending", reason: "INITIAL_FULL_PENDING", leaves };
  const freshnessHours = evidence.source.freshnessMaxHours ?? (evidence.source.kind === "realtime" ? 6 : 30);
  const asOf = evidence.source.dataAsOf?.getTime();
  if (asOf === undefined || asOf > checkedNow.getTime() || (checkedNow.getTime() - asOf) / 3600000 > freshnessHours) {
    return { coverage: "pending", reason: "SOURCE_STALE", leaves };
  }
  if (leaves.some((leaf) => leaf.availability !== "available")) return { coverage: "undeterminable", reason: "METRIC_MISSING", leaves };
  return { coverage: "checked", reason: "ok", leaves };
}
