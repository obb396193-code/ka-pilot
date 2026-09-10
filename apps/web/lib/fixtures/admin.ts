import type { Fixture, RatioValue } from "@/lib/fixtures/contract"
import members from "@contract/fixtures/admin/members-v195.json"
import memberCreated from "@contract/fixtures/admin/member-created.json"
import memberResetPassword from "@contract/fixtures/admin/member-reset-password.json"
import grants from "@contract/fixtures/admin/grants.json"
import grantsMember2 from "@contract/fixtures/admin/grants-member-2.json"
import calendar from "@contract/fixtures/admin/calendar.json"
import flags from "@contract/fixtures/admin/flags.json"
import etlRuns from "@contract/fixtures/system/etl-runs-page.json"
import assets from "@contract/fixtures/assets/list.json"
import reconcile from "@contract/fixtures/data-query/reconcile-pending.json"

// 治理后台（F-007 §11，admin 才显）fixture 读取层
// 契约 v1.9.5：成员行加 mustChangePassword（初始密码还没改过）。读 members-v195.json 而不是 members.json，
// 是因为 Codex 那边契约测试是 strict，字段先落在这份，F-OS-004 落地后 arch 会并回 members.json（到时改这一行即可）。
export type Member = { identityId: string; displayName: string; provider: string; userId: string; role: "admin" | "lead" | "operator" | "viewer"; isActive: boolean; joinedAt: string; grantsCount: number; lastSeenAt: string | null; mustChangePassword: boolean }
export const membersFixture = members as unknown as Fixture<{ items: Member[] }>
export const roleLabel: Record<Member["role"], string> = { admin: "管理员", lead: "负责人", operator: "优化师", viewer: "只读" }

// F8-11 新增成员 / 重置密码（契约 v1.9.5）：initialPassword **只在这一次响应里回**，
// 关掉面板后任何接口都拿不回来，所以面板必须自带复制并把这句写在人眼前。
// v1.9.21：登录名在 loginName（userId 已变成 workspace-local UUID）
export type MemberCreated = Member & { initialPassword: string; loginName: string }
export const memberCreatedFixture = memberCreated as unknown as Fixture<MemberCreated>
export type MemberPasswordReset = { identityId: string; initialPassword: string; sessionsRevoked: number }
export const memberResetPasswordFixture = memberResetPassword as unknown as Fixture<MemberPasswordReset>
/** 登录名规则（契约 v1.9.5）：中文名不能当用户名，用拼音或工号；display_name 才可中文。 */
export const MEMBER_USERNAME_PATTERN = /^[A-Za-z0-9._@-]{1,128}$/
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
// 契约 v1.9.12：`GET /system/etl-runs` 改分页形（page/pageSize/total，startedAt 倒序）。
// 一行 = 一次 attempt；旧 run 没有 execution 记录 → attempt 为 null 并带 LEGACY_NO_ATTEMPT 警告。
// rows 的 raw/canonical 各自可 null（只跑到 raw 阶段的任务不知道清洗后行数），别当 0 显。
// warnings 两种形状并存：旧的是纯字符串码，新的是 {code,message} —— 直接 render 对象 React 会整页崩，先归一。
type RawEtlWarning = string | { code: string; message?: string | null }
export type EtlWarning = { code: string; message: string | null }
export type EtlRun = { runId: string; jobId: string; attempt: number | null; jobType: string; status: "done" | "failed" | "running" | "queued"; businessDate: string; startedAt: string; finishedAt: string | null; rows: { raw: number | null; canonical: number | null } | null; warnings: EtlWarning[]; failedStage?: string }
type RawEtlRun = Omit<EtlRun, "warnings"> & { warnings: RawEtlWarning[] }
export const etlRunsFixture = etlRuns as unknown as Fixture<{ items: RawEtlRun[]; page: number; pageSize: number; total: number }>
export function normalizeEtlRun(run: RawEtlRun): EtlRun {
  return { ...run, warnings: run.warnings.map((warning) => typeof warning === "string" ? { code: warning, message: null } : { code: warning.code, message: warning.message ?? null }) }
}
export const etlJobLabel: Record<string, string> = { etl_incr: "增量同步", backfill_day: "按日补拉", etl_full: "全量同步" }
export type AssetItem = { id: string; assetKind: "workflow" | "report" | "view" | "rule"; refId: string; name: string; owner: { userId: string; name: string } | null; status: "draft" | "shared" | "verified" | "official" | "deprecated"; version: number; scope: string | null; dependencies: string[]; verifiedAt: string | null; successRate: RatioValue; usageCount: number; supersededBy: string | null }
export const assetsFixture = assets as unknown as Fixture<{ items: AssetItem[] }>
export const assetKindLabel: Record<AssetItem["assetKind"], string> = { workflow: "工作流", report: "报告", view: "视图", rule: "规则" }
export const assetStatusMeta: Record<AssetItem["status"], { label: string; tone: "pending" | "progress" | "success" | "critical" | "muted" }> = { draft: { label: "草稿", tone: "pending" }, shared: { label: "已分享", tone: "progress" }, verified: { label: "已验证", tone: "success" }, official: { label: "官方", tone: "success" }, deprecated: { label: "已弃用", tone: "muted" } }
export type ReconcileSide = { queryId: string; status: string; rows: { media: string; accountId: string; ds: string; metrics: { cost: number | null; exposure: number | null; click: number | null; conversion: number | null; realConversion: number | null; cashCost: number | null } }[]; lineage: { source: string; datasetVersion?: string; dataAsOf: string; authority?: { role: string } } }
export const reconcileFixture = reconcile as unknown as Fixture<{ mode: string; kaData: ReconcileSide; platform: ReconcileSide; comparison: { status: "ready" | "unavailable"; reason?: string; rows: unknown[] } }>
