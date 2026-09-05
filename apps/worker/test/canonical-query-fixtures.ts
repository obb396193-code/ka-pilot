import { metricValue } from "@ka/domain";
import {
  canonicalRowSchemaVersionByQueryId,
  safeDivide,
  type DataQueryId,
  type SourceQueryResult,
} from "@ka/domain";

export function canonicalMetrics(value: number) {
  return {
    cost: metricValue(value),
    exposure: metricValue(100),
    click: metricValue(10),
    conversion: metricValue(2),
    realConversion: metricValue(1),
    cashCost: metricValue(value),
    costSpace: metricValue(0),
    wakeUv: metricValue(null),
    potentialUv: metricValue(null),
    ratios: {
      ctr: safeDivide(10, 100),
      cvr: safeDivide(2, 10),
      realCpa: safeDivide(value, 1, { infiniteWhenPositiveNumerator: true }),
      cashCpa: safeDivide(value, 1, { infiniteWhenPositiveNumerator: true }),
      gap: { value: 1, state: "finite" as const },
      potentialRate: { value: null, state: "undefined" as const },
      biConversionRate: { value: null, state: "undefined" as const },
    },
  };
}

export function canonicalRow(
  queryId: DataQueryId,
  value: number,
  workspaceId = "00000000-0000-4000-8000-000000000024",
  accountId = "allowed-account",
): Record<string, unknown> {
  const metrics = canonicalMetrics(value);
  const summary = { rowCount: 1, accountCount: 1, anomalyRows: 0, metrics };
  if (queryId === "account.summary") return summary;
  if (queryId === "account.trend") return { ds: "2026-08-24", metrics: summary };
  return {
    workspaceId,
    media: "KUAISHOU",
    accountId,
    accountName: null,
    ownerUserId: null,
    ds: "2026-08-24",
    metrics: {
      ...metrics,
      budget: metricValue(null),
      budgetUsageRate: metricValue(null),
      deductionRate: metricValue(null),
      mainAdCostProportion: metricValue(null),
      assessmentPrice: metricValue(null),
    },
    dataAnomaly: queryId === "account.anomalies" ? true : false,
    computedAt: null,
    tasks: [],
  };
}

export function readySource(
  queryId: DataQueryId,
  source: "ka_data" | "canonical",
  rows: Record<string, unknown>[],
): SourceQueryResult {
  return {
    queryId,
    rowSchemaVersion: canonicalRowSchemaVersionByQueryId[queryId],
    status: "ready",
    rows,
    returnedRowCount: rows.length,
    wholeResultTotal: { value: rows.length, availability: "available" },
    lineage: {
      workspaceKind: "personal",
      source,
      datasetVersion: null,
      queryTemplateVersion: "v1",
      metricVersion: "fixture-v1",
      dataAsOf: null,
      timezone: null,
      dayCut: null,
      metadataAvailability: "unknown",
      authority: {
        policyVersion: "2026-08-24",
        useCase: "cross_media_operations",
        role: "default_authoritative",
      },
      objectIdentity: {
        objectType: "account",
        joinKeys: ["workspace_id", "media", "account_id"],
      },
      coverage: { complete: true },
      truncated: false,
      partial: false,
    },
    warnings: [],
  };
}
