// F-007：fixture 即契约。前端 mock 层直接读 packages/contract/fixtures/*.json（路径别名 @contract/*）。
// 这里只做类型与取值小工具，不算任何数；缺数一律显 −。lib/data/ 归后端，本目录是前端自己的 fixture 读取层。
/** `pending` =「这个数还没到」（调度未跑完 / 源未回），界面显「待到」——和「没有」是两件事（v1.9.27） */
// partial = v1.9.35 窗口部分合计（带真值）；展示「部分」角标是 fe ㉑，这里先让类型对齐镜像。
export type MetricValue = { value: number | null; availability: "available" | "missing" | "error" | "pending" | "partial" }
export type RatioValue = { value: number | null; state: "finite" | "infinite" | "undefined" }
export type CostStatus = "green" | "yellow" | "red" | null

export type FixtureMeta = { requestId?: string; dataAsOf?: string; businessDate?: string; workspaceKind?: "personal" | "team"; selectedSource?: "platform" | "ka_data"; _note?: string; _example?: boolean; [key: string]: unknown }
export type FixtureOk<T> = { ok: true; data: T; meta?: FixtureMeta }
export type FixtureErr = { ok: false; error: { code: string; message: string; retryable?: boolean; requestId?: string; [key: string]: unknown }; meta?: FixtureMeta }
export type Fixture<T> = FixtureOk<T> | FixtureErr

/**
 * ★A35 开关（F8-25 ①，老板拍板「内网不放假数据」）。
 *
 * `packages/contract/fixtures` 是**给 mock 模式用的样例数据**。真实模式下页面渲染它，
 * 用户看到的是一屏看着很真、其实和库里对不上的数字——devix 用改库探针实证过
 * （改 account-6 的名字，页面上纹丝不动；账户池九态合计 39 户，库里只有 6 户）。
 * 这比空页面坏得多：空页面只是没做完，假数字是**错的且看不出来**。
 *
 * 收口收在这一个函数上，而不是去改 52 个组件：所有 fixture 消费者都得先过 `isOk` 才拿得到
 * `.data`（这点由 TypeScript 保证——`Fixture<T>` 是联合类型，不窄化编译不过）。
 * 所以真实模式下让它恒 false，fixture 数据就一个字节也到不了界面。
 *
 * 加新页面时不需要记得做什么，默认就是安全的：忘了接真接口 → 空态，不会变成假数据。
 */
export const FIXTURES_ENABLED = process.env.NEXT_PUBLIC_KA_DATA_PROVIDER === "mock"

export function isOk<T>(fixture: Fixture<T>): fixture is FixtureOk<T> {
  if (!FIXTURES_ENABLED) return false
  return fixture.ok === true
}

const number0 = new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 0 })
const number2 = new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 2 })
const money = new Intl.NumberFormat("zh-CN", { style: "currency", currency: "CNY", maximumFractionDigits: 2 })
const money0 = new Intl.NumberFormat("zh-CN", { style: "currency", currency: "CNY", maximumFractionDigits: 0 })
const percent = new Intl.NumberFormat("zh-CN", { style: "percent", maximumFractionDigits: 1 })

/**
 * MetricValue → 文本。
 * missing/error 显 −（真实 0 才显 0）、pending 显「待到」、
 * **partial 照常显数字**（它带着真值，是「已有账户日的合计」，不是缺数；
 * 「这是部分合计」由旁边的角标说，不该把数字藏起来——v1.9.35 老板拍板 B）。
 */
export function mv(value: MetricValue | null | undefined, kind: "int" | "money" | "money0" | "num" = "int"): string {
  if (value?.availability === "pending") return "待到"
  if (!value || (value.availability !== "available" && value.availability !== "partial") || value.value === null) return "−"
  if (kind === "money") return money.format(value.value)
  if (kind === "money0") return money0.format(value.value)
  if (kind === "num") return number2.format(value.value)
  return number0.format(value.value)
}
/** RatioValue → 文本；undefined 显 −，infinite 显 ∞ */
export function rv(value: RatioValue | null | undefined, kind: "percent" | "money" | "num" | "x" = "percent"): string {
  if (!value || value.state === "undefined" || value.value === null) return "−"
  if (value.state === "infinite") return "∞"
  if (kind === "money") return money.format(value.value)
  if (kind === "num") return number2.format(value.value)
  if (kind === "x") return `${number2.format(value.value)}×`
  return percent.format(value.value)
}
/** 带符号的差值（环比 / 昨日增减）；null 显 − */
export function signed(value: MetricValue | null | undefined): string {
  if (!value || value.availability !== "available" || value.value === null) return "−"
  return value.value > 0 ? `+${number0.format(value.value)}` : number0.format(value.value)
}
/**
 * `assessment.biCashCost` 的**过渡期归一**（v1.9.32）。
 *
 * 它正在从 MetricValue 切成 RatioValue（be2 Q-041 ③ 那一笔），切之前后端还发老形，
 * 所以两形都可能收到。调用方只关心三件事：后端到底给没给准数（给了就别自己再除一遍，
 * 两个口径会打架）、是不是「花了钱零 BI 回传」、以及那个数是多少。
 */
export function normalizeBiCost(value: MetricValue | RatioValue | null | undefined): { known: boolean; infinite: boolean; value: number | null } {
  if (!value) return { known: false, infinite: false, value: null }
  if ("state" in value) {
    // RatioValue（新形）：infinite = cashCost>0 且 BI 回传为 0
    if (value.state === "infinite") return { known: true, infinite: true, value: null }
    return { known: value.state === "finite" && value.value !== null, infinite: false, value: value.state === "finite" ? value.value : null }
  }
  return { known: value.availability === "available" && value.value !== null, infinite: false, value: value.availability === "available" ? value.value : null }
}

