"use client"

import { useState } from "react"
import { IconChevronRight } from "@tabler/icons-react"

import { cn } from "@/lib/utils"

/**
 * 缺数点名（契约 v1.9.33）。
 *
 * 起因：窗口合计里只要有**一个账户的一天**缺数，整个指标就落成 `missing`、页面显「−」，
 * 但用户看不到缺的是谁、哪天——只看见一个大大的「−」，没法判断该等还是该去催。
 * 后端现在把每个缺数的账户日点名发在 `lineage.warnings[]` 里，这里把它变成看得懂的一行：
 * 「N 个账户 · M 天数据缺失」，点开是清单。
 *
 * **不认识的告警码也照样列出来**（原样显示 code）。宁可多显一条看不懂的，
 * 也好过后端加了新告警而页面装作什么都没发生。
 */

export type LineageWarning = string | { code: string; media?: string; accountId?: string; businessDate?: string; fields?: string[] }

/** 有明确成因的两个码：拉数失败 vs 就是没数。用户处置方式不同，所以分开说。 */
const REASON: Record<string, string> = {
  BATCH_FAILED: "拉数失败",
  ACCOUNT_DAY_MISSING: "源未回数",
}

const FIELD_LABEL: Record<string, string> = {
  cost: "账面花费", cashCost: "现金花费", conversion: "转化数", realConversion: "真实转化",
  exposure: "曝光", click: "点击", incentiveCost: "激励花费", biConv: "考核 BI 数",
}

export function MissingDataNotice({ warnings }: { warnings?: LineageWarning[] }) {
  const [open, setOpen] = useState(false)
  const items = (warnings ?? []).filter((warning): warning is Exclude<LineageWarning, string> => typeof warning === "object")
  if (items.length === 0) return null

  const accounts = new Set(items.map((item) => `${item.media ?? ""}:${item.accountId ?? ""}`)).size
  const days = new Set(items.map((item) => item.businessDate ?? "")).size

  return (
    <div className="rounded-lg border border-status-warning/40 bg-status-warning/5 px-3 py-2 text-sm">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center gap-1.5 text-left focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
      >
        <IconChevronRight className={cn("size-3.5 shrink-0 transition-transform", open && "rotate-90")} />
        <span className="font-medium">{accounts} 个账户 · {days} 天数据缺失</span>
        <span className="text-muted-foreground">合计里这些天没算进去，所以相关指标显「−」</span>
      </button>
      {open ? (
        <ul className="mt-2 flex flex-col gap-1 border-t pt-2 text-xs text-muted-foreground">
          {items.map((item, index) => (
            <li key={`${item.code}|${item.media}|${item.accountId}|${item.businessDate}|${index}`} className="flex flex-wrap gap-x-2 tabular-nums">
              <span>{item.businessDate ?? "日期未标"}</span>
              <span className="text-foreground">{item.media ?? "—"} · {item.accountId ?? "账户未标"}</span>
              <span>{REASON[item.code] ?? item.code}</span>
              {item.fields?.length ? <span>缺：{item.fields.map((field) => FIELD_LABEL[field] ?? field).join("、")}</span> : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
