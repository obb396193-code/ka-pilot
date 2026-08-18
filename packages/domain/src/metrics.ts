import type {
  ComparisonValue,
  DerivedMetricInput,
  DerivedMetrics,
  NumericInput,
  RatioValue,
} from "./types.js";

function isFiniteNumber(value: NumericInput): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function safeDivide(
  numerator: NumericInput,
  denominator: NumericInput,
  options: { infiniteWhenPositiveNumerator?: boolean } = {},
): RatioValue {
  if (!isFiniteNumber(numerator) || !isFiniteNumber(denominator)) {
    return { value: null, state: "undefined" };
  }
  if (denominator === 0) {
    if (options.infiniteWhenPositiveNumerator === true && numerator > 0) {
      return { value: null, state: "infinite" };
    }
    return { value: null, state: "undefined" };
  }
  return { value: numerator / denominator, state: "finite" };
}

export function compareAbsolute(
  current: NumericInput,
  previous: NumericInput,
): ComparisonValue {
  if (!isFiniteNumber(current) || !isFiniteNumber(previous)) {
    return null;
  }
  if (previous === 0) {
    return current > 0 ? "NEW" : current === 0 ? 0 : null;
  }
  return (current - previous) / previous;
}

export function compareRate(
  current: NumericInput,
  previous: NumericInput,
): ComparisonValue {
  if (!isFiniteNumber(current) || !isFiniteNumber(previous)) {
    return null;
  }
  if (previous === 0) {
    return current > 0 ? "NEW" : current === 0 ? 0 : null;
  }
  return current - previous;
}

export function computeDerivedMetrics(input: DerivedMetricInput): DerivedMetrics {
  const ctr = safeDivide(input.click, input.exposure);
  const cvr = safeDivide(input.conversion, input.click);
  const realCpa = safeDivide(input.cost, input.realConversion, {
    infiniteWhenPositiveNumerator: true,
  });

  const coefficient = input.channelCoefficient;
  const compensation = isFiniteNumber(input.compensation) ? input.compensation : 0;
  const cashCost =
    isFiniteNumber(input.cost) && isFiniteNumber(coefficient) && coefficient > 0
      ? (input.cost - compensation) / coefficient
      : null;
  const cashCpa = safeDivide(cashCost, input.realConversion, {
    infiniteWhenPositiveNumerator: true,
  });

  let onTarget: boolean | null = null;
  if (realCpa.state === "infinite") {
    onTarget = false;
  } else if (realCpa.state === "finite" && isFiniteNumber(input.assessmentPrice)) {
    onTarget = realCpa.value !== null && realCpa.value <= input.assessmentPrice;
  }

  const costSpace =
    isFiniteNumber(input.assessmentPrice) &&
    isFiniteNumber(input.realConversion) &&
    isFiniteNumber(cashCost)
      ? input.assessmentPrice * input.realConversion - cashCost
      : null;

  const gapBase = safeDivide(input.conversion, input.realConversion);
  const preDeductionBase = safeDivide(input.attributionVolume, input.realConversion);
  const velocity = isFiniteNumber(input.lastHourSpend) ? input.lastHourSpend : null;

  return {
    ctr,
    cvr,
    realCpa,
    onTarget,
    cashCost,
    cashCpa,
    costSpace,
    gap:
      gapBase.state === "finite"
        ? { value: (gapBase.value as number) - 1, state: "finite" }
        : gapBase,
    preDeductionGap:
      preDeductionBase.state === "finite"
        ? { value: (preDeductionBase.value as number) - 1, state: "finite" }
        : preDeductionBase,
    potentialRate: safeDivide(input.potentialUv, input.wakeUv),
    biConversionRate: safeDivide(input.realConversion, input.potentialUv),
    velocity,
    estimatedDailySpend:
      isFiniteNumber(input.cost) &&
      isFiniteNumber(input.elapsedDayFraction) &&
      input.elapsedDayFraction > 0
        ? input.cost / input.elapsedDayFraction
        : null,
    outageCountdownHours: safeDivide(input.balance, velocity, {
      infiniteWhenPositiveNumerator: true,
    }),
  };
}

export function meanIgnoringZeroSpend(values: readonly number[]): number | null {
  const included = values.filter((value) => Number.isFinite(value) && value !== 0);
  if (included.length === 0) {
    return null;
  }
  return included.reduce((sum, value) => sum + value, 0) / included.length;
}

export function isSpendAnomaly(
  currentSpend: NumericInput,
  historicalSpend: readonly number[],
): boolean {
  if (!isFiniteNumber(currentSpend)) {
    return false;
  }
  const mean = meanIgnoringZeroSpend(historicalSpend);
  return mean !== null && currentSpend > mean * 5;
}
