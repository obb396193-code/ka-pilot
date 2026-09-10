"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { IconBrandDingtalk, IconDownload, IconPlus, IconSparkles } from "@tabler/icons-react"
import { createColumnHelper } from "@tanstack/react-table"
import { toast } from "sonner"

import { openAgentDrawer } from "@/components/business/command/events"
import { actionsColumn, DataGrid, dragColumn, MissingValue, selectionColumn, StatusChip, TypeChip, useGridTable, type GridFeatures } from "@/components/business/data-grid/data-grid"
import { PageBody, PageHeader } from "@/components/business/page-header"
import { StateFrame, usePageState } from "@/components/business/state/page-state"
import { PageTabs, usePageTab } from "@/components/business/tabs/page-tabs"
import { KpiCards } from "@/components/business/workbench/kpi-cards"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu"
import { Switch } from "@/components/ui/switch"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import type { DisplayMetric } from "@/lib/data/contracts"
import { fmtTime, isOk, mv, rv } from "@/lib/fixtures/contract"
import { dataStatusMeta, deliveryLabel, exportFixtures, libraryFixture, renderFixture, reportConfigFixture, reportKindLabel, settlementTemplatesFixture, subscriptionKindLabel, subscriptionsFixture, type ReportLibraryItem, type SettlementTemplate, type Subscription } from "@/lib/fixtures/reports"
import { cn } from "@/lib/utils"
import { DailyReportView } from "./daily-report"
import { SettlementWizard } from "./settlement-wizard"
import { AiImpactTab, MonthlyTab, ReviewTab, WeeklyTab } from "./v17-tabs"

// 报告（F-007 §6）：tabs 经营报告｜日报｜任务复盘｜结算单｜模板｜定时任务｜AI 提效；顶五卡 = 报告库计数
const tabs = [
  { value: "business", label: "经营报告" },
  { value: "daily", label: "日报" },
  { value: "weekly", label: "周报" },
  { value: "review", label: "任务复盘" },
  { value: "settlement", label: "结算单" },
  { value: "templates", label: "模板" },
  { value: "schedules", label: "定时任务" },
  { value: "monthly", label: "月度推送" },
  { value: "ai", label: "AI 提效" },
] as const
type Tab = (typeof tabs)[number]["value"]

const libHelper = createColumnHelper<GridFeatures, ReportLibraryItem>()
const libColumns = libHelper.columns([
  dragColumn<ReportLibraryItem>(),
  selectionColumn<ReportLibraryItem>(),
  libHelper.accessor("name", { header: "名称", enableHiding: false, meta: { label: "名称" }, cell: ({ getValue }) => <span className="font-medium">{getValue()}</span> }),
  libHelper.accessor("kind", { header: "类型", meta: { label: "类型" }, cell: ({ getValue }) => <TypeChip>{reportKindLabel[getValue()]}</TypeChip> }),
  libHelper.accessor((row) => row.owner.name, { id: "owner", header: "所有者", meta: { label: "所有者" } }),
  libHelper.accessor("period", { header: "期间", meta: { label: "期间" }, cell: ({ getValue }) => <span className="tabular-nums">{getValue()}</span> }),
  libHelper.accessor("templateVersion", { header: "模板版本", meta: { label: "模板版本" }, cell: ({ getValue }) => <TypeChip>{getValue()}</TypeChip> }),
  libHelper.accessor("dataStatus", { header: "数据状态", meta: { label: "数据状态" }, cell: ({ getValue }) => <StatusChip tone={dataStatusMeta[getValue()].tone}>{dataStatusMeta[getValue()].label}</StatusChip> }),
  libHelper.accessor((row) => row.deliveryStatus ?? "", { id: "delivery", header: "投递状态", meta: { label: "投递状态" }, cell: ({ row }) => row.original.deliveryStatus ? <StatusChip tone="success">{deliveryLabel[row.original.deliveryStatus]}</StatusChip> : <StatusChip tone="pending">未投递</StatusChip> }),
  actionsColumn<ReportLibraryItem>((item) => (
    <>
      <DropdownMenuItem asChild><Link href={item.kind === "settlement" ? "/reports?tab=settlement" : item.kind === "daily" ? "/reports?tab=daily" : "/reports?tab=business"}>打开</Link></DropdownMenuItem>
      <DropdownMenuItem onSelect={() => toast("已排队导出", { description: "排队后完成（签名链接）" })}><IconDownload />导出</DropdownMenuItem>
      <DropdownMenuItem onSelect={() => toast.success("已推群")}><IconBrandDingtalk />推钉钉群</DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem onSelect={() => openAgentDrawer(`解读报告「${item.name}」${item.period} 的关键变化`)}><IconSparkles />问 AI</DropdownMenuItem>
    </>
  )),
])

