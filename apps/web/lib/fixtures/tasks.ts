import type { CostStatus, Fixture, MetricValue, RatioValue } from "@/lib/fixtures/contract"
import type { AssessmentV3, MetricsV3, TrendRow } from "@/lib/fixtures/data-analysis"
import type { PoolStatus, LifecycleStage } from "@/lib/fixtures/accounts"
import listV151 from "@contract/fixtures/tasks/list-v151.json"
import listReady from "@contract/fixtures/task-list/ready.json"
import listPartial from "@contract/fixtures/task-list/partial.json"
import listStale from "@contract/fixtures/task-list/stale.json"
import listEmpty from "@contract/fixtures/task-list/empty.json"
import overviewV151 from "@contract/fixtures/task-detail/overview-v151.json"
import overviewNoCap from "@contract/fixtures/task-detail/overview-no-cap.json"
import metrics from "@contract/fixtures/tasks/metrics.json"
import funnel from "@contract/fixtures/tasks/funnel.json"
import taskAccounts from "@contract/fixtures/tasks/accounts.json"
import taskTimeline from "@contract/fixtures/tasks/timeline.json"
import changeLog from "@contract/fixtures/settings/change-log.json"

// 投放任务（F-007 §4，契约 TASK-LIST-001 + v1.4 + v1.5.1 ②）的 fixture 读取层。不算数。
export type TaskStage = "preparing" | "opening" | "recharging" | "building" | "cold_start" | "delivering" | "ended"
export const taskStages: { value: TaskStage; label: string; dot: string }[] = [
  { value: "preparing", label: "准备", dot: "bg-border" },
  { value: "opening", label: "开户", dot: "bg-muted-foreground/60" },
  { value: "recharging", label: "充值", dot: "bg-status-warning" },
  { value: "building", label: "基建", dot: "bg-status-warning" },
  { value: "cold_start", label: "冷启动", dot: "bg-status-info" },
  { value: "delivering", label: "投放", dot: "bg-status-success" },
  { value: "ended", label: "结束", dot: "border border-muted-foreground bg-transparent" },
]
export const taskStageMap = Object.fromEntries(taskStages.map((item) => [item.value, item])) as Record<TaskStage, (typeof taskStages)[number]>

export type ReadinessKey = "accounts" | "recharge" | "products" | "materials" | "strategy" | "infra"
export const readinessKeys: { key: ReadinessKey; label: string }[] = [
  { key: "accounts", label: "账户" },
  { key: "recharge", label: "充值" },
  { key: "products", label: "商品" },
  { key: "materials", label: "素材" },
  { key: "strategy", label: "策略" },
  { key: "infra", label: "基建" },
]
export type ReadinessItem = { ratio: RatioValue; ready: boolean; source: "system" | "manual"; missing: string[] }
export type Readiness = Record<ReadinessKey, ReadinessItem> & { overall?: RatioValue }
export type Pacing = { asOf: string; remainingDays: number; targetProgress: RatioValue; timeProgress: RatioValue; projectedCompletion: RatioValue }

export type TaskItem = { taskId: string; taskName: string; bizName: string | null; status: "active" | "preparing" | "ended"; stage: TaskStage; period: { start: string; end: string } | null; owner: { userId: string; displayName: string } | null; assessmentPrice: { value: number; effectiveDate: string } | null; rta: boolean; placementPref: string | null; accountCount: number; volume: { target: number | null; completed: number | null } | null; readiness: Readiness; pacing: Pacing | null; costStatus: CostStatus; nextMilestone: { at: string; label: string } | null }
export const tasksFixture = listV151 as unknown as Fixture<{ items: TaskItem[]; page: number; pageSize: number; total: number }> & { meta?: { dataState?: string } }

// TASK-LIST-001 四态（老板 F-006 已看过的四态样例，保留可切）
export type LegacyTaskList = Fixture<{ items: unknown[]; page: number; pageSize: number; total: number }> & { meta?: { dataState?: "ready" | "partial" | "stale" | "empty"; dataAsOf?: string | null; coverage?: { complete: boolean }; requestId?: string } }
export const taskListStates = { ready: listReady as unknown as LegacyTaskList, partial: listPartial as unknown as LegacyTaskList, stale: listStale as unknown as LegacyTaskList, empty: listEmpty as unknown as LegacyTaskList }

