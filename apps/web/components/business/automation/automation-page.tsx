"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { IconExternalLink, IconPlus, IconSparkles, IconTopologyStar3 } from "@tabler/icons-react"
import { createColumnHelper } from "@tanstack/react-table"
import { toast } from "sonner"

import { openAgentDrawer } from "@/components/business/command/events"
import { actionsColumn, DataGrid, dragColumn, MissingValue, selectionColumn, StatusChip, TypeChip, useGridTable, useLocalOrder, type GridFeatures } from "@/components/business/data-grid/data-grid"
import { PageBody, PageHeader } from "@/components/business/page-header"
import { useSession } from "@/components/business/session/session-provider"
import { ExampleBlock, StateFrame, StateSwitch, usePageState } from "@/components/business/state/page-state"
import { PageTabs, usePageTab } from "@/components/business/tabs/page-tabs"
import { KpiCards } from "@/components/business/workbench/kpi-cards"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Progress } from "@/components/ui/progress"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Slider } from "@/components/ui/slider"
import { Switch } from "@/components/ui/switch"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import type { DisplayMetric } from "@/lib/data/contracts"
import { agentRunEventsFixture, agentRunsFixture, automationHealthFixture, autonomyLevels, capabilitiesFixture, capabilityCategoryLabel, capabilityStatusMeta, conditionText, definitionsFixture, metricLabel, notTriggeredLabel, riskLabel, ruleExplainFixture, rulesFixture, runsFixture, runStatusMeta, type AgentRunItem, type CapabilityItem, type RuleItem, type RunItem, type WorkflowDefinition } from "@/lib/fixtures/automation"
import { fmtTime, isOk, rv } from "@/lib/fixtures/contract"
import { ShadowTab } from "./shadow-tab"
import { cn } from "@/lib/utils"

// 自动化（F-007 §5）：tabs 官方模板｜我的工作流｜团队共享｜自动化规则｜运行中心｜原子能力；顶部健康五卡；画布/运行详情走二级路由
const tabs = [
  { value: "official", label: "官方模板" },
  { value: "mine", label: "我的工作流" },
  { value: "team", label: "团队共享" },
  { value: "rules", label: "自动化规则" },
  { value: "runs", label: "运行中心" },
  { value: "capabilities", label: "原子能力" },
  { value: "shadow", label: "Shadow" },
] as const
type Tab = (typeof tabs)[number]["value"]
const canvasHref = (id: string) => `/automation/workflows/${encodeURIComponent(id)}`
const runHref = (id: string) => `/automation/runs/${encodeURIComponent(id)}`

function TemplateCard({ item, kind }: { item: WorkflowDefinition; kind: "official" | "mine" | "team" }) {
  return (
    <Card className="flex flex-col">
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <div><CardTitle className="text-base">{item.name}</CardTitle><CardDescription className="mt-1">{item.description ?? (item.copiedFrom ? "复制自官方模板，草稿中" : "−")}</CardDescription></div>
          <StatusChip tone={item.risk === "low" ? "success" : item.risk === "medium" ? "warning" : "critical"}>{riskLabel[item.risk]}</StatusChip>
        </div>
      </CardHeader>
      <CardContent className="flex-1">
        <dl className="grid grid-cols-3 gap-2 text-xs">
          <div><dt className="text-muted-foreground">版本</dt><dd className="font-medium tabular-nums">{item.version}</dd></div>
          <div><dt className="text-muted-foreground">耗时</dt><dd className="font-medium tabular-nums">{item.avgDurationMin != null ? `${item.avgDurationMin} 分` : "−"}</dd></div>
          <div><dt className="text-muted-foreground">成功率</dt><dd className="font-medium tabular-nums">{item.successRate ? rv(item.successRate) : "−"}</dd></div>
          <div><dt className="text-muted-foreground">使用次数</dt><dd className="font-medium tabular-nums">{item.useCount ?? "−"}</dd></div>
          <div className="col-span-2"><dt className="text-muted-foreground">资产类型</dt><dd><TypeChip>{kind === "official" ? "官方模板" : kind === "mine" ? "个人" : "团队"}</TypeChip></dd></div>
        </dl>
      </CardContent>
      <CardFooter className="gap-2">
        <Button asChild size="sm" variant="outline"><Link href={canvasHref(item.id)}><IconTopologyStar3 />打开画布</Link></Button>
        {kind === "official" ? <Button size="sm" onClick={() => toast("已从模板复制到「我的工作流」", { description: "接入后落库；现在只在本页示意" })}><IconPlus />从模板创建</Button> : <Button size="sm" variant="ghost" onClick={() => toast("分享到团队", { description: "资产从草稿转共享，接入后生效" })}>分享到团队</Button>}
      </CardFooter>
    </Card>
  )
}

