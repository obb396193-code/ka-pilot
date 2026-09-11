"use client"

import { isOk } from "@/lib/fixtures/contract"
import { namingRulesFixture } from "@/lib/fixtures/naming"

/**
 * F8-22 自定义透视：可选维度 = **固定 8 维 + 该媒体命名规则里的可分析段**。
 *
 * 段维度用 `segment:<key>` 传给后端（契约 v1.9.27），例如腾讯的
 * `segment:bid_mode` / `segment:device` / `segment:landing`——
 * 这样新增一个媒体的命名规则，透视的可选维度自动多出来，不用改前端。
 */

export type PivotDimension = { value: string; label: string; group: "固定维度" | "命名规则段" }

/** 契约里冻结的 8 个固定维度 */
const FIXED: PivotDimension[] = [
  { value: "task", label: "任务", group: "固定维度" },
  { value: "biz", label: "业务", group: "固定维度" },
  { value: "account", label: "账户", group: "固定维度" },
  { value: "agent_type", label: "代理 / 自投", group: "固定维度" },
  { value: "resource_position", label: "资源位", group: "固定维度" },
  { value: "bid_tool", label: "出价工具", group: "固定维度" },
  { value: "ubp", label: "UBP", group: "固定维度" },
  { value: "deduction_range", label: "扣量区间", group: "固定维度" },
]

/** 固定 8 维已经覆盖的语义：命名规则里映射到同一维度的段不再重复列一遍 */
const COVERED = new Set(["biz", "agent_type", "resource_position", "bid_tool", "ubp", "deduction_range", "task", "account"])

export function pivotDimensions(): PivotDimension[] {
  const rule = isOk(namingRulesFixture) ? namingRulesFixture.data : null
  const segments = (rule?.segments ?? [])
    .filter((segment) => {
      // v1.9.27 给段加了 `analyzable`；后端还没发这个字段时，
      // 退回「有 mapsTo 就是可分析段」——能映射到一个业务维度的段，按定义就是能拿来分析的。
      const flag = (segment as { analyzable?: boolean }).analyzable
      if (typeof flag === "boolean") return flag
      return segment.mapsTo !== null && segment.mapsTo !== undefined
    })
    .filter((segment) => !COVERED.has(segment.mapsTo ?? segment.key))
    .map((segment) => ({ value: `segment:${segment.key}`, label: segment.label, group: "命名规则段" as const }))

  // 同一个 key 可能既在固定维度又在段里（不同媒体规则重名），去重保固定那份
  const seen = new Set(FIXED.map((item) => item.value))
  return [...FIXED, ...segments.filter((item) => !seen.has(item.value))]
}

/** 指标集：透视格子里显示哪几个数 */
export type PivotMetric = { value: string; label: string; kind: "money" | "int" | "percent" | "moneyRatio" }
export const PIVOT_METRICS: PivotMetric[] = [
  { value: "cost", label: "账面消耗", kind: "money" },
  { value: "cashCost", label: "现金消耗", kind: "money" },
  { value: "realConversion", label: "真实转化", kind: "int" },
  { value: "conversion", label: "转化数", kind: "int" },
  { value: "cashCpa", label: "现金 CPA", kind: "moneyRatio" },
  { value: "realCpa", label: "转化成本", kind: "moneyRatio" },
  { value: "ctr", label: "点击率", kind: "percent" },
  { value: "cvr", label: "转化率", kind: "percent" },
  { value: "gap", label: "回传 GAP", kind: "percent" },
  { value: "costSpace", label: "成本空间", kind: "money" },
]
