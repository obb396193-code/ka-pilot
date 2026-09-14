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
import { hourlyFixture } from "@/lib/fixtures/data-analysis"
import type { HourlyRow } from "@/lib/fixtures/data-analysis"
import { operationalIsMock, useHourly } from "@/lib/data/use-operational"
import { commitWatchlist, useWatchlist, type WatchlistItem } from "@/lib/data/use-watchlist"
import { warningText } from "@/lib/data/warning-codes"
import type { DataWindow } from "@/components/business/data/dashboard/window-picker"
import Link from "next/link"

import { cn } from "@/lib/utils"
import { LineageFooter } from "./shared"

// 盯盘：名单（GET/PUT /me/watchlist，真接口）+ 小时表（account.hourly）；缺小时显 −，不补 0；delta 相邻缺一边也 −
// ★名单里还有 task 型条目（只有 taskId、没有 media/accountId）。分时表是**按账户**取的（account.hourly），
// 任务没有小时行，所以任务条目只列出来能点去任务详情，不参与选中。
type WatchItem = { media: string; accountId: string }

// 盯盘名单显账户名，不显 ID；样例里查不到就退回 ID
const accountName = (id: string) => (isOk(accountsFixture) ? accountsFixture.data.items.find((item) => item.accountId === id)?.accountName ?? id : id)

/**
 * F8-24：盯盘接 `account.hourly`（走 `/api/internal/query`）。
 * 看的是**某一天**的分时，所以取窗口的最后一天——盯盘盯的就是最近这天跑得怎么样。
 *
 * ★小时表由 be2 Q-042 的采样 job 灌；灌之前后端返 `availability:"pending"`，
 * 页面显「待到」**不显示例数据**——拿 fixture 顶上，人就以为盯盘已经能用了。
 */
