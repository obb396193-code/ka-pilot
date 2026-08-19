import {
  parseReportExecutionPlan,
  REPORT_METRIC_KEYS,
  type ReportDimensionKey,
  type ReportExecutionPlan,
  type ReportMetricKey,
} from "./report-plan.js";

export type ReportMetricState = "finite" | "infinite" | "undefined" | "missing";

export interface ReportMetricValue {
  value: number | null;
  state: ReportMetricState;
}

export type ReportMetricBag = Partial<Record<ReportMetricKey, ReportMetricValue>>;

export interface ReportTrendFact {
  ds: string;
  metrics: ReportMetricBag;
}

export interface ReportDimensionFact {
  dimensionKey: string | null;
  dimensionLabel: string | null;
  metrics: ReportMetricBag;
}

export interface ReportFactsBundle {
  workspaceId: string;
  dataCutoffAt: string;
  summary: ReportMetricBag | null;
  trend: readonly ReportTrendFact[] | null;
  dimensions: Partial<Record<ReportDimensionKey, readonly ReportDimensionFact[]>>;
}

interface ReportComponentBase {
  id: string;
  title: string;
  status: "ready" | "empty" | "missing";
}

export interface ReportKpiDataset extends ReportComponentBase {
  kind: "kpi";
  metric: ReportMetricKey;
  value: ReportMetricValue;
}

export interface ReportTrendPoint {
  ds: string;
  value: ReportMetricValue;
}

export interface ReportTrendDataset extends ReportComponentBase {
  kind: "trend";
  metric: ReportMetricKey;
  points: ReportTrendPoint[];
}

export interface ReportBreakdownRow {
  dimensionKey: string | null;
  dimensionLabel: string | null;
  metrics: ReportMetricBag;
}

export interface ReportBreakdownDataset extends ReportComponentBase {
  kind: "table" | "bar";
  dimension: ReportDimensionKey;
  metrics: ReportMetricKey[];
  rows: ReportBreakdownRow[];
}

export type ReportComponentDataset =
  | ReportKpiDataset
  | ReportTrendDataset
  | ReportBreakdownDataset;

export interface ReportDataset {
  version: ReportExecutionPlan["version"];
  workspaceId: string;
  title: string;
  scope: ReportExecutionPlan["scope"];
  dataCutoffAt: string;
  components: ReportComponentDataset[];
}

const METRIC_KEYS = new Set<string>(REPORT_METRIC_KEYS);
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function missingMetric(): ReportMetricValue {
  return { value: null, state: "missing" };
}

function assertMetricValue(value: ReportMetricValue, path: string): void {
  if (value.state === "finite") {
    if (typeof value.value !== "number" || !Number.isFinite(value.value)) {
      throw new Error(`${path} finite metric must contain a finite number`);
    }
    return;
  }
  if (value.value !== null) {
    throw new Error(`${path} non-finite metric state must contain null`);
  }
}

function assertMetricBag(bag: ReportMetricBag, path: string): void {
  for (const [key, value] of Object.entries(bag)) {
    if (!METRIC_KEYS.has(key)) throw new Error(`${path} contains an unsupported metric: ${key}`);
    if (value === undefined) throw new Error(`${path}.${key} must not be undefined`);
    assertMetricValue(value, `${path}.${key}`);
  }
}

function normalizeCutoff(value: string): string {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) throw new Error("dataCutoffAt must be a valid timestamp");
  return new Date(timestamp).toISOString();
}

function assertDate(value: string, path: string): void {
  if (!DATE_PATTERN.test(value)) throw new Error(`${path} must be a valid date`);
  const timestamp = Date.parse(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString().slice(0, 10) !== value) {
    throw new Error(`${path} must be a valid date`);
  }
}

function kpiDataset(
  component: Extract<ReportExecutionPlan["components"][number], { kind: "kpi" }>,
  summary: ReportMetricBag | null,
): ReportKpiDataset {
  const value = summary?.[component.metric] ?? missingMetric();
  return {
    id: component.id,
    title: component.title,
    kind: "kpi",
    status: value.state === "missing" ? "missing" : "ready",
    metric: component.metric,
    value,
  };
}

