"use client"

import { useState } from "react"
import Link from "next/link"
import { IconChevronRight, IconLoader2 } from "@tabler/icons-react"

import { StatusChip } from "@/components/business/data-grid/data-grid"
import type { DataWindow } from "@/components/business/data/dashboard/window-picker"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { mv, normalizeBiCost, rv } from "@/lib/fixtures/contract"
import { allocateBi, type DashboardRow } from "@/lib/fixtures/dashboard"
import { useDrillChildren } from "@/lib/data/use-dashboard"
import { cn } from "@/lib/utils"

/**
 * 三级钻取表。层级由 `levels` 给（优化师树 = optimizer→biz→task→account，
 * 任务大类树 = biz→task→account），**每展开一层发一次带上游 filters 的查询**——
 * 树全量下发在账户多的空间会非常大，而且大部分层永远不会被展开。
 *
 * 未展开时不知道某行有没有下一级（真实模式没查过），所以：
 * 非叶子层一律给展开箭头，点开若为空就说「没有下一级」——
 * 比「先查一遍全部只为决定要不要画箭头」诚实也便宜。
 */

/** 每一级维度对应的 filter 键：逐级把上游选中的值带下去 */
const FILTER_KEY: Record<string, string> = { optimizer: "optimizer", biz: "biz", task: "task_id", account: "account_id" }

/**
 * 账户行按 **key 的形态**判，不按层级深度：`<MEDIA>:<accountId>` 才是账户。
 * 按 depth 判是错的——优化师树的账户在第 3 层、任务大类树在第 2 层，
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

type Shared = {
  levels: string[]
  window: DataWindow
  workspaceId: string | undefined
  expanded: Set<string>
  onToggle: (path: string) => void
  /** 结果被截断或只是部分：整列不分摊 */
  incomplete: boolean
}

