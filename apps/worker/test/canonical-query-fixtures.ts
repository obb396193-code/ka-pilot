import {
  canonicalRowSchemaVersionByQueryId,
  safeDivide,
  type DataQueryId,
  type SourceQueryResult,
} from "@ka/domain";

export function canonicalMetrics(value: number) {
  return {
    cost: value,
    exposure: 100,
    click: 10,
    conversion: 2,
    realConversion: 1,
    cashCost: value,
    costSpace: 0,
    wakeUv: null,
    potentialUv: null,
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
  workspaceId = "workspace-server-side",
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
      budget: null,
      budgetUsageRate: null,
      deductionRate: null,
      mainAdCostProportion: null,
      assessmentPrice: null,
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
