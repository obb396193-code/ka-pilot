import {
  canonicalMetricValueSchema,
  canonicalQueryRowSchemaById,
  accountSummaryRowSchema,
  safeDivide,
  metricValue,
  type AccountDailyRow,
  type AccountSummaryRow,
  type DataQueryId,
  type RatioValue,
} from "@ka/domain";

type RawRow = Record<string, unknown>;
type SourceKind = "ka_data" | "platform";

export class CanonicalQueryRowError extends Error {
  constructor() {
    super("Data source row did not match the canonical query contract");
    this.name = "CanonicalQueryRowError";
  }
}

function finite(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "" && /^-?\d+(?:\.\d+)?$/.test(value)) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  throw new CanonicalQueryRowError();
}

function firstNumber(row: RawRow, ...keys: string[]): number | null {
  for (const key of keys) {
    if (!Object.hasOwn(row, key) || row[key] === null) continue;
    return finite(row[key]);
  }
  return null;
}

function requiredCount(row: RawRow, ...keys: string[]): number {
  const value = firstNumber(row, ...keys);
  if (value === null || !Number.isInteger(value) || value < 0) throw new CanonicalQueryRowError();
  return value;
}

function kaBiConversion(row: RawRow): number | null {
  let result: number | null = null;
  for (const key of ["realConversion", "real_conversion", "conv"]) {
    if (!Object.hasOwn(row, key) || row[key] === null) continue;
    const value = finite(row[key]);
    if (result !== null && result !== value) throw new CanonicalQueryRowError();
    result = value;
  }
  return result;
}

function text(row: RawRow, ...keys: string[]): string | null {
  for (const key of keys) {
    if (!Object.hasOwn(row, key) || row[key] === null) continue;
    const value = row[key];
    if (typeof value === "string" && value.trim() !== "") return value;
    throw new CanonicalQueryRowError();
  }
  return null;
}

function optionalBoolean(row: RawRow, ...keys: string[]): boolean | null {
  for (const key of keys) {
    if (!Object.hasOwn(row, key) || row[key] === null) continue;
    if (typeof row[key] !== "boolean") throw new CanonicalQueryRowError();
    return row[key];
  }
  return null;
}

function requiredText(row: RawRow, ...keys: string[]): string {
  const value = text(row, ...keys);
  if (value === null) throw new CanonicalQueryRowError();
  return value;
}

function calendarDate(value: unknown): string {
  if (typeof value !== "string") throw new CanonicalQueryRowError();
  const compact = value.replaceAll("-", "");
  if (!/^\d{8}$/.test(compact)) throw new CanonicalQueryRowError();
  const result = `${compact.slice(0, 4)}-${compact.slice(4, 6)}-${compact.slice(6, 8)}`;
  const parsed = new Date(`${result}T00:00:00.000Z`);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== result) {
    throw new CanonicalQueryRowError();
  }
  return result;
}

function subtractOne(ratio: RatioValue): RatioValue {
  return ratio.state === "finite"
    ? { value: (ratio.value as number) - 1, state: "finite" }
    : ratio;
}

/**
 * v1.9.40：仓储对**部分合计**的列会带一份 `partial: string[]`（SQL 侧列名）。
 * 有值且在这份名单里 → `availability:"partial"`；没值仍是 `missing`。
 * 名单缺席时一切照旧（KA 源、老调用方不受影响）。
 */
export const PARTIAL_COLUMN_BY_FIELD: Record<string, string> = {
  cost: "cost", exposure: "exposure", click: "click", conversion: "conversion",
  realConversion: "real_conversion", cashCost: "cash_cost", costSpace: "cost_space",
  wakeUv: "wake_uv", potentialUv: "potential_uv",
};
function partialAware(row: RawRow, field: string, value: number | null) {
  const partial = (row as Record<string, unknown>).partial;
  if (value === null || !Array.isArray(partial)) return metricValue(value);
  const column = PARTIAL_COLUMN_BY_FIELD[field] ?? field;
  return partial.includes(column)
    ? canonicalMetricValueSchema.parse({ value, availability: "partial" })
    : metricValue(value);
}

