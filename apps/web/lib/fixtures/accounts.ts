import type { CostStatus, Fixture, MetricValue, RatioValue } from "@/lib/fixtures/contract"
import type { AssessmentV3, MetricsV3, TrendRow } from "@/lib/fixtures/data-analysis"
import listV151 from "@contract/fixtures/accounts/list-v151.json"
import pipeline from "@contract/fixtures/accounts/pipeline.json"
import detail from "@contract/fixtures/accounts/detail.json"
import timeline from "@contract/fixtures/accounts/timeline.json"
import overlay from "@contract/fixtures/accounts/overlay.json"
import structure from "@contract/fixtures/accounts/structure.json"
import openFlow from "@contract/fixtures/accounts/open-flow.json"
import tests from "@contract/fixtures/accounts/tests.json"
import transfer from "@contract/fixtures/accounts/transfer.json"
import replicate from "@contract/fixtures/accounts/replicate.json"
import replicationCompare from "@contract/fixtures/accounts/replication-compare.json"
import groupPreview from "@contract/fixtures/changesets/group-preview.json"
import infraRequests from "@contract/fixtures/infra/requests.json"
import trendV3 from "@contract/fixtures/data-query/trend-v3.json"

// 账户池 / 账户详情 / 基建 / 开户测试的 fixture 读取层（契约 v1.5 4.x + v1.5.1 ① + v1.6 4.7/4.8）。类型手写、JSON as 断言，不算数。
export type PoolStatus = "available" | "assigned" | "pending_open" | "pending_recharge" | "pending_build" | "in_delivery" | "paused" | "closed" | "abnormal"
export const poolStatuses: { value: PoolStatus; label: string; hint: string; dot: string }[] = [
  { value: "available", label: "可用", hint: "空闲可用，没挂任务", dot: "bg-muted-foreground/60" },
  { value: "assigned", label: "已分配", hint: "已分给任务，还没开投", dot: "bg-status-info" },
  { value: "pending_open", label: "待开户", hint: "开户申请中（媒体后台手工）", dot: "bg-border" },
  { value: "pending_recharge", label: "待充值", hint: "开户完成，充值未到位", dot: "bg-status-warning" },
  { value: "pending_build", label: "待搭建", hint: "充值到位，计划 / 素材没搭完", dot: "bg-status-warning" },
  { value: "in_delivery", label: "投放中", hint: "正常投放", dot: "bg-status-success" },
  { value: "paused", label: "暂停", hint: "人工或规则暂停", dot: "bg-foreground" },
  { value: "closed", label: "已关", hint: "已关停，只留历史", dot: "border border-muted-foreground bg-transparent" },
  { value: "abnormal", label: "异常", hint: "拒审 / 封户 / 限流等平台侧异常", dot: "bg-status-critical" },
]
export const poolStatusMap = Object.fromEntries(poolStatuses.map((item) => [item.value, item])) as Record<PoolStatus, (typeof poolStatuses)[number]>

export type LifecycleStage = "cold_start" | "ramping" | "stable" | "declining" | "unknown"
export const lifecycleLabel: Record<LifecycleStage, string> = { cold_start: "冷启动", ramping: "起量", stable: "稳定", declining: "衰退", unknown: "−" }

export type AccountItem = {
  workspaceId: string; media: string; accountId: string; accountName: string; status: string
  poolStatus: PoolStatus; poolStatusSource: "system" | "manual"; lifecycleStage: LifecycleStage
  product: { name: string; ref: string | null } | null; starred: boolean; tags: string[]
  owner: { userId: string; displayName: string } | null
  linkedTasks: { taskId: string; taskName: string }[]
  metrics: (MetricsV3 & { businessDate: string; window: { from: string; to: string; preset?: string } }) | null
  assessment: AssessmentV3 | null
  balance: { value: number | null; syncedAt: string | null; cutoff: { hours: MetricValue; state: "ok" | "warning" | "critical" | "unknown" } } | null
  dailyBudgetCap: number | null
  capacityLoad: RatioValue
  lastAction: { at: string; kind: string; summary: string } | null
  nextSuggestion: { workItemId: string; title: string } | null
}
export const accountsFixture = listV151 as unknown as Fixture<{ items: AccountItem[]; page: number; pageSize: number; total: number; groupBy: string }> & { meta?: { dataState?: string; coverage?: { complete: boolean } } }

export type PipelineStage = { poolStatus: PoolStatus; count: number | null; deltaVsYesterday: MetricValue }
export const pipelineFixture = pipeline as unknown as Fixture<{ stages: PipelineStage[]; asOf: string }>

export type AccountDetail = {
  account: { workspaceId: string; media: string; accountId: string; accountName: string; agentType: string; lifecycleStage: LifecycleStage; poolStatus: PoolStatus; claimedAt: string | null; owner: { userId: string; name: string } | null; tags: string[]; starred: boolean; product: { name: string; ref: string | null } | null }
  bio: { openedAt: string | null; openedBy: { userId: string; name: string } | null; tasks: { taskId: string; taskName: string; validFrom: string; validTo: string | null; current: boolean }[]; assessment: { price: number; effectiveDate: string } | null; onTarget: boolean | null; costStatus: CostStatus }
  balance: { asOf: string | null; balance: MetricValue; rechargeBalance: MetricValue; contractRebate: MetricValue; directRebate: MetricValue; extendedBalance: MetricValue; sharedWallet: MetricValue }
  velocity: { costPerHour: MetricValue; asOf: string | null }
  cutoff: { hours: MetricValue; at: string | null; state: "ok" | "warning" | "critical" | "unknown" }
  summary: { rowCount: number; accountCount: number; anomalyRows: number; metrics: MetricsV3; assessment: AssessmentV3 }
}
export const detailFixture = detail as unknown as Fixture<AccountDetail>

