import type { RatioValue } from "@ka/domain";

export type SemanticSortField = "ds" | "accountId" | "cost" | "realCpa" | "computedAt";
export type SortDirection = "asc" | "desc";
export type SupportedDimension = "account" | "task" | "biz";

export interface SemanticAccountScope {
  media: string;
  accountId: string;
}

export interface SemanticFilters {
  taskId?: string;
  accountId?: string;
  accountIds?: string[];
  accountScopes?: SemanticAccountScope[];
  ownerUserId?: string;
  media?: string;
  dataAnomaly?: boolean;
}

export interface SemanticQueryScope {
  workspaceId: string;
  dateFrom: string;
  dateTo: string;
  filters?: SemanticFilters;
}

export interface SemanticTableQuery extends SemanticQueryScope {
  page?: number;
  pageSize?: number;
  sortBy?: SemanticSortField;
  sortDirection?: SortDirection;
}

export interface RelatedTask {
  taskId: string;
  taskName: string | null;
  bizName: string | null;
}

export interface SemanticTableRow {
  workspaceId: string;
  accountId: string;
  accountName: string | null;
  media: string;
  ownerUserId: string | null;
  ds: string;
  cost: number | null;
  exposure: number | null;
  click: number | null;
  conversion: number | null;
  realConversion: number | null;
  realCpa: number | null;
  cashCost: number | null;
  cashCpa: number | null;
  costSpace: number | null;
  gap: number | null;
  budget: number | null;
  budgetUsageRate: number | null;
  deductionRate: number | null;
  mainAdCostProportion: number | null;
  assessmentPriceSnapshot: number | null;
  wakeUv: number | null;
  potentialUv: number | null;
  dataAnomaly: boolean;
  computedAt: string;
  tasks: RelatedTask[];
}

export interface SemanticTableResult {
  rows: SemanticTableRow[];
  total: number;
  page: number;
  pageSize: number;
}

export interface MetricRatios {
  ctr: RatioValue;
  cvr: RatioValue;
  realCpa: RatioValue;
  cashCpa: RatioValue;
  gap: RatioValue;
  potentialRate: RatioValue;
  biConversionRate: RatioValue;
}

export interface MetricSummary {
  rowCount: number;
  accountCount: number;
  cost: number | null;
  exposure: number | null;
  click: number | null;
  conversion: number | null;
  realConversion: number | null;
  cashCost: number | null;
  costSpace: number | null;
  wakeUv: number | null;
  potentialUv: number | null;
  anomalyRows: number;
  ratios: MetricRatios;
}

export interface MetricTrendRow {
  ds: string;
  metrics: MetricSummary;
}

export interface SemanticDimensionQuery extends SemanticQueryScope {
  dimension: SupportedDimension;
}

export interface SemanticDimensionRow {
  dimensionKey: string | null;
  dimensionLabel: string | null;
  /** Internal account grouping identity; never infer media from dimensionKey. */
  accountIdentity?: SemanticAccountScope & { workspaceId: string };
  metrics: MetricSummary;
}

export interface CoverageHealth {
  canonicalRows: number;
  accountsInScope: number;
  accountsWithCanonical: number;
  dateCount: number;
  expectedAccountDays: number;
  missingAccountDays: number;
}

export interface RawResourceHealth {
  resource: string;
  rowCount: number;
  latestFetchedAt: string;
}

export interface EtlStatusHealth {
  status: string;
  runCount: number;
  latestStartedAt: string | null;
  latestFinishedAt: string | null;
}

export interface QualityHealth {
  passedChecks: number;
  failedChecks: number;
  unknownChecks: number;
  latestCheckedAt: string | null;
}

export interface SemanticHealthResult {
  coverage: CoverageHealth;
  rawResources: RawResourceHealth[];
  etlStatuses: EtlStatusHealth[];
  quality: QualityHealth;
}

export interface SemanticLineageResult {
  dataAsOf: string | null;
  canonicalRows: number;
  returnedAccounts: number;
  requestedAccountDays: number;
  returnedAccountDays: number;
  /** Internal task-effective date proof, from the expected grid in the same read snapshot. */
  requestedDates?: string[] | undefined;
}

export class AmbiguousTaskMappingError extends Error {
  constructor(
    readonly accountId: string,
    readonly ds: string,
    readonly taskIds: readonly string[],
  ) {
    super(`Account ${accountId} has overlapping task mappings on ${ds}`);
    this.name = "AmbiguousTaskMappingError";
  }
}
