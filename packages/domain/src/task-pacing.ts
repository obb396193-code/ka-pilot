import { safeDivide } from "./metrics.js";
import type { NumericInput, RatioValue } from "./types.js";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 24 * 60 * 60 * 1_000;

export interface TaskPacingInput {
  periodStart: string;
  periodEnd: string;
  asOf: string;
  targetVolume?: NumericInput;
  completedVolume?: NumericInput;
  budget?: NumericInput;
  spent?: NumericInput;
  recentDailyVolumes: readonly number[];
  remainingEffectiveDays?: readonly string[];
}

export interface TaskPacing {
  elapsedDays: number;
  totalDays: number;
  remainingDays: number;
  targetProgress: RatioValue;
  timeProgress: RatioValue;
  recentDailyAverage: number | null;
  projectedVolume: number | null;
  projectedCompletion: RatioValue;
  projectedGap: number | null;
  requiredDailyVolume: RatioValue;
  budgetProgress: RatioValue;
}

function parseDate(value: string, field: string): number {
  if (!DATE_PATTERN.test(value)) {
    throw new Error(`${field} must be YYYY-MM-DD`);
  }
  const timestamp = Date.parse(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(timestamp)) {
    throw new Error(`${field} must be a valid date`);
  }
  if (new Date(timestamp).toISOString().slice(0, 10) !== value) {
    throw new Error(`${field} must be a valid date`);
  }
  return timestamp;
}

function nonnegativeFact(value: NumericInput, field: string): number | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${field} must be a finite nonnegative number`);
  }
  return value;
}

function countInclusiveDays(start: number, end: number): number {
  return Math.floor((end - start) / DAY_MS) + 1;
}

function countCalendarRemainingDays(
  periodStart: number,
  periodEnd: number,
  asOf: number,
): number {
  const firstRemainingDay = Math.max(periodStart, asOf + DAY_MS);
  return firstRemainingDay > periodEnd
    ? 0
    : countInclusiveDays(firstRemainingDay, periodEnd);
}

function countEffectiveRemainingDays(
  values: readonly string[],
  periodStart: number,
  periodEnd: number,
  asOf: number,
): number {
  const unique = new Set<number>();
  for (const value of values) {
    const timestamp = parseDate(value, "remainingEffectiveDays");
    if (
      timestamp < periodStart ||
      timestamp > periodEnd ||
      timestamp <= asOf ||
      unique.has(timestamp)
    ) {
      throw new Error(
        "remainingEffectiveDays must be unique dates after asOf within the task period",
      );
    }
    unique.add(timestamp);
  }
  return unique.size;
}

function recentAverage(values: readonly number[]): number | null {
  for (const value of values) {
    if (!Number.isFinite(value) || value < 0) {
      throw new Error("recentDailyVolumes must contain finite nonnegative numbers");
    }
  }
  const recent = values.slice(-7);
  return recent.length === 0
    ? null
    : recent.reduce((sum, value) => sum + value, 0) / recent.length;
}

export function computeTaskPacing(input: TaskPacingInput): TaskPacing {
  const periodStart = parseDate(input.periodStart, "periodStart");
  const periodEnd = parseDate(input.periodEnd, "periodEnd");
  const asOf = parseDate(input.asOf, "asOf");
  if (periodStart > periodEnd) {
    throw new Error("periodStart must not be after periodEnd");
  }

  const targetVolume = nonnegativeFact(input.targetVolume, "targetVolume");
  const completedVolume = nonnegativeFact(
    input.completedVolume,
    "completedVolume",
  );
  const budget = nonnegativeFact(input.budget, "budget");
  const spent = nonnegativeFact(input.spent, "spent");

  const totalDays = countInclusiveDays(periodStart, periodEnd);
  const elapsedDays =
    asOf < periodStart
      ? 0
      : asOf >= periodEnd
        ? totalDays
        : countInclusiveDays(periodStart, asOf);
  const remainingDays = input.remainingEffectiveDays
    ? countEffectiveRemainingDays(
        input.remainingEffectiveDays,
        periodStart,
        periodEnd,
        asOf,
      )
    : countCalendarRemainingDays(periodStart, periodEnd, asOf);
  const average = recentAverage(input.recentDailyVolumes);
  const projectedVolume =
    completedVolume === null
      ? null
      : remainingDays === 0
        ? completedVolume
        : average === null
          ? null
          : completedVolume + average * remainingDays;
  const projectedGap =
    targetVolume === null || projectedVolume === null
      ? null
      : Math.max(0, targetVolume - projectedVolume);
  const remainingTarget =
    targetVolume === null || completedVolume === null
      ? null
      : Math.max(0, targetVolume - completedVolume);

  return {
    elapsedDays,
    totalDays,
    remainingDays,
    targetProgress: safeDivide(completedVolume, targetVolume),
    timeProgress: safeDivide(elapsedDays, totalDays),
    recentDailyAverage: average,
    projectedVolume,
    projectedCompletion: safeDivide(projectedVolume, targetVolume),
    projectedGap,
    requiredDailyVolume: safeDivide(remainingTarget, remainingDays, {
      infiniteWhenPositiveNumerator: true,
    }),
    budgetProgress: safeDivide(spent, budget),
  };
}
