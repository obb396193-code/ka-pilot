import type { CostStatus, Fixture, MetricValue, RatioValue } from "@/lib/fixtures/contract"
import tableV3 from "@contract/fixtures/data-query/table-v3.json"
import summaryGreen from "@contract/fixtures/data-query/summary-window-v3-green.json"
import summaryYellow from "@contract/fixtures/data-query/summary-window-v3-yellow.json"
import summaryCashMissing from "@contract/fixtures/data-query/summary-window-v3-cash-missing.json"
import trendV3 from "@contract/fixtures/data-query/trend-v3.json"
import dimensionV3 from "@contract/fixtures/data-query/dimension-v3.json"
import dimensionUnsupported from "@contract/fixtures/data-query/dimension-unsupported.json"
import hourly from "@contract/fixtures/data-query/hourly.json"
import gap from "@contract/fixtures/data-query/gap.json"
import pivot2 from "@contract/fixtures/data-query/pivot2.json"
import exportQueued from "@contract/fixtures/exports/queued.json"
import watchlist from "@contract/fixtures/me/watchlist.json"
import views from "@contract/fixtures/me/views.json"
import reportConfig from "@contract/fixtures/reports/config-v1.json"
import reportRender from "@contract/fixtures/reports/render.json"

// 数据分析页的 fixture 读取层（fixture 即契约）。类型按 api.md v3 手写，JSON 用 as 断言；不算数。
export type Ratios = { ctr: RatioValue; cvr: RatioValue; realCpa: RatioValue; cashCpa: RatioValue; gap: RatioValue; potentialRate: RatioValue; biConversionRate: RatioValue }
export type MetricsV3 = { cost: MetricValue; cashCost: MetricValue; exposure: MetricValue; click: MetricValue; conversion: MetricValue; realConversion: MetricValue; costSpace: MetricValue; wakeUv: MetricValue; potentialUv: MetricValue; ratios: Ratios }
export type AssessmentV3 = { price: { value: number; effectiveDate: string } | null; onTarget: boolean | null; costStatus: CostStatus; costStatusReason: string; budgetUsageRate?: RatioValue }
export type WindowPreset = "today" | "yesterday" | "last_7d" | "month_to_date" | "last_month" | "task_period" | "custom"
export type Lineage = { source: string; workspaceKind?: "personal" | "team"; window?: { from: string; to: string; preset?: WindowPreset }; dataAsOf?: string; metricVersion?: string; coverage?: { complete: boolean }; truncated?: boolean; partial?: boolean }
export type QuerySource<TRow> = { queryId: string; rowSchemaVersion: string; status: "ready" | "partial" | "stale" | "empty"; rows: TRow[]; returnedRowCount: number; wholeResultTotal: MetricValue; lineage: Lineage; warnings: string[]; dimension?: string; groupBy?: string; dimA?: string; dimB?: string }
export type QueryFixture<TRow> = Fixture<{ mode: string; source: QuerySource<TRow> }>

export type TableRow = { workspaceId: string; media: string; accountId: string; accountName: string; ds: string; tasks: { taskId: string; taskName: string }[]; dataAnomaly: boolean; metrics: MetricsV3; assessment: AssessmentV3 }
export type SummaryRow = { rowCount: number; accountCount: number; anomalyRows: number; metrics: MetricsV3; assessment: AssessmentV3 }
export type TrendRow = { ds: string; metrics: MetricsV3 }
export type DimensionRow = { key: string; label: string; metrics: MetricsV3; assessment: AssessmentV3; anomaly: boolean }
export type HourlyRow = { media: string; accountId: string; hh: number; cumulative: { cost: MetricValue; cashCost: MetricValue; conversion: MetricValue; realConversion: MetricValue }; delta: { cost: MetricValue; cashCost: MetricValue; conversion: MetricValue; realConversion: MetricValue }; ratios: { cashCpa: RatioValue; realCpa: RatioValue }; velocity: { costPerHour: MetricValue }; projectedDayCost: MetricValue; budgetUsage: RatioValue; lastSyncAt: string | null }
export type GapRow = { group: { key: string; label: string }; conversion: MetricValue; realConversion: MetricValue; gap: RatioValue; preDeductionGap: RatioValue; deductionRate: RatioValue; gapStatus: "normal" | "high" | "missing" }
export type Pivot2Row = { a: { key: string; label: string }; b: { key: string; label: string }; metrics: MetricsV3; assessment: AssessmentV3 }

export const windowPresets: { value: WindowPreset; label: string }[] = [
  { value: "today", label: "今天" },
  { value: "yesterday", label: "昨天" },
  { value: "last_7d", label: "近 7 天" },
  { value: "month_to_date", label: "本月至今" },
  { value: "last_month", label: "上月" },
  { value: "task_period", label: "任务期" },
  { value: "custom", label: "自定义" },
]
export const windowLabel = (preset?: WindowPreset | string) => windowPresets.find((item) => item.value === preset)?.label ?? "自定义"

