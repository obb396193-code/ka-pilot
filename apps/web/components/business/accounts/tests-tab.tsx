"use client"

import { useState } from "react"
import { IconPlus } from "@tabler/icons-react"
import { createColumnHelper } from "@tanstack/react-table"
import { toast } from "sonner"

import { actionsColumn, DataGrid, MissingValue, selectionColumn, StatusChip, TypeChip, useGridTable, type GridFeatures, type StatusTone } from "@/components/business/data-grid/data-grid"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { DropdownMenuItem } from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { testsFixture, type AccountTest } from "@/lib/fixtures/accounts"
import { isOk, mv, rv } from "@/lib/fixtures/contract"
import { accountStatusTone, mediaLabel } from "./account-status"

// 开户测试跟踪（v1.6 4.7，P1）：列表 + 新建 + 结论填写；系统每日刷新 result（只算不判），结论由人填
const statusMeta: Record<AccountTest["status"], { label: string; tone: StatusTone }> = { planned: { label: "计划中", tone: "pending" }, running: { label: "进行中", tone: "progress" }, passed: { label: "通过", tone: "success" }, failed: { label: "未通过", tone: "critical" }, stopped: { label: "已停止", tone: "muted" } }

const helper = createColumnHelper<GridFeatures, AccountTest>()
function buildColumns(onVerdict: (test: AccountTest) => void) {
  return helper.columns([
    selectionColumn<AccountTest>(),
    helper.accessor("purpose", { header: "测试目的", enableHiding: false, meta: { label: "测试目的" }, cell: ({ row }) => <div className="flex flex-col"><span className="font-medium">{row.original.purpose}</span>{row.original.hypothesis ? <span className="text-xs text-muted-foreground">假设：{row.original.hypothesis}</span> : null}</div> }),
    helper.accessor("accountId", { header: "账户", meta: { label: "账户" }, cell: ({ row }) => <span className="flex items-center gap-1.5"><TypeChip>{mediaLabel(row.original.media)}</TypeChip><span className="font-mono text-xs">{row.original.accountId}</span></span> }),
    helper.accessor("taskId", { header: "任务", meta: { label: "任务" }, cell: ({ getValue }) => getValue() ? <TypeChip>{getValue()}</TypeChip> : <MissingValue /> }),
    helper.accessor("status", { header: "状态", meta: { label: "状态" }, cell: ({ getValue }) => <StatusChip tone={statusMeta[getValue()].tone}>{statusMeta[getValue()].label}</StatusChip> }),
    helper.accessor("startedAt", { header: "窗口", meta: { label: "窗口" }, cell: ({ row }) => <span className="tabular-nums">{row.original.startedAt.slice(5)} – {row.original.endAt?.slice(5) ?? "进行中"}</span> }),
    helper.accessor((row) => row.result?.metrics.cashCost.value ?? null, { id: "cashCost", header: "现金消耗", meta: { label: "现金消耗", align: "right" }, cell: ({ row }) => <span className="tabular-nums">{mv(row.original.result?.metrics.cashCost, "money0")}</span> }),
    helper.accessor((row) => row.result?.metrics.realConversion.value ?? null, { id: "realConversion", header: "真实转化", meta: { label: "真实转化", align: "right" }, cell: ({ row }) => <span className="tabular-nums">{mv(row.original.result?.metrics.realConversion)}</span> }),
    helper.accessor((row) => row.result?.metrics.ratios.cashCpa.value ?? null, { id: "cashCpa", header: "现金 CPA", meta: { label: "现金 CPA", align: "right" }, cell: ({ row }) => { const chip = accountStatusTone(row.original.result?.assessment); return <div className="flex items-center justify-end gap-2"><span className="tabular-nums">{rv(row.original.result?.metrics.ratios.cashCpa, "money")}</span><StatusChip tone={chip.tone}>{chip.label}</StatusChip></div> } }),
    helper.accessor("verdictNote", { header: "结论（人填）", meta: { label: "结论" }, cell: ({ getValue }) => getValue() ?? <span className="text-xs text-muted-foreground">待填</span> }),
    actionsColumn<AccountTest>((test) => (
      <>
        <DropdownMenuItem onSelect={() => onVerdict(test)}>填结论</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => toast("已停止测试", { description: "PATCH /account-tests/:id {status: stopped}" })}>停止</DropdownMenuItem>
      </>
    )),
  ])
}

