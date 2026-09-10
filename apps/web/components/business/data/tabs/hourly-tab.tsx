"use client"

import { useMemo, useState } from "react"
import { IconPlus, IconTrash } from "@tabler/icons-react"
import { toast } from "sonner"

import { mediaLabel } from "@/components/business/accounts/account-status"
import { accountsFixture } from "@/lib/fixtures/accounts"
import { TypeChip } from "@/components/business/data-grid/data-grid"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { fmtTime, isOk, mv, rv } from "@/lib/fixtures/contract"
import { hourlyFixture, watchlistFixture } from "@/lib/fixtures/data-analysis"
import Link from "next/link"

import { cn } from "@/lib/utils"
import { LineageFooter } from "./shared"

// 盯盘：名单（GET/PUT /me/watchlist）+ 小时表（account.hourly）；缺小时显 −，不补 0；delta 相邻缺一边也 −
// ★名单里还有 task 型条目（只有 taskId、没有 media/accountId）。分时表是**按账户**取的（account.hourly），
// 任务没有小时行，所以任务条目只列出来能点去任务详情，不参与选中。
type WatchItem = { media: string; accountId: string }

// 盯盘名单显账户名，不显 ID；样例里查不到就退回 ID
const accountName = (id: string) => (isOk(accountsFixture) ? accountsFixture.data.items.find((item) => item.accountId === id)?.accountName ?? id : id)

export function HourlyTab() {
  const all = isOk(watchlistFixture) ? watchlistFixture.data.items : []
  const watchedTasks = all.flatMap((item) => (item.type === "task" ? [item.taskId] : []))
  const [items, setItems] = useState<WatchItem[]>(() => all.flatMap((item) => (item.type === "task" ? [] : [{ media: item.media, accountId: item.accountId }])))
  const [current, setCurrent] = useState<WatchItem | null>(items[0] ?? null)
  const [draft, setDraft] = useState("")
  const rows = useMemo(() => (isOk(hourlyFixture) ? hourlyFixture.data.source.rows.filter((row) => current && row.accountId === current.accountId && row.media === current.media) : []), [current])
  const byHour = useMemo(() => new Map(rows.map((row) => [row.hh, row])), [rows])
  const hours = Array.from({ length: 24 }, (_, hh) => hh)
  const lastSync = rows.find((row) => row.lastSyncAt)?.lastSyncAt ?? null
  if (!isOk(hourlyFixture)) return null

  return (
    <div className="grid gap-4 @4xl/main:grid-cols-12">
      <Card className="@4xl/main:col-span-3">
        <CardHeader>
          <CardTitle>盯盘名单</CardTitle>
          <CardDescription>个人视图的一种；改动会保存到你的账号</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {items.map((item) => (
            <div key={`${item.media}:${item.accountId}`} className={cn("flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm", current?.accountId === item.accountId && "border-foreground ring-1 ring-foreground")}>
              <button type="button" className="flex min-w-0 flex-1 items-center gap-2 text-left" onClick={() => setCurrent(item)}>
                <TypeChip>{mediaLabel(item.media)}</TypeChip>
                <span className="truncate text-xs">{accountName(item.accountId)}</span>
              </button>
              <Button variant="ghost" size="icon" className="size-7 text-muted-foreground" onClick={() => { setItems((prev) => prev.filter((other) => other !== item)); toast("已从名单移除", { description: "接口接入后同步保存" }) }} aria-label="移除"><IconTrash className="size-3.5" /></Button>
            </div>
          ))}
          {watchedTasks.length ? (
            <div className="mt-1 flex flex-col gap-1 border-t pt-2">
              <p className="text-[11px] text-muted-foreground">名单里的任务（分时是按账户取的，任务没有小时行）</p>
              {watchedTasks.map((taskId) => (
                <Link key={taskId} href={`/tasks/${encodeURIComponent(taskId)}`} className="truncate rounded-md px-2 py-1 text-xs hover:bg-muted">任务 · {taskId}</Link>
              ))}
            </div>
          ) : null}
          <Dialog>
            <DialogTrigger asChild><Button variant="outline" size="sm"><IconPlus />加入账户</Button></DialogTrigger>
            <DialogContent className="sm:max-w-sm">
              <DialogHeader><DialogTitle>加入盯盘名单</DialogTitle><DialogDescription>输入账户 ID（媒体先固定快手）；账户池「加入盯盘」也会进这里。</DialogDescription></DialogHeader>
              <Input value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="account-3" />
              <DialogFooter>
                <Button onClick={() => { if (!draft.trim()) return; setItems((prev) => [...prev, { media: "KUAISHOU", accountId: draft.trim() }]); setDraft(""); toast.success("已加入名单", { description: "接入后保存到账号" }) }}>加入</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardContent>
      </Card>
      <Card className="@4xl/main:col-span-9">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">小时累计 / 逐时增量{current ? <span className="font-mono text-xs font-normal text-muted-foreground">{current.accountId}</span> : null}</CardTitle>
          <CardDescription>0–23 时 · 累计与逐时增量 · 缺小时显 − 不补 0 · 最近同步 {fmtTime(lastSync)}</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <Table>
            <TableHeader className="bg-muted">
              <TableRow>
                <TableHead className="w-14">小时</TableHead>
                <TableHead className="text-right">累计消耗</TableHead>
                <TableHead className="text-right">累计现金</TableHead>
                <TableHead className="text-right">累计真实转化</TableHead>
                <TableHead className="text-right">增量消耗</TableHead>
                <TableHead className="text-right">增量转化</TableHead>
                <TableHead className="text-right">现金 CPA</TableHead>
                <TableHead className="text-right">消耗速度 /h</TableHead>
                <TableHead className="text-right">预估日消耗</TableHead>
                <TableHead className="text-right">预算使用</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {hours.map((hh) => {
                const row = byHour.get(hh)
                const missingHour = !row
                return (
                  <TableRow key={hh} className={cn(missingHour && "text-muted-foreground")}>
                    <TableCell className="tabular-nums">{String(hh).padStart(2, "0")}</TableCell>
                    <TableCell className="text-right tabular-nums">{row ? mv(row.cumulative.cost, "money") : "−"}</TableCell>
                    <TableCell className="text-right tabular-nums">{row ? mv(row.cumulative.cashCost, "money") : "−"}</TableCell>
                    <TableCell className="text-right tabular-nums">{row ? mv(row.cumulative.realConversion) : "−"}</TableCell>
                    <TableCell className="text-right tabular-nums">{row ? mv(row.delta.cost, "money") : "−"}</TableCell>
                    <TableCell className="text-right tabular-nums">{row ? mv(row.delta.realConversion) : "−"}</TableCell>
                    <TableCell className="text-right tabular-nums">{row ? rv(row.ratios.cashCpa, "money") : "−"}</TableCell>
                    <TableCell className="text-right tabular-nums">{row ? mv(row.velocity.costPerHour, "money") : "−"}</TableCell>
                    <TableCell className="text-right tabular-nums">{row ? mv(row.projectedDayCost, "money0") : "−"}</TableCell>
                    <TableCell className="text-right tabular-nums">{row ? rv(row.budgetUsage) : "−"}</TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </CardContent>
        <div className="flex flex-wrap items-center gap-2 px-4 pb-1">
          <LineageFooter lineage={hourlyFixture.data.source.lineage} />
          {hourlyFixture.data.source.warnings.map((warning) => <Badge key={warning} variant="outline" className="text-status-warning">{warning}</Badge>)}
        </div>
      </Card>
    </div>
  )
}