export type TimelineItem = { at: string; kind: "changeset" | "external_change" | "assessment_price" | "daily_budget_cap" | "dispatch" | "work_item" | "escalation" | "infra" | "transfer" | "mute" | "pool_status"; actor: { userId: string; name: string } | "system" | "external"; summary: string; ref: { type: string; id: string } | null; detail?: unknown; t1Result?: { observedAt: string; metricDeltas: { cashCpa: RatioValue; cost: MetricValue; realConversion: MetricValue }; note: string } | null }
export const timelineFixture = timeline as unknown as Fixture<{ items: TimelineItem[]; nextCursor: string | null }>
export const overlayFixture = overlay as unknown as Fixture<{ points: { at: string; kind: string; label: string; ref: { type: string; id: string } }[] }>

export type StructureUnit = { unitId: string; name: string; status: string; bid: MetricValue; cpaBid: MetricValue; dayBudget: MetricValue; schedule168: unknown; metrics: { cost: MetricValue; realConversion: MetricValue; ratios: { cashCpa: RatioValue } }; junk: boolean }
export type StructureCampaign = { campaignId: string; name: string; status: string; dayBudget: MetricValue; units: StructureUnit[] }
export const structureFixture = structure as unknown as Fixture<{ media: string; accountId: string; syncedAt: string; campaigns: StructureCampaign[] }>

export const openFlowFixture = openFlow as unknown as Fixture<{ flowId: string; steps: { key: string; label: string; status: "done" | "running" | "pending"; at: string | null }[]; account: { media: string; accountId: string | null; poolStatus: PoolStatus }; note: string }>

export type AccountTest = { id: string; media: string; accountId: string; taskId: string | null; purpose: string; hypothesis: string | null; startedAt: string; endAt: string | null; status: "planned" | "running" | "passed" | "failed" | "stopped"; verdictNote: string | null; result: { window: { from: string; to: string }; metrics: MetricsV3; assessment: AssessmentV3 } | null }
export const testsFixture = tests as unknown as Fixture<{ items: AccountTest[] }>

export const transferFixture = transfer as unknown as Fixture<{ transferId: string; moved: { accounts: number; workItems: number; dispatches: number }; notifiedUserIds: string[] }>
export const replicateFixture = replicate as unknown as Fixture<{ replicationId: string; changesetGroupId: string; plan: { campaigns: number; units: number; fields: string[]; materialsNote: string }; source: { media: string; accountId: string }; target: { media: string; accountId: string; poolStatus: PoolStatus } }>
export const replicationCompareFixture = replicationCompare as unknown as Fixture<{ days: number; source: { media: string; accountId: string; trend: TrendRow[] }; target: { media: string; accountId: string; trend: TrendRow[] } }>

export type GroupPreview = { groupId: string; title: string; status: string; reasonCode: string; expiresAt: string; changesets: { changesetId: string; media: string; accountId: string; status: string; items: number; riskLevel: string; dataAsOf: string }[]; skipped: { media: string; accountId: string; reason: string }[]; permissionChecks: { check: string; pass: boolean }[]; accountLocks: { media: string; accountId: string; conflict: boolean; lockedBy: string | null }[] }
export const groupPreviewFixture = groupPreview as unknown as Fixture<GroupPreview>

export type InfraRequest = { id: string; accountId: string; threadId: string | null; params: { materials: number; targeting: number; bids: number[] }; templateVersion: string; compiledPrompt: string; status: string; initiator: string; credentialOwnerUserId: string; result: unknown; itemResults: unknown; scheduled: boolean; dailyCap: number }
export const infraFixture = infraRequests as unknown as Fixture<{ queue: { media: string; accountId: string; poolStatus: PoolStatus; source: string; since: string }[]; items: InfraRequest[] }>

// 账户级趋势：契约是 account.trend 加 accountIds 参数；样例暂用 trend-v3（TODO-fixture:accounts/trend-account-1.json）
export const accountTrendFixture = trendV3 as unknown as Fixture<{ mode: string; source: { rows: TrendRow[]; lineage: { window?: { from: string; to: string; preset?: string } } } }>

export const cutoffLabel: Record<"ok" | "warning" | "critical" | "unknown", { label: string; tone: string }> = {
  ok: { label: "余额充足", tone: "text-status-success" },
  warning: { label: "24h 内断量", tone: "text-status-warning" },
  critical: { label: "即将断量", tone: "text-status-critical" },
  unknown: { label: "无法判断", tone: "text-muted-foreground" },
}
export const accountHref = (item: Pick<AccountItem, "media" | "accountId">) => `/accounts/${encodeURIComponent(item.media)}/${encodeURIComponent(item.accountId)}`
