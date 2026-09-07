import { z } from "zod";

// v1.5 10.11 分级决策。策略阈值存 decision_policies 一行 JSONB；
// tier 判定是纯函数（agent 不算数，判定不落在 LLM 手里）。

export const decisionTierSchema = z.enum(["auto", "card_confirm", "proposal", "investigate", "escalate"]);
export type DecisionTier = z.infer<typeof decisionTierSchema>;

const ratioValueSchema = z.object({
  value: z.number().finite().nullable(),
  state: z.enum(["finite", "infinite", "undefined"]),
}).strict();

export const decisionPolicySchema = z.object({
  confidenceMin: z.number().min(0).max(1),
  historicalSuccessRateMin: z.number().min(0).max(1),
  recentManualOpsWindowHours: z.number().int().positive().max(720),
  dailyCapCny: z.number().nonnegative(),
}).strict();
export type DecisionPolicy = z.infer<typeof decisionPolicySchema>;

/** 契约没给默认值；这套是 api.md 10.11 括号里点名的阈值，作为未配置时的保守起点。 */
export const DEFAULT_DECISION_POLICY: DecisionPolicy = {
  confidenceMin: 0.9,
  historicalSuccessRateMin: 0.8,
  recentManualOpsWindowHours: 24,
  dailyCapCny: 0,
};

export const decisionGatesSchema = z.object({
  confidence: ratioValueSchema,
  historicalSuccessRate: ratioValueSchema,
  recentManualOps: z.number().int().nonnegative(),
  reversible: z.boolean(),
  withinCap: z.boolean(),
}).strict();
export type DecisionGates = z.infer<typeof decisionGatesSchema>;

export const decisionSchema = z.object({
  tier: decisionTierSchema,
  gates: decisionGatesSchema,
  overriddenBy: z.literal("history").nullable(),
  reason: z.string().min(1),
}).strict();
export type Decision = z.infer<typeof decisionSchema>;

export interface DecisionInput {
  /** 规则的自治度档位（1 仅建议 / 2 确认后执行 / 3 自动+事后汇报）。 */
  autonomyLevel: 1 | 2 | 3;
  gates: DecisionGates;
  policy: DecisionPolicy;
}

/**
 * api.md 10.11：`auto` 只在规则处于自治度第 3 档且门全过；否则**最高 card_confirm**。
 * 这里只判 auto / card_confirm 两档——proposal / investigate / escalate 由规则类型与严重度决定，
 * 不由本函数发明。
 *
 * 保守取向（真金白银的自动改价改预算，宁可少自动一次）：
 * - 置信度、历史成功率缺数（state 非 finite）一律**当不过**，不按 0 也不放行；
 * - `recentManualOps > 0` 当不过——窗口内有人刚动过手，系统不抢方向盘。
 *   （契约只给了 `recentManualOpsWindowHours` 这个"窗口"，没写门限；此处按 0 实现并已回抛 arch。）
 * - `overriddenBy` 恒为 null：fixture 里 recentManualOps=1 却 overriddenBy=null，
 *   说明它不由手动操作触发；触发条件契约未定义，不猜。
 */
export function evaluateDecisionTier(input: DecisionInput): Decision {
  const gates = decisionGatesSchema.parse(input.gates);
  const policy = decisionPolicySchema.parse(input.policy);

  const failures: string[] = [];
  if (gates.confidence.state !== "finite" || gates.confidence.value === null) {
    failures.push("置信度缺数，不自动执行");
  } else if (gates.confidence.value < policy.confidenceMin) {
    failures.push(`置信度 <${policy.confidenceMin}，走确认卡`);
  }
  if (gates.historicalSuccessRate.state !== "finite" || gates.historicalSuccessRate.value === null) {
    failures.push("历史成功率缺数，不自动执行");
  } else if (gates.historicalSuccessRate.value < policy.historicalSuccessRateMin) {
    failures.push(`历史成功率 <${policy.historicalSuccessRateMin}，走确认卡`);
  }
  if (gates.recentManualOps > 0) {
    failures.push(`近 ${policy.recentManualOpsWindowHours} 小时内有 ${gates.recentManualOps} 次人工操作，交回人工确认`);
  }
  if (!gates.reversible) failures.push("该动作不可逆，走确认卡");
  if (!gates.withinCap) failures.push("超出单日影响金额上限，走确认卡");

  if (input.autonomyLevel !== 3) {
    failures.unshift(
      input.autonomyLevel === 1 ? "规则处于「仅建议」档" : "规则处于「确认后执行」档",
    );
  }

  return decisionSchema.parse({
    tier: failures.length === 0 ? "auto" : "card_confirm",
    gates,
    overriddenBy: null,
    reason: failures.length === 0 ? "自治度第 3 档且各项门限全过，自动执行并事后汇报" : failures[0],
  });
}
