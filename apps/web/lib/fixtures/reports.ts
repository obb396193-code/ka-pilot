import type { Fixture, MetricValue, RatioValue } from "@/lib/fixtures/contract"
import library from "@contract/fixtures/reports/library.json"
import dailyV1 from "@contract/fixtures/reports/daily-v1.json"
import render from "@contract/fixtures/reports/render.json"
import configV1 from "@contract/fixtures/reports/config-v1.json"
import exportQueued from "@contract/fixtures/exports/queued.json"
import exportDone from "@contract/fixtures/exports/done.json"
import settlementTemplates from "@contract/fixtures/settlements/template.json"
import previewBlocked from "@contract/fixtures/settlements/preview-blocked.json"
import previewReady from "@contract/fixtures/settlements/preview-ready.json"
import frozen from "@contract/fixtures/settlements/frozen.json"
import subscriptions from "@contract/fixtures/integrations/subscriptions.json"

// 报告（F-007 §6，契约 v1.3 daily-report/v1 · report-config/v1 · v1.5 exports · v1.6 7.3 结算）fixture 读取层。不算数。

// ---- 报告库 ----
export type ReportLibraryItem = { id: string; name: string; kind: "daily" | "settlement" | "business" | "review" | "custom"; owner: { userId: string; name: string }; period: string; templateVersion: string; dataStatus: "ready" | "pending_check" | "pending_data" | "stale"; deliveryStatus: "sent_dingtalk" | "exported" | "scheduled" | null }
export const libraryFixture = library as unknown as Fixture<{ cards: { generatedThisMonth: number; pendingCheck: number; scheduled: number; shared: number; archived: number }; items: ReportLibraryItem[] }>
export const reportKindLabel: Record<ReportLibraryItem["kind"], string> = { daily: "日报", settlement: "结算单", business: "经营报告", review: "任务复盘", custom: "自定义" }
export const dataStatusMeta: Record<ReportLibraryItem["dataStatus"], { label: string; tone: "success" | "warning" | "muted" | "critical" }> = { ready: { label: "数据就绪", tone: "success" }, pending_check: { label: "待核对", tone: "warning" }, pending_data: { label: "等数据", tone: "muted" }, stale: { label: "过期", tone: "critical" } }
export const deliveryLabel: Record<NonNullable<ReportLibraryItem["deliveryStatus"]>, string> = { sent_dingtalk: "已发钉钉", exported: "已导出", scheduled: "已排期" }

// ---- 日报 daily-report/v1 ----
export type DailyModule = { key: string; title: string; cards?: { cost: MetricValue; cashCost: MetricValue; realConversion: MetricValue; cashCpa: RatioValue; onTargetRate: RatioValue; costSpace: MetricValue }; anomalies?: string[]; trend?: unknown[]; rows?: unknown[]; unsupported?: boolean; status?: string }
export type DailyReport = { schema: "daily-report/v1"; date: string; role: "optimizer" | "lead" | "admin" | "finance"; dataAsOf: string; modules: DailyModule[]; actions: { pushDingtalk: boolean; exportPdf: boolean } }
export const dailyFixture = dailyV1 as unknown as Fixture<DailyReport>
export const dailyRoleLabel: Record<DailyReport["role"], string> = { optimizer: "优化师", lead: "负责人", admin: "管理员", finance: "财务" }

// ---- 自定义报告 report-config/v1 + render ----
export type ReportConfig = { id: string; name: string; config: { version: "report-config/v1"; dataset: { queryId: string; params: Record<string, unknown> }; groupBy: string[]; columns: { metric: string; label: string }[]; sort: { by: string; dir: "asc" | "desc" }[]; filters: unknown[]; highlight: { metric: string; op: string; value: unknown; style: string }[]; layout: { type: string } }; isShared: boolean; version: string; updatedAt: string }
export const reportConfigFixture = configV1 as unknown as Fixture<ReportConfig>
export type RenderResult = { rows: { group: Record<string, string>; metrics: { cost: MetricValue; ratios: { cashCpa: RatioValue } }; assessment: { onTarget: boolean | null } }[]; columns: { key: string; label: string }[]; highlights: { rowIndex: number; metric: string; style: string }[]; lineage: { source: string; window: { from: string; to: string; preset: string } } }
export const renderFixture = render as unknown as Fixture<RenderResult>
export type ExportJob = { exportId: string; status: "queued" | "running" | "done" | "failed"; kind: string; format: string; file?: { url: string; bytes: number; expiresAt: string } | null; error?: string | null }
export const exportFixtures = { queued: exportQueued as unknown as Fixture<ExportJob>, done: exportDone as unknown as Fixture<ExportJob> }

