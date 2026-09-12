"use client"

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import type { LineageWarning } from "./missing-data-notice"

/**
 * 「部分」角标（契约 v1.9.35，老板拍板 B）。
 *
 * 窗口里有账户日还没到时，后端不再把整个指标打成 `missing`，而是给
 * **已有账户日的合计** + `availability:"partial"`。所以这个数是真的、可以看，
 * 只是**还会往上走**——角标说的就是这件事。
 *
 * 刻意不做的两件：**不降饱和、不打「−」**。把一个有真值的数显成灰的或者「−」，
 * 等于告诉用户「这里没数」，而实际上有数、只是没齐——那比不显还误导。
 */

const REASON: Record<string, string> = { BATCH_FAILED: "拉数失败", ACCOUNT_DAY_MISSING: "源未回数" }

/** 从 lineage 告警里数出「N 户 · M 天」，顺便给出前几条明细 */
export function partialSummary(warnings?: LineageWarning[]): { accounts: number; days: number; lines: string[] } | null {
  const items = (warnings ?? []).filter((warning): warning is Exclude<LineageWarning, string> => typeof warning === "object")
  if (items.length === 0) return null
  return {
    accounts: new Set(items.map((item) => `${item.media ?? ""}:${item.accountId ?? ""}`)).size,
    days: new Set(items.map((item) => item.businessDate ?? "")).size,
    lines: items.slice(0, 8).map((item) =>
      `${item.businessDate ?? "日期未标"} ${item.media ?? "—"}·${item.accountId ?? "账户未标"} ${REASON[item.code] ?? item.code}`),
  }
}

export function PartialMark({ warnings }: { warnings?: LineageWarning[] }) {
  const summary = partialSummary(warnings)
  const label = summary ? `部分 · 缺 ${summary.accounts} 户 ${summary.days} 日` : "部分"
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="cursor-help rounded bg-status-warning/15 px-1 text-[10px] text-status-warning">部分</span>
      </TooltipTrigger>
      <TooltipContent className="max-w-72">
        <p className="font-medium">{label}</p>
        <p className="mt-0.5 opacity-80">这个数是<b>已有账户日</b>的合计，缺的那些天还没算进来，数还会往上走。</p>
        {summary?.lines.length ? (
          <ul className="mt-1 flex flex-col gap-0.5 tabular-nums opacity-80">
            {summary.lines.map((line) => <li key={line}>{line}</li>)}
          </ul>
        ) : null}
      </TooltipContent>
    </Tooltip>
  )
}