const ruleHelper = createColumnHelper<GridFeatures, RuleItem>()
function makeRuleColumns(onExplain: (rule: RuleItem) => void, onAutonomy: (rule: RuleItem, level: number) => void, onToggle: (rule: RuleItem, enabled: boolean) => void) {
  return ruleHelper.columns([
    dragColumn<RuleItem>(),
    selectionColumn<RuleItem>(),
    ruleHelper.accessor("name", { header: "名称", enableHiding: false, meta: { label: "名称" }, cell: ({ getValue }) => <span className="font-medium">{getValue()}</span> }),
    ruleHelper.accessor("type", { header: "类型", meta: { label: "类型" }, cell: ({ getValue }) => <TypeChip>{getValue() === "auto" ? "自动" : "监控"}</TypeChip> }),
    ruleHelper.accessor((row) => conditionText(row.conditionTree), { id: "condition", header: "触发条件", meta: { label: "触发条件" }, cell: ({ getValue }) => <span className="text-xs">{getValue()}</span> }),
    ruleHelper.accessor("nextEvalAt", { header: "下次评估", meta: { label: "下次评估" }, cell: ({ getValue }) => <span className="tabular-nums">{fmtTime(getValue())}</span> }),
    ruleHelper.accessor("enabled", { header: "状态", meta: { label: "状态" }, cell: ({ row }) => <span className="flex items-center gap-2"><Switch checked={row.original.enabled} onCheckedChange={(checked) => onToggle(row.original, checked)} aria-label="启用" /><span className="text-xs text-muted-foreground">{row.original.enabled ? "启用" : "停用"}</span></span> }),
    ruleHelper.accessor((row) => row.notTriggeredReason ?? "", { id: "why", header: "为什么未触发", meta: { label: "为什么未触发" }, cell: ({ row }) => row.original.notTriggeredReason ? <Button variant="link" className="h-auto px-0 text-xs" onClick={() => onExplain(row.original)}><StatusChip tone="muted">{notTriggeredLabel[row.original.notTriggeredReason] ?? row.original.notTriggeredReason}</StatusChip></Button> : <span className="text-xs text-muted-foreground">最近一轮已判定</span> }),
    ruleHelper.accessor((row) => row.last7d.triggered, { id: "last7d", header: "近 7 天", meta: { label: "近 7 天", align: "right" }, cell: ({ row }) => <span className="tabular-nums">触发 {row.original.last7d.triggered} · 成功 {row.original.last7d.succeeded}</span> }),
    ruleHelper.accessor("autonomyLevel", { header: "自治度", meta: { label: "自治度" }, cell: ({ row }) => <div className="flex w-40 items-center gap-2"><Slider min={0} max={2} step={1} value={[row.original.autonomyLevel]} onValueChange={([level]) => onAutonomy(row.original, level)} aria-label="自治度" /><span className="w-14 shrink-0 text-xs">{autonomyLevels[row.original.autonomyLevel]?.label}</span></div> }),
    ruleHelper.accessor((row) => row.owner?.name ?? "", { id: "owner", header: "负责人", meta: { label: "负责人" }, cell: ({ getValue }) => getValue() || <span className="text-muted-foreground">系统</span> }),
    actionsColumn<RuleItem>((rule) => (
      <>
        <DropdownMenuItem onSelect={() => onExplain(rule)}>解释最近一轮</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => openAgentDrawer(`解释规则「${rule.name}」最近 7 天触发 ${rule.last7d.triggered} 次、成功 ${rule.last7d.succeeded} 次的原因`)}><IconSparkles />问 AI</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled title="规则编辑接入后启用">编辑条件</DropdownMenuItem>
      </>
    )),
  ])
}

