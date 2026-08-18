export type NumericInput = number | null | undefined;

export type RatioState = "finite" | "infinite" | "undefined";

export interface RatioValue {
  value: number | null;
  state: RatioState;
}

export type ComparisonValue = number | "NEW" | null;

export interface DerivedMetricInput {
  cost?: NumericInput;
  compensation?: NumericInput;
  channelCoefficient?: NumericInput;
  exposure?: NumericInput;
  click?: NumericInput;
  conversion?: NumericInput;
  realConversion?: NumericInput;
  attributionVolume?: NumericInput;
  assessmentPrice?: NumericInput;
  wakeUv?: NumericInput;
  potentialUv?: NumericInput;
  lastHourSpend?: NumericInput;
  elapsedDayFraction?: NumericInput;
  balance?: NumericInput;
}

export interface DerivedMetrics {
  ctr: RatioValue;
  cvr: RatioValue;
  realCpa: RatioValue;
  onTarget: boolean | null;
  cashCost: number | null;
  cashCpa: RatioValue;
  costSpace: number | null;
  gap: RatioValue;
  preDeductionGap: RatioValue;
  potentialRate: RatioValue;
  biConversionRate: RatioValue;
  velocity: number | null;
  estimatedDailySpend: number | null;
  outageCountdownHours: RatioValue;
}
