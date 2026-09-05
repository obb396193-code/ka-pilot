import {
  canonicalQueryRowSchemaById,
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

function metricSet(row: RawRow, source: SourceKind) {
  const cost = firstNumber(row, "cost", "cost_yuan");
  const exposure = firstNumber(row, "exposure", "show");
  const click = firstNumber(row, "click");
  const conversion = firstNumber(row, "conversion", "conversions", "conv");
  const realConversion = firstNumber(row, "realConversion", "real_conversion");
  const cashCost = firstNumber(row, "cashCost", "cash_cost", "cash_yuan");
  const costSpace = source === "platform" ? firstNumber(row, "costSpace") : null;
  const wakeUv = source === "platform" ? firstNumber(row, "wakeUv") : null;
  const potentialUv = source === "platform" ? firstNumber(row, "potentialUv") : null;
  return {
    cost: metricValue(cost),
    exposure: metricValue(exposure),
    click: metricValue(click),
    conversion: metricValue(conversion),
    realConversion: metricValue(realConversion),
    cashCost: metricValue(cashCost),
    costSpace: metricValue(costSpace),
    wakeUv: metricValue(wakeUv),
    potentialUv: metricValue(potentialUv),
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

function summaryRow(row: RawRow, source: SourceKind): AccountSummaryRow {
  return {
    rowCount: requiredCount(row, "rowCount", "row_count"),
    accountCount: requiredCount(row, "accountCount", "account_count"),
    anomalyRows: source === "platform"
      ? requiredCount(row, "anomalyRows", "anomaly_rows")
      : null,
    metrics: metricSet(row, source),
  };
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
  if (queryId === "account.summary") {
    return rows.map((row) => summaryRow(row, source));
  }
  if (queryId === "account.trend") {
    return rows.map((row) => {
      const nested = row.metrics;
      const metrics = typeof nested === "object" && nested !== null && !Array.isArray(nested)
        ? nested as RawRow
        : row;
      return { ds: calendarDate(row.ds), metrics: summaryRow(metrics, source) };
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
    const result = queryId === "account.trend"
      ? { ...clean, metrics: { ...container, metrics: maskedMetrics(container.metrics as RawRow) } }
      : { ...clean, metrics: maskedMetrics(container) };
    const masked = schema.safeParse(result);
    if (!masked.success) throw new CanonicalQueryRowError();
    return masked.data as RawRow;
  });
}