export const tableFixture = tableV3 as unknown as QueryFixture<TableRow>
export const summaryFixtures = {
  green: summaryGreen as unknown as QueryFixture<SummaryRow>,
  yellow: summaryYellow as unknown as QueryFixture<SummaryRow>,
  "cash-missing": summaryCashMissing as unknown as QueryFixture<SummaryRow>,
}
export type SummaryVariant = keyof typeof summaryFixtures
export const trendFixture = trendV3 as unknown as QueryFixture<TrendRow>
export const hourlyFixture = hourly as unknown as QueryFixture<HourlyRow>
export const gapFixture = gap as unknown as QueryFixture<GapRow> & { meta?: { ruleSetVersion?: string } }
export const pivot2Fixture = pivot2 as unknown as QueryFixture<Pivot2Row> & { meta?: { cellCoverage?: { cells: number; withData: number; undeterminable: number } } }
export const exportQueuedFixture = exportQueued as unknown as Fixture<{ exportId: string; status: string; kind: string; format: string }>
export const watchlistFixture = watchlist as unknown as Fixture<{ items: { media: string; accountId: string }[]; updatedAt: string }>
export type SavedView = { id: string; page: string; name: string; config: { version: string; filters: Record<string, string>; columns: string[]; sort: { by: string; dir: string }[]; window: { preset: WindowPreset } }; isShared: boolean; updatedAt: string }
export const viewsFixture = views as unknown as Fixture<{ items: SavedView[] }>
export type ReportConfig = { id: string; name: string; config: { version: string; dataset: { queryId: string; params: Record<string, unknown> }; groupBy: string[]; columns: { metric: string; label?: string }[]; sort: { by: string; dir: string }[]; filters: unknown[]; highlight: { metric: string; op: string; value: unknown; style: string }[]; layout: { type: "table" | "chart" } }; isShared: boolean; version: string; updatedAt: string }
export const reportConfigFixture = reportConfig as unknown as Fixture<ReportConfig>
export type RenderRow = { group: Record<string, string>; metrics: { cost: MetricValue; ratios: { cashCpa: RatioValue } }; assessment: { onTarget: boolean | null } }
export const reportRenderFixture = reportRender as unknown as Fixture<{ rows: RenderRow[]; columns: { key: string; label: string }[]; highlights: { rowIndex: number; metric: string; style: string }[]; lineage: Lineage }>

// 8 维透视：契约枚举 + 各维现状（ubp 永久无源；bid_tool 映射表未提案；agent_type 只账户级）
export type Dimension = "task" | "biz" | "account" | "agent_type" | "resource_position" | "bid_tool" | "ubp" | "deduction_range"
export const dimensions: { value: Dimension; label: string }[] = [
  { value: "task", label: "任务" },
  { value: "biz", label: "业务" },
  { value: "account", label: "账户" },
  { value: "agent_type", label: "代理 / 自投" },
  { value: "resource_position", label: "资源位" },
  { value: "bid_tool", label: "出价工具" },
  { value: "ubp", label: "UBP" },
  { value: "deduction_range", label: "扣量区间" },
]
const dimensionReady = dimensionV3 as unknown as QueryFixture<DimensionRow>
const dimensionUnsupportedFixture = dimensionUnsupported as unknown as { ok: false; error: { code: string; message: string; dimension: string; hint: string } }

const missing: MetricValue = { value: null, availability: "missing" }
const undef: RatioValue = { value: null, state: "undefined" }
const emptyMetrics = (): MetricsV3 => ({ cost: missing, cashCost: missing, exposure: missing, click: missing, conversion: missing, realConversion: missing, costSpace: missing, wakeUv: missing, potentialUv: missing, ratios: { ctr: undef, cvr: undef, realCpa: undef, cashCpa: undef, gap: undef, potentialRate: undef, biConversionRate: undef } })
const emptyAssessment = (): AssessmentV3 => ({ price: null, onTarget: null, costStatus: null, costStatusReason: "assessment_missing" })

// TODO-fixture:data-query/dimension-v3-{task,biz,account,agent_type,deduction_range}.json —— 契约只给了资源位一维样例；
// 这里按 api.md 自造最小 mock：只有维度值，指标全部 missing（显 −），不造真实感数据。arch 补 fixture 后删。
function minimalDimension(dimension: Dimension, labels: string[]): QueryFixture<DimensionRow> {
  return { ok: true, data: { mode: "platform", source: { queryId: "account.dimension", rowSchemaVersion: "account.dimension/v3", status: "partial", dimension, rows: labels.map((label, index) => ({ key: `${dimension}-${index + 1}`, label, metrics: emptyMetrics(), assessment: emptyAssessment(), anomaly: false })), returnedRowCount: labels.length, wholeResultTotal: { value: labels.length, availability: "available" }, lineage: { source: "canonical", workspaceKind: "personal", window: { from: "2026-09-01", to: "2026-09-05", preset: "month_to_date" }, coverage: { complete: false }, truncated: false, partial: true }, warnings: ["TODO-fixture：该维度样例待 arch 补，指标先显 −"] } }, meta: { requestId: "fe-minimal-mock", _note: "前端自造最小 mock" } }
}
export const dimensionFixtures: Record<Dimension, QueryFixture<DimensionRow> | { unsupported: true; message: string }> = {
  resource_position: dimensionReady,
  task: minimalDimension("task", ["AAC 拉新", "示例任务 B"]),
  biz: minimalDimension("biz", ["拉新", "促活"]),
  account: minimalDimension("account", ["AAC拉新_快手_01", "AAC拉新_快手_02"]),
  agent_type: minimalDimension("agent_type", ["代理", "自投"]),
  deduction_range: minimalDimension("deduction_range", ["0–5%", "5–10%", ">10%"]),
  bid_tool: { unsupported: true, message: "出价工具为派生枚举，映射表未提案前无数据源" },
  ubp: { unsupported: true, message: dimensionUnsupportedFixture.error.message },
}

export const strategyPresets: { value: string; label: string; dimA: Dimension; dimB: Dimension }[] = [
  { value: "position_task", label: "版位 × 任务", dimA: "resource_position", dimB: "task" },
  { value: "bidtool_task", label: "出价工具 × 任务", dimA: "bid_tool", dimB: "task" },
  { value: "biz_position", label: "业务 × 版位", dimA: "biz", dimB: "resource_position" },
]