function metricSet(row: RawRow, source: SourceKind) {
  const cost = firstNumber(row, "cost", "cost_yuan");
  const exposure = firstNumber(row, "exposure", "show");
  const click = firstNumber(row, "click");
  const conversion = firstNumber(row, "conversion", "conversions");
  // KA account conv comes from fact_conv (BI), not OCPX/media conversions.
  // Do not use it for both metrics or infer a missing media conversion count.
  const realConversion = source === "ka_data"
    ? kaBiConversion(row)
    : firstNumber(row, "realConversion", "real_conversion");
  const cashCost = firstNumber(row, "cashCost", "cash_cost", "cash_yuan");
  const costSpace = source === "platform" ? firstNumber(row, "costSpace") : null;
  // v1.9.27 ④：个人源（启航）有「激励」这一列；ka-data 没有 → 恒 null（= missing），
  // 不是 0。前端据此显「不支持」而不是「这段时间没有激励花费」。
  const incentiveCost = source === "platform"
    ? firstNumber(row, "incentiveCost", "incentive_cost") : null;
  const wakeUv = source === "platform" ? firstNumber(row, "wakeUv") : null;
  const potentialUv = source === "platform" ? firstNumber(row, "potentialUv") : null;
  return {
    cost: partialAware(row, "cost", cost),
    exposure: partialAware(row, "exposure", exposure),
    click: partialAware(row, "click", click),
    conversion: partialAware(row, "conversion", conversion),
    realConversion: partialAware(row, "realConversion", realConversion),
    cashCost: partialAware(row, "cashCost", cashCost),
    costSpace: partialAware(row, "costSpace", costSpace),
    incentiveCost: metricValue(incentiveCost),
    wakeUv: partialAware(row, "wakeUv", wakeUv),
    potentialUv: partialAware(row, "potentialUv", potentialUv),
    ratios: {
      ctr: safeDivide(click, exposure),
      cvr: safeDivide(conversion, click),
      realCpa: safeDivide(cost, realConversion, { infiniteWhenPositiveNumerator: true }),
      cashCpa: safeDivide(cashCost, realConversion, { infiniteWhenPositiveNumerator: true }),
      gap: subtractOne(safeDivide(conversion, realConversion)),
      potentialRate: safeDivide(potentialUv, wakeUv),
      biConversionRate: safeDivide(realConversion, potentialUv),
    },
  };
}

/** Reusable strict metric/count base for v2 and the v3 window assembler. */
export function canonicalSummaryBaseRow(row: RawRow, source: SourceKind): AccountSummaryRow {
  const parsed = accountSummaryRowSchema.safeParse({
    rowCount: requiredCount(row, "rowCount", "row_count"),
    accountCount: requiredCount(row, "accountCount", "account_count"),
    anomalyRows: source === "platform"
      ? requiredCount(row, "anomalyRows", "anomaly_rows")
      : null,
    metrics: metricSet(row, source),
  });
  if (!parsed.success) throw new CanonicalQueryRowError();
  return parsed.data;
}

function tasks(row: RawRow, source: SourceKind): AccountDailyRow["tasks"] {
  if (source === "ka_data") {
    const taskId = text(row, "task_id", "taskId");
    return taskId === null ? [] : [{
      taskId,
      taskName: text(row, "task_name", "taskName"),
      bizName: text(row, "biz_name", "bizName"),
    }];
  }
  if (!Object.hasOwn(row, "tasks") || row.tasks === null) return [];
  if (!Array.isArray(row.tasks)) throw new CanonicalQueryRowError();
  return row.tasks.map((task) => {
    if (typeof task !== "object" || task === null || Array.isArray(task)) {
      throw new CanonicalQueryRowError();
    }
    const item = task as RawRow;
    return {
      taskId: requiredText(item, "taskId"),
      taskName: text(item, "taskName"),
      bizName: text(item, "bizName"),
    };
  });
}

