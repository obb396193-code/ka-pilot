import type { Fixture, MetricValue, RatioValue } from "@/lib/fixtures/contract"
import type { AssessmentV3, MetricsV3 } from "@/lib/fixtures/data-analysis"
import wiReady from "@contract/fixtures/work-item-list/ready.json"
import wiPartial from "@contract/fixtures/work-item-list/partial.json"
import wiStale from "@contract/fixtures/work-item-list/stale.json"
import wiEmpty from "@contract/fixtures/work-item-list/empty.json"
import wiCovComplete from "@contract/fixtures/work-item-list/coverage-complete.json"
import wiCovPending from "@contract/fixtures/work-item-list/coverage-pending.json"
import wiCovUndeterminable from "@contract/fixtures/work-item-list/coverage-undeterminable.json"
import wiDetail from "@contract/fixtures/work-items/detail.json"
import wiActions from "@contract/fixtures/work-items/actions.json"
import changesetDetail from "@contract/fixtures/changesets/detail.json"
import runsRunning from "@contract/fixtures/workflows/runs-running.json"
import alertsStream from "@contract/fixtures/alerts/stream.json"
import roster from "@contract/fixtures/alerts/roster.json"
import escalations from "@contract/fixtures/alerts/escalations.json"
import briefReady from "@contract/fixtures/reports/daily-brief.json"
import briefPending from "@contract/fixtures/reports/daily-brief-pending.json"
import dispatches from "@contract/fixtures/collab/dispatches.json"
import approvals from "@contract/fixtures/collab/approvals.json"
import lead from "@contract/fixtures/workbench/lead.json"

// 工作台（F-007 §3）的 fixture 读取层：今日队列 / 变更集 / 运行中工作流 / 警报 / 早报 / 协作 / 负责人视图。不算数。
export type Severity = "P0" | "P1" | "P2" | "opportunity"
export type WorkItem = { workItemId: string; type: string; status: string; severity: Severity; title: string; account: { workspaceId: string; media: string; accountId: string; accountName: string | null } | null; task: { taskId: string; taskName: string } | null; assignee: { userId: string; name: string } | null; slaDue: string | null; createdAt: string; resolvedAt: string | null }
export type Coverage = { complete?: boolean; accountsInScope?: number; checked?: number; pending?: number; undeterminable?: number; ruleSetVersion?: string; checkedAt?: string; window?: { from: string; to: string } }
export type WorkItemList = Fixture<{ items: WorkItem[]; page: number; pageSize: number; total: number }> & { meta?: { dataState?: "ready" | "partial" | "stale" | "empty"; businessDate?: string; dataAsOf?: string | null; coverage?: Coverage; requestId?: string; _note?: string } }
export const workItemLists = {
  ready: wiReady as unknown as WorkItemList,
  "coverage-complete": wiCovComplete as unknown as WorkItemList,
  "coverage-pending": wiCovPending as unknown as WorkItemList,
  "coverage-undeterminable": wiCovUndeterminable as unknown as WorkItemList,
  partial: wiPartial as unknown as WorkItemList,
  stale: wiStale as unknown as WorkItemList,
  empty: wiEmpty as unknown as WorkItemList,
}
export type WorkItemListVariant = keyof typeof workItemLists
export const workItemListVariants: { value: WorkItemListVariant; label: string }[] = [
  { value: "coverage-complete", label: "覆盖完整（45/45）" },
  { value: "coverage-pending", label: "待检查 15（源过期）" },
  { value: "coverage-undeterminable", label: "缺数无法判断" },
  { value: "ready", label: "ready · 最小" },
  { value: "partial", label: "partial" },
  { value: "stale", label: "stale" },
  { value: "empty", label: "empty" },
]

export type WorkItemDetail = WorkItem & {
  rule: { ruleId: number; name: string; version: string } | null
  occurrenceCount: number; lastTriggeredAt: string | null
  evidenceSnapshot: { snapshotAt: string; window: { from: string; to: string }; metrics: MetricsV3; assessment: AssessmentV3; leaves: { metric: string; operator: string; threshold: number; value: number | null; availability: string; pass: boolean }[] } | null
  diagnosis: { schema: string; causeCategory: string; subCause: string; confidence: number; evidenceRefs: string[]; suggestions: { action: string; target: string; delta: number; expected: { cashCpa: RatioValue }; reversible: boolean }[]; caveats: string[] } | null
  decision: { tier: "auto" | "card_confirm" | "proposal" | "investigate" | "escalate"; gates: { confidence: RatioValue; historicalSuccessRate: RatioValue; recentManualOps: number; reversible: boolean; withinCap: boolean }; overriddenBy: string | null; reason: string } | null
  actions: string[]
  t1Result: { observedAt: string; metricDeltas: { cashCpa: RatioValue; cost: MetricValue; realConversion: MetricValue }; note: string } | null
}
export const workItemDetailFixture = wiDetail as unknown as Fixture<WorkItemDetail>
export const workItemActionsFixture = wiActions as unknown as Fixture<{ ignore: { reasons: string[]; muteDays: number[] }; process: { transitions: string }; dispatch: { acceptanceRuleMetrics: string[] }; escalate: { rosterTarget: { userId: string; name: string } } }>

