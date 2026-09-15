"use client"

import { useMemo } from "react"
import Link from "next/link"
import { IconStar, IconStarOff } from "@tabler/icons-react"

import { accountHref, accountsFixture, poolStatusMap } from "@/lib/fixtures/accounts"
import { useAccounts } from "@/lib/data/use-accounts"
import { useTasks } from "@/lib/data/use-tasks"
import { MissingValue, TypeChip } from "@/components/business/data-grid/data-grid"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { isOk, mv, rv } from "@/lib/fixtures/contract"
import { commitWatchlist, useWatchlist } from "@/lib/data/use-watchlist"
import { tasksFixture } from "@/lib/fixtures/tasks"
import { cn } from "@/lib/utils"

// 「我关注的」= me/watchlist 的落点（v1.7.4 起项可为 account 或 task；无 type 视为 account）。
// 按「视图收敛」原则不开独立路由、不进侧栏，收在工作台的一个 tab 里。
//
// ★名单、账户、任务三份原来全读样例：真实模式下样例为空 → 这个 tab 永远是「还没有关注的对象」，
//   哪怕用户在账户池里加过（arch 2026-09-14 点名的五处之一）。三份都改真接口。
const IS_MOCK = process.env.NEXT_PUBLIC_KA_DATA_PROVIDER === "mock"

export function StarredTab() {
  const watchlist = useWatchlist()
  const watch = watchlist.items
  // 名单最多几十条，一页拉完够用；筛选在本地做（这里不是账户池那种全量列表页）
  const accountsQuery = useAccounts({ pageSize: 200 })
  const tasksQuery = useTasks({ pageSize: 200 })
  const accounts = useMemo(() => {
    const all = (IS_MOCK ? (isOk(accountsFixture) ? accountsFixture.data.items : []) : accountsQuery.items) ?? []
    const keys = new Set(watch.filter((item) => item.type === "account").map((item) => `${item.media}:${item.accountId}`))
    return all.filter((item) => keys.has(`${item.media}:${item.accountId}`))
  }, [watch, accountsQuery.items])
  const tasks = useMemo(() => {
    const all = (IS_MOCK ? (isOk(tasksFixture) ? tasksFixture.data.items : []) : tasksQuery.items) ?? []
    const ids = new Set(watch.filter((item) => item.type === "task").map((item) => item.taskId))
    for (const account of accounts) for (const linked of account.linkedTasks) ids.add(linked.taskId)
    return all.filter((task) => ids.has(task.taskId))
  }, [watch, tasksQuery.items, accounts])

  const loading = watchlist.loading || accountsQuery.loading || tasksQuery.loading
  // 「还在读」「读不到」「读到了是空的」是三件事。原来全画成「还没有关注的对象」，
  // 于是名单拉不到时用户会以为自己的关注没了，跑去重加一遍
  const failed = watchlist.error ?? accountsQuery.error?.message ?? tasksQuery.error?.message ?? null
  const empty = !loading && !failed && accounts.length === 0 && tasks.length === 0

  return (
    <div className="flex flex-col gap-4">
      {loading && accounts.length === 0 && tasks.length === 0 ? (
        <Card><CardContent className="py-16 text-center text-sm text-muted-foreground">正在读关注名单…</CardContent></Card>
      ) : null}
      {failed ? (
        <Card><CardContent className="flex flex-col items-center gap-2 py-16 text-center"><p className="font-medium text-status-critical">关注名单没读到</p><p className="max-w-md text-sm text-muted-foreground">{failed}</p><Button size="sm" variant="outline" onClick={() => { watchlist.reload(); accountsQuery.reload(); tasksQuery.reload() }}>重试</Button></CardContent></Card>
      ) : null}
      {empty ? (
        <Card><CardContent className="flex flex-col items-center gap-2 py-16 text-center"><IconStarOff className="size-7 text-muted-foreground" /><p className="font-medium">还没有关注的对象</p><p className="max-w-md text-sm text-muted-foreground">在账户池或任务列表的行菜单里点「加入盯盘」，这里就会汇总它们的当天表现，不用每天翻列表。</p><div className="mt-1 flex gap-2"><Button asChild size="sm" variant="outline"><Link href="/accounts">去账户池</Link></Button><Button asChild size="sm" variant="outline"><Link href="/tasks">去投放任务</Link></Button></div></CardContent></Card>
      ) : null}

      {accounts.length ? (
        <Card>
          <CardHeader><CardTitle className="text-base">盯盘账户</CardTitle><CardDescription>{accounts.length} 个 · 当天口径，缺数显 −</CardDescription></CardHeader>
          <CardContent className="grid gap-2 @3xl/main:grid-cols-2">
            {accounts.map((item) => (
              <div key={`${item.media}-${item.accountId}`} className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5">
                <div className="min-w-0">
                  <Link href={accountHref(item)} className="truncate text-sm font-medium hover:underline">{item.accountName ?? item.accountId}</Link>
                  <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground"><TypeChip className="gap-1.5"><span className={cn("size-1.5 rounded-full", poolStatusMap[item.poolStatus].dot)} />{poolStatusMap[item.poolStatus].label}</TypeChip>{item.product?.name ? <TypeChip>{item.product.name}</TypeChip> : null}</p>
                </div>
                <dl className="flex shrink-0 gap-4 text-right text-xs">
                  <div><dt className="text-muted-foreground">消耗</dt><dd className="tabular-nums">{item.metrics ? mv(item.metrics.cost, "money0") : <MissingValue />}</dd></div>
                  <div><dt className="text-muted-foreground">现金 CPA</dt><dd className="tabular-nums">{item.metrics ? rv(item.metrics.ratios.cashCpa, "money") : <MissingValue />}</dd></div>
                </dl>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      {tasks.length ? (
        <Card>
          <CardHeader><CardTitle className="text-base">相关任务</CardTitle><CardDescription>关注的账户挂在这些任务下 · 点进去看完整看板</CardDescription></CardHeader>
          <CardContent className="grid gap-2 @3xl/main:grid-cols-2">
            {tasks.map((task) => (
              <div key={task.taskId} className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5">
                <div className="min-w-0">
                  <Link href={`/tasks/${task.taskId}`} className="truncate text-sm font-medium hover:underline">{task.taskName}</Link>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">{task.bizName ?? "−"} · 负责人 {task.owner?.displayName ?? "待分配"}</p>
                </div>
                <Button size="sm" variant="ghost" className="h-7 shrink-0 text-xs" onClick={() => { void commitWatchlist(watchlist, watch.filter((item) => !(item.type === "task" && item.taskId === task.taskId))) }}><IconStar className="size-3.5" />取消关注</Button>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}
