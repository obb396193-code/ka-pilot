"use client"

import { useMemo, useState } from "react"
import { IconBrandDingtalk, IconPlus, IconRefresh, IconSend, IconShieldCheck } from "@tabler/icons-react"
import { createColumnHelper } from "@tanstack/react-table"
import { toast } from "sonner"

import { actionsColumn, DataGrid, dragColumn, MissingValue, selectionColumn, StatusChip, TypeChip, useGridTable, type GridFeatures } from "@/components/business/data-grid/data-grid"
import { PageBody, PageHeader } from "@/components/business/page-header"
import { useSession } from "@/components/business/session/session-provider"
import { ExampleBlock, StateFrame, StateSwitch, usePageState } from "@/components/business/state/page-state"
import { PageTabs, usePageTab } from "@/components/business/tabs/page-tabs"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { DropdownMenuItem } from "@/components/ui/dropdown-menu"
import { Switch } from "@/components/ui/switch"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { fmtTime, isOk } from "@/lib/fixtures/contract"
import { cardCallbacksFixture, cardLevelHint, cardsFixture, connectionsFixture, escalateLabel, identityMappingsFixture, messageKindLabel, messageStatusMeta, messagesFixture, policiesFixture, providerLabel, type CardCallback, type CardInstance, type IdentityMapping, type MessageItem } from "@/lib/fixtures/integrations"
import { subscriptionKindLabel, subscriptionsFixture, type Subscription } from "@/lib/fixtures/reports"
import { escalationsFixture, rosterFixture } from "@/lib/fixtures/workbench"
import { cn } from "@/lib/utils"

// 集成与通知（F-007 §7）：tabs 接入管理｜群助手｜推送订阅｜卡片中心｜值守告警｜消息记录
const tabs = [
  { value: "connections", label: "接入管理" },
  { value: "assistant", label: "群助手" },
  { value: "subscriptions", label: "推送订阅" },
  { value: "cards", label: "卡片中心" },
  { value: "oncall", label: "值守告警" },
  { value: "messages", label: "消息记录" },
] as const
type Tab = (typeof tabs)[number]["value"]

const idHelper = createColumnHelper<GridFeatures, IdentityMapping>()
const idColumns = idHelper.columns([
  dragColumn<IdentityMapping>(),
  selectionColumn<IdentityMapping>(),
  idHelper.accessor("displayName", { header: "成员", enableHiding: false, meta: { label: "成员" }, cell: ({ getValue }) => <span className="font-medium">{getValue()}</span> }),
  idHelper.accessor("provider", { header: "平台", meta: { label: "平台" }, cell: ({ getValue }) => <TypeChip>{providerLabel[getValue() as keyof typeof providerLabel] ?? getValue()}</TypeChip> }),
  idHelper.accessor("externalUserId", { header: "外部 ID", meta: { label: "外部 ID" }, cell: ({ getValue }) => <span className="font-mono text-xs">{getValue()}</span> }),
  idHelper.accessor((row) => row.verifiedAt ?? "", { id: "verified", header: "实名验证", meta: { label: "实名验证" }, cell: ({ row }) => row.original.verifiedAt ? <span className="flex items-center gap-2"><StatusChip tone="success">已验证</StatusChip><span className="text-xs text-muted-foreground tabular-nums">{fmtTime(row.original.verifiedAt)}</span></span> : <StatusChip tone="warning">未验证</StatusChip> }),
  actionsColumn<IdentityMapping>((item) => (
    <>
      <DropdownMenuItem disabled={!!item.verifiedAt} onSelect={() => toast("已发送验证消息", { description: `钉钉私聊 ${item.externalUserId}，点卡片完成实名绑定` })}>发起验证</DropdownMenuItem>
      <DropdownMenuItem onSelect={() => toast("已解绑", { description: "DELETE /identity-mappings/:id" })}>解绑</DropdownMenuItem>
    </>
  )),
])

