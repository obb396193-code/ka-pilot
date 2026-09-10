"use client"

import { useState } from "react"
import Link from "next/link"
import { IconChevronRight } from "@tabler/icons-react"

import { StatusChip } from "@/components/business/data-grid/data-grid"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { isOk, mv, rv } from "@/lib/fixtures/contract"
import { allocateBi, drillFixture, type DashboardRow } from "@/lib/fixtures/dashboard"
import { cn } from "@/lib/utils"

// F8-19 三级钻取：优化师 → 任务大类 → 细分任务 → 账户。
// 真实模式下每展开一层 = 一次 `POST /data/query`（带上游 filters），不是一次性把整棵树拉下来——
// 树全量下发在账户多的空间会非常大，而且大部分层永远不会被展开。
// 过渡期用 fixture 的 byParent 表模拟同样的「按需取下一层」。

const children = (parentKey: string): DashboardRow[] => {
  const table = isOk(drillFixture) ? drillFixture.data.byParent : {}
  return table[parentKey] ?? []
}

/** 账户层的 key 是 `<media>:<accountId>`，点进去要拆开 */
function accountHref(key: string): string | null {
  const [media, accountId] = key.split(":")
  return media && accountId ? `/accounts/${encodeURIComponent(media)}/${encodeURIComponent(accountId)}` : null
}

function Row({ row, depth, parentBi, parentCost, path, expanded, onToggle }: {
  row: DashboardRow; depth: number; parentBi: number | null; parentCost: number | null
  path: string; expanded: Set<string>; onToggle: (path: string) => void
}) {
  const kids = children(path)
  const open = expanded.has(path)
  // 下钻层后端不给考核 BI 数，按消耗占比从上一级分摊；**界面上标「分」，不让人当成实测值**
  // 契约里已有的 biz/task 维度不带 v1.9.22 的考核三项，只有 summary 和新维度带 —— 缺就走分摊
  const own = row.assessment.biConv?.value ?? null
  const bi = own ?? allocateBi(parentBi, parentCost, row.metrics.cost.value)
  const allocated = own === null && bi !== null
  const cash = row.metrics.cashCost.value
  const biCost = bi && cash !== null ? cash / bi : null
  const href = depth === 3 ? accountHref(row.key) : null

  return (
    <>
      <TableRow className={cn(kids.length > 0 && "cursor-pointer")} onClick={kids.length ? () => onToggle(path) : undefined}>
        <TableCell style={{ paddingLeft: 12 + depth * 18 }}>
          <span className="flex items-center gap-1.5">
            {kids.length ? <IconChevronRight className={cn("size-3.5 shrink-0 text-muted-foreground transition-transform", open && "rotate-90")} /> : <span className="w-3.5 shrink-0" />}
            {href ? <Link href={href} className="underline-offset-4 hover:underline" onClick={(event) => event.stopPropagation()}>{row.label}</Link> : <span className={cn(depth === 0 && "font-medium")}>{row.label}</span>}
          </span>
        </TableCell>
        <TableCell className="text-right tabular-nums">{mv(row.metrics.cost, "money0")}</TableCell>
        <TableCell className="text-right tabular-nums">{mv(row.metrics.cashCost, "money0")}</TableCell>
        <TableCell className="text-right tabular-nums">{mv(row.metrics.conversion)}</TableCell>
        <TableCell className="text-right tabular-nums">
          {bi === null ? "−" : <span className="inline-flex items-center gap-1">{bi.toLocaleString("zh-CN")}{allocated ? <span className="rounded bg-muted px-1 text-[10px] text-muted-foreground" title="上级按消耗占比分摊，不是实测值">分</span> : null}</span>}
        </TableCell>
        <TableCell className="text-right tabular-nums">{biCost === null ? "−" : `¥${biCost.toFixed(2)}`}</TableCell>
        <TableCell className="text-right tabular-nums">{rv(row.metrics.ratios.realCpa, "money")}</TableCell>
        <TableCell>
          {row.assessment.onTarget === null ? <span className="text-muted-foreground">−</span>
            : row.assessment.onTarget ? <StatusChip tone="success">达标</StatusChip> : <StatusChip tone="critical">超线</StatusChip>}
        </TableCell>
      </TableRow>
      {open ? kids.map((kid) => (
        <Row key={`${path}|${kid.key}`} row={kid} depth={depth + 1} parentBi={bi} parentCost={row.metrics.cost.value} path={`${path}|${kid.key}`} expanded={expanded} onToggle={onToggle} />
      )) : null}
    </>
  )
}

export function DrillTable({ rows, caption, rootBi = null, rootCost = null }: {
  rows: DashboardRow[]
  caption: string
  /** 顶层行的上级（= 窗口 summary）的考核 BI 数与消耗：顶层自己没有 biConv 时按占比分摊下来 */
  rootBi?: number | null
  rootCost?: number | null
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const toggle = (path: string) => setExpanded((prev) => {
    const next = new Set(prev)
    if (next.has(path)) next.delete(path); else next.add(path)
    return next
  })

  if (rows.length === 0) return <p className="rounded-lg border border-dashed px-3 py-8 text-center text-sm text-muted-foreground">这个窗口没有数据</p>

  return (
    <div className="flex flex-col gap-2">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader className="bg-muted">
            <TableRow>
              <TableHead className="min-w-48">{caption}</TableHead>
              <TableHead className="text-right">账面花费</TableHead>
              <TableHead className="text-right">现金花费</TableHead>
              <TableHead className="text-right">转化数</TableHead>
              <TableHead className="text-right">考核 BI 数</TableHead>
              <TableHead className="text-right">BI 现金成本</TableHead>
              <TableHead className="text-right">转化成本</TableHead>
              <TableHead>达标</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <Row key={row.key} row={row} depth={0} parentBi={row.assessment.biConv?.value ?? rootBi} parentCost={row.assessment.biConv?.value ? row.metrics.cost.value : rootCost} path={row.key} expanded={expanded} onToggle={toggle} />
            ))}
          </TableBody>
        </Table>
      </div>
      <p className="text-[11px] text-muted-foreground">点行展开下一级；带「分」的考核 BI 数是按消耗占比从上级分摊的，不是该层实测值。账户层可点进账户详情。</p>
    </div>
  )
}