function Row({ row, depth, siblings, parentBi, path, filters, shared }: {
  row: DashboardRow
  depth: number
  /** 同级已返回的行：分摊的分母取它们的消耗之和，不是父行消耗 */
  siblings: DashboardRow[]
  parentBi: DashboardRow["assessment"]["biConv"] | null
  path: string
  /** 从祖先累积下来的上游过滤条件 */
  filters: Record<string, unknown>
  shared: Shared
}) {
  const { levels, window, workspaceId, expanded, onToggle, incomplete } = shared
  const nextDimension = levels[depth + 1]
  const isLeaf = nextDimension === undefined
  const open = expanded.has(path)
  const childFilters = { ...filters, [FILTER_KEY[levels[depth]] ?? levels[depth]]: [row.key] }
  // 只有展开时才查下一层（未展开时 path 传空，hook 内不发请求）
  const kids = useDrillChildren(open ? path : "", nextDimension ?? "account", childFilters, window, workspaceId)

  // 后端给了这一层的考核 BI 数就直接用，不重算；没给才按消耗占比从上级分摊
  const own = row.assessment.biConv
  const measured = own && own.availability === "available" ? own.value : null
  const allocatedBi = measured === null ? allocateBi({ parentBi, siblings, childCost: row.metrics.cost.value, incomplete }) : null
  const bi = measured ?? allocatedBi
  const isAllocated = measured === null && allocatedBi !== null
  // 后端给了 biCashCost 就用它，别拿分摊值再除一遍——两个口径会打架。
  // v1.9.32 起它可能是 RatioValue（含 `infinite`），两形归一走 normalizeBiCost。
  const backendBiCost = normalizeBiCost(row.assessment.biCashCost)
  const cash = row.metrics.cashCost.value
  const derivedBiCost = bi !== null && bi !== 0 && cash !== null ? cash / bi : null
  const biCost = backendBiCost.known ? backendBiCost.value : derivedBiCost
  // 派生出来的成本同样是「分」的——它建立在分摊值之上（审查员 D ③）
  const biCostAllocated = !backendBiCost.known && !backendBiCost.infinite && isAllocated
  const href = accountHref(row.key)
  const childRows = kids.data ?? []

  return (
    <>
      <TableRow>
        <TableCell style={{ paddingLeft: 12 + depth * 18 }}>
          <span className="flex items-center gap-1.5">
            {isLeaf ? <span className="w-[22px] shrink-0" /> : (
              // 整行可点在这里不合适：行内还有账户链接，点链接会连带展开。
              // 改成行内按钮 + aria-expanded，键盘也能到（审查员 C ⑬）
              <button
                type="button"
                aria-expanded={open}
                aria-label={`${open ? "收起" : "展开"} ${row.label}`}
                onClick={() => onToggle(path)}
                className="rounded p-0.5 text-muted-foreground hover:bg-muted focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
              >
                {open && kids.loading
                  ? <IconLoader2 className="size-3.5 animate-spin" />
                  : <IconChevronRight className={cn("size-3.5 transition-transform", open && "rotate-90")} />}
              </button>
            )}
            {href ? <Link href={href} className="underline-offset-4 hover:underline">{row.label}</Link> : <span className={cn(depth === 0 && "font-medium")}>{row.label}</span>}
          </span>
        </TableCell>
        <TableCell className="text-right tabular-nums">{mv(row.metrics.cost, "money0")}</TableCell>
        <TableCell className="text-right tabular-nums">{mv(row.metrics.incentiveCost, "money0")}</TableCell>
        <TableCell className="text-right tabular-nums">{mv(row.metrics.cashCost, "money0")}</TableCell>
        <TableCell className="text-right tabular-nums">{mv(row.metrics.conversion)}</TableCell>
        <TableCell className="text-right tabular-nums">
          {bi === null ? "−" : <span className="inline-flex items-center gap-1">{bi.toLocaleString("zh-CN")}{isAllocated ? <Allocated /> : null}</span>}
        </TableCell>
        <TableCell className="text-right tabular-nums">{rv(row.metrics.ratios.gap)}</TableCell>
        <TableCell className="text-right tabular-nums">
          {backendBiCost.infinite ? <span title="花了现金但一个 BI 都没回传">∞</span>
            : biCost === null ? "−"
            : <span className="inline-flex items-center gap-1">{cny2.format(biCost)}{biCostAllocated ? <Allocated /> : null}</span>}
        </TableCell>
        <TableCell className="text-right tabular-nums">{rv(row.metrics.ratios.realCpa, "money")}</TableCell>
        <TableCell>
          {row.assessment.onTarget === null ? <span className="text-muted-foreground">−</span>
            : row.assessment.onTarget ? <StatusChip tone="success">达标</StatusChip> : <StatusChip tone="critical">超线</StatusChip>}
        </TableCell>
      </TableRow>
      {open && kids.error ? (
        <TableRow><TableCell colSpan={10} className="text-xs text-status-critical" style={{ paddingLeft: 30 + depth * 18 }}>
          展开失败：{kids.error.message}
          {kids.error.requestId ? <span className="ml-1 text-muted-foreground">（问题编号 {kids.error.requestId}）</span> : null}
          <button type="button" onClick={kids.reload} className="ml-2 underline underline-offset-2">重试</button>
        </TableCell></TableRow>
      ) : null}
      {open && !kids.loading && !kids.error && childRows.length === 0 ? (
        <TableRow><TableCell colSpan={10} className="text-xs text-muted-foreground" style={{ paddingLeft: 30 + depth * 18 }}>没有下一级</TableCell></TableRow>
      ) : null}
      {open ? childRows.map((kid) => (
        <Row
          key={`${path}|${kid.key}`}
          row={kid}
          depth={depth + 1}
          siblings={childRows}
          parentBi={own ?? parentBi}
          path={`${path}|${kid.key}`}
          filters={childFilters}
          shared={shared}
        />
      )) : null}
    </>
  )
}

export function DrillTable({ rows, caption, levels, window, workspaceId, rootBi = null, incomplete = false }: {
  rows: DashboardRow[]
  caption: string
  /** 从上到下的维度序列，例如 ["optimizer","biz","task","account"] */
  levels: string[]
  window: DataWindow
  workspaceId: string | undefined
  /** 顶层行的上级（= 窗口 summary）的考核 BI 数：顶层自己没有时按占比分摊下来 */
  rootBi?: DashboardRow["assessment"]["biConv"] | null
  /** 结果被截断或只是部分：整列不分摊 */
  incomplete?: boolean
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const toggle = (path: string) => setExpanded((prev) => {
    const next = new Set(prev)
    if (next.has(path)) next.delete(path); else next.add(path)
    return next
  })
  const shared: Shared = { levels, window, workspaceId, expanded, onToggle: toggle, incomplete }

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
              <Row
                key={row.key}
                row={row}
                depth={0}
                siblings={rows}
                parentBi={row.assessment.biConv ?? rootBi}
                path={row.key}
                filters={{}}
                shared={shared}
              />
            ))}
          </TableBody>
        </Table>
      </div>
      <p className="text-[11px] text-muted-foreground">
        点箭头展开下一级（每展开一层向后端查一次）；带「分」的数是按消耗占比从上级分摊的，不是该层实测值。账户行可点进账户详情。
        {incomplete ? <span className="ml-1 text-status-warning">结果不完整，本页不做分摊。</span> : null}
      </p>
    </div>
  )
}
