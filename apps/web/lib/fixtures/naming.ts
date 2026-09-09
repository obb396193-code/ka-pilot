// 契约 v1.8 归属清洗（`/admin?tab=naming`）。
// arch 的 fixture（admin/naming-rules.json、admin/account-names.json、admin/naming-rules-test.json）还没进 main，
// 先按 api.md「v1.8 追加」的形状在这里放**示例数据**顶着，页面标了「示例」角标；fixture 到位后把下面几个常量换成 import 即可，组件不用改。
// TODO-fixture: admin/naming-rules.json, admin/account-names.json, admin/naming-rules-test.json

export type SegmentSource = "enum" | "regex" | "free"
export type NamingSegment = {
  key: string
  label: string
  order: number
  source: SegmentSource
  values?: string[]
  pattern?: string
  required: boolean
  multi: boolean
  mapsTo: string | null
}

export type NamingRule = { media: string; version: number; segments: NamingSegment[]; separators: string[]; effectiveFrom: string; createdBy: string; note: string | null }

/** 快手现行 12 段（api.md v1.8）：渠道-业务-运营方-优化师/代理商-出价模式-设备-流量版位-出价目标-RTA-专项-承接-自定义 */
const kuaishouSegments: NamingSegment[] = [
  { key: "channel", label: "渠道", order: 1, source: "enum", values: ["KS", "快手"], required: true, multi: false, mapsTo: null },
  { key: "biz", label: "业务", order: 2, source: "enum", values: ["CVR有端(1803240580)", "促活UV(1803240581)", "AAC拉新(1803240582)"], required: true, multi: false, mapsTo: "biz" },
  { key: "agent_type", label: "运营方", order: 3, source: "enum", values: ["自投", "代投"], required: true, multi: false, mapsTo: "agent_type" },
  { key: "optimizer", label: "优化师 / 代理商", order: 4, source: "free", required: true, multi: false, mapsTo: "optimizer" },
  { key: "bid_mode", label: "出价模式", order: 5, source: "enum", values: ["手动", "自动", "最大转化", "控成本"], required: true, multi: false, mapsTo: "bid_mode" },
  { key: "device", label: "设备", order: 6, source: "enum", values: ["安卓", "iOS", "不限"], required: true, multi: false, mapsTo: "device" },
  { key: "placement", label: "流量版位", order: 7, source: "enum", values: ["优选", "主站", "极速版", "联盟"], required: true, multi: false, mapsTo: "placement" },
  { key: "goal", label: "出价目标", order: 8, source: "enum", values: ["激活", "注册", "付费", "留存"], required: true, multi: false, mapsTo: "goal" },
  { key: "rta", label: "RTA", order: 9, source: "enum", values: ["RTA", "非RTA"], required: false, multi: false, mapsTo: "rta" },
  { key: "special", label: "专项", order: 10, source: "free", required: false, multi: true, mapsTo: "special" },
  { key: "landing", label: "承接", order: 11, source: "regex", pattern: "^\\d+$", required: false, multi: false, mapsTo: "landing" },
  { key: "custom", label: "自定义", order: 12, source: "free", required: false, multi: false, mapsTo: null },
]

export const namingRules: Record<string, NamingRule> = {
  KUAISHOU: { media: "KUAISHOU", version: 3, segments: kuaishouSegments, separators: ["-"], effectiveFrom: "2026-08-01", createdBy: "示例管理员", note: "快手现行规范（示例）" },
  TENCENT: { media: "TENCENT", version: 1, segments: [], separators: ["-", "_"], effectiveFrom: "", createdBy: "", note: null },
  BYTEDANCE: { media: "BYTEDANCE", version: 1, segments: [], separators: ["-"], effectiveFrom: "", createdBy: "", note: null },
}

export const mediaOptions = [
  { value: "KUAISHOU", label: "快手" },
  { value: "TENCENT", label: "腾讯" },
  { value: "BYTEDANCE", label: "字节" },
]

export const separatorOptions = [
  { value: "-", label: "半角减号 -" },
  { value: "－", label: "全角减号 －" },
  { value: "_", label: "下划线 _" },
  { value: " ", label: "空格" },
]

export type ParseStatus = "parsed" | "partial" | "failed" | "conflict" | "confirmed" | "overridden"
export const parseStatusMeta: Record<ParseStatus, { label: string; tone: "success" | "warning" | "critical" | "muted" | "pending" }> = {
  parsed: { label: "解析成功", tone: "success" },
  partial: { label: "部分成功", tone: "warning" },
  failed: { label: "解析失败", tone: "critical" },
  conflict: { label: "冲突", tone: "critical" },
  confirmed: { label: "已确认", tone: "muted" },
  overridden: { label: "已人工改", tone: "pending" },
}

export type NameConflict = { field: string; fromNickname: string; fromPlatform: string }
export type AccountNameParse = {
  media: string
  accountId: string
  accountName: string
  ruleVersion: number
  status: ParseStatus
  segments: Record<string, string | null>
  overrides: string[]
  taskIds: string[]
  conflicts: NameConflict[]
  parsedAt: string
  confirmedBy: string | null
}