export type ChangesetDetail = { id: string; media: string; accountId: string; workItemId: string | null; title: string; status: string; initiator: { userId: string; name: string }; reasonCode: string; ttlExpireAt: string; dryRunHash: string | null; confirmHash: string | null; simulation: { riskLevel: string; expected: { cashCpa: { from: number; to: number }; cost: { from: number; to: number } }; confidence: number; note: string } | null; items: { id: number; targetType: string; targetId: string; field: string; fromValue: { type: string; value: unknown }; toValue: { type: string; value: unknown }; itemStatus: string; failReason: string | null }[]; executionRuns: { id: string; attempt: number; status: string; dryRun: boolean; startedAt: string; finishedAt: string | null }[] }
export const changesetFixture = changesetDetail as unknown as Fixture<ChangesetDetail>

export const runsRunningFixture = runsRunning as unknown as Fixture<{ items: { run_id: string; name: string; step_index: number; step_total: number; status: string; eta: string | null }[] }>
export const alertsStreamFixture = alertsStream as unknown as Fixture<{ items: { escalationId: string; severity: Severity; title: string; workItemId: string; status: string; ackBy: { userId: string; name: string } | null; escalateAt: string; policy: string }[]; summary: { onDuty: { userId: string; name: string } | null; p0Unacked: number; escalating: number } }>
export const rosterFixture = roster as unknown as Fixture<{ items: { date: string; primary: { userId: string; name: string }; backup: { userId: string; name: string } | null }[] }>
export const escalationsFixture = escalations as unknown as Fixture<{ items: { escalationId: string; chain: { level: number; to: { userId: string; name: string }; at: string; status: "unacked" | "acked" | "pending" }[]; paused: boolean }[] }>

export type DailyBrief = { date: string; status: "ready" | "pending_data" | "failed"; generatedAt: string | null; dataAsOf: string | null; sections: { key: string; title: string; metrics?: { cost: MetricValue; cashCost: MetricValue; realConversion: MetricValue; cashCpa: RatioValue }; text?: string; items?: string[] }[]; queueSummary: { p0: number; p1: number; opportunity: number; coverage: Coverage } | null; pushStatus: "not_sent" | "sent" | "failed"; reason?: string }
export const briefFixtures = { ready: briefReady as unknown as Fixture<DailyBrief>, pending: briefPending as unknown as Fixture<DailyBrief> }

export type Dispatch = { dispatchId: string; workItemId: string; to: { userId: string; name: string }; from: { userId: string; name: string }; acceptanceCriteria: string; acceptanceRule: { metric: string; operator: string; threshold: number; windowDays: number } | null; status: string; slaDue: string | null; receipt: { outcome: "agreed" | "disagreed" | "done"; reason: string | null; at: string; changes?: unknown } | null }
export const dispatchesFixture = dispatches as unknown as Fixture<{ sent: Dispatch[]; received: Dispatch[] }>
export type Approval = { approvalId: string; kind: string; title: string; status: string; approver?: { userId: string; name: string }; requester?: { userId: string; name: string }; createdAt: string; autoPass: boolean; changesetId?: string }
export const approvalsFixture = approvals as unknown as Fixture<{ mine: Approval[]; toApprove: Approval[]; autoPassRules: { kind: string; condition: string; count7d: number }[] }>

export type LeadView = { window: { from: string; to: string; preset?: string }; cards: { targetAchievement: RatioValue; cumulativeCost: MetricValue; cashCpa: { value: RatioValue; assessment: number | null }; conversions: MetricValue; healthyTasks: { n: number; total: number }; budgetGap: { value: MetricValue; basis: string } }; risks: LeadItem[]; opportunities: LeadItem[]; blockers: { kind: "dispatch_overdue" | "escalation" | "approval_pending" | "readiness_missing"; count: number; tasks: string[] }[]; approvalsPending: { approvalId: string; title: string; requester: { userId: string; name: string }; due: string }[]; brief: { status: "ready" | "pending_data"; sections: { key: string; title: string; text?: string; items?: string[] }[] } }
export type LeadItem = { taskId: string; taskName: string; kind: "cost_over" | "volume_short" | "budget_short" | "structure"; impact: MetricValue; suggestion: { workItemId: string } | null }
export const leadFixture = lead as unknown as Fixture<LeadView>

export const severityMeta: Record<Severity, { label: string; dot: string; tone: "critical" | "warning" | "muted" | "success" }> = {
  P0: { label: "P0", dot: "bg-status-critical", tone: "critical" },
  P1: { label: "P1", dot: "bg-status-warning", tone: "warning" },
  P2: { label: "P2", dot: "bg-muted-foreground", tone: "muted" },
  opportunity: { label: "机会", dot: "bg-status-success", tone: "success" },
}
export const leadKindLabel: Record<LeadItem["kind"], string> = { cost_over: "成本超线", volume_short: "量不足", budget_short: "预算不足", structure: "结构问题" }
export const blockerKindLabel: Record<LeadView["blockers"][number]["kind"], string> = { dispatch_overdue: "派发超期", escalation: "升级中", approval_pending: "待审批", readiness_missing: "就绪缺项" }
