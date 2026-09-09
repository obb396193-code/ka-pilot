import type { Fixture, RatioValue } from "@/lib/fixtures/contract"
import members from "@contract/fixtures/admin/members.json"
import grants from "@contract/fixtures/admin/grants.json"
import grantsMember2 from "@contract/fixtures/admin/grants-member-2.json"
import calendar from "@contract/fixtures/admin/calendar.json"
import flags from "@contract/fixtures/admin/flags.json"
import etlRuns from "@contract/fixtures/system/etl-runs.json"
import assets from "@contract/fixtures/assets/list.json"
import reconcile from "@contract/fixtures/data-query/reconcile-pending.json"

// 治理后台（F-007 §11，admin 才显）fixture 读取层
export type Member = { identityId: string; displayName: string; provider: string; userId: string; role: "admin" | "lead" | "operator" | "viewer"; isActive: boolean; joinedAt: string; grantsCount: number; lastSeenAt: string | null }
export const membersFixture = members as unknown as Fixture<{ items: Member[] }>
export const roleLabel: Record<Member["role"], string> = { admin: "管理员", lead: "负责人", operator: "优化师", viewer: "只读" }
export type Grant = { media: string; accountId: string; accessLevel: "read" | "execute"; grantedAt: string }
export const grantsFixture = grants as unknown as Fixture<{ identityId: string; items: Grant[] }>
// arch 第三批补了第二位成员的授权，按 identityId 取；查不到就显诚实空态
export const grantsFixtures: Record<string, Fixture<{ identityId: string; items: Grant[] }>> = {
  [(grants as { data?: { identityId?: string } }).data?.identityId ?? "unknown"]: grants as unknown as Fixture<{ identityId: string; items: Grant[] }>,
  [(grantsMember2 as { data?: { identityId?: string } }).data?.identityId ?? "unknown-2"]: grantsMember2 as unknown as Fixture<{ identityId: string; items: Grant[] }>,
}
export type CalendarEvent = { id: number; eventDate: string; eventType: "holiday" | "coefficient_change" | "promotion" | "custom"; label: string; affectsBaseline: boolean; thresholdProfile: string | null }
export const calendarFixture = calendar as unknown as Fixture<{ items: CalendarEvent[] }>
export const eventTypeLabel: Record<CalendarEvent["eventType"], string> = { holiday: "节假日", coefficient_change: "口径变更", promotion: "大促", custom: "自定义" }
export type FlagKey = "write_enabled" | "agent_enabled" | "team_source_enabled" | "materials_enabled" | "dingtalk_enabled"
export const flagsFixture = flags as unknown as Fixture<{ flags: Record<FlagKey, boolean>; updatedBy: { userId: string; name: string }; updatedAt: string }>
export const flagMeta: Record<FlagKey, { label: string; hint: string }> = {
  write_enabled: { label: "写媒体", hint: "关：变更集 confirm 返回 403 WRITE_DISABLED；灰度 = 老板一人 true" },
  agent_enabled: { label: "Agent", hint: "关：抽屉 / 诊断 / 帮编全部只读示例" },
  team_source_enabled: { label: "团队数据源", hint: "关：团队空间不可切（ka_data）" },
  materials_enabled: { label: "商品素材", hint: "关：素材域整页示例态" },
  dingtalk_enabled: { label: "钉钉网关", hint: "关：不发任何卡片 / 消息，值守只在站内" },
}
export type EtlRun = { id: string; jobType: string; status: "done" | "failed" | "running" | "queued"; businessDate: string; startedAt: string; finishedAt: string | null; rows: { raw: number; canonical: number } | null; warnings: string[]; failedStage?: string }
export const etlRunsFixture = etlRuns as unknown as Fixture<{ items: EtlRun[] }>
export const etlJobLabel: Record<string, string> = { etl_incr: "增量同步", backfill_day: "按日补拉", etl_full: "全量同步" }
export type AssetItem = { id: string; assetKind: "workflow" | "report" | "view" | "rule"; refId: string; name: string; owner: { userId: string; name: string } | null; status: "draft" | "shared" | "verified" | "official" | "deprecated"; version: number; scope: string | null; dependencies: string[]; verifiedAt: string | null; successRate: RatioValue; usageCount: number; supersededBy: string | null }
export const assetsFixture = assets as unknown as Fixture<{ items: AssetItem[] }>
export const assetKindLabel: Record<AssetItem["assetKind"], string> = { workflow: "工作流", report: "报告", view: "视图", rule: "规则" }
export const assetStatusMeta: Record<AssetItem["status"], { label: string; tone: "pending" | "progress" | "success" | "critical" | "muted" }> = { draft: { label: "草稿", tone: "pending" }, shared: { label: "已分享", tone: "progress" }, verified: { label: "已验证", tone: "success" }, official: { label: "官方", tone: "success" }, deprecated: { label: "已弃用", tone: "muted" } }
export type ReconcileSide = { queryId: string; status: string; rows: { media: string; accountId: string; ds: string; metrics: { cost: number | null; exposure: number | null; click: number | null; conversion: number | null; realConversion: number | null; cashCost: number | null } }[]; lineage: { source: string; datasetVersion?: string; dataAsOf: string; authority?: { role: string } } }
export const reconcileFixture = reconcile as unknown as Fixture<{ mode: string; kaData: ReconcileSide; platform: ReconcileSide; comparison: { status: "ready" | "unavailable"; reason?: string; rows: unknown[] } }>
