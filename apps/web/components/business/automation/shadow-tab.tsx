"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { createColumnHelper } from "@tanstack/react-table"
import { toast } from "sonner"

import { mediaLabel } from "@/components/business/accounts/account-status"
import { actionsColumn, DataGrid, dragColumn, MissingValue, selectionColumn, StatusChip, TypeChip, useGridTable, type GridFeatures } from "@/components/business/data-grid/data-grid"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { DropdownMenuItem } from "@/components/ui/dropdown-menu"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { fmtTime, isOk, mv, rv } from "@/lib/fixtures/contract"
import { actionKindLabel, shadowDecisionsFixture, shadowExamFixture, type ShadowDecision } from "@/lib/fixtures/v17"
import { cn } from "@/lib/utils"

// 自动化 · Shadow tab（v1.7 5.9 举证引擎）：决策点表（AI 建议 vs 人实际 vs T+1 / T+7 观察）+ 汇总卡 + 规则考试期四门；全程用词「操作后观察结果」
const helper = createColumnHelper<GridFeatures, ShadowDecision>()
const columns = helper.columns([
  dragColumn<ShadowDecision>(),
  selectionColumn<ShadowDecision>(),
  helper.accessor("decidedAt", { header: "时间", enableHiding: false, meta: { label: "时间" }, cell: ({ getValue }) => <span className="tabular-nums">{fmtTime(getValue())}</span> }),
  helper.accessor((row) => row.rule.name, { id: "rule", header: "规则", meta: { label: "规则" }, cell: ({ row }) => <span className="font-medium">{row.original.rule.name}</span> }),
  helper.accessor((row) => row.account.accountId, { id: "account", header: "账户", meta: { label: "账户" }, cell: ({ row }) => <Link href={`/accounts/${encodeURIComponent(row.original.account.media)}/${encodeURIComponent(row.original.account.accountId)}`} className="underline-offset-4 hover:underline">{mediaLabel(row.original.account.media)} · {row.original.account.accountId}</Link> }),
  helper.accessor((row) => row.aiAction.kind, { id: "ai", header: "AI 建议", meta: { label: "AI 建议" }, cell: ({ row }) => <span className="flex items-center gap-1.5 text-xs"><TypeChip>{actionKindLabel[row.original.aiAction.kind] ?? row.original.aiAction.kind}</TypeChip>{row.original.aiAction.target}{row.original.aiAction.delta !== null ? <span className="tabular-nums">{(row.original.aiAction.delta * 100).toFixed(0)}%</span> : null}</span> }),
  helper.accessor((row) => row.humanAction?.kind ?? "", { id: "human", header: "人实际", meta: { label: "人实际" }, cell: ({ row }) => row.original.humanAction ? <span className="text-xs"><TypeChip>{actionKindLabel[row.original.humanAction.kind] ?? row.original.humanAction.kind}</TypeChip> <span className="text-muted-foreground">{row.original.humanAction.source} · {fmtTime(row.original.humanAction.at)}</span></span> : <span className="text-xs text-muted-foreground">无动作</span> }),
  helper.accessor((row) => (row.adopted === null ? "" : row.adopted ? "yes" : "no"), { id: "adopted", header: "采纳", meta: { label: "采纳" }, cell: ({ row }) => row.original.adopted === null ? <StatusChip tone="muted">待定</StatusChip> : row.original.adopted ? <StatusChip tone="success">采纳</StatusChip> : <StatusChip tone="pending">未采纳</StatusChip> }),
  helper.accessor((row) => row.t1Result?.cashCpaDelta.value ?? null, { id: "t1", header: "T+1 观察", meta: { label: "T+1 观察", align: "right" }, cell: ({ row }) => row.original.t1Result ? <span className={cn("text-xs tabular-nums", (row.original.t1Result.cashCpaDelta.value ?? 0) < 0 ? "text-status-success" : "text-status-warning")}>CPA {rv(row.original.t1Result.cashCpaDelta, "money")} · 消耗 {mv(row.original.t1Result.costDelta, "money0")} · 转化 {mv(row.original.t1Result.realConversionDelta)}</span> : <MissingValue title="未成熟" /> }),
  helper.accessor((row) => row.t7Result?.cashCpaDelta.value ?? null, { id: "t7", header: "T+7 观察", meta: { label: "T+7 观察", align: "right" }, cell: ({ row }) => row.original.t7Result ? <span className="text-xs tabular-nums">CPA {rv(row.original.t7Result.cashCpaDelta, "money")}</span> : <MissingValue title="未成熟" /> }),
  helper.accessor("status", { header: "状态", meta: { label: "状态" }, cell: ({ getValue }) => <TypeChip>{getValue()}</TypeChip> }),
  actionsColumn<ShadowDecision>((row) => <DropdownMenuItem asChild><Link href={`/diagnostics/${row.workItemId}`}>看工作项</Link></DropdownMenuItem>),
])

