"use client"

import { useState } from "react"
import Link from "next/link"
import { IconChevronRight } from "@tabler/icons-react"

import { mediaLabel } from "@/components/business/accounts/account-status"
import { StatusChip, TypeChip } from "@/components/business/data-grid/data-grid"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { mv, rv } from "@/lib/fixtures/contract"
import { adLevelSourceLabel, type AttributionTree, type GapNode } from "@/lib/fixtures/v17"
import { cn } from "@/lib/utils"

// 归因树（v1.7 3.7，原型 P02 目标差距树）：只画有公式的节点；undeterminable → 灰显「数据不足」，不显金额、不显"可优化空间"；证据抽屉列账户
const undeterminable = (node: GapNode) => node.availability === "undeterminable" || node.gap.availability !== "available"

function NodeCard({ node, depth, mode, onEvidence }: { node: GapNode; depth: number; mode: "volume" | "cost"; onEvidence: (node: GapNode) => void }) {
  const [open, setOpen] = useState(depth < 2)
  const grey = undeterminable(node)
  const children = node.children ?? []
  return (
    <div className={cn("flex flex-col gap-2", depth > 0 && "ml-5 border-l pl-4")}>
      <div className={cn("flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2", grey ? "border-dashed text-muted-foreground" : "bg-card")}>
        {children.length ? <button type="button" onClick={() => setOpen((value) => !value)} aria-label={open ? "收起" : "展开"} className="grid size-5 place-items-center rounded hover:bg-muted"><IconChevronRight className={cn("size-3.5 transition-transform", open && "rotate-90")} /></button> : <span className="w-5" />}
        <span className={cn("text-sm font-medium", grey && "font-normal")}>{node.label}</span>
        {grey ? <StatusChip tone="muted">数据不足</StatusChip> : <span className="text-sm font-semibold tabular-nums">{mode === "cost" ? mv(node.gap, "money0") : mv(node.gap)}</span>}
        {!grey && node.share ? <TypeChip className="tabular-nums">占 {rv(node.share)}</TypeChip> : null}
        {!grey && node.share?.state === "finite" && node.share.value !== null ? <span className="h-1.5 w-24 overflow-hidden rounded-full bg-muted"><span className="block h-full rounded-full" style={{ width: `${Math.min(100, node.share.value * 100)}%`, background: "var(--kp-chart-spend)" }} /></span> : null}
        {node.evidence?.accounts?.length ? <Button size="sm" variant="ghost" className="ml-auto h-7 text-xs" onClick={() => onEvidence(node)}>证据 · {node.evidence.accounts.length} 户</Button> : null}
      </div>
      {open && children.length ? <div className="flex flex-col gap-2">{children.map((child) => <NodeCard key={child.key} node={child} depth={depth + 1} mode={mode} onEvidence={onEvidence} />)}</div> : null}
    </div>
  )
}

export function GapTree({ tree, title = "目标差距" }: { tree: AttributionTree; title?: string }) {
  const [evidence, setEvidence] = useState<GapNode | null>(null)
  const root = tree.root
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline gap-3 rounded-xl border bg-foreground px-4 py-3 text-background">
        <span className="text-sm">{root.label || title}</span>
        <span className="text-2xl font-semibold tabular-nums">{tree.mode === "cost" ? mv(root.gap, "money0") : mv(root.gap)}</span>
        {root.gapRate ? <span className="text-sm opacity-80 tabular-nums">占目标 {rv(root.gapRate)}</span> : null}
        <span className="ml-auto text-[11px] opacity-70">{tree.mode === "volume" ? "量：目标 − 预计完成" : "成本：Σ(现金 CPA − 考核价) × 超标转化"} · 广告级来源 {adLevelSourceLabel[tree.lineage.adLevelSource] ?? tree.lineage.adLevelSource}</span>
      </div>
      <div className="flex flex-col gap-2">{tree.children.map((child) => <NodeCard key={child.key} node={child} depth={0} mode={tree.mode} onEvidence={setEvidence} />)}</div>
      <p className="text-[11px] text-muted-foreground">灰色节点 = 数据不足，不显示金额、不估「可优化空间」；窗口 {tree.lineage.window.from} ～ {tree.lineage.window.to}</p>
      <Sheet open={evidence !== null} onOpenChange={(open) => { if (!open) setEvidence(null) }}>
        <SheetContent side="right" className="sm:max-w-lg">
          <SheetHeader><SheetTitle>证据 · {evidence?.label}</SheetTitle><SheetDescription>节点 evidence.accounts · 同口径来自数据分析</SheetDescription></SheetHeader>
          <div className="px-4 pb-4">
            <Table>
              <TableHeader className="bg-muted"><TableRow><TableHead>账户</TableHead><TableHead className="text-right">现金 CPA</TableHead><TableHead className="text-right">考核价</TableHead><TableHead className="text-right">消耗占比</TableHead><TableHead>备注</TableHead></TableRow></TableHeader>
              <TableBody>{(evidence?.evidence?.accounts ?? []).map((account) => <TableRow key={account.accountId}><TableCell><Link href={`/accounts/${encodeURIComponent(account.media)}/${encodeURIComponent(account.accountId)}`} className="underline-offset-4 hover:underline">{mediaLabel(account.media)} · {account.accountId}</Link></TableCell><TableCell className="text-right tabular-nums">{account.cashCpa ? rv(account.cashCpa, "money") : "−"}</TableCell><TableCell className="text-right tabular-nums">{account.price != null ? `¥${account.price.toFixed(2)}` : "−"}</TableCell><TableCell className="text-right tabular-nums">{account.costShare ? rv(account.costShare) : "−"}</TableCell><TableCell className="text-xs text-muted-foreground">{account.note ?? "−"}</TableCell></TableRow>)}</TableBody>
            </Table>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  )
}