function RulesTab() {
  const [explain, setExplain] = useState<RuleItem | null>(null)
  const [levels, setLevels] = useState<Record<number, number>>({})
  const [enabled, setEnabled] = useState<Record<number, boolean>>({})
  const rules = useMemo(() => (isOk(rulesFixture) ? rulesFixture.data.items : []).map((rule) => ({ ...rule, autonomyLevel: levels[rule.ruleId] ?? rule.autonomyLevel, enabled: enabled[rule.ruleId] ?? rule.enabled })), [levels, enabled])
  const columns = useMemo(() => makeRuleColumns(setExplain, (rule, level) => { setLevels((prev) => ({ ...prev, [rule.ruleId]: level })); toast(`「${rule.name}」自治度 → ${autonomyLevels[level].label}`, { description: `${autonomyLevels[level].hint}` }) }, (rule, next) => { setEnabled((prev) => ({ ...prev, [rule.ruleId]: next })); toast(`「${rule.name}」已${next ? "启用" : "停用"}`) }), [])
  const { ordered, reorder } = useLocalOrder(rules, (rule) => String(rule.ruleId))
  const table = useGridTable({ data: ordered, columns, pageSize: 20, getRowId: (rule) => String(rule.ruleId), initialColumnVisibility: { owner: false } })
  const explainData = isOk(ruleExplainFixture) && explain && ruleExplainFixture.data.ruleId === explain.ruleId ? ruleExplainFixture.data : null
  return (
    <>
      <DataGrid table={table} onReorder={reorder} empty="还没有规则" toolbar={<p className="text-xs text-muted-foreground">12.8：任一叶子指标缺数 → 不触发也不消触，账户计入「不可判断」；自治度三档只改执行方式，不改条件</p>} actions={<Tooltip><TooltipTrigger asChild><span className="inline-flex"><Button size="sm" disabled><IconPlus />新建规则</Button></span></TooltipTrigger><TooltipContent side="bottom">新建规则接入后启用（自然语言建规则未开发）</TooltipContent></Tooltip>} />
      <Dialog open={explain !== null} onOpenChange={(open) => { if (!open) setExplain(null) }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>为什么未触发 · {explain?.name}</DialogTitle><DialogDescription>按账户 × 日期看叶子真值表</DialogDescription></DialogHeader>
          {explainData ? (
            <div className="flex flex-col gap-3">
              <p className="text-sm">账户 {explainData.accountId} · {explainData.ds} · <StatusChip tone="muted">{notTriggeredLabel[explainData.notTriggeredReason ?? ""] ?? explainData.notTriggeredReason ?? "−"}</StatusChip></p>
              <Table>
                <TableHeader className="bg-muted"><TableRow><TableHead>指标</TableHead><TableHead>条件</TableHead><TableHead className="text-right">实际</TableHead><TableHead>结果</TableHead></TableRow></TableHeader>
                <TableBody>{explainData.leaves.map((leaf) => <TableRow key={leaf.metric}><TableCell>{metricLabel[leaf.metric] ?? leaf.metric}</TableCell><TableCell className="tabular-nums">{leaf.operator} {leaf.threshold}</TableCell><TableCell className="text-right tabular-nums">{leaf.availability === "available" ? leaf.value : <MissingValue title="缺数" />}</TableCell><TableCell>{leaf.pass === null ? <StatusChip tone="muted">不判</StatusChip> : leaf.pass ? <StatusChip tone="success">通过</StatusChip> : <StatusChip tone="critical">未过</StatusChip>}</TableCell></TableRow>)}</TableBody>
              </Table>
              <p className="rounded-lg bg-muted px-3 py-2 text-sm">{explainData.fallbackCopy}</p>
            </div>
          ) : <p className="text-sm text-muted-foreground">该规则没有 explain 样例（fixture 只给了规则 3 · account-5）；接口接入后按账户 × 日期查看。</p>}
        </DialogContent>
      </Dialog>
    </>
  )
}

const runHelper = createColumnHelper<GridFeatures, RunItem>()
const runColumns = runHelper.columns([
  dragColumn<RunItem>(),
  selectionColumn<RunItem>(),
  runHelper.accessor("name", { header: "工作流", enableHiding: false, meta: { label: "工作流" }, cell: ({ row }) => <Button asChild variant="link" className="h-auto px-0 font-medium text-foreground"><Link href={runHref(row.original.runId)}>{row.original.name}</Link></Button> }),
  runHelper.accessor("version", { header: "版本", meta: { label: "版本" }, cell: ({ getValue }) => <TypeChip>{getValue()}</TypeChip> }),
  runHelper.accessor("status", { header: "状态", meta: { label: "状态" }, cell: ({ getValue }) => <StatusChip tone={runStatusMeta[getValue()].tone}>{runStatusMeta[getValue()].label}</StatusChip> }),
  runHelper.accessor("stepIndex", { header: "步骤", meta: { label: "步骤" }, cell: ({ row }) => <div className="flex w-36 items-center gap-2"><Progress value={(row.original.stepIndex / Math.max(1, row.original.stepTotal)) * 100} className="h-1.5" /><span className="text-xs tabular-nums">{row.original.stepIndex}/{row.original.stepTotal}</span></div> }),
  runHelper.accessor("startedAt", { header: "开始", meta: { label: "开始" }, cell: ({ getValue }) => <span className="tabular-nums">{fmtTime(getValue())}</span> }),
  runHelper.accessor((row) => row.eta ?? "", { id: "eta", header: "ETA", meta: { label: "ETA" }, cell: ({ row }) => row.original.eta ? <span className="tabular-nums">{fmtTime(row.original.eta)}</span> : <MissingValue title="后端未给 ETA" /> }),
  runHelper.accessor((row) => row.initiator.name, { id: "initiator", header: "发起人", meta: { label: "发起人" } }),
  runHelper.accessor("runId", { header: "Run ID", meta: { label: "Run ID" }, cell: ({ getValue }) => <span className="font-mono text-xs text-muted-foreground">…{getValue().slice(-6)}</span> }),
  actionsColumn<RunItem>((run) => (
    <>
      <DropdownMenuItem asChild><Link href={runHref(run.runId)}>运行详情</Link></DropdownMenuItem>
      <DropdownMenuItem disabled={run.status !== "WAITING_CONFIRMATION"} onSelect={() => toast("去运行详情确认", { description: "确认执行在详情页，带权限校验与账户锁" })}>确认执行</DropdownMenuItem>
      <DropdownMenuItem disabled={run.status !== "UNKNOWN"} onSelect={() => toast("已触发回读", { description: "先回读媒体现状再决定，不重发" })}>回读媒体态</DropdownMenuItem>
    </>
  )),
])

const agentHelper = createColumnHelper<GridFeatures, AgentRunItem>()
function makeAgentColumns(onEvents: (run: AgentRunItem) => void) {
  return agentHelper.columns([
    dragColumn<AgentRunItem>(),
    selectionColumn<AgentRunItem>(),
    agentHelper.accessor("kind", { header: "类型", enableHiding: false, meta: { label: "类型" }, cell: ({ getValue }) => <TypeChip>{getValue() === "diagnosis" ? "诊断" : getValue() === "report" ? "报告" : getValue()}</TypeChip> }),
    agentHelper.accessor("status", { header: "状态", meta: { label: "状态" }, cell: ({ row }) => <StatusChip tone={row.original.status === "done" ? "success" : row.original.status === "failed" ? "critical" : "progress"}>{row.original.status === "done" ? "完成" : row.original.status === "failed" ? `失败 · ${row.original.error ?? ""}` : "运行中"}</StatusChip> }),
    agentHelper.accessor("startedAt", { header: "开始", meta: { label: "开始" }, cell: ({ getValue }) => <span className="tabular-nums">{fmtTime(getValue())}</span> }),
    agentHelper.accessor("durationMs", { header: "耗时", meta: { label: "耗时", align: "right" }, cell: ({ getValue }) => <span className="tabular-nums">{getValue() == null ? "−" : `${(getValue()! / 1000).toFixed(1)} s`}</span> }),
    agentHelper.accessor((row) => row.tokens?.in ?? null, { id: "tokens", header: "Tokens", meta: { label: "Tokens", align: "right" }, cell: ({ row }) => row.original.tokens ? <span className="tabular-nums">{row.original.tokens.in} / {row.original.tokens.out}</span> : <MissingValue /> }),
    agentHelper.accessor("budgetUsd", { header: "花费", meta: { label: "花费", align: "right" }, cell: ({ getValue }) => <span className="tabular-nums">{getValue() == null ? "−" : `$${getValue()!.toFixed(2)}`}</span> }),
    agentHelper.accessor((row) => row.result?.workItemId ?? "", { id: "result", header: "产物", meta: { label: "产物" }, cell: ({ row }) => row.original.result?.workItemId ? <Link href={`/diagnostics/${row.original.result.workItemId}`} className="text-xs underline-offset-4 hover:underline">工作项 …{row.original.result.workItemId.slice(-4)}</Link> : <MissingValue /> }),
    actionsColumn<AgentRunItem>((run) => <DropdownMenuItem onSelect={() => onEvents(run)}>查看事件（受限日志）</DropdownMenuItem>),
  ])
}

function RunsTab() {
  const [status, setStatus] = useState<"all" | "active" | "waiting" | "done">("all")
  const [events, setEvents] = useState<AgentRunItem | null>(null)
  const runs = useMemo(() => (isOk(runsFixture) ? runsFixture.data.items : []).filter((run) => status === "all" || (status === "active" && (run.status === "RUNNING" || run.status === "UNKNOWN")) || (status === "waiting" && run.status === "WAITING_CONFIRMATION") || (status === "done" && (run.status === "SUCCESS" || run.status === "PARTIAL_SUCCESS" || run.status === "FAILED"))), [status])
  const table = useGridTable({ data: runs, columns: runColumns, pageSize: 20, getRowId: (run) => run.runId, initialColumnVisibility: { runId: false } })
  const agentRuns = isOk(agentRunsFixture) ? agentRunsFixture.data.items : []
  const agentColumns = useMemo(() => makeAgentColumns(setEvents), [])
  const agentTable = useGridTable({ data: agentRuns, columns: agentColumns, pageSize: 20, getRowId: (run) => run.runId })
  const eventData = isOk(agentRunEventsFixture) && events && agentRunEventsFixture.data.runId === events.runId ? agentRunEventsFixture.data : null
  return (
    <div className="flex flex-col gap-6">
      <DataGrid table={table} empty="没有运行记录" toolbar={<Tabs value={status} onValueChange={(value) => setStatus(value as typeof status)}><TabsList><TabsTrigger value="all">全部</TabsTrigger><TabsTrigger value="active">运行中 / UNKNOWN</TabsTrigger><TabsTrigger value="waiting">待确认</TabsTrigger><TabsTrigger value="done">已结束</TabsTrigger></TabsList></Tabs>} />
      <Card>
        <CardHeader><CardTitle>Agent / OS 运行监控</CardTitle><CardDescription>我发起的 Run；原始日志受限</CardDescription></CardHeader>
        <CardContent><DataGrid table={agentTable} empty="没有 Agent 运行" showPagination={false} showColumnPicker={false} /></CardContent>
      </Card>
      <Dialog open={events !== null} onOpenChange={(open) => { if (!open) setEvents(null) }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>运行事件 · …{events?.runId.slice(-4)}</DialogTitle><DialogDescription>只显示事件骨架，不含 prompt / 原始日志</DialogDescription></DialogHeader>
          {eventData ? <ol className="flex flex-col gap-2">{eventData.events.map((event) => <li key={event.seq} className="flex items-start gap-3 text-sm"><span className="w-5 text-right text-xs text-muted-foreground tabular-nums">{event.seq}</span><TypeChip>{event.kind}</TypeChip><span className="flex-1 text-xs">{event.tool ?? event.schema ?? event.status ?? ""}{event.argsExcerpt ? ` · ${JSON.stringify(event.argsExcerpt)}` : ""}{event.ok === true ? " · ok" : ""}</span><span className="text-xs text-muted-foreground tabular-nums">{fmtTime(event.at)}</span></li>)}</ol> : <p className="text-sm text-muted-foreground">该 Run 没有事件样例（fixture 只给了 …1801）。</p>}
        </DialogContent>
      </Dialog>
    </div>
  )
}

function CapabilityForm({ item, onClose }: { item: CapabilityItem; onClose: () => void }) {
  const [values, setValues] = useState<Record<string, string>>({})
  const props = Object.entries(item.form_schema.properties ?? {})
  const required = item.form_schema.required ?? []
  const missing = required.filter((key) => !values[key])
  const writeLike = item.category !== "query"
  return (
    <>
      <div className="grid gap-3">
        {props.length ? props.map(([key, schema]) => (
          <div key={key} className="grid gap-1.5">
            <Label>{key}{required.includes(key) ? <span className="text-status-critical"> *</span> : null}<span className="ml-1 text-xs text-muted-foreground">{schema.type}{schema.items ? `<${schema.items.type}>` : ""}</span></Label>
            {schema.enum ? (
              <Select value={values[key] ?? ""} onValueChange={(value) => setValues((prev) => ({ ...prev, [key]: value }))}><SelectTrigger><SelectValue placeholder="选择" /></SelectTrigger><SelectContent>{schema.enum.map((option) => <SelectItem key={option} value={option}>{option}</SelectItem>)}</SelectContent></Select>
            ) : schema.type === "number" ? (
              <Input type="number" min={schema.minimum} value={values[key] ?? ""} onChange={(event) => setValues((prev) => ({ ...prev, [key]: event.target.value }))} />
            ) : schema.type === "array" ? (
              <Textarea placeholder="逗号分隔" value={values[key] ?? ""} onChange={(event) => setValues((prev) => ({ ...prev, [key]: event.target.value }))} />
            ) : (
              <Input value={values[key] ?? ""} onChange={(event) => setValues((prev) => ({ ...prev, [key]: event.target.value }))} />
            )}
          </div>
        )) : <p className="text-sm text-muted-foreground">该能力不需要填参数。</p>}
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>取消</Button>
        <Button disabled={missing.length > 0} onClick={() => { toast.success(writeLike ? "已生成变更集草稿（未落媒体）" : "查询已提交", { description: writeLike ? "到「工作台 · 待确认变更集」确认后才会落媒体" : "结果会出现在运行记录里" }); onClose() }}>{writeLike ? "生成变更集草稿" : "执行查询"}</Button>
      </DialogFooter>
    </>
  )
}

function CapabilitiesTab() {
  const [active, setActive] = useState<CapabilityItem | null>(null)
  const items = isOk(capabilitiesFixture) ? capabilitiesFixture.data.items : []
  return (
    <>
      <div className="grid gap-4 @3xl/main:grid-cols-2 @6xl/main:grid-cols-4">
        {items.map((item) => (
          <Card key={item.key} className={cn("flex flex-col", item.status === "disabled" && "opacity-60")}>
            <CardHeader>
              <div className="flex items-start justify-between gap-2"><CardTitle className="text-base">{item.name}</CardTitle><StatusChip tone={capabilityStatusMeta[item.status].tone}>{capabilityStatusMeta[item.status].label}</StatusChip></div>
              <CardDescription className="font-mono text-xs">{item.key} · v{item.version}</CardDescription>
            </CardHeader>
            <CardContent className="flex-1">
              <dl className="grid grid-cols-2 gap-2 text-xs">
                <div><dt className="text-muted-foreground">类别</dt><dd><TypeChip>{capabilityCategoryLabel[item.category]}</TypeChip></dd></div>
                <div><dt className="text-muted-foreground">执行器</dt><dd className="font-mono">{item.executor}</dd></div>
                <div><dt className="text-muted-foreground">媒体</dt><dd>{item.media.join(" / ")}</dd></div>
                <div><dt className="text-muted-foreground">权限</dt><dd className="font-mono">{item.permission}</dd></div>
              </dl>
            </CardContent>
            <CardFooter>
              <Tooltip><TooltipTrigger asChild><span className="inline-flex w-full"><Button size="sm" className="w-full" variant={item.category === "query" ? "outline" : "default"} disabled={item.status === "disabled"} onClick={() => setActive(item)}>{item.category === "query" ? "查数" : "调用（出变更集草稿）"}</Button></span></TooltipTrigger>{item.status === "disabled" ? <TooltipContent side="bottom">能力已禁用（治理后台可开）</TooltipContent> : null}</Tooltip>
            </CardFooter>
          </Card>
        ))}
      </div>
      <Dialog open={active !== null} onOpenChange={(open) => { if (!open) setActive(null) }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>{active?.name}</DialogTitle><DialogDescription>表单按能力自带的字段定义渲染；写类操作只出变更集草稿，不直接落媒体</DialogDescription></DialogHeader>
          {active ? <CapabilityForm item={active} onClose={() => setActive(null)} /> : null}
        </DialogContent>
      </Dialog>
    </>
  )
}

export function AutomationPage() {
  const { isMock } = useSession()
  const state = usePageState()
  const [tab, setTab] = usePageTab<Tab>(tabs, "official")
  const defs = isOk(definitionsFixture) ? definitionsFixture.data : { official: [], mine: [], team: [] }
  const health = isOk(automationHealthFixture) ? automationHealthFixture.data : null
  const cards: DisplayMetric[] = health ? [
    { key: "connectors", label: "连接器", value: `${health.connectors.ok}/${health.connectors.total}`, delta: health.connectors.ok === health.connectors.total ? "全部在线" : `${health.connectors.total - health.connectors.ok} 个异常`, tone: health.connectors.ok === health.connectors.total ? "positive" : "critical" },
    { key: "executors", label: "执行器", value: `${health.executors.ok}/${health.executors.total}`, delta: health.executors.ok === health.executors.total ? "全部在线" : `${health.executors.total - health.executors.ok} 个异常`, tone: health.executors.ok === health.executors.total ? "positive" : "critical" },
    { key: "queue", label: "队列待处理", value: String(health.queue.pending), delta: null, tone: "neutral" },
    { key: "agent", label: "Agent 实例", value: `${health.agent.ok}/${health.agent.instances}`, delta: null, tone: health.agent.ok === health.agent.instances ? "positive" : "warning" },
    { key: "score", label: "健康分", value: String(health.healthScore), delta: health.overall === "green" ? "正常" : health.overall === "yellow" ? "有补拉" : "异常", tone: health.overall === "green" ? "positive" : health.overall === "yellow" ? "warning" : "critical" },
  ] : []
  const tabBadges = tabs.map((item) => ({ ...item, badge: item.value === "official" ? defs.official.length : item.value === "mine" ? defs.mine.length : item.value === "team" ? defs.team.length : item.value === "runs" && isOk(runsFixture) ? runsFixture.data.items.filter((run) => run.status === "WAITING_CONFIRMATION").length || null : null }))

  return (
    <PageBody>
      <PageHeader title="自动化" description="规则、工作流、运行与原子能力的统一入口；写媒体一律 变更集 → 人工确认 → 执行" isMock={isMock} actions={<><StateSwitch /><Button variant="outline" size="sm" onClick={() => openAgentDrawer("帮我把「新任务开户到基建」改成只处理快手账户的草稿")}><IconSparkles />Agent 帮编</Button><Button asChild size="sm"><Link href={canvasHref("new")}><IconPlus />新建工作流</Link></Button></>} />
      {cards.length ? <KpiCards metrics={cards} /> : null}
      <PageTabs tabs={tabBadges} value={tab} onChange={setTab} />
      <div className="px-4 lg:px-6">
        <StateFrame state={state} unlock="R-014（工作流画布 / capabilities）+ v1.3 rules 接入后切换为真数据" empty={{ title: "还没有自动化资产", description: "从官方模板复制一份开始，或用 Agent 帮编生成草稿。" }}>
          {tab === "official" || tab === "mine" || tab === "team" ? (
            defs[tab].length ? (
              <div className="grid gap-4 @3xl/main:grid-cols-2 @6xl/main:grid-cols-3">{defs[tab].map((item) => <TemplateCard key={item.id} item={item} kind={tab} />)}</div>
            ) : (
              <Card><CardContent className="flex flex-col items-center gap-2 py-12 text-center"><p className="font-medium">{tab === "team" ? "团队共享为空" : "还没有我的工作流"}</p><p className="max-w-md text-sm text-muted-foreground">{tab === "team" ? "个人空间没有团队资产；切到团队空间，或让同事把草稿分享到团队（draft → shared）。" : "从官方模板复制一份，或用 Agent 帮编从目标生成草稿。"}</p><Button size="sm" variant="outline" onClick={() => setTab("official")}>去官方模板</Button></CardContent></Card>
            )
          ) : null}
          {tab === "rules" ? <RulesTab /> : null}
          {tab === "runs" ? <RunsTab /> : null}
          {tab === "capabilities" ? <CapabilitiesTab /> : null}
          {tab === "shadow" ? <ShadowTab /> : null}
          {tab === "official" ? (
            <ExampleBlock className="mt-6" unlock="Agent 帮编接入后：输入目标 → 出图草稿 + 缺参列表，应用后仍须校验">
              <Card><CardHeader><CardTitle>Agent 帮编</CardTitle><CardDescription>用一句话描述目标，生成工作流草稿</CardDescription></CardHeader><CardContent className="flex gap-2"><Input placeholder="例：每天 9 点检查所有快手户，超考核的出降价草稿并通知我" readOnly /><Button variant="outline" disabled><IconSparkles />生成草稿</Button></CardContent></Card>
            </ExampleBlock>
          ) : null}
        </StateFrame>
      </div>
      <div className="px-4 pb-4 lg:px-6"><Badge variant="outline" className="gap-1 font-normal text-muted-foreground"><IconExternalLink className="size-3" />画布 /automation/workflows/[id] · 运行详情 /automation/runs/[id]</Badge></div>
    </PageBody>
  )
}