function ConnectionsTab() {
  const items = isOk(connectionsFixture) ? connectionsFixture.data.items : []
  const mappings = isOk(identityMappingsFixture) ? identityMappingsFixture.data.items : []
  const table = useGridTable({ data: mappings, columns: idColumns, pageSize: 20, getRowId: (item) => item.externalUserId })
  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-4 @3xl/main:grid-cols-2 @6xl/main:grid-cols-3">
        {items.map((item) => (
          <Card key={item.id} className={cn(item.status !== "connected" && "border-status-critical")}>
            <CardHeader>
              <div className="flex items-start justify-between gap-2"><CardTitle className="flex items-center gap-2 text-base"><IconBrandDingtalk className="size-5" />{providerLabel[item.provider]}</CardTitle><span className="flex gap-1"><StatusChip tone={item.status === "connected" ? "success" : "critical"}>{item.status === "connected" ? "已连接" : item.status === "pending" ? "待授权" : "断连"}</StatusChip><StatusChip tone={item.health === "ok" ? "success" : item.health === "degraded" ? "warning" : "critical"}>{item.health === "ok" ? "健康" : item.health === "degraded" ? "降级" : "不可用"}</StatusChip></span></div>
              <CardDescription className="font-mono text-xs">{item.config.clientIdMasked} · 探活 {fmtTime(item.lastCheckedAt)}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-2 text-sm">
              <div><p className="text-xs text-muted-foreground">机器人</p>{item.config.robots.map((robot) => <p key={robot.robot_id}>{robot.name} <span className="font-mono text-xs text-muted-foreground">{robot.robot_id}</span></p>)}</div>
              <div><p className="text-xs text-muted-foreground">群</p>{item.config.groups.map((group) => <p key={group.conversation_id}>{group.name} <span className="font-mono text-xs text-muted-foreground">{group.conversation_id}</span></p>)}</div>
            </CardContent>
            <CardFooter className="gap-2">
              <Button size="sm" variant="outline" onClick={() => toast.success("探活通过", { description: "POST /integrations/connections/:id/check · 机器人 token 与群可达" })}><IconRefresh />探活</Button>
              <Button size="sm" variant="ghost" onClick={() => toast("发送测试消息", { description: "向群发一条 L0 测试卡" })}><IconSend />测试消息</Button>
            </CardFooter>
          </Card>
        ))}
        <Card className="border-dashed">
          <CardHeader><CardTitle className="text-base">新增接入</CardTitle><CardDescription>飞书 / 企业微信</CardDescription></CardHeader>
          <CardContent className="text-sm text-muted-foreground">当前只有钉钉网关；其他平台待网关适配（独立部署包）。</CardContent>
          <CardFooter><Tooltip><TooltipTrigger asChild><span className="inline-flex"><Button size="sm" variant="outline" disabled><IconPlus />添加</Button></span></TooltipTrigger><TooltipContent side="bottom">网关适配后开放</TooltipContent></Tooltip></CardFooter>
        </Card>
      </div>
      <Card>
        <CardHeader><CardTitle>身份映射</CardTitle><CardDescription>identity-mappings · 外部账号 ↔ 产品成员；未验证成员在群里发的指令不执行写操作</CardDescription></CardHeader>
        <CardContent><DataGrid table={table} empty="没有映射" showPagination={false} showColumnPicker={false} /></CardContent>
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
    subHelper.accessor((row) => `${row.target}:${row.targetRef ?? ""}`, { id: "target", header: "目标", meta: { label: "目标" }, cell: ({ row }) => <span>{row.original.target === "group" ? "群" : "私聊（本人）"}{row.original.targetRef ? <span className="ml-1 font-mono text-xs text-muted-foreground">{row.original.targetRef}</span> : null}</span> }),
    subHelper.accessor((row) => JSON.stringify(row.config), { id: "config", header: "配置", meta: { label: "配置" }, cell: ({ row }) => { const c = row.original.config as Record<string, unknown>; const parts = [Array.isArray(c.severities) ? `级别 ${(c.severities as string[]).join("/")}` : null, c.cron ? `cron ${String(c.cron)}` : null, c.time ? `每天 ${String(c.time)}` : null, c.role ? `角色 ${String(c.role)}` : null, c.format ? `格式 ${String(c.format)}` : null].filter(Boolean); return parts.length ? <span className="text-xs">{parts.join(" · ")}</span> : <MissingValue title="无配置" /> } }),
    subHelper.accessor((row) => row.quietHours ? `${row.quietHours.from}-${row.quietHours.to}` : "", { id: "quiet", header: "免打扰", meta: { label: "免打扰" }, cell: ({ row }) => row.original.quietHours ? <span className="text-xs tabular-nums">{row.original.quietHours.from} – {row.original.quietHours.to}</span> : <span className="text-xs text-muted-foreground">无</span> }),
    subHelper.accessor("enabled", { header: "启用", meta: { label: "启用" }, cell: ({ row }) => <Switch checked={row.original.enabled} onCheckedChange={(checked) => onToggle(row.original, checked)} aria-label="启用" /> }),
    actionsColumn<Subscription>((sub) => <DropdownMenuItem onSelect={() => toast("立即发送一次", { description: `POST /subscriptions/${sub.id}/run-now` })}>立即发送一次</DropdownMenuItem>),
  ])
}

