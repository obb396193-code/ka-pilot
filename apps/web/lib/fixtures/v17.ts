import type { Fixture, MetricValue, RatioValue } from "@/lib/fixtures/contract"
import type { CostStatus } from "@/lib/fixtures/contract"
import strategiesList from "@contract/fixtures/strategies/list.json"
import strategyDetail from "@contract/fixtures/strategies/detail.json"
import strategyCompare from "@contract/fixtures/strategies/compare.json"
import strategyTaskBinding from "@contract/fixtures/strategies/task-binding.json"
import attribution from "@contract/fixtures/tasks/attribution.json"
import leadGapTree from "@contract/fixtures/workbench/lead-gaptree.json"
import fyi from "@contract/fixtures/workbench/fyi.json"
import intelMaterials from "@contract/fixtures/intel/materials.json"
import shadowDecisions from "@contract/fixtures/shadow/decisions.json"
import shadowExam from "@contract/fixtures/shadow/exam.json"
import aiImpact from "@contract/fixtures/reports/ai-impact.json"
import weekly from "@contract/fixtures/reports/weekly-v1.json"
import taskReview from "@contract/fixtures/reports/task-review-v1.json"
import monthlyExec from "@contract/fixtures/reports/monthly-exec.json"

// v1.7（F-007 清单 §13，老板拍 P2 大件先做前端）fixture 读取层：策略方案 / 归因树 / 知悉流 / 竞情 / Shadow / AI 提效 / 周报 / 复盘 / 月度推送。不算数。

// ---- 3.11b 策略方案 ----
export type StrategyStatus = "official" | "team_verified" | "mine" | "draft" | "shared" | "verified" | "deprecated"
export type StrategyPlaybook = { placement: string[]; delivery_mode: string; bid: { tool: string; style: string; cpa_hint: string }; rta: { enabled: boolean; audience_packs: string[] }; budget_rhythm: { cold_start_days: number; split: { phase: string; share: number }[] }; account_matrix: { accounts: number; campaigns_per_account: number; units_per_campaign: number }; product_material_rules: string[] }
export type StrategyItem = { id: string; name: string; version: number; status: StrategyStatus; owner: { userId: string; name: string } | null; applicable: { stages: string[]; biz: string[]; objectives: string[]; media: string[] }; playbook: StrategyPlaybook; evidence: { sampleTasks: number; window: { from: string; to: string }; metrics: { cost: MetricValue; cashCost: MetricValue; realConversion: MetricValue; ratios: { cashCpa: RatioValue; realCpa: RatioValue } }; pivot2SnapshotRef: string | null } | null; validations: { count: number; improved: number; noChange: number; worse: number; insufficient: number }; boundTasks: { taskId: string; taskName: string }[]; updatedAt: string; copiedFrom?: string }
export const strategiesFixture = strategiesList as unknown as Fixture<{ items: StrategyItem[] }>
export type StrategyDetail = StrategyItem & { playbookMap: { step: number; key: string; label: string; value: string }[]; conditions: { applicable: string[]; not_applicable: string[] }; validationsDetail: { taskId: string; window: { from: string; to: string }; before: { cashCpa: RatioValue; volume: MetricValue; onTarget: boolean | null } | null; after: { cashCpa: RatioValue; volume: MetricValue; onTarget: boolean | null } | null; status: "improved" | "no_change" | "worse" | "insufficient_sample"; note: string }[]; versions: { version: number; at: string; note: string }[] }
export const strategyDetailFixture = strategyDetail as unknown as Fixture<StrategyDetail>
export const strategyCompareFixture = strategyCompare as unknown as Fixture<{ left: { id: string; name: string }; right: { id: string; name: string }; fields: { key: string; left: string; right: string }[]; evidence: { left: { cashCpa: RatioValue; sampleTasks: number }; right: { cashCpa: RatioValue; sampleTasks: number } } }>
export type StrategyTaskBinding = { taskId: string; strategy: { id: string; name: string; version: number; status: StrategyStatus }; boundAt: string; diff: { field: string; playbook: string; actual: string | null; match: boolean | null }[] }
export const strategyTaskBindingFixture = strategyTaskBinding as unknown as Fixture<StrategyTaskBinding>
export const strategyStatusMeta: Record<StrategyStatus, { label: string; tone: "success" | "progress" | "pending" | "muted" }> = { official: { label: "官方", tone: "success" }, team_verified: { label: "团队已验证", tone: "progress" }, verified: { label: "已验证", tone: "progress" }, shared: { label: "已分享", tone: "pending" }, mine: { label: "我的", tone: "pending" }, draft: { label: "草稿", tone: "pending" }, deprecated: { label: "已弃用", tone: "muted" } }
export const validationStatusMeta: Record<string, { label: string; tone: "success" | "muted" | "critical" | "pending" }> = { improved: { label: "改善", tone: "success" }, no_change: { label: "无变化", tone: "pending" }, worse: { label: "变差", tone: "critical" }, insufficient_sample: { label: "样本不足", tone: "muted" } }
export const playbookFieldLabel: Record<string, string> = { placement: "版位", "bid.tool": "出价工具", bid: "出价", budget_rhythm: "预算节奏", rta: "RTA 人群", delivery_mode: "投放方式", account_matrix: "账户矩阵", stages: "阶段" }

