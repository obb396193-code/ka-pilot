const canonicalAvailable = (value: number) => ({ value, availability: "available" as const })
const missingMetric = { value: null, availability: "missing" } as const

import { canonicalRowSchemaVersionByQueryId, type DataQueryId } from "./canonical-query-rows.ts"

const lineage = {
  workspaceKind: "personal",
  source: "canonical",
  datasetVersion: "canonical-20260824-01",
  queryTemplateVersion: "v1",
  metricVersion: "canonical-v1",
  dataAsOf: "2026-08-24T07:59:00.000Z",
  timezone: "Asia/Shanghai",
  dayCut: "calendar_day",
  metadataAvailability: "known",
  authority: { policyVersion: "2026-08-24", useCase: "realtime_delivery", role: "default_authoritative" },
  objectIdentity: { objectType: "account", joinKeys: ["workspace_id", "media", "account_id"] },
  coverage: { complete: true, requestedObjects: 1, returnedObjects: 1 },
  truncated: false,
  partial: false,
} as const

const ratios = {
  ctr: { value: 0.0819, state: "finite" },
  cvr: { value: 0.1222, state: "finite" },
  realCpa: { value: 11.74, state: "finite" },
  cashCpa: { value: 9.39, state: "finite" },
  gap: { value: 0.1739, state: "finite" },
  potentialRate: { value: 0.5, state: "finite" },
  biConversionRate: { value: 0.4182, state: "finite" },
} as const

const summaryMetrics = {
  cost: canonicalAvailable(270),
  exposure: canonicalAvailable(2700),
  click: canonicalAvailable(221),
  conversion: canonicalAvailable(27),
  realConversion: canonicalAvailable(23),
  cashCost: canonicalAvailable(216),
  costSpace: canonicalAvailable(34),
  wakeUv: canonicalAvailable(110),
  potentialUv: canonicalAvailable(55),
  ratios,
} as const

export const canonicalSummaryRow = {
  rowCount: 3,
  accountCount: 2,
  anomalyRows: 1,
  metrics: summaryMetrics,
} as const

function singleSource(queryId: DataQueryId, rows: readonly Record<string, unknown>[], wholeResultTotal: number) {
  return {
    ok: true,
    data: {
      mode: "platform",
      source: {
        queryId,
        rowSchemaVersion: canonicalRowSchemaVersionByQueryId[queryId],
        status: "ready",
        rows,
        returnedRowCount: rows.length,
        wholeResultTotal: { value: wholeResultTotal, availability: "available" },
        lineage,
        warnings: [],
      },
    },
  } as const
}

export const canonicalSummaryEnvelope = singleSource("account.summary", [canonicalSummaryRow], 3)
export const canonicalTrendEnvelope = singleSource("account.trend", [
  { ds: "2026-08-23", metrics: { ...canonicalSummaryRow, metrics: { ...summaryMetrics, cost: canonicalAvailable(250), ratios: { ...ratios, realCpa: { value: 12.5, state: "finite" } } } } },
  { ds: "2026-08-24", metrics: canonicalSummaryRow },
], 2)

export const canonicalTableRow = {
  workspaceId: "00000000-0000-4000-8000-000000000024",
  accountId: "account-demo-07",
  accountName: "脱敏账户 07",
  media: "KUAISHOU",
  ownerUserId: "buc-user-demo",
  ds: "2026-08-24",
  metrics: {
    ...summaryMetrics,
    cost: canonicalAvailable(120),
    realConversion: canonicalAvailable(8),
    ratios: { ...ratios, realCpa: { value: 15, state: "finite" }, cashCpa: { value: 12, state: "finite" } },
    budget: canonicalAvailable(500),
    budgetUsageRate: canonicalAvailable(0.24),
    deductionRate: missingMetric,
    mainAdCostProportion: missingMetric,
    assessmentPrice: canonicalAvailable(38),
  },
  dataAnomaly: true,
  computedAt: null,
  tasks: [{ taskId: "task-demo", taskName: "AAC 拉新", bizName: "拉新" }],
} as const

export const canonicalTableEnvelope = singleSource("account.table", [canonicalTableRow], 1)
export const canonicalAnomaliesEnvelope = singleSource("account.anomalies", [canonicalTableRow], 1)