function SubscriptionsTab() {
  const [enabled, setEnabled] = useState<Record<number, boolean>>({})
  const items = useMemo(() => (isOk(subscriptionsFixture) ? subscriptionsFixture.data.items : []).map((item) => ({ ...item, enabled: enabled[item.id] ?? item.enabled })), [enabled])
  const columns = useMemo(() => makeSubColumns((sub, next) => { setEnabled((prev) => ({ ...prev, [sub.id]: next })); toast(`${subscriptionKindLabel[sub.kind]}已${next ? "启用" : "停用"}`) }), [])
  const table = useGridTable({ data: items, columns, pageSize: 20, getRowId: (item) => String(item.id) })
  return <DataGrid table={table} empty="没有订阅" toolbar={<p className="text-xs text-muted-foreground">GET /subscriptions/mine · quiet_hours 只压 P1/P2，P0 破静默</p>} actions={<Button size="sm" onClick={() => toast("新建订阅", { description: "POST /subscriptions {kind, target, config, quiet_hours}" })}><IconPlus />新建订阅</Button>} showPagination={false} />
}

const instHelper = createColumnHelper<GridFeatures, CardInstance>()
const instColumns = instHelper.columns([
  dragColumn<CardInstance>(),
  selectionColumn<CardInstance>(),
  instHelper.accessor("templateId", { header: "模板", enableHiding: false, meta: { label: "模板" }, cell: ({ getValue }) => <span className="font-mono text-xs">{getValue()}</span> }),
  instHelper.accessor("status", { header: "状态", meta: { label: "状态" }, cell: ({ getValue }) => <StatusChip tone={getValue() === "awaiting" ? "warning" : getValue() === "acted" ? "success" : "muted"}>{getValue() === "awaiting" ? "等待动作" : getValue() === "acted" ? "已处理" : "已过期"}</StatusChip> }),
  instHelper.accessor((row) => row.changesetId ?? "", { id: "changeset", header: "变更集", meta: { label: "变更集" }, cell: ({ row }) => row.original.changesetId ? <span className="font-mono text-xs">…{row.original.changesetId.slice(-4)}</span> : <MissingValue /> }),
  instHelper.accessor((row) => row.hash ?? "", { id: "hash", header: "hash", meta: { label: "hash" }, cell: ({ row }) => row.original.hash ? <span className="font-mono text-xs">{row.original.hash}</span> : <MissingValue /> }),
  instHelper.accessor((row) => row.expiresAt ?? "", { id: "expires", header: "到期", meta: { label: "到期" }, cell: ({ row }) => row.original.expiresAt ? <span className="tabular-nums">{fmtTime(row.original.expiresAt)}</span> : <MissingValue /> }),
  instHelper.accessor("sentTo", { header: "发往", meta: { label: "发往" }, cell: ({ getValue }) => <span className="font-mono text-xs">{getValue()}</span> }),
  actionsColumn<CardInstance>(() => <DropdownMenuItem onSelect={() => toast("已重发", { description: "同 hash 重发；到期后需重新预览" })}>重发卡片</DropdownMenuItem>),
])
const cbHelper = createColumnHelper<GridFeatures, CardCallback>()
const cbColumns = cbHelper.columns([
  dragColumn<CardCallback>(),
  selectionColumn<CardCallback>(),
  cbHelper.accessor("at", { header: "时间", enableHiding: false, meta: { label: "时间" }, cell: ({ getValue }) => <span className="tabular-nums">{fmtTime(getValue())}</span> }),
  cbHelper.accessor("action", { header: "动作", meta: { label: "动作" }, cell: ({ getValue }) => <TypeChip>{getValue() === "confirm" ? "确认" : getValue() === "reject" ? "拒绝" : getValue()}</TypeChip> }),
  cbHelper.accessor("actorExternalId", { header: "操作者", meta: { label: "操作者" }, cell: ({ row }) => <span className="font-mono text-xs">{row.original.actorExternalId}{row.original.actorUserId ? "" : <StatusChip tone="warning" className="ml-2">未映射</StatusChip>}</span> }),
  cbHelper.accessor("hashVerified", { header: "hash 校验", meta: { label: "hash 校验" }, cell: ({ getValue }) => getValue() ? <StatusChip tone="success">通过</StatusChip> : <StatusChip tone="critical">不匹配</StatusChip> }),
  cbHelper.accessor("result", { header: "结果", meta: { label: "结果" }, cell: ({ getValue }) => <span className={cn("font-mono text-xs", getValue().startsWith("rejected") && "text-status-critical")}>{getValue()}</span> }),
  cbHelper.accessor("idempotencyKey", { header: "幂等键", meta: { label: "幂等键" }, cell: ({ getValue }) => <span className="font-mono text-xs text-muted-foreground">{getValue()}</span> }),
])

