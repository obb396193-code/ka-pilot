import type { CostStatus, Fixture, MetricValue, RatioValue } from "@/lib/fixtures/contract"
import tableV3 from "@contract/fixtures/data-query/table-v3.json"
import summaryGreen from "@contract/fixtures/data-query/summary-window-v3-green.json"
import summaryYellow from "@contract/fixtures/data-query/summary-window-v3-yellow.json"
import summaryCashMissing from "@contract/fixtures/data-query/summary-window-v3-cash-missing.json"
import trendV3 from "@contract/fixtures/data-query/trend-v3.json"
import dimensionV3 from "@contract/fixtures/data-query/dimension-v3.json"
import dimensionTask from "@contract/fixtures/data-query/dimension-v3-task.json"
import dimensionBiz from "@contract/fixtures/data-query/dimension-v3-biz.json"
import dimensionAccount from "@contract/fixtures/data-query/dimension-v3-account.json"
import dimensionAgentType from "@contract/fixtures/data-query/dimension-v3-agent_type.json"
import dimensionDeduction from "@contract/fixtures/data-query/dimension-v3-deduction_range.json"
import dimensionUnsupported from "@contract/fixtures/data-query/dimension-unsupported.json"
import hourly from "@contract/fixtures/data-query/hourly.json"
import gap from "@contract/fixtures/data-query/gap.json"
import gapTask from "@contract/fixtures/data-query/gap-task.json"
import gapBiz from "@contract/fixtures/data-query/gap-biz.json"
import pivot2 from "@contract/fixtures/data-query/pivot2.json"
import pivot2BizPosition from "@contract/fixtures/data-query/pivot2-biz-resource_position.json"
import dimensionOptimizer from "@contract/fixtures/data-query/dimension-v1922-optimizer.json"
import dimensionGoal from "@contract/fixtures/data-query/dimension-v1922-goal.json"
import dimensionPlacement from "@contract/fixtures/data-query/dimension-v1922-placement.json"
import pivot2Unsupported from "@contract/fixtures/data-query/pivot2-unsupported.json"
import exportQueued from "@contract/fixtures/exports/queued.json"
import watchlist from "@contract/fixtures/me/watchlist.json"
import views from "@contract/fixtures/me/views.json"
import reportConfig from "@contract/fixtures/reports/config-v1.json"
import reportRender from "@contract/fixtures/reports/render.json"

// 数据分析页的 fixture 读取层（fixture 即契约）。类型按 api.md v3 手写，JSON 用 as 断言；不算数。
export type Ratios = { ctr: RatioValue; cvr: RatioValue; realCpa: RatioValue; cashCpa: RatioValue; gap: RatioValue; potentialRate: RatioValue; biConversionRate: RatioValue }
export type MetricsV3 = { cost: MetricValue; cashCost: MetricValue; exposure: MetricValue; click: MetricValue; conversion: MetricValue; realConversion: MetricValue; costSpace: MetricValue; wakeUv: MetricValue; potentialUv: MetricValue; ratios: Ratios }
// v1.7.2/1.7.4：price=null 且 priceVersions≥2 = 窗口内多版本考核价（显「多版本(N)」）；effectiveDate 只在团队源（priceSource=ka_daily）可为 null
export type AssessmentV3 = { price: { value: number; effectiveDate: string | null } | null; priceSource?: "history" | "ka_daily"; priceVersions?: number; onTarget: boolean | null; costStatus: CostStatus; costStatusReason: string; budgetUsageRate?: RatioValue }
export type WindowPreset = "today" | "yesterday" | "last_7d" | "month_to_date" | "last_month" | "task_period" | "custom"
export type Lineage = { source: string; workspaceKind?: "personal" | "team"; window?: { from: string; to: string; preset?: WindowPreset }; dataAsOf?: string; metricVersion?: string; coverage?: { complete: boolean }; truncated?: boolean; partial?: boolean }
export type QuerySource<TRow> = { queryId: string; rowSchemaVersion: string; status: "ready" | "partial" | "stale" | "empty"; rows: TRow[]; returnedRowCount: number; wholeResultTotal: MetricValue; lineage: Lineage; warnings: string[]; dimension?: string; groupBy?: string; dimA?: string; dimB?: string }
export type QueryFixture<TRow> = Fixture<{ mode: string; source: QuerySource<TRow> }>

export type TableRow = { workspaceId: string; media: string; accountId: string; accountName: string; ds: string; tasks: { taskId: string; taskName: string }[]; dataAnomaly: boolean; metrics: MetricsV3; assessment: AssessmentV3 }
export type SummaryRow = { rowCount: number; accountCount: number; anomalyRows: number; metrics: MetricsV3; assessment: AssessmentV3 }
export type TrendRow = { ds: string; metrics: MetricsV3 }
export type DimensionRow = { key: string; label: string; metrics: MetricsV3; assessment: AssessmentV3; anomaly: boolean; agent_type?: "agency" | "self"; agency_name?: string | null }
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
export type GapFixture = QueryFixture<GapRow> & { meta?: { ruleSetVersion?: string } }
export const gapFixture = gap as unknown as GapFixture
export const gapFixtures: Record<"account" | "task" | "biz", GapFixture> = { account: gapFixture, task: gapTask as unknown as GapFixture, biz: gapBiz as unknown as GapFixture }
export type Pivot2Fixture = QueryFixture<Pivot2Row> & { meta?: { cellCoverage?: { cells: number; withData: number; undeterminable: number } } }
export const pivot2Fixture = pivot2 as unknown as Pivot2Fixture
/** 交叉表按 dimA-dimB 取样例；缺的组合显诚实空态 */
export const pivot2Fixtures: Record<string, Pivot2Fixture> = { "resource_position-task": pivot2Fixture, "biz-resource_position": pivot2BizPosition as unknown as Pivot2Fixture }
export const pivot2UnsupportedFixture = pivot2Unsupported as unknown as { ok: false; error: { code: string; message: string; dimension: string; hint: string } }
export const exportQueuedFixture = exportQueued as unknown as Fixture<{ exportId: string; status: string; kind: string; format: string }>
/**
 * 盯盘名单（`GET/PUT /me/watchlist`，契约 v1.7.4 G2）。
 * ★items 是**联合类型**：task 型只有 taskId、**没有 media/accountId**。
 * 原来这里断言成 `{media, accountId}[]`，TypeScript 就看不见 task 那一支了——
 * `/data?tab=hourly` 拿 `item.media` 去 `.toUpperCase()` 直接整页崩（老板 2026-09-10 在联调环境撞到）。
 */