/**
 * BI 现金成本 → 文本。
 * **`∞ · 无 BI 回传` 不能显成「−」**：花了钱一个 BI 都没回来，是最该被看见的一档，
 * 显「−」等于把它和「没数」混成一样（v1.9.32 arch 点名）。
 * 后端没给确定值时，按 `biConv` 是不是还没到，分别显「待到」和「−」。
 */
export function biCostText(value: MetricValue | RatioValue | null | undefined, biConv?: MetricValue | null): string {
  const normalized = normalizeBiCost(value)
  if (normalized.infinite) return "∞ · 无 BI 回传"
  if (normalized.known && normalized.value !== null) return money.format(normalized.value)
  return biConv?.availability === "pending" ? "待到" : "−"
}

/** 这个数是不是「部分合计」（窗口里有账户日缺数，合的是有数的那些）。 */
export function isPartial(value: MetricValue | RatioValue | null | undefined): boolean {
  return Boolean(value && "availability" in value && value.availability === "partial")
}

export function isMissing(value: MetricValue | RatioValue | null | undefined): boolean {
  if (!value) return true
  if ("availability" in value) return value.availability !== "available" || value.value === null
  return value.state === "undefined" || value.value === null
}

/** 三色色标只从 DTO 拿；前端不算 */
export const costStatusTone: Record<Exclude<CostStatus, null>, string> = { green: "text-status-success", yellow: "text-status-warning", red: "text-status-critical" }
export const costStatusDot: Record<Exclude<CostStatus, null>, string> = { green: "bg-status-success", yellow: "bg-status-warning", red: "bg-status-critical" }
export const costStatusLabel: Record<Exclude<CostStatus, null>, string> = { green: "达标", yellow: "单日超线 · 累计达标", red: "累计超线" }

// ★`partial_data` 是 v1.9.35 新增的一档：窗口里有账户日还没齐，**判定挂起**。
// 不是「判不了」而是「等数齐了再判」，所以说「待补齐」，不跟其它几档一样说「无法判定」。
export const costStatusReasonLabel: Record<string, string> = { window_ok: "窗口累计达标", day_over_window_ok: "单日超线，累计仍达标", window_over: "窗口累计超线", cash_missing: "现金消耗缺数，无法判定", conversion_missing: "转化数缺数，无法判定", assessment_missing: "没有考核价，无法判定", partial_data: "数据还没齐，判定待补齐" }
export const costStatusReasonShort: Record<string, string> = { window_ok: "窗口达标", day_over_window_ok: "单日超线", window_over: "累计超线", cash_missing: "现金缺数", conversion_missing: "转化缺数", assessment_missing: "无考核价", partial_data: "待补齐" }
export const costStatusReasonText = (reason: string | null | undefined) => (reason ? costStatusReasonLabel[reason] ?? reason : null)

export function fmtDate(value: string | null | undefined): string {
  if (!value) return "−"
  return value.slice(0, 10)
}
export function fmtTime(value: string | null | undefined): string {
  if (!value) return "−"
  const [date, rest] = value.split("T")
  return rest ? `${date.slice(5)} ${rest.slice(0, 5)}` : date
}

// 变更集状态 / 执行态的中文（界面不直出英文枚举）
export const changesetStatusLabel: Record<string, string> = { draft: "草稿", dry_run_ok: "试运行通过", confirmed: "已确认", executing: "执行中", executed: "已执行", partially_failed: "部分失败", failed: "失败", expired: "已过期", cancelled: "已取消" }
export const changesetStatusText = (status: string | null | undefined) => (status ? changesetStatusLabel[status] ?? status : "−")

// 变更集原因码 / 明细状态 / 风险等级 / 对象类型的中文（界面不直出英文枚举）
export const reasonCodeLabel: Record<string, string> = { cost_over_assessment: "成本超考核", volume_short_with_cost_space: "量不足但有成本空间", missing_feature: "缺功能配置", audience_token_overlap: "人群词重合", hook_kind_match: "钩子类型相同", rhythm_text_and_visual_similarity: "节奏与画面相似", role_sequence_similarity: "角色顺序相似", selling_point_token_overlap: "卖点词重合" }
export const itemStatusLabel: Record<string, string> = { pending: "待执行", running: "执行中", success: "成功", failed: "失败", skipped: "已跳过" }
export const riskLevelLabel: Record<string, string> = { low: "低", medium: "中", high: "高" }
export const targetTypeLabel: Record<string, string> = { unit: "单元", campaign: "计划", account: "账户", creative: "创意" }

// 报告 / 诊断的模板版本标识在界面显中文
export const schemaLabel: Record<string, string> = { "daily-report/v1": "日报模板 v1", "weekly-report/v1": "周报模板 v1", "task-review/v1": "任务复盘模板 v1", "diagnosis/v1": "诊断模板 v1", "monthly-exec/v1": "月度经营模板 v1" }
export const schemaText = (key: string) => schemaLabel[key] ?? key

export const exportStatusLabel: Record<string, string> = { queued: "排队中", running: "生成中", done: "已完成", failed: "失败", expired: "已过期" }
export const exportStatusText = (status: string | null | undefined) => (status ? exportStatusLabel[status] ?? status : "−")
