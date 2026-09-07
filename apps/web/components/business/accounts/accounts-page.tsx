"use client"

import { useMemo, useState } from "react"
import { IconArrowsExchange, IconChevronDown, IconEye, IconListCheck, IconPlus, IconStar, IconTag, IconUpload } from "@tabler/icons-react"
import { toast } from "sonner"

import { PageBody, PageHeader } from "@/components/business/page-header"
import { useSession } from "@/components/business/session/session-provider"
import { ExampleBlock, StateFrame, StateSwitch, usePageState } from "@/components/business/state/page-state"
import { PageTabs, usePageTab } from "@/components/business/tabs/page-tabs"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { accountsFixture, infraFixture, lifecycleLabel, pipelineFixture, poolStatusMap, type AccountItem, type LifecycleStage } from "@/lib/fixtures/accounts"
import { isOk } from "@/lib/fixtures/contract"
import { cn } from "@/lib/utils"
import { AccountDialogs, type DialogKind } from "./account-dialogs"
import { AccountsTable, rowId, type RowActions } from "./accounts-table"
import { InfraTab } from "./infra-tab"
import { PoolKanban, PoolPipeline, PoolTiles, poolViews, type PoolView, type StatusFilter } from "./pool-views"
import { TestsTab } from "./tests-tab"

// 账户池（F-007 §2，契约 v1.5.1 ①）：九态流水线（点卡即筛；三种表达可切）→ 筛选 + 分组 → 12 列母版表 → 右栏；tabs 账户池 / 基建管理 / 开户测试
const tabs = [
  { value: "pool", label: "账户池" },
  { value: "infra", label: "基建管理" },
  { value: "tests", label: "开户测试" },
] as const
type Tab = (typeof tabs)[number]["value"]
type GroupBy = "none" | "lifecycle" | "product" | "owner" | "task"
const groupLabels: Record<GroupBy, string> = { none: "不分组", lifecycle: "按投放阶段", product: "按产品名", owner: "按负责人", task: "按任务" }
const UNASSIGNED = "未填"