export function HourlyTab({ window, workspaceId }: { window: DataWindow; workspaceId?: string }) {
  // 名单走真接口。原来读的是样例：真实模式下样例是空的 → 名单空 → 不发小时查询 →
  // 0–23 时全「−」，而同一天 account.hourly 明明有 150 行（arch 2026-09-14 截图）
  const watchlist = useWatchlist()
  const watchedTasks = watchlist.items.flatMap((item) => (item.type === "task" ? [item.taskId] : []))
  const items = useMemo(
    () => watchlist.items.flatMap((item) => (item.type === "task" ? [] : [{ media: item.media, accountId: item.accountId }])),
    [watchlist.items],
  )
  const [picked, setPicked] = useState<WatchItem | null>(null)
  // 选中项跟着名单走：名单是异步拉回来的，用 useState 初值锁第一条会永远是 null；
  // 选中的那条被移除后也要自动落回第一条，而不是继续查一个已经不在名单里的账户
  const current = (picked && items.some((item) => item.media === picked.media && item.accountId === picked.accountId) ? picked : items[0]) ?? null
  const [draft, setDraft] = useState("")

  // 整份覆盖（契约就是这样），任务型条目原样带上——盯盘只管账户那一半，别把别人的任务关注洗掉
  const setList = (next: WatchItem[]) => commitWatchlist(watchlist, [
    ...next.map((item) => ({ type: "account" as const, media: item.media, accountId: item.accountId })),
    ...watchlist.items.filter((item): item is Extract<WatchlistItem, { type: "task" }> => item.type === "task"),
  ])
  // 没选账户就不查：`media` 是必填参数，没得填就别发（发出去 400）
  const query = useMemo(
    () => (current ? { date: window.to, media: current.media, accountIds: [current.accountId] } : null),
    [current, window.to],
  )
  const remote = useHourly<HourlyRow>(query, workspaceId)
  const mockRows = useMemo(
    () => (isOk(hourlyFixture) ? hourlyFixture.data.source.rows.filter((row) => current && row.accountId === current.accountId && row.media === current.media) : []),
    [current],
  )
  // 三元式直接当 useMemo 依赖会让下面那个 byHour 每帧重算；套一层把身份稳住
  const rows = useMemo(() => (operationalIsMock ? mockRows : remote.rows ?? []), [mockRows, remote.rows])
  const byHour = useMemo(() => new Map(rows.map((row) => [row.hh, row])), [rows])
  const hours = Array.from({ length: 24 }, (_, hh) => hh)
  const lastSync = rows.find((row) => row.lastSyncAt)?.lastSyncAt ?? null
  // A35 同上：盯盘的数据来自 `account.hourly` 真接口，别因为样例没了就空白
  // ★血缘跟着**这次响应**走：固定读样例的话，真实模式下等于把假的
  //   「数据截至 / 来源」贴在真数字旁边——比不显更糟。mock 下才回落到样例。
  const lineage = (remote.lineage as Parameters<typeof LineageFooter>[0]["lineage"] | null) ?? (isOk(hourlyFixture) ? hourlyFixture.data.source.lineage : null)

  return (
    <div className="grid gap-4 @4xl/main:grid-cols-12">
      <Card className="@4xl/main:col-span-3">
        <CardHeader>
          <CardTitle>盯盘名单</CardTitle>
          <CardDescription>个人视图的一种；改动会保存到你的账号</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {watchlist.loading && items.length === 0 ? <p className="px-1 py-2 text-xs text-muted-foreground">正在读名单…</p> : null}
          {/* 「名单拉不到」和「名单是空的」是两回事：退成空名单会让人以为自己没加过账户，跑去重加一遍 */}
          {watchlist.error ? (
            <p className="rounded-md border border-dashed px-3 py-2 text-xs text-status-critical">
              {watchlist.error}
              <button type="button" onClick={watchlist.reload} className="ml-2 underline underline-offset-2">重试</button>
            </p>
          ) : null}
          {items.map((item) => (
            <div key={`${item.media}:${item.accountId}`} className={cn("flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm", current?.media === item.media && current?.accountId === item.accountId && "border-foreground ring-1 ring-foreground")}>
              <button type="button" className="flex min-w-0 flex-1 items-center gap-2 text-left" onClick={() => setPicked(item)}>
                <TypeChip>{mediaLabel(item.media)}</TypeChip>
                <span className="truncate text-xs">{accountName(item.accountId)}</span>
              </button>
              <Button
                variant="ghost" size="icon" className="size-7 text-muted-foreground" aria-label="移除"
                onClick={() => { void setList(items.filter((other) => !(other.media === item.media && other.accountId === item.accountId))) }}
              ><IconTrash className="size-3.5" /></Button>
            </div>
          ))}
          {!watchlist.loading && !watchlist.error && items.length === 0 && watchedTasks.length === 0 ? (
            <p className="rounded-md border border-dashed px-3 py-3 text-center text-xs text-muted-foreground">名单是空的——先加一个账户</p>
          ) : null}
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
                <Button onClick={() => {
                  const accountId = draft.trim()
                  if (!accountId) return
                  const next = { media: "KUAISHOU", accountId }
                  // 已经在名单里就别重复 PUT 一份重复条目
                  if (items.some((item) => item.media === next.media && item.accountId === next.accountId)) { toast("这个账户已经在名单里了"); return }
                  void setList([...items, next]).then((done) => { if (done) { setDraft(""); setPicked(next); toast.success("已加入名单") } })
                }}>加入</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardContent>
      </Card>
      <Card className="@4xl/main:col-span-9">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">小时累计 / 逐时增量{current ? <span className="font-mono text-xs font-normal text-muted-foreground">{current.accountId}</span> : null}</CardTitle>
          <CardDescription>
            {window.to} · 0–23 时 · 累计与逐时增量 · 缺小时显 − 不补 0 · 最近同步 {fmtTime(lastSync)}
          </CardDescription>
        </CardHeader>
        {/* 取数状态照实说。小时表由 be2 Q-042 的采样 job 灌，灌之前后端返「还没到」——
            这时显空表 + 一行说明，而不是拿示例数据顶上让人以为盯盘已经能用了。 */}
        {!operationalIsMock && (remote.loading || remote.error || remote.unavailable) ? (
          <p className={cn("mx-6 mb-2 rounded-md border border-dashed px-3 py-2 text-xs", remote.error ? "text-status-critical" : "text-muted-foreground")}>
            {remote.loading ? "正在取数…"
              : remote.error ? <>取数失败：{remote.error.message}{remote.error.requestId ? `（问题编号 ${remote.error.requestId}）` : ""}<button type="button" onClick={remote.reload} className="ml-2 underline underline-offset-2">重试</button></>
              : remote.unavailable}
          </p>
        ) : null}
        <CardContent className="overflow-x-auto p-0">
          {/* 没选账户时画 24 行「−」，看着像「查过了、这天没数」——其实一个请求都没发过。
              空表和「查了没有」必须长得不一样。 */}
          {current === null ? (
            <p className="mx-6 my-10 rounded-lg border border-dashed px-3 py-10 text-center text-sm text-muted-foreground">
              {watchlist.loading ? "正在读名单…" : watchlist.error ? "名单没拉到，小时表无从查起" : "左边名单里先加一个账户，这里才知道要盯谁"}
            </p>
          ) : (
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
          )}
        </CardContent>
        <div className="flex flex-wrap items-center gap-2 px-4 pb-1">
          {lineage ? <LineageFooter lineage={lineage} /> : null}
          {/* ★告警必须跟着**这次响应**走：原来固定读样例的三条，真实模式下就是贴在真数字旁边的三句假话。
              码 → 人话在 warning-codes.ts，认不出来的原样显示不吞。 */}
          {(operationalIsMock ? (isOk(hourlyFixture) ? hourlyFixture.data.source.warnings : []) : remote.warnings)
            .map((code: string) => <Badge key={code} variant="outline" className="text-status-warning">{warningText(code)}</Badge>)}
        </div>
      </Card>
    </div>
  )
}