// ---- 结算单 v1.6 7.3 ----
export type FormulaExpr = { kind: "field"; fieldKey: string } | { kind: "constant"; value: number } | { kind: "add" | "subtract" | "multiply" | "divide"; left: FormulaExpr; right: FormulaExpr }
export type SettlementField = { fieldKey: string; label: string; order: number; valueType: "text" | "date" | "number" | "money" | "rate"; aggregation: "none" | "sum"; source: { kind: "fact"; factKey: string } | { kind: "formula"; expression: FormulaExpr }; required: boolean; allowCorrection: boolean }
export type SettlementCheck = { checkKey: string; label: string; order: number; leftFieldKey: string; rightFieldKey: string; tolerance: { mode: "absolute"; amount: number } | { mode: "relative"; rate: number } | { mode: "either"; amount: number; rate: number }; severity: "block" | "warn" }
export type SettlementTemplate = { templateId: string; templateVersion: string; name: string; currencyCode: string; unitNote: string; fields: SettlementField[]; checks: SettlementCheck[]; fingerprint: string }
export const settlementTemplatesFixture = settlementTemplates as unknown as Fixture<{ items: SettlementTemplate[] }>
export type PreviewRow = { rowKey: string; sourceFactId: string; fields: { fieldKey: string; value: string | number | null; source: "fact" | "formula" | "correction" }[]; checks: { checkKey: string; status: "match" | "mismatch" | "undefined"; difference: number | null; relativeDifference: number | null; severity: "block" | "warn" }[]; fingerprint: string }
export type SettlementPreview = { runId: string; templateFingerprint: string; period: string; dataBasis: string; dataCutoffAt: string; rows: PreviewRow[]; totals: { fieldKey: string; value: number | null }[]; issues: { code: string; severity: "block" | "warn"; rowKey: string | null; fieldKey: string | null; checkKey: string | null }[]; status: "blocked" | "ready_to_freeze"; appliedCorrections?: unknown[] }
export const previewFixtures = { blocked: previewBlocked as unknown as Fixture<SettlementPreview>, ready: previewReady as unknown as Fixture<SettlementPreview> }
export type FrozenSettlement = { id: string; period: string; templateVersion: string; status: "frozen"; confirmedBy: { userId: string; name: string }; confirmedAt: string; fingerprint: string; snapshot: { rows: PreviewRow[]; totals: { fieldKey: string; value: number | null }[] }; lines: { lineId: number; rowKey: string; taskId: string | null; checks: PreviewRow["checks"]; workItemId: string | null }[] }
export const frozenFixture = frozen as unknown as Fixture<FrozenSettlement>
export const issueCodeLabel: Record<string, string> = { missing_required: "必填缺失", check_mismatch: "校验不一致", check_undefined: "校验无法判断", stale_data: "数据过期" }
/** 公式树 → 人话（只描述模板定义，不算值） */
export const formulaText = (expr: FormulaExpr, labelOf: (key: string) => string): string => {
  if (expr.kind === "field") return labelOf(expr.fieldKey)
  if (expr.kind === "constant") return String(expr.value)
  const op = { add: " + ", subtract: " − ", multiply: " × ", divide: " ÷ " }[expr.kind]
  return `${formulaText(expr.left, labelOf)}${op}${formulaText(expr.right, labelOf)}`
}
export const toleranceText = (tolerance: SettlementCheck["tolerance"]): string => tolerance.mode === "absolute" ? `±${tolerance.amount}` : tolerance.mode === "relative" ? `±${(tolerance.rate * 100).toFixed(1)}%` : `±${tolerance.amount} 或 ±${(tolerance.rate * 100).toFixed(1)}%`

// ---- 定时任务（subscriptions） ----
export type Subscription = { id: number; kind: "daily_report" | "alert" | "report_schedule" | "settlement"; target: "group" | "dm"; targetRef: string | null; config: Record<string, unknown>; quietHours: { from: string; to: string } | null; enabled: boolean }
export const subscriptionsFixture = subscriptions as unknown as Fixture<{ items: Subscription[] }>
export const subscriptionKindLabel: Record<Subscription["kind"], string> = { daily_report: "日报推送", alert: "警报", report_schedule: "定时报表", settlement: "结算单" }