function CapacityDistribution({ items }: { items: AccountItem[] }) {
  // 只数账户个数（UI 分桶），不算指标
  const buckets = [{ label: "< 50%", test: (v: number) => v < 0.5 }, { label: "50–70%", test: (v: number) => v >= 0.5 && v < 0.7 }, { label: "70–90%", test: (v: number) => v >= 0.7 && v < 0.9 }, { label: "≥ 90%", test: (v: number) => v >= 0.9 }]
  const known = items.filter((item) => item.capacityLoad.state === "finite" && item.capacityLoad.value !== null)
  const unknown = items.length - known.length
  return (
    <div className="flex flex-col gap-2">
      {buckets.map((bucket) => { const n = known.filter((item) => bucket.test(item.capacityLoad.value as number)).length; return <div key={bucket.label} className="flex items-center gap-2 text-xs"><span className="w-14 text-muted-foreground">{bucket.label}</span><span className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted"><span className="block h-full rounded-full bg-foreground" style={{ width: `${items.length ? (n / items.length) * 100 : 0}%` }} /></span><span className="w-6 text-right tabular-nums">{n}</span></div> })}
      <div className="flex items-center gap-2 text-xs text-muted-foreground"><span className="w-14">无卡 / 缺</span><span className="flex-1" /><span className="w-6 text-right tabular-nums">{unknown}</span></div>
    </div>
  )
}

export function AccountsPage() {
  const { isMock } = useSession()
  const [tab, setTab] = usePageTab<Tab>(tabs, "pool")
  const state = usePageState()
  const [view, setView] = useState<PoolView>("tiles")
  const [status, setStatus] = useState<StatusFilter>("all")
  const [search, setSearch] = useState("")
  const [media, setMedia] = useState("all")
  const [product, setProduct] = useState("all")
  const [owner, setOwner] = useState("all")
  const [lifecycle, setLifecycle] = useState<"all" | LifecycleStage>("all")
  const [starredOnly, setStarredOnly] = useState(false)
  const [groupBy, setGroupBy] = useState<GroupBy>("none")
  const [selected, setSelected] = useState<string[]>([])
  const [dialog, setDialog] = useState<DialogKind>(null)

  const items = useMemo(() => (isOk(accountsFixture) ? accountsFixture.data.items : []), [])
  const stages = isOk(pipelineFixture) ? pipelineFixture.data.stages : []
  const asOf = isOk(pipelineFixture) ? pipelineFixture.data.asOf : ""
  const total = isOk(accountsFixture) ? accountsFixture.data.total : items.length
  const products = useMemo(() => [...new Set(items.map((item) => item.product?.name).filter((name): name is string => Boolean(name)))], [items])
  const owners = useMemo(() => [...new Set(items.map((item) => item.owner?.displayName).filter((name): name is string => Boolean(name)))], [items])
  const filtered = useMemo(() => items.filter((item) =>
    (status === "all" || item.poolStatus === status) &&
    (media === "all" || item.media === media) &&
    (product === "all" || (item.product?.name ?? UNASSIGNED) === product) &&
    (owner === "all" || item.owner?.displayName === owner) &&
    (lifecycle === "all" || item.lifecycleStage === lifecycle) &&
    (!starredOnly || item.starred) &&
    (search.trim() === "" || item.accountName.includes(search.trim()) || item.accountId.includes(search.trim())),
  ), [items, status, media, product, owner, lifecycle, starredOnly, search])
  const selectedItems = useMemo(() => filtered.filter((item) => selected.includes(rowId(item))), [filtered, selected])
  const groups = useMemo(() => {
    if (groupBy === "none") return []
    const keyOf = (item: AccountItem) => groupBy === "lifecycle" ? lifecycleLabel[item.lifecycleStage] : groupBy === "product" ? (item.product?.name ?? UNASSIGNED) : groupBy === "owner" ? (item.owner?.displayName ?? "待分配") : (item.linkedTasks[0]?.taskName ?? "未挂任务")
    const map = new Map<string, AccountItem[]>()
    for (const item of filtered) { const key = keyOf(item); map.set(key, [...(map.get(key) ?? []), item]) }
    return [...map.entries()]
  }, [groupBy, filtered])

  const rowActions = useMemo<RowActions>(() => ({
    onTransfer: (list) => setDialog({ kind: "transfer", items: list }),
    onPoolStatus: (item) => setDialog({ kind: "poolStatus", item }),
    onProduct: (item) => setDialog({ kind: "product", item }),
    onReplicate: (item) => setDialog({ kind: "replicate", item }),
  }), [])

  const filters = (
    <>
      <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索账户名 / ID" className="h-8 w-40" aria-label="搜索" />
      <Select value={media} onValueChange={setMedia}><SelectTrigger size="sm" className="w-24" aria-label="渠道"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">全部渠道</SelectItem><SelectItem value="KUAISHOU">快手</SelectItem></SelectContent></Select>
      <Select value={product} onValueChange={setProduct}><SelectTrigger size="sm" className="w-32" aria-label="产品名"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">全部产品名</SelectItem>{products.map((name) => <SelectItem key={name} value={name}>{name}</SelectItem>)}<SelectItem value={UNASSIGNED}>未填产品名</SelectItem></SelectContent></Select>
      <Select value={owner} onValueChange={setOwner}><SelectTrigger size="sm" className="w-32" aria-label="负责人"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">全部负责人</SelectItem>{owners.map((name) => <SelectItem key={name} value={name}>{name}</SelectItem>)}</SelectContent></Select>
      <Select value={lifecycle} onValueChange={(value) => setLifecycle(value as typeof lifecycle)}><SelectTrigger size="sm" className="w-32" aria-label="投放阶段"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">全部投放阶段</SelectItem>{(Object.keys(lifecycleLabel) as LifecycleStage[]).filter((key) => key !== "unknown").map((key) => <SelectItem key={key} value={key}>{lifecycleLabel[key]}</SelectItem>)}</SelectContent></Select>
      <Button variant={starredOnly ? "default" : "outline"} size="sm" onClick={() => setStarredOnly((prev) => !prev)}><IconStar />星标</Button>
      <Tooltip><TooltipTrigger asChild><span className="inline-flex"><Button variant="outline" size="sm" disabled><IconTag />标签</Button></span></TooltipTrigger><TooltipContent side="bottom">双层标签筛选随 tags 组合查询接口开放</TooltipContent></Tooltip>
      <Select value={groupBy} onValueChange={(value) => setGroupBy(value as GroupBy)}><SelectTrigger size="sm" className="w-36" aria-label="分组"><span className="text-muted-foreground">分组</span><SelectValue /></SelectTrigger><SelectContent>{(Object.keys(groupLabels) as GroupBy[]).map((key) => <SelectItem key={key} value={key}>{groupLabels[key]}</SelectItem>)}</SelectContent></Select>
    </>
  )
  const headerActions = (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild><Button variant="outline" size="sm" disabled={selectedItems.length === 0}>批量操作<IconChevronDown /></Button></DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setDialog({ kind: "batch", items: selectedItems, op: "budget_up" })}>提预算 +15%</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setDialog({ kind: "batch", items: selectedItems, op: "bid_down" })}>降价 −5%</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setDialog({ kind: "batch", items: selectedItems, op: "pause" })}>暂停投放</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setDialog({ kind: "transfer", items: selectedItems })}><IconArrowsExchange />转移负责人</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Button variant="outline" size="sm" disabled={selectedItems.length === 0} onClick={() => setDialog({ kind: "batch", items: selectedItems, op: "budget_up" })}><IconEye />变更预览{selectedItems.length ? ` (${selectedItems.length})` : ""}</Button>
      <Tooltip><TooltipTrigger asChild><span className="inline-flex"><Button variant="outline" size="sm" onClick={() => toast("导入认领", { description: "POST /accounts/import（R-012）接入后可上传认领清单" })}><IconUpload />导入认领</Button></span></TooltipTrigger><TooltipContent side="bottom">认领已有账户</TooltipContent></Tooltip>
      <Button size="sm" onClick={() => setDialog({ kind: "open" })}><IconPlus />新建账户</Button>
    </>
  )
  const bulk = (
    <>
      <Button variant="outline" size="sm" onClick={() => setDialog({ kind: "batch", items: selectedItems, op: "budget_up" })}><IconEye />变更预览</Button>
      <Button variant="outline" size="sm" onClick={() => setDialog({ kind: "transfer", items: selectedItems })}><IconArrowsExchange />转移负责人</Button>
      <Button variant="outline" size="sm" disabled title="任务挂载接口开放后启用"><IconListCheck />加入任务</Button>
    </>
  )
  const queue = isOk(infraFixture) ? infraFixture.data.queue : []

  return (
    <PageBody>
      <PageHeader title="账户池" description="全量账户各在哪个库存态、哪些没用、按产品名分、哪些备用；缺数显 −" isMock={isMock} actions={<StateSwitch />} />
      <PageTabs tabs={tabs} value={tab} onChange={setTab} />
      <div className="px-4 lg:px-6">
        <StateFrame state={state} unlock="R-014（v1.5.1 账户池扩展）接入后切换为真数据" empty={{ title: "当前空间没有可见账户", description: "个人空间只看本人授权账户；导入认领或新建账户后出现。" }}>
          {tab === "pool" ? (
            <div className="flex flex-col gap-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm font-medium">账户状态 <span className="text-xs font-normal text-muted-foreground">九态 · GET /accounts/pipeline · 点一态即筛</span></div>
                <ToggleGroup type="single" variant="outline" size="sm" value={view} onValueChange={(value) => { if (value) setView(value as PoolView) }} aria-label="表达">
                  {poolViews.map((item) => <ToggleGroupItem key={item.value} value={item.value} title={item.hint} className="px-3 text-xs">{item.label}</ToggleGroupItem>)}
                </ToggleGroup>
              </div>
              {view === "tiles" ? <PoolTiles stages={stages} total={total} value={status} onChange={setStatus} asOf={asOf} /> : null}
              {view === "pipeline" ? <PoolPipeline stages={stages} total={total} value={status} onChange={setStatus} asOf={asOf} /> : null}
              <div className="grid gap-4 @6xl/main:grid-cols-12">
                <div className="min-w-0 @6xl/main:col-span-9">
                  {view === "kanban" ? (
                    <div className="flex flex-col gap-4">
                      <div className="flex flex-wrap items-center justify-between gap-2"><div className="flex min-w-0 flex-wrap items-center gap-2">{filters}</div><div className="flex items-center gap-2">{headerActions}</div></div>
                      <PoolKanban items={filtered} />
                    </div>
                  ) : groupBy !== "none" ? (
                    <div className="flex flex-col gap-6">
                      <div className="flex flex-wrap items-center justify-between gap-2"><div className="flex min-w-0 flex-wrap items-center gap-2">{filters}</div><div className="flex items-center gap-2">{headerActions}</div></div>
                      {groups.map(([name, groupItems]) => (
                        <section key={name} className="flex flex-col gap-2">
                          <AccountsTable items={groupItems} actions={rowActions} showColumnPicker={false} showPagination={false} toolbar={<div className="flex items-center gap-2 text-sm"><span className="font-medium">{name}</span><span className="text-xs text-muted-foreground tabular-nums">{groupItems.length} 户</span></div>} bulkActions={bulk} onSelectionChange={setSelected} />
                        </section>
                      ))}
                    </div>
                  ) : (
                    <AccountsTable items={filtered} actions={rowActions} toolbar={filters} headerActions={headerActions} bulkActions={bulk} onSelectionChange={setSelected} />
                  )}
                </div>
                <aside className="flex flex-col gap-4 @6xl/main:col-span-3">
                  <ExampleBlock unlock="基建管理（P1）OS 联调后" inline>
                    <Card>
                      <CardHeader><CardTitle className="text-sm">待搭建队列</CardTitle><CardDescription>开户完成 / 手动加入</CardDescription></CardHeader>
                      <CardContent className="flex flex-col gap-2">{queue.map((row) => <div key={row.accountId} className="flex items-center justify-between rounded-lg border px-3 py-2 text-xs"><span className="font-mono">{row.accountId}</span><span className="text-muted-foreground">{poolStatusMap[row.poolStatus].label} · 自 {row.since.slice(5)}</span></div>)}</CardContent>
                    </Card>
                  </ExampleBlock>
                  <Card>
                    <CardHeader><CardTitle className="text-sm">容量分布</CardTitle><CardDescription>按容量负载分桶（只数户数）</CardDescription></CardHeader>
                    <CardContent><CapacityDistribution items={filtered} /></CardContent>
                  </Card>
                  <ExampleBlock unlock="账户-任务匹配建议（P1）随需求预测开放" inline>
                    <Card>
                      <CardHeader><CardTitle className="text-sm">匹配建议</CardTitle><CardDescription>空闲 / 可用户 → 待挂任务</CardDescription></CardHeader>
                      <CardContent className={cn("text-xs text-muted-foreground")}>{items.filter((item) => item.poolStatus === "available").length} 户可用；预测模型后置，先按「可用」筛选人工挂。</CardContent>
                    </Card>
                  </ExampleBlock>
                </aside>
              </div>
            </div>
          ) : null}
          {tab === "infra" ? <InfraTab /> : null}
          {tab === "tests" ? <TestsTab /> : null}
        </StateFrame>
      </div>
      <AccountDialogs dialog={dialog} onClose={() => setDialog(null)} />
    </PageBody>
  )
}