function BusinessTab() {
  const items = isOk(libraryFixture) ? libraryFixture.data.items : []
  const table = useGridTable({ data: items, columns: libColumns, pageSize: 20, getRowId: (item) => item.id })
  const config = isOk(reportConfigFixture) ? reportConfigFixture.data : null
  const rendered = isOk(renderFixture) ? renderFixture.data : null
  const [exportState, setExportState] = useState<"idle" | "queued" | "done">("idle")
  const exportJob = exportState === "idle" ? null : isOk(exportFixtures[exportState]) ? exportFixtures[exportState].data : null
  return (
    <div className="flex flex-col gap-6">
      <DataGrid table={table} empty="报告库为空" toolbar={<p className="text-xs text-muted-foreground">报表运行与导出合并 · 名称 / 所有者 / 期间 / 模板版本 / 数据状态 / 投递状态</p>} actions={<Button size="sm" onClick={() => toast("新建报告", { description: "选模板或从空白开始；Agent 帮做表后续接入" })}><IconPlus />新建报告</Button>} showPagination={false} />
      {config && rendered ? (
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div><CardTitle>{config.name}</CardTitle><CardDescription>数据来自{datasetLabel(config.config.dataset.queryId)} · 分组 {config.config.groupBy.map(groupLabel).join(" × ")} · 排序 {config.config.sort.map((item) => `${metricLabel(item.by)}${item.dir === "desc" ? "从高到低" : "从低到高"}`).join("，")} · {config.isShared ? "已分享" : "私有"} · 更新 {fmtTime(config.updatedAt)}</CardDescription></div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => openAgentDrawer(`把报告「${config.name}」改成按业务分组并加真实转化列`)}><IconSparkles />Agent 帮做表</Button>
                <Button size="sm" variant="outline" disabled={exportState === "queued"} onClick={() => { setExportState("queued"); toast("已排队导出 xlsx", { description: "已提交，导出完成后给下载链接" }); setTimeout(() => setExportState("done"), 1500) }}><IconDownload />{exportState === "queued" ? "导出中…" : "导出 xlsx"}</Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader className="bg-muted"><TableRow>{config.config.groupBy.map((key) => <TableHead key={key}>{key === "task" ? "任务" : key === "owner" ? "负责人" : key}</TableHead>)}{rendered.columns.map((column) => <TableHead key={column.key} className="text-right">{column.label}</TableHead>)}</TableRow></TableHeader>
              <TableBody>{rendered.rows.map((row, index) => { const hits = rendered.highlights.filter((item) => item.rowIndex === index); return <TableRow key={index} className={cn(hits.some((item) => item.style === "red") && "bg-status-critical/5")}>{config.config.groupBy.map((key) => <TableCell key={key}>{row.group[key] ?? "−"}</TableCell>)}{rendered.columns.map((column) => <TableCell key={column.key} className={cn("text-right tabular-nums", hits.some((item) => item.metric === column.key) && "font-medium text-status-critical")}>{column.key === "cost" ? mv(row.metrics.cost, "money0") : column.key === "cashCpa" ? rv(row.metrics.ratios.cashCpa, "money") : column.key === "onTarget" ? (row.assessment.onTarget === null ? "−" : row.assessment.onTarget ? "达标" : "未达标") : "−"}</TableCell>)}</TableRow> })}</TableBody>
            </Table>
            <div className="flex flex-wrap items-center justify-between gap-2 border-t px-4 py-2 text-xs text-muted-foreground"><span>来源 {rendered.lineage.source} · 窗口 {rendered.lineage.window.from} ～ {rendered.lineage.window.to}（{rendered.lineage.window.preset}）· 高亮规则：{config.config.highlight.map((item) => `${item.metric} ${item.op} ${String(item.value)} → ${item.style}`).join("；")}</span>{exportJob ? <span className="flex items-center gap-2">{exportJob.status === "done" && exportJob.file ? <><StatusChip tone="success">导出完成</StatusChip><a href={exportJob.file.url} className="underline-offset-4 hover:underline" target="_blank" rel="noreferrer">下载 {(exportJob.file.bytes / 1024).toFixed(0)} KB</a><span>链接 {fmtTime(exportJob.file.expiresAt)} 失效</span></> : <StatusChip tone="progress">排队中 · {exportJob.format}</StatusChip>}</span> : null}</div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}

const tplHelper = createColumnHelper<GridFeatures, SettlementTemplate>()
const tplColumns = tplHelper.columns([
  dragColumn<SettlementTemplate>(),
  selectionColumn<SettlementTemplate>(),
  tplHelper.accessor("name", { header: "模板", enableHiding: false, meta: { label: "模板" }, cell: ({ getValue }) => <span className="font-medium">{getValue()}</span> }),
  tplHelper.accessor("templateVersion", { header: "版本", meta: { label: "版本" }, cell: ({ getValue }) => <TypeChip>{getValue()}</TypeChip> }),
  tplHelper.accessor("templateId", { header: "ID", meta: { label: "ID" }, cell: ({ getValue }) => <span className="font-mono text-xs text-muted-foreground">{getValue()}</span> }),
  tplHelper.accessor("currencyCode", { header: "币种", meta: { label: "币种" }, cell: ({ row }) => `${row.original.currencyCode} · ${row.original.unitNote}` }),
  tplHelper.accessor((row) => row.fields.length, { id: "fields", header: "字段", meta: { label: "字段", align: "right" }, cell: ({ getValue }) => <span className="tabular-nums">{getValue()}</span> }),
  tplHelper.accessor((row) => row.checks.length, { id: "checks", header: "校验", meta: { label: "校验", align: "right" }, cell: ({ getValue }) => <span className="tabular-nums">{getValue()}</span> }),
  tplHelper.accessor("fingerprint", { header: "指纹", meta: { label: "指纹" }, cell: ({ getValue }) => <span className="font-mono text-xs text-muted-foreground">{getValue().slice(0, 12)}…</span> }),
  actionsColumn<SettlementTemplate>((item) => (
    <>
      <DropdownMenuItem asChild><Link href="/reports?tab=settlement">用此版本开结算单</Link></DropdownMenuItem>
      <DropdownMenuItem onSelect={() => toast(`复制 ${item.templateVersion} 为新版本`, { description: "新行；旧结算单仍绑旧版本" })}>复制为新版本</DropdownMenuItem>
    </>
  )),
])

function TemplatesTab() {
  const items = isOk(settlementTemplatesFixture) ? settlementTemplatesFixture.data.items : []
  const table = useGridTable({ data: items, columns: tplColumns, pageSize: 20, getRowId: (item) => `${item.templateId}-${item.templateVersion}`, initialColumnVisibility: { templateId: false } })
  const config = isOk(reportConfigFixture) ? reportConfigFixture.data : null
  return (
    <div className="flex flex-col gap-6">
      <DataGrid table={table} empty="没有结算模板" toolbar={<p className="text-xs text-muted-foreground">结算模板版本列表（新版本 = 新行）</p>} showPagination={false} />
      <Card>
        <CardHeader><CardTitle>报告配置</CardTitle><CardDescription>保存下来的报表配置 · Agent 的修改建议可全部或局部接受</CardDescription></CardHeader>
        <CardContent>{config ? <div className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm"><span className="flex items-center gap-2"><span className="font-medium">{config.name}</span><TypeChip>{config.version}</TypeChip><span className="text-xs text-muted-foreground">{config.config.groupBy.join(" × ")} · {config.config.columns.length} 列 · {config.isShared ? "已分享" : "私有"}</span></span><Button asChild size="sm" variant="outline"><Link href="/reports?tab=business">查看渲染</Link></Button></div> : <p className="text-sm text-muted-foreground">无配置</p>}</CardContent>
      </Card>
    </div>
  )
}

const subHelper = createColumnHelper<GridFeatures, Subscription>()
function makeSubColumns(onToggle: (sub: Subscription, enabled: boolean) => void) {
  return subHelper.columns([
    dragColumn<Subscription>(),
    selectionColumn<Subscription>(),
    subHelper.accessor("kind", { header: "类型", enableHiding: false, meta: { label: "类型" }, cell: ({ getValue }) => <TypeChip>{subscriptionKindLabel[getValue()]}</TypeChip> }),
    subHelper.accessor((row) => `${row.target}:${row.targetRef ?? ""}`, { id: "target", header: "目标", meta: { label: "目标" }, cell: ({ row }) => <span>{row.original.target === "group" ? "群" : "私聊"}{row.original.targetRef ? <span className="ml-1 font-mono text-xs text-muted-foreground">{row.original.targetRef}</span> : null}</span> }),
    subHelper.accessor((row) => JSON.stringify(row.config), { id: "config", header: "计划", meta: { label: "计划" }, cell: ({ row }) => { const c = row.original.config as Record<string, string | undefined>; const parts = [c.cron ? `cron ${c.cron}` : null, c.time ? `每天 ${c.time}` : null, c.role ? `角色 ${c.role}` : null, c.format ? `格式 ${c.format}` : null, c.view_id ? `视图 …${c.view_id.slice(-4)}` : null].filter(Boolean); return parts.length ? <span className="text-xs">{parts.join(" · ")}</span> : <MissingValue title="无计划配置" /> } }),
    subHelper.accessor((row) => row.quietHours ? `${row.quietHours.from}-${row.quietHours.to}` : "", { id: "quiet", header: "免打扰", meta: { label: "免打扰" }, cell: ({ row }) => row.original.quietHours ? <span className="text-xs tabular-nums">{row.original.quietHours.from} – {row.original.quietHours.to}<span className="ml-1 text-muted-foreground">（只压 P1/P2）</span></span> : <span className="text-xs text-muted-foreground">无</span> }),
    subHelper.accessor("enabled", { header: "启用", meta: { label: "启用" }, cell: ({ row }) => <Switch checked={row.original.enabled} onCheckedChange={(checked) => onToggle(row.original, checked)} aria-label="启用" /> }),
    actionsColumn<Subscription>((sub) => <DropdownMenuItem onSelect={() => toast("立即发送一次", { description: `接口接入后生效（当前为示例）` })}>立即发送一次</DropdownMenuItem>),
  ])
}

function SchedulesTab() {
  const [enabled, setEnabled] = useState<Record<number, boolean>>({})
  const items = useMemo(() => (isOk(subscriptionsFixture) ? subscriptionsFixture.data.items : []).filter((item) => item.kind !== "alert").map((item) => ({ ...item, enabled: enabled[item.id] ?? item.enabled })), [enabled])
  const columns = useMemo(() => makeSubColumns((sub, next) => { setEnabled((prev) => ({ ...prev, [sub.id]: next })); toast(`${subscriptionKindLabel[sub.kind]}已${next ? "启用" : "停用"}`, { description: `接口接入后生效（当前为示例）` }) }), [])
  const table = useGridTable({ data: items, columns, pageSize: 20, getRowId: (item) => String(item.id) })
  return <DataGrid table={table} empty="没有定时任务" toolbar={<p className="text-xs text-muted-foreground">日报推送 / 定时报表 / 结算单（警报订阅在「集成与通知」）</p>} actions={<Button size="sm" onClick={() => toast("新建定时任务", { description: "接口接入后生效（当前为示例）" })}><IconPlus />新建定时</Button>} showPagination={false} />
}

// 报表配置卡里的技术标识改人话：数据集 / 分组维度 / 排序指标
const datasetLabels: Record<string, string> = { "account.table": "账户明细表", "account.dimension": "维度汇总", "account.pivot2": "双维透视", "task.table": "任务明细表" }
const groupLabels: Record<string, string> = { task: "任务", owner: "负责人", account: "账户", biz: "业务", product: "产品", resource_position: "版位", agent_type: "代理类型" }
const metricLabels: Record<string, string> = { cost: "消耗", cashCost: "现金消耗", cashCpa: "现金 CPA", realCpa: "账面 CPA", realConversion: "真实转化", onTarget: "达标", costSpace: "成本空间" }
const datasetLabel = (key: string) => datasetLabels[key] ?? key
const groupLabel = (key: string) => groupLabels[key] ?? key
const metricLabel = (key: string) => metricLabels[key] ?? key

export function ReportsPage() {
  const state = usePageState()
  const [tab, setTab] = usePageTab<Tab>(tabs, "business")
  const cards = isOk(libraryFixture) ? libraryFixture.data.cards : null
  const kpis: DisplayMetric[] = cards ? [
    { key: "generated", label: "本月生成", value: String(cards.generatedThisMonth), delta: null, tone: "neutral" },
    { key: "pending", label: "待核对", value: String(cards.pendingCheck), delta: cards.pendingCheck ? "待分发" : null, tone: cards.pendingCheck ? "warning" : "neutral" },
    { key: "scheduled", label: "定时任务", value: String(cards.scheduled), delta: null, tone: "neutral" },
    { key: "shared", label: "已分享", value: String(cards.shared), delta: null, tone: "neutral" },
    { key: "archived", label: "已归档", value: String(cards.archived), delta: null, tone: "neutral" },
  ] : []
  return (
    <PageBody>
      <PageHeader title="报告" description="日报、经营报告、结算对账与定时分发；数据全部来自后端已冻口径，前端不算数" actions={<><Button variant="outline" size="sm" onClick={() => openAgentDrawer("帮我做一张按任务和负责人的现金 CPA 达标表，最近 7 天")}><IconSparkles />Agent 帮做表</Button></>} />
      {kpis.length ? <KpiCards metrics={kpis} /> : null}
      <PageTabs tabs={tabs} value={tab} onChange={setTab} />
      <div className="px-4 lg:px-6">
        <StateFrame state={state} unlock="报告接口（日报 / 报表配置 / 导出 / 结算）接入后切换为真数据" empty={{ title: "还没有报告", description: "日报每天自动生成；结算单在周期结束后走向导。" }}>
          {tab === "business" ? <BusinessTab /> : null}
          {tab === "daily" ? <DailyReportView /> : null}
          {tab === "weekly" ? <WeeklyTab /> : null}
          {tab === "review" ? <ReviewTab /> : null}
          {tab === "settlement" ? <SettlementWizard /> : null}
          {tab === "templates" ? <TemplatesTab /> : null}
          {tab === "schedules" ? <SchedulesTab /> : null}
          {tab === "monthly" ? <MonthlyTab /> : null}
          {tab === "ai" ? <AiImpactTab /> : null}
        </StateFrame>
      </div>
      <div className="px-4 pb-4 lg:px-6"><Badge variant="outline" className="font-normal text-muted-foreground">日报字段按 docs/18 KA 日报规范 · 结算 DTO v1.6 7.3</Badge></div>
    </PageBody>
  )
}
