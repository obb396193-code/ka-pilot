import type {
  ReportDimensionKey,
  ReportExecutionPlan,
  ReportFactsBundle,
  ReportMetricBag,
  ReportMetricValue,
} from "@ka/domain";
import { parseReportExecutionPlan } from "@ka/domain";

import type {
  MetricSummary,
  MetricTrendRow,
  SemanticDimensionQuery,
  SemanticDimensionRow,
  SemanticFilters,
  SemanticQueryScope,
} from "./semantic-query-types.js";

export interface SemanticReportQueryPort {
  querySummary(input: SemanticQueryScope): Promise<MetricSummary>;
  queryTrend(input: SemanticQueryScope): Promise<MetricTrendRow[]>;
  queryDimension(input: SemanticDimensionQuery): Promise<SemanticDimensionRow[]>;
}

export interface ReportDataCutoffProvider {
  resolve(input: {
    workspaceId: string;
    dateFrom: string;
    dateTo: string;
  }): Promise<string>;
}

export interface SemanticReportFactsInput {
  workspaceId: string;
  plan: ReportExecutionPlan;
}

function finite(value: number | null): ReportMetricValue {
  if (value === null) return { value: null, state: "missing" };
  if (!Number.isFinite(value)) throw new Error("Semantic metric must be finite");
  return { value, state: "finite" };
}

function ratio(value: MetricSummary["ratios"][keyof MetricSummary["ratios"]]): ReportMetricValue {
  if (value.state === "finite") {
    if (value.value === null || !Number.isFinite(value.value)) {
      throw new Error("Semantic ratio finite state must contain a finite value");
    }
    return { value: value.value, state: "finite" };
  }
  return { value: null, state: value.state };
}

export function reportMetricBag(summary: MetricSummary): ReportMetricBag {
  return {
    rowCount: finite(summary.rowCount),
    accountCount: finite(summary.accountCount),
    cost: finite(summary.cost),
    exposure: finite(summary.exposure),
    click: finite(summary.click),
    conversion: finite(summary.conversion),
    realConversion: finite(summary.realConversion),
    cashCost: finite(summary.cashCost),
    costSpace: finite(summary.costSpace),
    wakeUv: finite(summary.wakeUv),
    potentialUv: finite(summary.potentialUv),
    anomalyRows: finite(summary.anomalyRows),
    ctr: ratio(summary.ratios.ctr),
    cvr: ratio(summary.ratios.cvr),
    realCpa: ratio(summary.ratios.realCpa),
    cashCpa: ratio(summary.ratios.cashCpa),
    gap: ratio(summary.ratios.gap),
    potentialRate: ratio(summary.ratios.potentialRate),
    biConversionRate: ratio(summary.ratios.biConversionRate),
  };
}

function semanticScope(workspaceId: string, plan: ReportExecutionPlan): SemanticQueryScope {
  const filters: SemanticFilters = {};
  if (plan.scope.filters.taskId !== undefined) filters.taskId = plan.scope.filters.taskId;
  if (plan.scope.filters.accountId !== undefined) {
    filters.accountId = plan.scope.filters.accountId;
  }
  if (plan.scope.filters.ownerUserId !== undefined) {
    filters.ownerUserId = plan.scope.filters.ownerUserId;
  }
  if (plan.scope.filters.media !== undefined) filters.media = plan.scope.filters.media;
  return {
    workspaceId,
    dateFrom: plan.scope.dateFrom,
    dateTo: plan.scope.dateTo,
    filters,
  };
}

function requiredDimensions(plan: ReportExecutionPlan): ReportDimensionKey[] {
  return [
    ...new Set(
      plan.components.flatMap((component) =>
        component.kind === "table" || component.kind === "bar"
          ? [component.dimension]
          : [],
      ),
    ),
  ];
}

function mapTrend(rows: readonly MetricTrendRow[]) {
  return rows.map((row) => ({ ds: row.ds, metrics: reportMetricBag(row.metrics) }));
}

function mapDimension(rows: readonly SemanticDimensionRow[]) {
  return rows.map((row) => ({
    dimensionKey: row.dimensionKey,
    dimensionLabel: row.dimensionLabel,
    metrics: reportMetricBag(row.metrics),
  }));
}

export class SemanticReportFactsSource {
  constructor(
    private readonly queries: SemanticReportQueryPort,
    private readonly cutoff: ReportDataCutoffProvider,
  ) {}

  async load(input: SemanticReportFactsInput): Promise<ReportFactsBundle> {
    if (input.workspaceId.trim() === "") throw new Error("workspaceId is required");
    const plan = parseReportExecutionPlan(input.plan);
    const scope = semanticScope(input.workspaceId, plan);
    const needsSummary = plan.components.some((component) => component.kind === "kpi");
    const needsTrend = plan.components.some((component) => component.kind === "trend");
    const dimensions = requiredDimensions(plan);

    const [summary, trend, dataCutoffAt, dimensionEntries] = await Promise.all([
      needsSummary ? this.queries.querySummary(scope) : Promise.resolve(null),
      needsTrend ? this.queries.queryTrend(scope) : Promise.resolve(null),
      this.cutoff.resolve({
        workspaceId: input.workspaceId,
        dateFrom: plan.scope.dateFrom,
        dateTo: plan.scope.dateTo,
      }),
      Promise.all(
        dimensions.map(async (dimension) => [
          dimension,
          mapDimension(await this.queries.queryDimension({ ...scope, dimension })),
        ] as const),
      ),
    ]);

    return {
      workspaceId: input.workspaceId,
      dataCutoffAt,
      summary: summary === null ? null : reportMetricBag(summary),
      trend: trend === null ? null : mapTrend(trend),
      dimensions: Object.fromEntries(dimensionEntries),
    };
  }
}