function trendDataset(
  component: Extract<ReportExecutionPlan["components"][number], { kind: "trend" }>,
  trend: readonly ReportTrendFact[] | null,
): ReportTrendDataset {
  if (trend === null) {
    return { ...component, status: "missing", points: [] };
  }
  const dates = new Set<string>();
  const points = trend.map((row, index) => {
    assertDate(row.ds, `trend[${index}].ds`);
    if (dates.has(row.ds)) throw new Error("trend dates must be unique");
    dates.add(row.ds);
    assertMetricBag(row.metrics, `trend[${index}].metrics`);
    return { ds: row.ds, value: row.metrics[component.metric] ?? missingMetric() };
  });
  points.sort((left, right) => left.ds.localeCompare(right.ds));
  const missing = points.some((point) => point.value.state === "missing");
  return {
    id: component.id,
    title: component.title,
    kind: "trend",
    status: points.length === 0 ? "empty" : missing ? "missing" : "ready",
    metric: component.metric,
    points,
  };
}

function selectedMetrics(
  metrics: readonly ReportMetricKey[],
  bag: ReportMetricBag,
): ReportMetricBag {
  return Object.fromEntries(
    metrics.map((metric) => [metric, bag[metric] ?? missingMetric()]),
  ) as ReportMetricBag;
}

function finiteSortValue(row: ReportBreakdownRow, metric: ReportMetricKey): number | null {
  const value = row.metrics[metric];
  return value?.state === "finite" ? value.value : null;
}

function compareBreakdownRows(
  left: ReportBreakdownRow,
  right: ReportBreakdownRow,
  metric: ReportMetricKey,
): number {
  const leftValue = finiteSortValue(left, metric);
  const rightValue = finiteSortValue(right, metric);
  if (leftValue !== null && rightValue !== null && leftValue !== rightValue) {
    return rightValue - leftValue;
  }
  if (leftValue !== null && rightValue === null) return -1;
  if (leftValue === null && rightValue !== null) return 1;
  return (left.dimensionKey ?? "").localeCompare(right.dimensionKey ?? "");
}

function breakdownDataset(
  component: Extract<
    ReportExecutionPlan["components"][number],
    { kind: "table" | "bar" }
  >,
  dimensions: ReportFactsBundle["dimensions"],
): ReportBreakdownDataset {
  const facts = dimensions[component.dimension];
  if (facts === undefined) {
    return { ...component, status: "missing", metrics: [...component.metrics], rows: [] };
  }
  const keys = new Set<string | null>();
  const rows = facts.map((fact, index) => {
    if (keys.has(fact.dimensionKey)) {
      throw new Error(`${component.dimension} dimension keys must be unique`);
    }
    keys.add(fact.dimensionKey);
    assertMetricBag(fact.metrics, `${component.dimension}[${index}].metrics`);
    return {
      dimensionKey: fact.dimensionKey,
      dimensionLabel: fact.dimensionLabel,
      metrics: selectedMetrics(component.metrics, fact.metrics),
    };
  });
  const firstMetric = component.metrics[0]!;
  rows.sort((left, right) => compareBreakdownRows(left, right, firstMetric));
  const limited = rows.slice(0, component.limit);
  const missing = limited.some((row) =>
    component.metrics.some((metric) => row.metrics[metric]?.state === "missing"),
  );
  return {
    id: component.id,
    title: component.title,
    kind: component.kind,
    status: limited.length === 0 ? "empty" : missing ? "missing" : "ready",
    dimension: component.dimension,
    metrics: [...component.metrics],
    rows: limited,
  };
}

export function assembleReportDataset(
  untrustedPlan: ReportExecutionPlan,
  facts: ReportFactsBundle,
): ReportDataset {
  const plan = parseReportExecutionPlan(untrustedPlan);
  if (facts.workspaceId.trim() === "") throw new Error("workspaceId is required");
  const dataCutoffAt = normalizeCutoff(facts.dataCutoffAt);
  if (facts.summary !== null) assertMetricBag(facts.summary, "summary");

  const components = plan.components.map((component): ReportComponentDataset => {
    if (component.kind === "kpi") return kpiDataset(component, facts.summary);
    if (component.kind === "trend") return trendDataset(component, facts.trend);
    return breakdownDataset(component, facts.dimensions);
  });

  return {
    version: plan.version,
    workspaceId: facts.workspaceId,
    title: plan.title,
    scope: plan.scope,
    dataCutoffAt,
    components,
  };
}