export function TestsTab() {
  const [items, setItems] = useState<AccountTest[]>(() => (isOk(testsFixture) ? testsFixture.data.items : []))
  const [creating, setCreating] = useState(false)
  const [verdict, setVerdict] = useState<AccountTest | null>(null)
  const [form, setForm] = useState({ accountId: "", taskId: "", purpose: "", hypothesis: "", startedAt: "2026-09-06", endAt: "" })
  const [note, setNote] = useState("")
  const [status, setStatus] = useState<AccountTest["status"]>("passed")
  const columns = buildColumns((test) => { setVerdict(test); setNote(test.verdictNote ?? ""); setStatus(test.status === "running" ? "passed" : test.status) })
  const table = useGridTable({ data: items, columns, pageSize: 20, getRowId: (row) => row.id })

  return (
    <>
      <DataGrid
        table={table}
        empty="还没有开户测试；新建一个跟踪窗口指标"
        toolbar={<span className="text-xs text-muted-foreground">系统每日刷新窗口指标（只算不判），结论由人填；测试户加 tag testing，库存态不因测试改变</span>}
        actions={<Button size="sm" onClick={() => setCreating(true)}><IconPlus />新建测试</Button>}
      />
      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>新建开户测试</DialogTitle><DialogDescription>POST /account-tests；目的必填，假设可选。</DialogDescription></DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1.5"><Label>账户 ID</Label><Input value={form.accountId} onChange={(event) => setForm((prev) => ({ ...prev, accountId: event.target.value }))} placeholder="account-4" /></div>
            <div className="grid gap-1.5"><Label>任务（可选）</Label><Input value={form.taskId} onChange={(event) => setForm((prev) => ({ ...prev, taskId: event.target.value }))} /></div>
            <div className="grid gap-1.5"><Label>测试目的</Label><Input value={form.purpose} onChange={(event) => setForm((prev) => ({ ...prev, purpose: event.target.value }))} placeholder="如 新版位：联盟" /></div>
            <div className="grid gap-1.5"><Label>假设</Label><Input value={form.hypothesis} onChange={(event) => setForm((prev) => ({ ...prev, hypothesis: event.target.value }))} placeholder="如 联盟位现金 CPA 可 ≤ 36" /></div>
            <div className="grid grid-cols-2 gap-3"><div className="grid gap-1.5"><Label>开始</Label><Input type="date" value={form.startedAt} onChange={(event) => setForm((prev) => ({ ...prev, startedAt: event.target.value }))} /></div><div className="grid gap-1.5"><Label>结束（可选）</Label><Input type="date" value={form.endAt} onChange={(event) => setForm((prev) => ({ ...prev, endAt: event.target.value }))} /></div></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreating(false)}>取消</Button>
            <Button disabled={!form.accountId.trim() || !form.purpose.trim()} onClick={() => { setItems((prev) => [{ id: `local-${Date.now()}`, media: "KUAISHOU", accountId: form.accountId.trim(), taskId: form.taskId.trim() || null, purpose: form.purpose.trim(), hypothesis: form.hypothesis.trim() || null, startedAt: form.startedAt, endAt: form.endAt || null, status: "planned", verdictNote: null, result: null }, ...prev]); setCreating(false); toast.success("测试已创建", { description: "系统从开始日起每日刷新窗口指标" }) }}>创建</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={verdict !== null} onOpenChange={(open) => { if (!open) setVerdict(null) }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>填写结论 · {verdict?.purpose}</DialogTitle><DialogDescription>PATCH /account-tests/:id；系统只算窗口指标，不替你判。</DialogDescription></DialogHeader>
          <div className="grid gap-3">
            <Select value={status} onValueChange={(value) => setStatus(value as AccountTest["status"])}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="passed">通过</SelectItem><SelectItem value="failed">未通过</SelectItem><SelectItem value="stopped">停止</SelectItem></SelectContent></Select>
            <Textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="结论与依据" />
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setVerdict(null)}>取消</Button><Button disabled={!note.trim()} onClick={() => { setItems((prev) => prev.map((item) => item.id === verdict?.id ? { ...item, status, verdictNote: note.trim() } : item)); setVerdict(null); toast.success("结论已保存") }}>保存</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
