// Synthetic envelopes matching the live Platform repository shapes at de31f3a.
const lineage = {
  source: "canonical",
  datasetVersion: null,
  queryTemplateVersion: "v1",
  metricVersion: "platform-v1",
  dataAsOf: "2026-08-24T07:59:00.000Z",
  timezone: "Asia/Shanghai",
  dayCut: "calendar_day",
  metadataAvailability: "partial",
  authority: { policyVersion: "2026-08-24", useCase: "realtime_delivery", role: "default_authoritative" },
  objectIdentity: { objectType: "account", joinKeys: ["workspace_id", "media", "account_id"] },
  coverage: { complete: true, requestedObjects: 1, returnedObjects: 1 },
  truncated: false,
  partial: false,
} as const

const ratios = {
  ctr: { value: 221 / 2700, state: "finite" },
  cvr: { value: 27 / 221, state: "finite" },
  realCpa: { value: 270 / 23, state: "finite" },
  cashCpa: { value: 216 / 23, state: "finite" },
  gap: { value: 27 / 23 - 1, state: "finite" },
  potentialRate: { value: 0.5, state: "finite" },
  biConversionRate: { value: 23 / 55, state: "finite" },
} as const

export const platformMetricSummary = {
  rowCount: 3,
  accountCount: 2,
  cost: 270,
  exposure: 2700,
  click: 221,
  conversion: 27,
  realConversion: 23,
  cashCost: 216,
  costSpace: 34,
  wakeUv: 110,
  potentialUv: 55,
  anomalyRows: 1,
  ratios,
} as const

function singleSource(rows: readonly Record<string, unknown>[], wholeResultTotal: number) {
  return {
    ok: true,
    data: {
      mode: "platform",
      source: {
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

export const platformSummaryEnvelope = singleSource([platformMetricSummary], 3)
export const platformTrendEnvelope = singleSource([
  { ds: "2026-08-23", metrics: { ...platformMetricSummary, cost: 250, ratios: { ...ratios, realCpa: { value: 12.5, state: "finite" } } } },
  { ds: "2026-08-24", metrics: platformMetricSummary },
], 2)

export const platformTableRow = {
  workspaceId: "00000000-0000-4000-8000-000000000024",
  accountId: "account-demo-07",
  accountName: "脱敏账户 07",
  media: "KUAISHOU",
  ownerUserId: "buc-user-demo",
  ds: "2026-08-24",
  cost: 120,
  exposure: 1200,
  click: 96,
  conversion: 10,
  realConversion: 8,
  realCpa: 15,
  cashCost: 96,
  cashCpa: 12,
  costSpace: 4,
  gap: 0.25,
  budget: 500,
  budgetUsageRate: 0.24,
  deductionRate: null,
  mainAdCostProportion: null,
  assessmentPriceSnapshot: 38,
  wakeUv: 40,
  potentialUv: 20,
  dataAnomaly: true,
  computedAt: "2026-08-24T07:59:00.000Z",
  tasks: [{ taskId: "task-demo", taskName: "AAC 拉新", bizName: "拉新" }],
} as const

export const platformTableEnvelope = singleSource([platformTableRow], 1)
export const platformAnomaliesEnvelope = singleSource([platformTableRow], 1)