function CardsTab() {
  const data = isOk(cardsFixture) ? cardsFixture.data : { templates: [], instances: [] }
  const callbacks = isOk(cardCallbacksFixture) ? cardCallbacksFixture.data.items : []
  const instTable = useGridTable({ data: data.instances, columns: instColumns, pageSize: 20, getRowId: (item) => item.id })
  const cbTable = useGridTable({ data: callbacks, columns: cbColumns, pageSize: 20, getRowId: (item) => String(item.id), initialColumnVisibility: { idempotencyKey: false } })
  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-4 @3xl/main:grid-cols-2 @6xl/main:grid-cols-4">
        {data.templates.map((template) => (
          <Card key={template.id}>
            <CardHeader><div className="flex items-start justify-between gap-2"><CardTitle className="text-base">{template.name}</CardTitle><TypeChip>{template.level}</TypeChip></div><CardDescription>{cardLevelHint[template.level]} · <span className="font-mono">{template.id}</span></CardDescription></CardHeader>
            <CardContent className="flex flex-wrap gap-1">{template.actions.map((action) => <Badge key={action} variant="outline">{action}</Badge>)}{template.hashCheck ? <Badge variant="secondary" className="gap-1"><IconShieldCheck className="size-3" />hash 校验</Badge> : null}</CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardHeader><CardTitle>卡片实例</CardTitle><CardDescription>已发出的卡片；L2 带 hash + TTL，过期不可确认</CardDescription></CardHeader>
        <CardContent><DataGrid table={instTable} empty="没有卡片实例" showPagination={false} showColumnPicker={false} /></CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>回调记录</CardTitle><CardDescription>幂等 + hash 校验 + 实名溯源；未映射身份或 hash 不匹配一律拒绝</CardDescription></CardHeader>
        <CardContent><DataGrid table={cbTable} empty="没有回调" showPagination={false} showColumnPicker={false} /></CardContent>
      </Card>
    </div>
  )
}

function OncallTab() {
  const policies = isOk(policiesFixture) ? policiesFixture.data : null
  const roster = isOk(rosterFixture) ? rosterFixture.data.items : []
  const escalations = isOk(escalationsFixture) ? escalationsFixture.data.items : []
  const [paused, setPaused] = useState<Record<string, boolean>>({})
  return (
    <div className="grid gap-4 @5xl/main:grid-cols-2">
      <Card>
        <CardHeader><CardTitle>分级策略</CardTitle><CardDescription>alerts/policies · 默认 P0 30 分钟未确认升级备班 → 负责人</CardDescription></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-muted"><TableRow><TableHead>级别</TableHead><TableHead>破静默</TableHead><TableHead>确认时限</TableHead><TableHead>升级</TableHead></TableRow></TableHeader>
            <TableBody>{policies?.items.map((policy) => <TableRow key={policy.severity}><TableCell><StatusChip tone={policy.severity === "P0" ? "critical" : policy.severity === "P1" ? "warning" : "muted"}>{policy.severity}</StatusChip></TableCell><TableCell>{policy.breakMute ? "是" : "否"}</TableCell><TableCell className="tabular-nums">{policy.ackWithinMin ? (policy.ackWithinMin >= 60 ? `${policy.ackWithinMin / 60} 小时` : `${policy.ackWithinMin} 分钟`) : policy.batchDigest ? "合并摘要" : "−"}</TableCell><TableCell className="text-xs">{policy.escalateTo ? `${escalateLabel[policy.escalateTo] ?? policy.escalateTo}${policy.then ? ` → ${escalateLabel[policy.then] ?? policy.then}` : ""}${policy.thenAfterMin ? `（${policy.thenAfterMin / 60} 小时后）` : ""}` : "−"}</TableCell></TableRow>)}</TableBody>
          </Table>
          {policies ? <p className="border-t px-4 py-2 text-xs text-muted-foreground">免打扰 {policies.quietHours.from} – {policies.quietHours.to}，只压 {policies.quietHours.suppress.join(" / ")}</p> : null}
        </CardContent>
      </Card>
      <Card>
        <CardHeader><div className="flex items-center justify-between gap-2"><div><CardTitle>值班表</CardTitle><CardDescription>alerts/roster · 主班 / 备班</CardDescription></div><Button size="sm" variant="outline" onClick={() => toast("换班申请已发出", { description: "PUT /alerts/roster/:date" })}>换班</Button></div></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-muted"><TableRow><TableHead>日期</TableHead><TableHead>主班</TableHead><TableHead>备班</TableHead></TableRow></TableHeader>
            <TableBody>{roster.map((row) => <TableRow key={row.date}><TableCell className="tabular-nums">{row.date}</TableCell><TableCell>{row.primary.name}</TableCell><TableCell>{row.backup?.name ?? <MissingValue title="无备班" />}</TableCell></TableRow>)}</TableBody>
          </Table>
        </CardContent>
      </Card>
      <Card className="@5xl/main:col-span-2">
        <CardHeader><CardTitle>升级链</CardTitle><CardDescription>alerts/escalations · 未确认按策略逐级升级；可暂停</CardDescription></CardHeader>
        <CardContent className="flex flex-col gap-2">
          {escalations.length ? escalations.map((item) => { const isPaused = paused[item.escalationId] ?? item.paused; return <div key={item.escalationId} className="flex flex-wrap items-center gap-3 rounded-lg border px-3 py-2 text-sm"><span className="font-mono text-xs text-muted-foreground">…{item.escalationId.slice(-4)}</span><ol className="flex flex-wrap items-center gap-2">{item.chain.map((step) => <li key={step.level} className="flex items-center gap-1.5"><StatusChip tone={step.status === "acked" ? "success" : step.status === "unacked" ? "critical" : "pending"}>L{step.level} {step.status === "acked" ? "已确认" : step.status === "unacked" ? "未确认" : "待触发"}</StatusChip><span>{step.to.name}</span><span className="text-xs text-muted-foreground tabular-nums">{fmtTime(step.at)}</span></li>)}</ol><span className="ml-auto flex items-center gap-2 text-xs"><span className="text-muted-foreground">{isPaused ? "已暂停" : "运行中"}</span><Switch checked={!isPaused} onCheckedChange={(checked) => { setPaused((prev) => ({ ...prev, [item.escalationId]: !checked })); toast(checked ? "升级链已恢复" : "升级链已暂停", { description: `POST /alerts/escalations/${item.escalationId}/${checked ? "resume" : "pause"}` }) }} aria-label="升级链开关" /></span></div> }) : <p className="text-sm text-muted-foreground">没有进行中的升级</p>}
        </CardContent>
      </Card>
    </div>
  )
}

const msgHelper = createColumnHelper<GridFeatures, MessageItem>()
const msgColumns = msgHelper.columns([
  dragColumn<MessageItem>(),
  selectionColumn<MessageItem>(),
  msgHelper.accessor("createdAt", { header: "时间", enableHiding: false, meta: { label: "时间" }, cell: ({ getValue }) => <span className="tabular-nums">{fmtTime(getValue())}</span> }),
  msgHelper.accessor("direction", { header: "方向", meta: { label: "方向" }, cell: ({ getValue }) => <TypeChip>{getValue() === "out" ? "出站" : "入站"}</TypeChip> }),
  msgHelper.accessor("kind", { header: "类型", meta: { label: "类型" }, cell: ({ getValue }) => messageKindLabel[getValue()] ?? getValue() }),
  msgHelper.accessor("target", { header: "对象", meta: { label: "对象" }, cell: ({ row }) => <span className="font-mono text-xs">{row.original.channel} · {row.original.target}</span> }),
  msgHelper.accessor("status", { header: "状态", meta: { label: "状态" }, cell: ({ getValue }) => <StatusChip tone={messageStatusMeta[getValue()].tone}>{messageStatusMeta[getValue()].label}</StatusChip> }),
  msgHelper.accessor("attempts", { header: "尝试", meta: { label: "尝试", align: "right" }, cell: ({ getValue }) => <span className="tabular-nums">{getValue()}</span> }),
  msgHelper.accessor((row) => row.failReason ?? "", { id: "fail", header: "失败原因", meta: { label: "失败原因" }, cell: ({ getValue }) => getValue() ? <span className="text-xs text-status-critical">{getValue()}</span> : <span className="text-xs text-muted-foreground">−</span> }),
  msgHelper.accessor((row) => row.sentAt ?? row.processedAt ?? "", { id: "done", header: "完成", meta: { label: "完成" }, cell: ({ getValue }) => getValue() ? <span className="tabular-nums">{fmtTime(getValue())}</span> : <MissingValue /> }),
  msgHelper.accessor((row) => row.ref ? `${row.ref.type}:${row.ref.id}` : "", { id: "ref", header: "关联", meta: { label: "关联" }, cell: ({ row }) => row.original.ref ? <span className="text-xs">{row.original.ref.type} …{row.original.ref.id.slice(-4)}</span> : <span className="text-xs text-muted-foreground">−</span> }),
  actionsColumn<MessageItem>((item) => (
    <>
      <DropdownMenuItem disabled={!(item.direction === "out" && item.status === "failed")} onSelect={() => toast("已重新排队", { description: `POST /messages/${item.id}/retry · 出站 failed → queued` })}>重试（出站）</DropdownMenuItem>
      <DropdownMenuItem disabled={!(item.direction === "in" && item.status === "dead")} onSelect={() => toast("已重置 dead 行", { description: `POST /messages/${item.id}/retry · 入站 dead 需 admin 重置` })}>重置（入站 dead · admin）</DropdownMenuItem>
    </>
  )),
])

function MessagesTab() {
  const [filter, setFilter] = useState<"all" | "out" | "in" | "failed">("all")
  const items = useMemo(() => (isOk(messagesFixture) ? messagesFixture.data.items : []).filter((item) => filter === "all" || (filter === "failed" ? item.status === "failed" || item.status === "dead" : item.direction === filter)), [filter])
  const table = useGridTable({ data: items, columns: msgColumns, pageSize: 20, getRowId: (item) => item.id })
  return <DataGrid table={table} empty="没有消息" toolbar={<Tabs value={filter} onValueChange={(value) => setFilter(value as typeof filter)}><TabsList><TabsTrigger value="all">全部</TabsTrigger><TabsTrigger value="out">出站</TabsTrigger><TabsTrigger value="in">入站</TabsTrigger><TabsTrigger value="failed">失败 / dead</TabsTrigger></TabsList></Tabs>} showPagination={false} />
}

export function IntegrationsPage() {
  const { isMock } = useSession()
  const state = usePageState()
  const [tab, setTab] = usePageTab<Tab>(tabs, "connections")
  return (
    <PageBody>
      <PageHeader title="集成与通知" description="钉钉网关：接入、身份映射、订阅、卡片 L0–L3、值守升级链、消息记录（出站 ∪ 入站）" isMock={isMock} actions={<StateSwitch />} />
      <PageTabs tabs={tabs} value={tab} onChange={setTab} />
      <div className="px-4 lg:px-6">
        <StateFrame state={state} unlock="网关 HTTP（connections / subscriptions / cards / messages，R-012 / R-014）接入后切换为真数据" empty={{ title: "还没有接入", description: "先在接入管理连上钉钉机器人。" }}>
          {tab === "connections" ? <ConnectionsTab /> : null}
          {tab === "assistant" ? (
            <ExampleBlock unlock="群助手为联调项（网关已具备）：接入后这里显示机器人在群里支持的指令与最近会话">
              <Card>
                <CardHeader><CardTitle>群助手</CardTitle><CardDescription>在钉钉群 @KA Pilot 经营助手，用自然语言查数、建任务、调工作流；写操作一律出变更集卡片确认</CardDescription></CardHeader>
                <CardContent className="grid gap-3 @3xl/main:grid-cols-3 text-sm">
                  {[["查数", "「AAC 拉新 昨天 现金 CPA」→ 回 L0 卡：账面 / 现金并排，缺数显 −"], ["建任务", "「新建任务 闲鱼潜客 9 月 目标 5 万」→ 回确认卡，确认后创建（未映射身份不执行）"], ["调工作流", "「跑一遍 新任务开户到基建」→ 起 run，到人工确认节点发 L2 卡"]].map(([title, body]) => <div key={title} className="rounded-lg border p-3"><p className="font-medium">{title}</p><p className="mt-1 text-xs text-muted-foreground">{body}</p></div>)}
                </CardContent>
              </Card>
            </ExampleBlock>
          ) : null}
          {tab === "subscriptions" ? <SubscriptionsTab /> : null}
          {tab === "cards" ? <CardsTab /> : null}
          {tab === "oncall" ? <OncallTab /> : null}
          {tab === "messages" ? <MessagesTab /> : null}
        </StateFrame>
      </div>
    </PageBody>
  )
}