export const accountNameParses: AccountNameParse[] = [
  {
    media: "KUAISHOU", accountId: "account-1", accountName: "KS-CVR有端(1803240580)-自投-张三-手动-安卓-优选-激活-RTA-双十一-1024-A",
    ruleVersion: 3, status: "parsed", overrides: [], taskIds: ["1803240580"], conflicts: [], parsedAt: "2026-09-05T08:00:00.000+08:00", confirmedBy: null,
    segments: { channel: "KS", biz: "CVR有端(1803240580)", agent_type: "自投", optimizer: "张三", bid_mode: "手动", device: "安卓", placement: "优选", goal: "激活", rta: "RTA", special: "双十一", landing: "1024", custom: "A" },
  },
  {
    media: "KUAISHOU", accountId: "account-2", accountName: "KS-促活UV(1803240581)-代投-李四-自动-iOS-主站-注册-非RTA--2048-",
    ruleVersion: 3, status: "partial", overrides: [], taskIds: ["1803240581"], conflicts: [], parsedAt: "2026-09-05T08:00:00.000+08:00", confirmedBy: null,
    segments: { channel: "KS", biz: "促活UV(1803240581)", agent_type: "代投", optimizer: "李四", bid_mode: "自动", device: "iOS", placement: "主站", goal: "注册", rta: "非RTA", special: null, landing: "2048", custom: null },
  },
  {
    media: "KUAISHOU", accountId: "account-5", accountName: "KS-AAC拉新(1803240582)-自投-王五-控成本-不限-极速版-付费-RTA-年货节-4096-B",
    ruleVersion: 3, status: "conflict", overrides: [], taskIds: ["1803240582"], parsedAt: "2026-09-05T08:00:00.000+08:00", confirmedBy: null,
    conflicts: [
      { field: "运营方", fromNickname: "自投", fromPlatform: "代投" },
      { field: "任务归属", fromNickname: "1803240582", fromPlatform: "1803240599" },
    ],
    segments: { channel: "KS", biz: "AAC拉新(1803240582)", agent_type: "自投", optimizer: "王五", bid_mode: "控成本", device: "不限", placement: "极速版", goal: "付费", rta: "RTA", special: "年货节", landing: "4096", custom: "B" },
  },
  {
    media: "KUAISHOU", accountId: "account-7", accountName: "快手账户07测试",
    ruleVersion: 3, status: "failed", overrides: [], taskIds: [], conflicts: [], parsedAt: "2026-09-05T08:00:00.000+08:00", confirmedBy: null,
    segments: { channel: null, biz: null, agent_type: null, optimizer: null, bid_mode: null, device: null, placement: null, goal: null, rta: null, special: null, landing: null, custom: null },
  },
  {
    media: "KUAISHOU", accountId: "account-9", accountName: "KS-CVR有端(1803240580)-代投-赵六-手动-安卓-联盟-激活-非RTA-春节-8192-C",
    ruleVersion: 3, status: "confirmed", overrides: ["optimizer"], taskIds: ["1803240580"], conflicts: [], parsedAt: "2026-09-04T08:00:00.000+08:00", confirmedBy: "示例管理员",
    segments: { channel: "KS", biz: "CVR有端(1803240580)", agent_type: "代投", optimizer: "赵六（人工改）", bid_mode: "手动", device: "安卓", placement: "联盟", goal: "激活", rta: "非RTA", special: "春节", landing: "8192", custom: "C" },
  },
]

/** 维度值的来源角标（v1.8：每个维度带 source） */
export const dimensionSourceLabel: Record<string, string> = { nickname: "来自昵称", platform: "来自平台", manual: "人工改", qihang: "来自启航" }

// —— 干跑用的本地预览解析：按 api.md「两端锚定」的思路做，只用于改规范时看效果，
// 保存后以后端 `POST /admin/naming-rules/test` 为准（页面上写明了）。
const LANDING = /^\d+$/
const REBATE = /^(ZZ|KK)\d+$/

export type DryRunRow = { name: string; hit: number; segments: Record<string, string | null> }

export function dryRunParse(name: string, rule: NamingRule): DryRunRow {
  const segments: Record<string, string | null> = {}
  for (const segment of rule.segments) segments[segment.key] = null
  const trimmed = name.trim()
  if (!trimmed || rule.segments.length === 0) return { name, hit: 0, segments }

  // 按配置的分隔符切；专项段自身可能含分隔符，所以中段留到最后整体归并
  const pattern = new RegExp(`[${rule.separators.map((item) => item.replace(/[.*+?^${}()|[\]\\-]/g, "\\$&")).join("")}]`)
  const parts = trimmed.split(pattern)
  const head = rule.segments.filter((segment) => segment.order <= 9).sort((a, b) => a.order - b.order)
  const tail = rule.segments.filter((segment) => segment.order > 9).sort((a, b) => a.order - b.order)

  let cursor = 0
  for (const segment of head) {
    const value = parts[cursor]
    if (value === undefined) break
    if (segment.source === "enum" && segment.values?.length && !segment.values.includes(value)) { cursor += 1; continue }
    segments[segment.key] = value || null
    cursor += 1
  }

  // 末尾锚定：承接（纯数字）/ 增量扣量（ZZ|KK + 数字）从后往前认，剩下的整体归专项
  const rest = parts.slice(cursor).filter((item) => item !== "")
  const landingSegment = tail.find((segment) => segment.key === "landing")
  const customSegment = tail.find((segment) => segment.key === "custom")
  const specialSegment = tail.find((segment) => segment.key === "special")
  const tailValues = [...rest]
  if (customSegment && tailValues.length > 0 && !LANDING.test(tailValues[tailValues.length - 1]) && !REBATE.test(tailValues[tailValues.length - 1])) {
    segments[customSegment.key] = tailValues.pop() ?? null
  }
  if (landingSegment) {
    const index = tailValues.findIndex((item) => LANDING.test(item))
    if (index >= 0) segments[landingSegment.key] = tailValues.splice(index, 1)[0]
  }
  if (specialSegment && tailValues.length) segments[specialSegment.key] = tailValues.join("-")

  const filled = Object.values(segments).filter((value) => value !== null && value !== "").length
  return { name, hit: rule.segments.length ? filled / rule.segments.length : 0, segments }
}
