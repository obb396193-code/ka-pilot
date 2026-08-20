export type HourlyDeltaField =
  | "cost"
  | "exposure"
  | "click"
  | "conversion"
  | "realConversion";

export interface HourlyAdMetric {
  readonly adId: string;
  readonly accountId: string;
  readonly ds: string;
  readonly hh: number;
  readonly cost: number;
  readonly exposure: number;
  readonly click: number;
  readonly conversion: number;
  readonly realConversion: number;
  readonly bid: number;
  readonly budget: number;
  readonly lastSyncTime: string | null;
  readonly dataCorrectionFields: readonly HourlyDeltaField[];
}

export type HourlyMetricIssue =
  | Readonly<{ code: "incomplete_current_snapshot"; adId: string }>
  | Readonly<{ code: "data_correction"; adId: string; fields: readonly HourlyDeltaField[] }>;

export interface DeriveHourlyAdMetricsInput {
  currentHh: number;
  previousRows: readonly Record<string, unknown>[];
  currentRows: readonly Record<string, unknown>[];
}

export interface HourlyAdMetricsResult {
  readonly rows: readonly HourlyAdMetric[];
  readonly issues: readonly HourlyMetricIssue[];
}

interface ParsedCumulativeRow {
  adId: string;
  accountId: string;
  ds: string;
  cost: number;
  exposure: number;
  click: number;
  conversion: number;
  realConversion: number;
  bid: number;
  budget: number;
  lastSyncTime: string | null;
}

const DELTA_FIELDS: readonly HourlyDeltaField[] = Object.freeze([
  "cost",
  "exposure",
  "click",
  "conversion",
  "realConversion",
]);

export function deriveHourlyAdMetrics(
  input: DeriveHourlyAdMetricsInput,
): HourlyAdMetricsResult {
  assertHour(input.currentHh);
  const previous = indexRows(input.previousRows, "previous");
  const current = indexRows(input.currentRows, "current");
  const rows: HourlyAdMetric[] = [];
  const issues: HourlyMetricIssue[] = [];

  for (const [adId, previousRow] of previous) {
    if (!current.has(adId)) {
      issues.push(Object.freeze({ code: "incomplete_current_snapshot", adId }));
    } else {
      assertSameIdentity(previousRow, current.get(adId)!);
    }
  }

  for (const currentRow of [...current.values()].sort((left, right) =>
    left.adId.localeCompare(right.adId))) {
    const previousRow = previous.get(currentRow.adId);
    const corrections = correctedFields(previousRow, currentRow);
    if (corrections.length > 0) {
      issues.push(Object.freeze({
        code: "data_correction",
        adId: currentRow.adId,
        fields: corrections,
      }));
    }
    rows.push(toHourlyRow(input.currentHh, previousRow, currentRow, corrections));
  }

  return Object.freeze({ rows: Object.freeze(rows), issues: Object.freeze(issues) });
}

function indexRows(
  rows: readonly Record<string, unknown>[],
  label: string,
): Map<string, ParsedCumulativeRow> {
  const indexed = new Map<string, ParsedCumulativeRow>();
  for (const raw of rows) {
    const parsed = parseRow(raw);
    if (indexed.has(parsed.adId)) throw new Error(`${label} snapshot contains duplicate ad_id`);
    indexed.set(parsed.adId, parsed);
  }
  return indexed;
}

function parseRow(row: Record<string, unknown>): ParsedCumulativeRow {
  return {
    adId: requiredText(row.ad_id, "ad_id"),
    accountId: requiredText(row.account_id, "account_id"),
    ds: normalizeDate(requiredText(row.ds, "ds")),
    cost: requiredMetric(row.ad_cost_h, "ad_cost_h"),
    exposure: requiredMetric(row.ad_exposure_h, "ad_exposure_h"),
    click: requiredMetric(row.ad_click_h, "ad_click_h"),
    conversion: requiredMetric(row.ad_conversion_h, "ad_conversion_h"),
    realConversion: requiredMetric(row.ad_real_conversion_h, "ad_real_conversion_h"),
    bid: requiredMetric(row.ad_bid_h, "ad_bid_h"),
    budget: requiredMetric(row.ad_budget_h, "ad_budget_h"),
    lastSyncTime: optionalText(row.last_sync_time, "last_sync_time"),
  };
}

function correctedFields(
  previous: ParsedCumulativeRow | undefined,
  current: ParsedCumulativeRow,
): readonly HourlyDeltaField[] {
  if (previous === undefined) return Object.freeze([]);
  return Object.freeze(DELTA_FIELDS.filter((field) => current[field] < previous[field]));
}

function toHourlyRow(
  hh: number,
  previous: ParsedCumulativeRow | undefined,
  current: ParsedCumulativeRow,
  corrections: readonly HourlyDeltaField[],
): HourlyAdMetric {
  const baseline = previous ?? zeroBaseline(current);
  return Object.freeze({
    adId: current.adId,
    accountId: current.accountId,
    ds: current.ds,
    hh,
    cost: Math.max(0, current.cost - baseline.cost),
    exposure: Math.max(0, current.exposure - baseline.exposure),
    click: Math.max(0, current.click - baseline.click),
    conversion: Math.max(0, current.conversion - baseline.conversion),
    realConversion: Math.max(0, current.realConversion - baseline.realConversion),
    bid: current.bid,
    budget: current.budget,
    lastSyncTime: current.lastSyncTime,
    dataCorrectionFields: corrections,
  });
}

function zeroBaseline(current: ParsedCumulativeRow): ParsedCumulativeRow {
  return { ...current, cost: 0, exposure: 0, click: 0, conversion: 0, realConversion: 0 };
}

function assertSameIdentity(previous: ParsedCumulativeRow, current: ParsedCumulativeRow): void {
  if (previous.accountId !== current.accountId) throw new Error("ad_id changed account_id");
  if (previous.ds !== current.ds) throw new Error("ad_id changed ds");
}

function requiredText(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim() === "") throw new Error(`${field} is required`);
  return value;
}

function optionalText(value: unknown, field: string): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") throw new Error(`${field} must be a string`);
  return value;
}

function requiredMetric(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new Error(`${field} must be a finite nonnegative number`);
  }
  return value;
}

function normalizeDate(value: string): string {
  const compact = value.replaceAll("-", "");
  if (!/^\d{8}$/.test(compact)) throw new Error("ds must use YYYYMMDD or YYYY-MM-DD");
  const iso = `${compact.slice(0, 4)}-${compact.slice(4, 6)}-${compact.slice(6, 8)}`;
  const date = new Date(`${iso}T00:00:00.000Z`);
  if (Number.isNaN(date.valueOf()) || date.toISOString().slice(0, 10) !== iso) {
    throw new Error("ds must be a valid date");
  }
  return iso;
}

function assertHour(value: number): void {
  if (!Number.isInteger(value) || value < 0 || value > 23) {
    throw new Error("currentHh must be an integer between 0 and 23");
  }
}
