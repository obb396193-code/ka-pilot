"use client"

import { IconDownload } from "@tabler/icons-react"

import { DimensionChart } from "./dimension-chart"
import { Button } from "@/components/ui/button"
import { csvName, downloadCsv } from "@/lib/data/export-csv"
import { PartialMark } from "./partial-mark"
import { StatusChip } from "@/components/business/data-grid/data-grid"
import { Card, CardContent } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { isPartial, mv, rv } from "@/lib/fixtures/contract"
import type { DashboardRow } from "@/lib/fixtures/dashboard"
import type { LineageWarning } from "./missing-data-notice"

/**
 * 一张分布卡 = 图 + **同源明细表**（契约 v1.9.29 的硬要求：只有饼图不算完成）。
 *
 * 为什么明细表是硬要求：饼图只能回答「谁占得多」，回答不了「它达标没有、成本多少、
 * 这个数是几个账户堆出来的」。优化师真正要做决定时看的是后面这几个。
 * 图和表**必须同源**——各取各的数是「同一屏两个真相」，比只给图更坏。
 *
 * 「样本量」取归属来源里的账户数之和（`sources`，只有命名维度行才有）：
 * 一个只有 1 个账户的分组和 30 个账户的分组，占比一样但可信度差远了。
 * 悬停能看到这些账户是**怎么归上来的**（昵称解析 / 人工 / 平台 / 启航）——
 * 昵称解析占比高的分组，规则一改数就会变，得知道。
 */

type NamedRow = DashboardRow & { sources?: Partial<Record<"manual" | "nickname" | "platform" | "qihang", number>> }

const SOURCE_LABEL: Record<string, string> = { manual: "人工", nickname: "昵称解析", platform: "平台", qihang: "启航" }

function sampleSize(row: NamedRow): { total: number; parts: string[] } | null {
  const sources = row.sources
  if (!sources) return null
  const entries = Object.entries(sources).filter(([, count]) => typeof count === "number" && count > 0)
  if (entries.length === 0) return null
  return {
    total: entries.reduce((sum, [, count]) => sum + (count ?? 0), 0),
    parts: entries.map(([key, count]) => `${SOURCE_LABEL[key] ?? key} ${count}`),
  }
}

export function DistributionCard({ id, title, description, rows, colorKey, warnings, window }: {
  id: string
  title: string
  description: string
  rows: DashboardRow[]
  colorKey?: string
  warnings?: LineageWarning[]
  /** 导出文件名里带上窗口——一堆「导出.csv」躺在下载目录里谁也认不出哪个是哪个 */
  window?: { from: string; to: string }
}) {
  const named = rows as NamedRow[]

  /**
   * 导出的是**屏幕上这份**，不再向后端要一次：
   * 两次请求之间数据可能已经变了，人会拿到一份和刚才看的不一样的表，而且看不出来。
   * 所以缺数在 CSV 里也是「−」、部分合计也带标记，和明细表一字不差。
   */
  const exportCsv = () => {
    downloadCsv(
      csvName("分布", window ?? { from: "", to: "" }, title),
      ["分组", "花费", "真实转化", "现金 CPA", "考核达标", "样本量"],
      named.map((row) => [
        row.label,
        mv(row.metrics.cost, "money0") + (isPartial(row.metrics.cost) ? "（部分）" : ""),
        mv(row.metrics.realConversion) + (isPartial(row.metrics.realConversion) ? "（部分）" : ""),
        rv(row.metrics.ratios.cashCpa, "money"),
        row.assessment.onTarget === null
          ? (row.assessment.costStatusReason === "partial_data" ? "待补齐" : "−")
          : row.assessment.onTarget ? "达标" : "超线",
        sampleSize(row)?.total ?? "",
      ]),
    )
  }
  return (
    <Card>
      <CardContent className="flex flex-col gap-3 pt-5">
        <DimensionChart id={id} title={title} description={description} rows={rows} colorKey={colorKey} height={220} />
        {rows.length ? (
          <>
          <div className="flex justify-end">
            <Button variant="ghost" size="sm" className="h-6 gap-1 px-1.5 text-xs font-normal text-muted-foreground" onClick={exportCsv}>
              <IconDownload className="size-3" />导出 CSV
            </Button>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader className="bg-muted">
                <TableRow>
                  <TableHead className="min-w-28">分组</TableHead>
                  <TableHead className="text-right">花费</TableHead>
                  <TableHead className="text-right">真实转化</TableHead>
                  <TableHead className="text-right">现金 CPA</TableHead>
                  <TableHead>考核达标</TableHead>
                  <TableHead className="text-right">样本量</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {named.map((row) => {
                  const sample = sampleSize(row)
                  return (
                    <TableRow key={row.key}>
                      <TableCell className="font-medium">{row.label}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        <span className="inline-flex items-center gap-1">{mv(row.metrics.cost, "money0")}{isPartial(row.metrics.cost) ? <PartialMark warnings={warnings} /> : null}</span>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        <span className="inline-flex items-center gap-1">{mv(row.metrics.realConversion)}{isPartial(row.metrics.realConversion) ? <PartialMark warnings={warnings} /> : null}</span>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{rv(row.metrics.ratios.cashCpa, "money")}</TableCell>
                      <TableCell>
                        {row.assessment.onTarget === null
                          // 判定挂起（部分合计）和「不可判断」不是一回事，文案分开
                          ? <span className="text-xs text-muted-foreground">{row.assessment.costStatusReason === "partial_data" ? "待补齐" : "−"}</span>
                          : row.assessment.onTarget ? <StatusChip tone="success">达标</StatusChip> : <StatusChip tone="critical">超线</StatusChip>}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {sample ? (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="cursor-help border-b border-dotted border-muted-foreground/50">{sample.total}</span>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>这个分组由 {sample.total} 个账户构成</p>
                              <p className="mt-0.5 opacity-80">归属来源：{sample.parts.join(" · ")}</p>
                            </TooltipContent>
                          </Tooltip>
                        ) : <span className="text-muted-foreground">−</span>}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
          </>
        ) : null}
      </CardContent>
    </Card>
  )
}
