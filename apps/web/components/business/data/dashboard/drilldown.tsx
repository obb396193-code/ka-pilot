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

/**
 * 账户行按 **key 的形态**判，不按层级深度：`<MEDIA>:<accountId>` 才是账户。
 * 按 depth 判是错的——优化师树的账户在第 3 层、任务大类树的账户在第 2 层，
 * 写死 depth 会让后者永远不是链接（审查员 C ⑭）。
 */
function accountHref(key: string): string | null {
  const match = /^([A-Z0-9_]{1,32}):([A-Za-z0-9_-]{1,128})$/.exec(key)
  return match ? `/accounts/${encodeURIComponent(match[1])}/${encodeURIComponent(match[2])}` : null
}

const cny2 = new Intl.NumberFormat("zh-CN", { style: "currency", currency: "CNY", maximumFractionDigits: 2 })

/** 「分」= 这个数是按消耗占比从上级分摊来的，不是该层实测值 */
function Allocated() {
  return <span className="rounded bg-muted px-1 text-[10px] text-muted-foreground" title="按消耗占比从上级分摊，不是该层实测值">分</span>
}

function Row({ row, depth, siblings, parentBi, path, expanded, onToggle }: {
  row: DashboardRow
  depth: number
  /** 同级已返回的行：分摊的分母取它们的消耗之和，不是父行消耗 */
  siblings: DashboardRow[]
  parentBi: DashboardRow["assessment"]["biConv"] | null
  path: string
  expanded: Set<string>
  onToggle: (path: string) => void
}) {
  const kids = children(path)
  const open = expanded.has(path)
  // 后端给了这一层的考核 BI 数就直接用，不重算；没给才按消耗占比从上级分摊
  const own = row.assessment.biConv
  const measured = own && own.availability === "available" ? own.value : null
  const allocatedBi = measured === null ? allocateBi({ parentBi, siblings, childCost: row.metrics.cost.value }) : null
  const bi = measured ?? allocatedBi
  const isAllocated = measured === null && allocatedBi !== null
  // 后端给了 biCashCost 就用它，别拿分摊值再除一遍——两个口径会打架
  const backendBiCost = row.assessment.biCashCost
  const cash = row.metrics.cashCost.value
  const derivedBiCost = bi !== null && bi !== 0 && cash !== null ? cash / bi : null
  const biCost = backendBiCost && backendBiCost.availability === "available" ? backendBiCost.value : derivedBiCost
  // 派生出来的成本同样是「分」的——它建立在分摊值之上（审查员 D ③）
  const biCostAllocated = (!backendBiCost || backendBiCost.availability !== "available") && isAllocated
  const href = accountHref(row.key)

  return (
    <>
      <TableRow>
        <TableCell style={{ paddingLeft: 12 + depth * 18 }}>
          <span className="flex items-center gap-1.5">
            {kids.length ? (
              // 整行可点在这里不合适：行内还有账户链接，点链接会连带展开。
              // 改成行内按钮 + aria-expanded，键盘也能到（审查员 C ⑬）
              <button
                type="button"
                aria-expanded={open}
                aria-label={`${open ? "收起" : "展开"} ${row.label}`}
                onClick={() => onToggle(path)}
                className="rounded p-0.5 text-muted-foreground hover:bg-muted focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
              >
                <IconChevronRight className={cn("size-3.5 transition-transform", open && "rotate-90")} />
              </button>
            ) : <span className="w-[22px] shrink-0" />}
            {href ? <Link href={href} className="underline-offset-4 hover:underline">{row.label}</Link> : <span className={cn(depth === 0 && "font-medium")}>{row.label}</span>}
          </span>
        </TableCell>
        <TableCell className="text-right tabular-nums">{mv(row.metrics.cost, "money0")}</TableCell>
        <TableCell className="text-right tabular-nums">{row.metrics.incentiveCost ? mv(row.metrics.incentiveCost, "money0") : <span className="text-muted-foreground">待接源</span>}</TableCell>
        <TableCell className="text-right tabular-nums">{mv(row.metrics.cashCost, "money0")}</TableCell>
        <TableCell className="text-right tabular-nums">{mv(row.metrics.conversion)}</TableCell>
        <TableCell className="text-right tabular-nums">
          {bi === null ? "−" : <span className="inline-flex items-center gap-1">{bi.toLocaleString("zh-CN")}{isAllocated ? <Allocated /> : null}</span>}
        </TableCell>
        <TableCell className="text-right tabular-nums">{rv(row.metrics.ratios.gap)}</TableCell>
        <TableCell className="text-right tabular-nums">
          {biCost === null ? "−" : <span className="inline-flex items-center gap-1">{cny2.format(biCost)}{biCostAllocated ? <Allocated /> : null}</span>}
        </TableCell>
        <TableCell className="text-right tabular-nums">{rv(row.metrics.ratios.realCpa, "money")}</TableCell>
        <TableCell>
          {row.assessment.onTarget === null ? <span className="text-muted-foreground">−</span>
            : row.assessment.onTarget ? <StatusChip tone="success">达标</StatusChip> : <StatusChip tone="critical">超线</StatusChip>}
        </TableCell>
      </TableRow>
      {open ? kids.map((kid) => (
        <Row key={`${path}|${kid.key}`} row={kid} depth={depth + 1} siblings={kids} parentBi={own ?? parentBi} path={`${path}|${kid.key}`} expanded={expanded} onToggle={onToggle} />
      )) : null}
    </>
  )
}

export function DrillTable({ rows, caption, rootBi = null }: {
  rows: DashboardRow[]
  caption: string
  /** 顶层行的上级（= 窗口 summary）的考核 BI 数：顶层自己没有时按占比分摊下来 */
  rootBi?: DashboardRow["assessment"]["biConv"] | null
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
              <TableHead className="text-right">激励</TableHead>
              <TableHead className="text-right">现金花费</TableHead>
              <TableHead className="text-right">转化数</TableHead>
              <TableHead className="text-right">考核 BI 数</TableHead>
              <TableHead className="text-right">回传 GAP</TableHead>
              <TableHead className="text-right">BI 现金成本</TableHead>
              <TableHead className="text-right">转化成本</TableHead>
              <TableHead>达标</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <Row key={row.key} row={row} depth={0} siblings={rows} parentBi={row.assessment.biConv ?? rootBi} path={row.key} expanded={expanded} onToggle={toggle} />
            ))}
          </TableBody>
        </Table>
      </div>
      <p className="text-[11px] text-muted-foreground">点箭头展开下一级；带「分」的数是按消耗占比从上级分摊的，不是该层实测值。账户行可点进账户详情。</p>
    </div>
  )
}
