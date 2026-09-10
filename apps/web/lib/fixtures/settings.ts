import type { Fixture } from "@/lib/fixtures/contract"
import passwordChanged from "@contract/fixtures/auth/password-changed.json"
import passwordError from "@contract/fixtures/auth/password-error.json"
import credentials from "@contract/fixtures/settings/credentials.json"
import coefficients from "@contract/fixtures/settings/channel-coefficients.json"
import decisionPolicy from "@contract/fixtures/settings/decision-policy.json"
import views from "@contract/fixtures/me/views.json"
import watchlist from "@contract/fixtures/me/watchlist.json"

// 设置（F-007 §10）fixture 读取层：三凭证只显绑定状态不显值；口径 = 返点系数（team 只读）；个人视图 saved_views
export type Credential = { provider: "qihang" | "multica" | "idealab"; label: string; bound: boolean; maskedRef: string | null; boundAt: string | null }
export const credentialsFixture = credentials as unknown as Fixture<{ items: Credential[] }>
export const credentialHint: Record<Credential["provider"], string> = { qihang: "启航数据平台：账户 / 报表读取；个人空间的数据源", multica: "Multica 执行器：开户 / 充值 / 基建等写操作的执行身份（PAT）", idealab: "IdeaLab：素材拆片与 AIGC 的 AK" }
export type ChannelCoefficient = { media: string; op: "multiply" | "divide"; coefficient: number; effectiveDate: string; changedBy: { userId: string; name: string }; evidenceUrl: string | null; historyCount: number }
export const coefficientsFixture = coefficients as unknown as Fixture<{ items: ChannelCoefficient[] }>
export const coefficientText = (item: ChannelCoefficient) => `现金消耗 = 账面消耗 ${item.op === "multiply" ? "×" : "÷"} ${item.coefficient}`
export type DecisionPolicy = { policy: { confidenceMin: number; historicalSuccessRateMin: number; recentManualOpsWindowHours: number; dailyCapCny: number }; updatedBy: { userId: string; name: string }; updatedAt: string }
export const decisionPolicyFixture = decisionPolicy as unknown as Fixture<DecisionPolicy>
export type SavedView = { id: string; page: string; name: string; config: { version: string; filters: Record<string, unknown>; columns: string[]; sort: { by: string; dir: string }[]; window: { preset: string } }; isShared: boolean; updatedAt: string }
export const viewsFixture = views as unknown as Fixture<{ items: SavedView[] }>
export const viewPageLabel: Record<string, string> = { "data.table": "数据分析 · 总表", "data.pivot": "数据分析 · 透视", "accounts.pool": "账户池", "tasks.list": "任务列表" }
export const watchlistFixture = watchlist as unknown as Fixture<{ items: import("./data-analysis").WatchlistItem[]; updatedAt: string }>

// F8-3 账号安全（契约 v1.7.6 POST /auth/password）
export const passwordChangedFixture = passwordChanged as unknown as Fixture<{ changedAt: string; otherSessionsRevoked: number }>
export const passwordErrorFixture = passwordError as unknown as Fixture<never>