export type TaskOverview = {
  task: { taskId: string; taskName: string; bizName: string | null; status: string; period: { start: string; end: string }; owner: { userId: string; displayName: string } | null; budget: MetricValue }
  overview: {
    targetVolume: MetricValue; achieved: MetricValue; achievementRate: RatioValue; timeProgress: RatioValue
    pacing: { asOf: string; elapsedDays: number; totalDays: number; remainingDays: number; targetProgress: RatioValue; timeProgress: RatioValue; projectedVolume: number | null; projectedCompletion: RatioValue; projectedGap: number | null; requiredDailyVolume: RatioValue; sevenDayAvgVolume: RatioValue; excludedZeroDays: number; finalAchievementRate: RatioValue | null } | null
    onTarget: boolean | null; costStatus: CostStatus; costStatusReason: string
    cost: { window: { from: string; to: string; preset?: string }; cost: MetricValue; cashCost: MetricValue; cashCpa: RatioValue; realCpa: RatioValue; costSpace: MetricValue; projectedWindowCashCpa: RatioValue; affordableDailyCashCpa: RatioValue }
    anomalySummary: { p0: number; p1: number; opportunity: number }
    assessmentPrice: { current: number; effectiveDate: string; historyCount: number } | null
    dailyBudgetCap: { current: number; effectiveDate: string; historyCount: number } | null
    budgetUsageRate: RatioValue; budgetUsageDate: string | null
    stage?: { value: TaskStage; source: "system" | "manual" | "workflow"; changedAt: string }
    readiness?: Readiness
    sopProgress?: { runId: string | null; steps: { key: "prepare" | "open" | "recharge" | "build" | "cold_start" | "deliver_monitor"; status: "done" | "running" | "pending" | "skipped"; at: string | null }[] }
    blockers?: { kind: "work_item" | "dispatch" | "escalation" | "readiness"; ref: string; title: string; severity: string }[]
    nextActions?: { kind: string; ref: string; title: string }[]
  }
  tabs?: string[]
}
export const overviewFixtures = { ready: overviewV151 as unknown as Fixture<TaskOverview>, nocap: overviewNoCap as unknown as Fixture<TaskOverview> }
export const sopStepLabel: Record<string, string> = { prepare: "准备", open: "开户", recharge: "充值", build: "基建", cold_start: "冷启动", deliver_monitor: "跑量监控" }

export const taskMetricsFixture = metrics as unknown as Fixture<{ summary: { rowCount: number; accountCount: number; anomalyRows: number; metrics: MetricsV3; assessment: AssessmentV3 }; trend: TrendRow[]; compare: { mode: "dod" | "wow"; deltas: { cost: RatioValue; cashCpa: RatioValue } } }>
export const taskFunnelFixture = funnel as unknown as Fixture<{ window: { from: string; to: string }; online: { exposure: MetricValue; click: MetricValue; conversion: MetricValue; realConversion: MetricValue }; offline: { wakeUv: MetricValue; potentialUv: MetricValue; realConversion: MetricValue }; rates: { ctr: RatioValue; cvr: RatioValue; gap: RatioValue; potentialRate: RatioValue; biConversionRate: RatioValue } }>
export type TaskAccountRow = { media: string; accountId: string; accountName: string; poolStatus: PoolStatus; lifecycleStage: LifecycleStage; validFrom: string; validTo: string | null; onTarget: boolean | null; costStatus: CostStatus; capacity: { dailyBudgetCap: number | null; usage: RatioValue } }
export const taskAccountsFixture = taskAccounts as unknown as Fixture<{ items: TaskAccountRow[] }>
export type TaskTimelineItem = { at: string; kind: string; actor: { user_id?: string; userId?: string; name: string } | "system" | "external"; summary: string; ref: { type: string; id: string } | null }
export const taskTimelineFixture = taskTimeline as unknown as Fixture<{ items: TaskTimelineItem[]; next_cursor: string | null }>
export type ChangeLogValue = number | { op: string; coefficient: number } | null
export type ChangeLogItem = { at: string; kind: "assessment_price" | "daily_budget_cap" | "channel_coefficient"; scope: { taskId?: string; media?: string }; oldValue: ChangeLogValue; newValue: ChangeLogValue; effectiveDate: string; changedBy: { userId: string; name: string }; evidenceUrl: string | null; recomputedDays?: number }
/** 变更值展示：数字 / 返点系数对象 / 空 → 文本（不算数，只格式化） */
export const fmtChangeValue = (value: ChangeLogValue): string => value === null ? "−" : typeof value === "number" ? value.toLocaleString("zh-CN") : `${value.op === "multiply" ? "×" : value.op} ${value.coefficient}`
export const changeLogFixture = changeLog as unknown as Fixture<{ items: ChangeLogItem[]; nextCursor: string | null }>
export const changeLogKindLabel: Record<ChangeLogItem["kind"], string> = { assessment_price: "考核价", daily_budget_cap: "日预算卡", channel_coefficient: "返点系数" }
