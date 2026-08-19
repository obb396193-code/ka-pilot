import { safeDivide } from "./metrics.js";
import {
  computeTaskPacing,
  type TaskPacing,
  type TaskPacingInput,
} from "./task-pacing.js";
import type { RatioValue } from "./types.js";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export interface DailyReportMetricInput {
  accountCount: number;
  cost: number;
  exposure: number;
  click: number;
  conversion: number;
  realConversion: number;
  cashCost: number;
  costSpace: number;
  wakeUv: number;
  potentialUv: number;
  anomalyRows: number;
}

export interface DailyReportMetricRatios {
  ctr: RatioValue;
  cvr: RatioValue;
  realCpa: RatioValue;
  cashCpa: RatioValue;
  gap: RatioValue;
  potentialRate: RatioValue;
  biConversionRate: RatioValue;
}

export interface DailyReportMetricFacts extends DailyReportMetricInput {
  ratios: DailyReportMetricRatios;
}

export interface DailyReportTaskInput {
  taskId: string;
  taskName: string | null;
  assessmentPrice: number | null;
  metrics: DailyReportMetricInput | null;
  pacing: TaskPacingInput;
}

export interface DailyReportTaskFacts {
  taskId: string;
  taskName: string | null;
  assessmentPrice: number | null;
  metrics: DailyReportMetricFacts | null;
  pacing: TaskPacing;
}

export interface DailyReportFactsInput {
  reportDate: string;
  dataCutoffAt: string;
  currentMetrics: DailyReportMetricInput | null;
  previousMetrics: DailyReportMetricInput | null;
  tasks: readonly DailyReportTaskInput[];
}

export interface DailyReportFacts {
  reportDate: string;
  dataCutoffAt: string;
  summary: DailyReportMetricFacts | null;
  previousSummary: DailyReportMetricFacts | null;
  tasks: DailyReportTaskFacts[];
  anomalyCount: number | null;
  missingFacts: string[];
}

function assertDate(value: string, field: string): void {
  if (!DATE_PATTERN.test(value)) throw new Error(`${field} must be YYYY-MM-DD`);
  const timestamp = Date.parse(`${value}T00:00:00.000Z`);
  if (
    !Number.isFinite(timestamp) ||
    new Date(timestamp).toISOString().slice(0, 10) !== value
  ) {
    throw new Error(`${field} must be a valid date`);
  }
}

function normalizeTimestamp(value: string): string {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    throw new Error("dataCutoffAt must be a valid timestamp");
  }
  return new Date(timestamp).toISOString();
}

function assertMetric(value: number, field: string, allowNegative = false): void {
  if (!Number.isFinite(value) || (!allowNegative && value < 0)) {
    throw new Error(`${field} must be a finite ${allowNegative ? "" : "nonnegative "}number`);
  }
}

function subtractOne(value: RatioValue): RatioValue {
  return value.state === "finite"
    ? { value: (value.value as number) - 1, state: "finite" }
    : value;
}

export function buildDailyReportMetricFacts(
  input: DailyReportMetricInput,
): DailyReportMetricFacts {
  const entries = Object.entries(input) as [keyof DailyReportMetricInput, number][];
  for (const [field, value] of entries) {
    assertMetric(value, field, field === "costSpace");
  }
  if (!Number.isInteger(input.accountCount) || !Number.isInteger(input.anomalyRows)) {
    throw new Error("accountCount and anomalyRows must be integers");
  }

  return {
    ...input,
    ratios: {
      ctr: safeDivide(input.click, input.exposure),
      cvr: safeDivide(input.conversion, input.click),
      realCpa: safeDivide(input.cost, input.realConversion, {
        infiniteWhenPositiveNumerator: true,
      }),
      cashCpa: safeDivide(input.cashCost, input.realConversion, {
        infiniteWhenPositiveNumerator: true,
      }),
      gap: subtractOne(safeDivide(input.conversion, input.realConversion)),
      potentialRate: safeDivide(input.potentialUv, input.wakeUv),
      biConversionRate: safeDivide(input.realConversion, input.potentialUv),
    },
  };
}

function taskFacts(
  input: DailyReportTaskInput,
  reportDate: string,
  missingFacts: string[],
): DailyReportTaskFacts {
  if (input.taskId.trim() === "") throw new Error("taskId is required");
  if (input.pacing.asOf !== reportDate) {
    throw new Error("task pacing asOf must equal reportDate");
  }
  if (
    input.assessmentPrice !== null &&
    (!Number.isFinite(input.assessmentPrice) || input.assessmentPrice <= 0)
  ) {
    throw new Error("assessmentPrice must be a finite positive number");
  }

  const path = `tasks.${input.taskId}`;
  if (input.assessmentPrice === null) missingFacts.push(`${path}.assessmentPrice`);
  if (input.pacing.budget === null || input.pacing.budget === undefined) {
    missingFacts.push(`${path}.budget`);
  }
  if (
    input.pacing.completedVolume === null ||
    input.pacing.completedVolume === undefined
  ) {
    missingFacts.push(`${path}.completedVolume`);
  }
  if (input.metrics === null) missingFacts.push(`${path}.metrics`);
  if (input.pacing.spent === null || input.pacing.spent === undefined) {
    missingFacts.push(`${path}.spent`);
  }
  if (
    input.pacing.targetVolume === null ||
    input.pacing.targetVolume === undefined
  ) {
    missingFacts.push(`${path}.targetVolume`);
  }

  return {
    taskId: input.taskId,
    taskName: input.taskName,
    assessmentPrice: input.assessmentPrice,
    metrics: input.metrics === null ? null : buildDailyReportMetricFacts(input.metrics),
    pacing: computeTaskPacing(input.pacing),
  };
}

export function assembleDailyReportFacts(
  input: DailyReportFactsInput,
): DailyReportFacts {
  assertDate(input.reportDate, "reportDate");
  const dataCutoffAt = normalizeTimestamp(input.dataCutoffAt);
  const missingFacts: string[] = [];
  if (input.currentMetrics === null) missingFacts.push("summary.current");
  if (input.previousMetrics === null) missingFacts.push("summary.previous");

  const seenTaskIds = new Set<string>();
  const tasks = input.tasks.map((task) => {
    if (seenTaskIds.has(task.taskId)) {
      throw new Error(`taskId must be unique: ${task.taskId}`);
    }
    seenTaskIds.add(task.taskId);
    return taskFacts(task, input.reportDate, missingFacts);
  });
  const summary =
    input.currentMetrics === null
      ? null
      : buildDailyReportMetricFacts(input.currentMetrics);

  return {
    reportDate: input.reportDate,
    dataCutoffAt,
    summary,
    previousSummary:
      input.previousMetrics === null
        ? null
        : buildDailyReportMetricFacts(input.previousMetrics),
    tasks,
    anomalyCount: summary?.anomalyRows ?? null,
    missingFacts: missingFacts.sort(),
  };
}