// ---- 3.7 归因树 ----
export type GapNode = { key: string; label: string; gap: MetricValue; share?: RatioValue; gapRate?: RatioValue; availability?: "available" | "undeterminable"; evidence?: { accounts: { media: string; accountId: string; cashCpa?: RatioValue; price?: number; costShare?: RatioValue; note?: string }[] }; children?: GapNode[] }
export type AttributionTree = { mode: "volume" | "cost"; root: GapNode; children: GapNode[]; byTask?: { taskId: string; taskName: string; gap: MetricValue }[]; lineage: { window: { from: string; to: string; preset?: string }; adLevelSource: string } }
export const attributionFixtures: Record<string, Fixture<AttributionTree>> = { "fixture-task-ready": attribution as unknown as Fixture<AttributionTree> }
export const leadGapTreeFixture = leadGapTree as unknown as Fixture<AttributionTree>
export const adLevelSourceLabel: Record<string, string> = { "platform.ad_realtime": "奇航广告实时", "ka_data.dwd_adgroup_daily": "ka_data 广告组日表", none: "无广告级数据" }

// ---- 7.6 知悉流 ----
export type FyiItem = { at: string; kind: "approval_decided" | "escalation_closed" | "major_change" | "milestone" | "member_change"; summary: string; ref: { type: string; id: string } | null }
export const fyiFixture = fyi as unknown as Fixture<{ items: FyiItem[]; nextCursor: string | null }>
export const fyiKindLabel: Record<FyiItem["kind"], string> = { approval_decided: "审批已定", escalation_closed: "升级关闭", major_change: "重大变更", milestone: "里程碑", member_change: "成员变动" }

// ---- 3.12 竞情（示例态） ----
export type IntelMaterial = { id: string; source: string; ingestMode: "csv_import" | "link" | "api"; competitor: string; industry: string; materialRef: string; thumbnailRef: string | null; firstSeen: string; lastSeen: string; activeDays: number; placements: string[]; estCostTier: "high" | "mid" | "low" | "unknown"; linked: { taskId: string | null; materialId: string | null } }
export const intelFixture = intelMaterials as unknown as Fixture<{ items: IntelMaterial[]; sourceStatus: { mode: string; lastIngestAt: string | null; note: string } }>
export const costTierLabel: Record<IntelMaterial["estCostTier"], string> = { high: "高", mid: "中", low: "低", unknown: "未知" }

