import type { NumericInput, RatioValue } from "./types.js";

export type RuleOutcome = "matched" | "not_matched" | "insufficient_data";
export type AlertRuleCode = "over_cost_ramp" | "zero_delivery" | "spend_cliff";
export type AlertSeverity = "P0" | "P1" | "P2";

export interface ConditionTrace {
  condition: string;
  outcome: RuleOutcome;
  actual?: number | boolean | string | null;
  expected?: number | boolean | string;
  reason: string;
}

export interface RuleEvaluation {
  ruleCode: AlertRuleCode;
  outcome: RuleOutcome;
  severity: AlertSeverity;
  trace: ConditionTrace[];
}

export interface OverCostRampInput {
  realCpa?: NumericInput | RatioValue;
  assessmentPrice?: NumericInput;
  cost?: NumericInput;
  lifecycleStage?: string | null;
  realConversion?: NumericInput;
}

export interface ZeroDeliveryInput {
  entityAgeHours?: NumericInput;
  cost?: NumericInput;
}

export interface SpendCliffInput {
  spendChange?: NumericInput | "NEW";
  hadManualBudgetChange?: boolean | null | undefined;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

const KNOWN_LIFECYCLE_STAGES = new Set([
  "cold_start",
  "ramping",
  "scaling",
  "stable",
  "declining",
  "paused",
  "closed",
]);

function hasKnownLifecycleStage(value: string | null | undefined): value is string {
  return typeof value === "string" && KNOWN_LIFECYCLE_STAGES.has(value);
}

function combineAll(trace: readonly ConditionTrace[]): RuleOutcome {
  if (trace.some((item) => item.outcome === "not_matched")) {
    return "not_matched";
  }
  if (trace.some((item) => item.outcome === "insufficient_data")) {
    return "insufficient_data";
  }
  return "matched";
}

function result(
  ruleCode: AlertRuleCode,
  severity: AlertSeverity,
  trace: ConditionTrace[],
): RuleEvaluation {
  return { ruleCode, severity, trace, outcome: combineAll(trace) };
}

function overCostSampleTrace(input: OverCostRampInput): ConditionTrace {
  if (!hasKnownLifecycleStage(input.lifecycleStage)) {
    return {
      condition: "cold_start_sample_guard",
      outcome: "insufficient_data",
      reason: "账户生命周期缺失或未知，无法选择普通或冷启动阈值",
    };
  }
  if (input.lifecycleStage !== "cold_start") {
    return {
      condition: "cold_start_sample_guard",
      outcome: "matched",
      actual: input.lifecycleStage,
      expected: "not_cold_start",
      reason: "非冷启动账户使用普通阈值",
    };
  }
  if (!isFiniteNumber(input.realConversion)) {
    return {
      condition: "cold_start_sample_guard",
      outcome: "insufficient_data",
      reason: "冷启动账户缺少真实转化量，不能判断样本是否充足",
    };
  }
  const enough = input.realConversion >= 10;
  return {
    condition: "cold_start_sample_guard",
    outcome: enough ? "matched" : "not_matched",
    actual: input.realConversion,
    expected: 10,
    reason: enough ? "冷启动样本已达到判断门槛" : "冷启动真实转化少于 10，按护栏不判超成本",
  };
}

function overCostSpendTrace(cost: NumericInput): ConditionTrace {
  if (!isFiniteNumber(cost)) {
    return {
      condition: "minimum_spend",
      outcome: "insufficient_data",
      reason: "缺少当日消耗，不能判断起量门槛",
    };
  }
  const matched = cost > 3000;
  return {
    condition: "minimum_spend",
    outcome: matched ? "matched" : "not_matched",
    actual: cost,
    expected: 3000,
    reason: matched ? "当日消耗超过 3000" : "当日消耗未超过 3000",
  };
}

function normalizeRatio(value: OverCostRampInput["realCpa"]): RatioValue {
  if (isFiniteNumber(value)) {
    return { value, state: "finite" };
  }
  if (typeof value === "object" && value !== null && "state" in value) {
    return value;
  }
  return { value: null, state: "undefined" };
}

type CpaThreshold = { threshold: number; multiplier: number };

function resolveCpaThreshold(input: OverCostRampInput): CpaThreshold | ConditionTrace {
  if (!isFiniteNumber(input.assessmentPrice) || input.assessmentPrice < 0) {
    return {
      condition: "cpa_threshold",
      outcome: "insufficient_data",
      reason: "缺少有效考核价，不能计算超成本阈值",
    };
  }
  if (!hasKnownLifecycleStage(input.lifecycleStage)) {
    return {
      condition: "cpa_threshold",
      outcome: "insufficient_data",
      reason: "账户生命周期缺失或未知，不能确定阈值倍数",
    };
  }
  const multiplier = input.lifecycleStage === "cold_start" ? 1.5 : 1.2;
  return { threshold: input.assessmentPrice * multiplier, multiplier };
}

function overCostCpaTrace(input: OverCostRampInput): ConditionTrace {
  const thresholdResult = resolveCpaThreshold(input);
  if ("outcome" in thresholdResult) {
    return thresholdResult;
  }
  const { threshold, multiplier } = thresholdResult;
  const ratio = normalizeRatio(input.realCpa);
  if (ratio.state === "infinite") {
    return {
      condition: "cpa_threshold",
      outcome: "matched",
      actual: "infinite",
      expected: threshold,
      reason: "真实 CPA 为无穷，已超过有限考核阈值",
    };
  }
  if (ratio.state !== "finite" || !isFiniteNumber(ratio.value)) {
    return {
      condition: "cpa_threshold",
      outcome: "insufficient_data",
      actual: ratio.state,
      expected: threshold,
      reason: "真实 CPA 无有效数值",
    };
  }
  const matched = ratio.value > threshold;
  return {
    condition: "cpa_threshold",
    outcome: matched ? "matched" : "not_matched",
    actual: ratio.value,
    expected: threshold,
    reason: matched
      ? `真实 CPA 超过考核价的 ${multiplier} 倍`
      : `真实 CPA 未超过考核价的 ${multiplier} 倍`,
  };
}

export function evaluateOverCostRamp(input: OverCostRampInput): RuleEvaluation {
  return result("over_cost_ramp", "P0", [
    overCostSampleTrace(input),
    overCostSpendTrace(input.cost),
    overCostCpaTrace(input),
  ]);
}

export function evaluateZeroDelivery(input: ZeroDeliveryInput): RuleEvaluation {
  const ageTrace: ConditionTrace = isFiniteNumber(input.entityAgeHours)
    ? {
        condition: "entity_age",
        outcome: input.entityAgeHours >= 24 ? "matched" : "not_matched",
        actual: input.entityAgeHours,
        expected: 24,
        reason:
          input.entityAgeHours >= 24 ? "实体已创建至少 24 小时" : "实体创建未满 24 小时",
      }
    : {
        condition: "entity_age",
        outcome: "insufficient_data",
        reason: "缺少实体创建时间，不能判断 24 小时窗口",
      };
  const costTrace: ConditionTrace = isFiniteNumber(input.cost)
    ? {
        condition: "zero_spend",
        outcome: input.cost === 0 ? "matched" : "not_matched",
        actual: input.cost,
        expected: 0,
        reason: input.cost === 0 ? "窗口内消耗为 0" : "窗口内已有消耗",
      }
    : {
        condition: "zero_spend",
        outcome: "insufficient_data",
        reason: "缺少窗口内消耗",
      };
  return result("zero_delivery", "P1", [ageTrace, costTrace]);
}

export function evaluateSpendCliff(input: SpendCliffInput): RuleEvaluation {
  const spendTrace: ConditionTrace = isFiniteNumber(input.spendChange)
    ? {
        condition: "spend_change",
        outcome: input.spendChange <= -0.3 ? "matched" : "not_matched",
        actual: input.spendChange,
        expected: -0.3,
        reason:
          input.spendChange <= -0.3 ? "消耗较基线下降至少 30%" : "消耗降幅不足 30%",
      }
    : {
        condition: "spend_change",
        outcome: "insufficient_data",
        actual: input.spendChange ?? null,
        reason: "缺少可比较的消耗变化率",
      };
  const operationTrace: ConditionTrace =
    typeof input.hadManualBudgetChange === "boolean"
      ? {
          condition: "manual_budget_change_exclusion",
          outcome: input.hadManualBudgetChange ? "not_matched" : "matched",
          actual: input.hadManualBudgetChange,
          expected: false,
          reason: input.hadManualBudgetChange
            ? "窗口内存在主动预算调整，按规则排除"
            : "窗口内没有主动预算调整",
        }
      : {
          condition: "manual_budget_change_exclusion",
          outcome: "insufficient_data",
          reason: "缺少预算操作史，不能排除主动调整",
        };
  return result("spend_cliff", "P1", [spendTrace, operationTrace]);
}
