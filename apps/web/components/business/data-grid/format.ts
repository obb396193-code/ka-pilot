// 展示层格式化（Intl），不做任何业务计算；比率/CPA 的 ∞ / − 语义按 api.md P-001#6 与 metrics.md 缺数三态
export type RatioLike = { value: number | null; state: "finite" | "infinite" | "undefined" }

const money = new Intl.NumberFormat("zh-CN", { style: "currency", currency: "CNY", maximumFractionDigits: 2 })
const money0 = new Intl.NumberFormat("zh-CN", { style: "currency", currency: "CNY", maximumFractionDigits: 0 })
const integer = new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 0 })
const percent = new Intl.NumberFormat("zh-CN", { style: "percent", maximumFractionDigits: 1 })

export function formatMoney(value: number | null | undefined, { compact = false } = {}): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "−"
  return compact ? money0.format(value) : money.format(value)
}
export function formatInteger(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "−"
  return integer.format(value)
}
export function formatRatio(ratio: RatioLike | null | undefined): string {
  if (!ratio) return "−"
  if (ratio.state === "infinite") return "∞"
  if (ratio.state === "undefined" || ratio.value === null) return "−"
  return percent.format(ratio.value)
}
export function formatDate(value: string | null | undefined): string {
  if (!value) return "−"
  return value.slice(5).replace("-", "/")
}
