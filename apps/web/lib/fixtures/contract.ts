// F-007：fixture 即契约。前端 mock 层直接读 packages/contract/fixtures/*.json（路径别名 @contract/*）。
// 这里只做类型与取值小工具，不算任何数；缺数一律显 −。lib/data/ 归后端，本目录是前端自己的 fixture 读取层。
export type MetricValue = { value: number | null; availability: "available" | "missing" | "error" }
export type RatioValue = { value: number | null; state: "finite" | "infinite" | "undefined" }
export type CostStatus = "green" | "yellow" | "red" | null

export type FixtureMeta = { requestId?: string; dataAsOf?: string; businessDate?: string; workspaceKind?: "personal" | "team"; selectedSource?: "platform" | "ka_data"; _note?: string; _example?: boolean; [key: string]: unknown }
export type FixtureOk<T> = { ok: true; data: T; meta?: FixtureMeta }
export type FixtureErr = { ok: false; error: { code: string; message: string; retryable?: boolean; requestId?: string; [key: string]: unknown }; meta?: FixtureMeta }
export type Fixture<T> = FixtureOk<T> | FixtureErr

export function isOk<T>(fixture: Fixture<T>): fixture is FixtureOk<T> {
  return fixture.ok === true
}

const number0 = new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 0 })
const number2 = new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 2 })
const money = new Intl.NumberFormat("zh-CN", { style: "currency", currency: "CNY", maximumFractionDigits: 2 })
const money0 = new Intl.NumberFormat("zh-CN", { style: "currency", currency: "CNY", maximumFractionDigits: 0 })
const percent = new Intl.NumberFormat("zh-CN", { style: "percent", maximumFractionDigits: 1 })

/** MetricValue → 文本；missing/error 显 −（真实 0 才显 0） */
export function mv(value: MetricValue | null | undefined, kind: "int" | "money" | "money0" | "num" = "int"): string {
  if (!value || value.availability !== "available" || value.value === null) return "−"
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
export function isMissing(value: MetricValue | RatioValue | null | undefined): boolean {
  if (!value) return true
  if ("availability" in value) return value.availability !== "available" || value.value === null
  return value.state === "undefined" || value.value === null
}

/** 三色色标只从 DTO 拿；前端不算 */
export const costStatusTone: Record<Exclude<CostStatus, null>, string> = { green: "text-status-success", yellow: "text-status-warning", red: "text-status-critical" }
export const costStatusDot: Record<Exclude<CostStatus, null>, string> = { green: "bg-status-success", yellow: "bg-status-warning", red: "bg-status-critical" }
export const costStatusLabel: Record<Exclude<CostStatus, null>, string> = { green: "达标", yellow: "单日超线 · 累计达标", red: "累计超线" }
export const costStatusReasonLabel: Record<string, string> = { window_ok: "窗口累计达标", day_over_window_ok: "单日超线，累计仍达标", window_over: "窗口累计超线", cash_missing: "现金消耗缺数，无法判定", conversion_missing: "转化数缺数，无法判定", assessment_missing: "没有考核价，无法判定" }
export const costStatusReasonShort: Record<string, string> = { window_ok: "窗口达标", day_over_window_ok: "单日超线", window_over: "累计超线", cash_missing: "现金缺数", conversion_missing: "转化缺数", assessment_missing: "无考核价" }
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