// ---- 5.9 Shadow ----
export type ShadowDecision = { id: string; workItemId: string; rule: { id: number; name: string }; account: { media: string; accountId: string }; aiAction: { kind: string; target: string; delta: number | null; expected: Record<string, MetricValue | RatioValue> }; humanAction: { kind: string; source: string; ref: string; at: string } | null; adopted: boolean | null; t1Result: { cashCpaDelta: RatioValue; costDelta: MetricValue; realConversionDelta: MetricValue; matured: boolean } | null; t7Result: { cashCpaDelta: RatioValue; costDelta: MetricValue; realConversionDelta: MetricValue; matured: boolean } | null; status: string; decidedAt: string }
export const shadowDecisionsFixture = shadowDecisions as unknown as Fixture<{ items: ShadowDecision[]; summary: { n: number; adoptedRate: RatioValue; t1ImprovedRate: { adopted: RatioValue; notAdopted: RatioValue }; t7ImprovedRate: { adopted: RatioValue; notAdopted: RatioValue }; matured: { t1: number; t7: number }; caveat: string } }>
export const shadowExamFixture = shadowExam as unknown as Fixture<{ ruleId: number; days: number; sample: number; observedImprovedRate: RatioValue; gates: { observation: { pass: boolean; value: RatioValue; threshold: number; minSample: number }; executionReliability: { pass: boolean; successRate: RatioValue; unknownRate: RatioValue }; scope: { pass: boolean; note: string }; lossBound: { pass: boolean; netLoss30d: MetricValue; threshold: number } }; eligibleForAutonomy3: boolean }>
export const actionKindLabel: Record<string, string> = { lower_bid: "降价", raise_bid: "提价", pause_unit: "暂停单元", raise_budget: "加预算", lower_budget: "减预算" }

// ---- 7.5 AI 提效 ----
export type AiImpact = { window: { from: string; to: string; preset?: string }; quadrants: { automatedRules: { executed: MetricValue; succeeded: MetricValue; unknown: MetricValue }; anomaliesIntercepted: { count: MetricValue; p0: MetricValue; avgAckMinutes: RatioValue }; hoursSaved: { value: MetricValue; basis: string; detail: { action: string; count: number; minutes: number }[] }; observedCostDiff: { adoptedVsNot: { cashCpaDelta: RatioValue; sample: { adopted: number; notAdopted: number } }; caveat: string } }; trend: { ds: string; executed: MetricValue; intercepted: MetricValue; hoursSaved: MetricValue }[]; byUser: { userId: string; name: string; executed: number; hoursSaved: number }[] }
export const aiImpactFixture = aiImpact as unknown as Fixture<AiImpact>
export const aiActionLabel: Record<string, string> = { diagnosis: "诊断", changeset_bid: "调价变更集", report_daily: "日报" }
// 节省人时的口径键，界面显中文
export const hoursSavedBasisLabel: Record<string, string> = { action_minutes_table: "按每类操作的估时表折算（表里的分钟数可改）", manual_estimate: "人工估算", not_configured: "未配置" }

// ---- 7.2 周报 / 复盘 ----
export type WeeklySection = { key: "overview"; cards: { cost: MetricValue; cashCost: MetricValue; realConversion: MetricValue; cashCpa: RatioValue; onTargetRate: RatioValue } } | { key: "tasks"; rows: { taskId: string; taskName: string; achievementRate: RatioValue; costStatus: CostStatus; stage: string }[] } | { key: "anomalies"; items: { title: string; handled: boolean; t1: string }[] } | { key: "operations"; items: { summary: string; observed: string }[] } | { key: "nextWeek"; items: { text: string; source: string }[] }
export const weeklyFixture = weekly as unknown as Fixture<{ schema: string; week: string; role: string; sections: WeeklySection[]; generatedAt: string; dataAsOf: string; pushStatus: string }>
export type ReviewSection = { key: "goal"; cards: { target: MetricValue; achieved: MetricValue; achievementRate: RatioValue } } | { key: "cost_trend"; trend: { ds: string; cashCpa: RatioValue }[] } | { key: "key_operations"; timeline: { at: string; summary: string }[] } | { key: "attribution"; tree: { root: GapNode } } | { key: "why"; findings: { text: string; evidenceRefs: string[] }[] } | { key: "next"; suggestions: { text: string; evidenceRefs: string[]; reversible: boolean }[] }
export type TaskReview = { schema: string; taskId: string; status: "queued" | "running" | "ready" | "failed"; runId: string; window: { from: string; to: string }; sections: ReviewSection[]; citations: { ref: string; type: string; label: string }[]; kbDocumentId: string | null; humanConfirmed: boolean }
export const taskReviewFixtures: Record<string, Fixture<TaskReview>> = { "fixture-task-ready": taskReview as unknown as Fixture<TaskReview> }

// ---- 7.6 月度推送 ----
export const monthlyExecFixture = monthlyExec as unknown as Fixture<{ month: string; triples: { goal: string; status: string; needDecision: boolean }[]; decisions: { approvalId: string; title: string; options: string[] }[]; diffSinceLast: { item: string; from: RatioValue | string; to: RatioValue | string }[] }>