export type WatchlistItem =
  | { type?: "account"; media: string; accountId: string }
  | { type: "task"; taskId: string }
export const watchlistFixture = watchlist as unknown as Fixture<{ items: WatchlistItem[]; updatedAt: string }>
export type SavedView = { id: string; page: string; name: string; config: { version: string; filters: Record<string, string>; columns: string[]; sort: { by: string; dir: string }[]; window: { preset: WindowPreset } }; isShared: boolean; updatedAt: string }
export const viewsFixture = views as unknown as Fixture<{ items: SavedView[] }>
export type ReportConfig = { id: string; name: string; config: { version: string; dataset: { queryId: string; params: Record<string, unknown> }; groupBy: string[]; columns: { metric: string; label?: string }[]; sort: { by: string; dir: string }[]; filters: unknown[]; highlight: { metric: string; op: string; value: unknown; style: string }[]; layout: { type: "table" | "chart" } }; isShared: boolean; version: string; updatedAt: string }
export const reportConfigFixture = reportConfig as unknown as Fixture<ReportConfig>
export type RenderRow = { group: Record<string, string>; metrics: { cost: MetricValue; ratios: { cashCpa: RatioValue } }; assessment: { onTarget: boolean | null } }
export const reportRenderFixture = reportRender as unknown as Fixture<{ rows: RenderRow[]; columns: { key: string; label: string }[]; highlights: { rowIndex: number; metric: string; style: string }[]; lineage: Lineage }>

// 8 维透视：契约枚举 + 各维现状（ubp 永久无源；bid_tool 映射表未提案；agent_type 只账户级）
/**
 * 维度清单。**顺序按「今天查得出来」排前面**（v1.9.41 联调实测的六个：
 * account/task/biz/optimizer/goal/placement），查不出来的排后面并由界面标「待接源」。
 *
 * ★「资源位」这一项的 value 是 `placement`：快手的资源位实际落在 placement 维度
 *   （实测分出 优选/搜索/联盟/主站/上下滑）。旧的 `resource_position` 键在 schema 里合法、
 *   但没有任何解析器产出它，查了直接 DIMENSION_UNSUPPORTED——所以它留在列表里只是为了
 *   界面上能显示「待接源」，不是可用选项。
 */
export type Dimension = "task" | "biz" | "account" | "optimizer" | "goal" | "placement" | "agent_type" | "resource_position" | "bid_tool" | "ubp" | "deduction_range"
export const dimensions: { value: Dimension; label: string }[] = [
  { value: "task", label: "任务" },
  { value: "biz", label: "业务" },
  { value: "account", label: "账户" },
  { value: "optimizer", label: "优化师/代理商" },
  { value: "goal", label: "出价目标" },
  { value: "placement", label: "资源位" },
  { value: "agent_type", label: "代理 / 自投" },
  { value: "resource_position", label: "资源位（旧键）" },
  { value: "bid_tool", label: "出价工具" },
  { value: "ubp", label: "UBP" },
  { value: "deduction_range", label: "扣量区间" },
]
const dimensionReady = dimensionV3 as unknown as QueryFixture<DimensionRow>
const dimensionUnsupportedFixture = dimensionUnsupported as unknown as { ok: false; error: { code: string; message: string; dimension: string; hint: string } }

const dimensionFixture = (json: unknown) => json as unknown as QueryFixture<DimensionRow>
export const dimensionFixtures: Record<Dimension, QueryFixture<DimensionRow> | { unsupported: true; message: string }> = {
  // placement 有自己的冻结样例（v1922 那批就是按新维度导的）
  placement: dimensionFixture(dimensionPlacement),
  // 旧键留在表里只为界面能显示「待接源」，不是可用选项
  resource_position: dimensionReady,
  optimizer: dimensionFixture(dimensionOptimizer),
  goal: dimensionFixture(dimensionGoal),
  task: dimensionFixture(dimensionTask),
  biz: dimensionFixture(dimensionBiz),
  account: dimensionFixture(dimensionAccount),
  agent_type: dimensionFixture(dimensionAgentType),
  deduction_range: dimensionFixture(dimensionDeduction),
  bid_tool: { unsupported: true, message: pivot2UnsupportedFixture.error.message },
  ubp: { unsupported: true, message: dimensionUnsupportedFixture.error.message },
}

export const strategyPresets: { value: string; label: string; dimA: Dimension; dimB: Dimension }[] = [
  { value: "position_task", label: "版位 × 任务", dimA: "placement", dimB: "task" },
  { value: "bidtool_task", label: "出价工具 × 任务", dimA: "bid_tool", dimB: "task" },
  { value: "biz_position", label: "业务 × 版位", dimA: "biz", dimB: "placement" },
]