export function ShadowTab() {
  const data = isOk(shadowDecisionsFixture) ? shadowDecisionsFixture.data : null
  const exam = isOk(shadowExamFixture) ? shadowExamFixture.data : null
  const [adopted, setAdopted] = useState<"all" | "yes" | "no">("all")
  const items = useMemo(() => (data?.items ?? []).filter((item) => adopted === "all" || (adopted === "yes" ? item.adopted === true : item.adopted === false)), [data, adopted])
  const table = useGridTable({ data: items, columns, pageSize: 20, getRowId: (item) => item.id, initialColumnVisibility: { status: false } })
  if (!data) return null
  const s = data.summary
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 @3xl/main:grid-cols-4">
        <Card><CardHeader className="pb-1"><CardDescription>决策点</CardDescription><CardTitle className="text-2xl tabular-nums">{s.n}</CardTitle></CardHeader><CardContent className="text-xs text-muted-foreground">成熟 T+1 {s.matured.t1} · T+7 {s.matured.t7}</CardContent></Card>
        <Card><CardHeader className="pb-1"><CardDescription>采纳率</CardDescription><CardTitle className="text-2xl tabular-nums">{rv(s.adoptedRate)}</CardTitle></CardHeader><CardContent className="text-xs text-muted-foreground">24h 内同账户同字段同向变更 = 采纳</CardContent></Card>
        <Card><CardHeader className="pb-1"><CardDescription>T+1 改善率 · 采纳 / 未采纳</CardDescription><CardTitle className="text-2xl tabular-nums">{rv(s.t1ImprovedRate.adopted)} <span className="text-base text-muted-foreground">/ {rv(s.t1ImprovedRate.notAdopted)}</span></CardTitle></CardHeader><CardContent className="text-xs text-muted-foreground">操作后观察结果</CardContent></Card>
        <Card><CardHeader className="pb-1"><CardDescription>T+7 改善率 · 采纳 / 未采纳</CardDescription><CardTitle className="text-2xl tabular-nums">{rv(s.t7ImprovedRate.adopted)} <span className="text-base text-muted-foreground">/ {rv(s.t7ImprovedRate.notAdopted)}</span></CardTitle></CardHeader><CardContent className="text-xs text-muted-foreground">T+7 尚无成熟样本</CardContent></Card>
      </div>
      <p className="rounded-lg border border-status-warning/30 bg-status-warning/10 px-3 py-2 text-xs text-status-warning">{s.caveat}</p>
      <DataGrid table={table} empty="没有决策点" toolbar={<Select value={adopted} onValueChange={(value) => setAdopted(value as typeof adopted)}><SelectTrigger size="sm" className="w-36" aria-label="采纳"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">全部</SelectItem><SelectItem value="yes">已采纳</SelectItem><SelectItem value="no">未采纳</SelectItem></SelectContent></Select>} showPagination={false} />
      {exam ? (
        <Card>
          <CardHeader><CardTitle>规则考试期 · 规则 {exam.ruleId}</CardTitle><CardDescription>{exam.days} 天 · 样本 {exam.sample} · 四门全过才提示可升自治度 3，人点确认才升</CardDescription></CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div className="grid gap-2 @3xl/main:grid-cols-4">
              {[
                { label: "观察改善率", pass: exam.gates.observation.pass, text: `${rv(exam.gates.observation.value)} · 门槛 ${(exam.gates.observation.threshold * 100).toFixed(0)}% · 最少 ${exam.gates.observation.minSample} 样本` },
                { label: "执行可靠性", pass: exam.gates.executionReliability.pass, text: `成功 ${rv(exam.gates.executionReliability.successRate)} · UNKNOWN ${rv(exam.gates.executionReliability.unknownRate)}` },
                { label: "范围", pass: exam.gates.scope.pass, text: exam.gates.scope.note },
                { label: "损失上限", pass: exam.gates.lossBound.pass, text: `30 日净损 ${mv(exam.gates.lossBound.netLoss30d, "money0")} · 上限 ¥${exam.gates.lossBound.threshold}` },
              ].map((gate) => <div key={gate.label} className="rounded-lg border px-3 py-2 text-sm"><div className="flex items-center justify-between"><span className="font-medium">{gate.label}</span>{gate.pass ? <StatusChip tone="success">过</StatusChip> : <StatusChip tone="critical">未过</StatusChip>}</div><p className="mt-1 text-xs text-muted-foreground">{gate.text}</p></div>)}
            </div>
            <div className="flex items-center gap-2 text-sm">{exam.eligibleForAutonomy3 ? <StatusChip tone="success">可升自治度 3</StatusChip> : <StatusChip tone="muted">暂不可升</StatusChip>}<Button size="sm" variant="outline" disabled={!exam.eligibleForAutonomy3} onClick={() => toast("已升自治度 3", { description: "接口接入后生效（当前为示例）" })}>确认升档</Button></div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}