function dailyRow(row: RawRow, source: SourceKind, trustedWorkspaceId: string): AccountDailyRow {
  const base = metricSet(row, source);
  const dataAnomaly = optionalBoolean(row, "dataAnomaly", "data_anomaly");
  const computedAt = text(row, "computedAt");
  return {
    workspaceId: trustedWorkspaceId,
    media: requiredText(row, "media"),
    accountId: requiredText(row, "accountId", "account_id"),
    accountName: text(row, "accountName", "account_name"),
    ownerUserId: source === "platform" ? text(row, "ownerUserId") : null,
    ds: calendarDate(row.ds),
    metrics: {
      ...base,
      budget: metricValue(firstNumber(row, "budget")),
      budgetUsageRate: metricValue(firstNumber(row, "budgetUsageRate", "budget_usage_rate")),
      deductionRate: metricValue(firstNumber(row, "deductionRate", "deduction_rate")),
      mainAdCostProportion: metricValue(firstNumber(
        row,
        "mainAdCostProportion",
        "main_ad_cost_proportion",
      )),
      assessmentPrice: metricValue(firstNumber(row, "assessmentPriceSnapshot", "assessment")),
    },
    dataAnomaly,
    computedAt,
    tasks: tasks(row, source),
  };
}

function mappedRows(
  queryId: DataQueryId,
  source: SourceKind,
  rows: readonly RawRow[],
  trustedWorkspaceId: string,
): unknown[] {
  if (queryId === "account.summary" || queryId === "account.dimension") {
    // v3 assessment must come from the window calculator, never a guessed current price.
    return [...rows];
  }
  if (queryId === "account.trend") {
    return rows.map((row) => {
      const nested = row.metrics;
      const metrics = typeof nested === "object" && nested !== null && !Array.isArray(nested)
        ? nested as RawRow
        : row;
      if (Object.hasOwn(metrics, "rowCount") || Object.hasOwn(metrics, "row_count")) {
        return { ds: calendarDate(row.ds), metrics: canonicalSummaryBaseRow(metrics, source).metrics };
      }
      return { ds: calendarDate(row.ds), metrics };
    });
  }
  return rows.map((row) => dailyRow(row, source, trustedWorkspaceId));
}

export function canonicalizeQueryRows(
  queryId: DataQueryId,
  source: SourceKind,
  rows: readonly RawRow[],
  trustedWorkspaceId: string,
): Record<string, unknown>[] {
  const mapped = mappedRows(queryId, source, rows, trustedWorkspaceId);
  const schema = canonicalQueryRowSchemaById[queryId];
  return mapped.map((row) => {
    const parsed = schema.safeParse(row);
    if (!parsed.success) throw new CanonicalQueryRowError();
    return parsed.data as Record<string, unknown>;
  });
}

/** Only call on canonical rows: corruption must fail before transport masking. */
export function maskCanonicalQueryRows(
  queryId: DataQueryId,
  rows: readonly RawRow[],
  availability: "missing" | "error",
): RawRow[] {
  const schema = canonicalQueryRowSchemaById[queryId];
  function maskedMetrics(metrics: RawRow): RawRow {
    return Object.fromEntries(Object.entries(metrics).map(([key, value]) => [
      key,
      key === "ratios"
        ? Object.fromEntries(Object.keys(value as RawRow).map((name) => [name, { value: null, state: "undefined" }]))
        : { value: null, availability },
    ]));
  }
  return rows.map((row) => {
    const parsed = schema.safeParse(row);
    if (!parsed.success) throw new CanonicalQueryRowError();
    const clean = parsed.data as RawRow;
    const container = clean.metrics as RawRow;
    const result: RawRow = { ...clean, metrics: maskedMetrics(container) };
    if (queryId === "account.summary" || queryId === "account.dimension") {
      const assessment = clean.assessment as RawRow;
      result.assessment = { ...assessment, onTarget: null, costStatus: null,
        costStatusReason: assessment.costStatusReason === "assessment_missing" ? "assessment_missing" : "cash_missing",
        budgetUsageRate: { value: null, state: "undefined" },
      };
      if (clean.compare) {
        const compare = clean.compare as RawRow;
        result.compare = { ...compare, deltas: Object.fromEntries(Object.keys(compare.deltas as RawRow)
          .map((key) => [key, { value: null, state: "undefined" }])) };
      }
    }
    const masked = schema.safeParse(result);
    if (!masked.success) throw new CanonicalQueryRowError();
    return masked.data as RawRow;
  });
}
