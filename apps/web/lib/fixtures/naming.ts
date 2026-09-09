import type { Fixture } from "@/lib/fixtures/contract"
import namingRulesJson from "@contract/fixtures/admin/naming-rules.json"
import accountNamesJson from "@contract/fixtures/admin/account-names.json"
import namingRulesTestJson from "@contract/fixtures/admin/naming-rules-test.json"

// 契约 v1.8 归属清洗（`/admin?tab=naming`）。三份 fixture 由 arch 从真后端响应导出（快手 v1 规范 13 段）。
// 真实模式走 BFF：GET/PUT /api/internal/admin/naming-rules、POST .../naming-rules/test、GET/PATCH .../account-names。

export type SegmentSource = "enum" | "regex" | "free"
export type NamingSegment = {
  key: string
  label: string
  order: number
  source: SegmentSource
  values?: string[]
  pattern?: string | null
  required: boolean
  multi: boolean
  mapsTo: string | null
}

export type NamingRule = {
  media: string
  version: number
  segments: NamingSegment[]
  separators: string[]
  effectiveFrom: string | null
  note: string | null
  createdAt: string | null
}

export const namingRulesFixture = namingRulesJson as unknown as Fixture<NamingRule>

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

export const segmentSourceLabel: Record<SegmentSource, string> = { enum: "枚举", regex: "正则", free: "自由填写" }

export type ParseStatus = "parsed" | "partial" | "failed" | "conflict" | "confirmed" | "overridden"
export const parseStatusMeta: Record<ParseStatus, { label: string; tone: "success" | "warning" | "critical" | "muted" | "pending" }> = {
  parsed: { label: "解析成功", tone: "success" },
  partial: { label: "部分成功", tone: "warning" },
  failed: { label: "解析失败", tone: "critical" },
  conflict: { label: "冲突", tone: "critical" },
  confirmed: { label: "已确认", tone: "muted" },
  overridden: { label: "已人工改", tone: "pending" },
}

/** 一段的解析结果：值 + 对应系统维度 + 该段带出的任务 ID（业务段会带） */
export type ParsedSegment = { key: string; value: string | null; mapsTo: string | null; taskIds: string[] }
export type NameConflict = { field: string; fromNickname: string; fromPlatform: string }

export type AccountNameParse = {
  media: string
  accountId: string
  accountName: string
  ruleVersion: number
  status: ParseStatus
  segments: Record<string, ParsedSegment>
  taskIds: string[]
  conflicts: NameConflict[] | null
  override: Record<string, string> | null
  parsedAt: string
  confirmedAt: string | null
}

export const accountNamesFixture = accountNamesJson as unknown as Fixture<{ items: AccountNameParse[]; total: number }>

export type DryRunResult = { accountName: string; status: ParseStatus; segments: Record<string, ParsedSegment> }
export type DryRunResponse = { ruleVersion: number; results: DryRunResult[]; hitRate: number; counts: Record<string, number> }
export const namingRulesTestFixture = namingRulesTestJson as unknown as Fixture<DryRunResponse>

/** 维度值的来源角标（v1.8：每个维度带 source） */
export const dimensionSourceLabel: Record<string, string> = { nickname: "来自昵称", platform: "来自平台", manual: "人工改", qihang: "来自启航" }

/** 一条解析结果里填上了几段（用于列表里显命中程度） */
export function filledSegmentCount(segments: Record<string, ParsedSegment>): number {
  return Object.values(segments).filter((segment) => segment.value !== null && segment.value !== "").length
}
