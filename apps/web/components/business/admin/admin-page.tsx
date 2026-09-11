"use client"

import { useMemo, useState } from "react"
import { IconPlus, IconRefresh } from "@tabler/icons-react"
import { createColumnHelper } from "@tanstack/react-table"
import { toast } from "sonner"

import { mediaLabel } from "@/components/business/accounts/account-status"
import { actionsColumn, DataGrid, dragColumn, MissingValue, selectionColumn, StatusChip, TypeChip, useGridTable, type GridFeatures } from "@/components/business/data-grid/data-grid"
import { PageBody, PageHeader } from "@/components/business/page-header"
import { NamingTab } from "@/components/business/admin/naming-tab"
import { NoAccess } from "@/components/business/state/no-access"
import { useSession } from "@/components/business/session/session-provider"
import { StateFrame, usePageState } from "@/components/business/state/page-state"
import { PageTabs, usePageTab } from "@/components/business/tabs/page-tabs"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { fmtTime, isOk, rv } from "@/lib/fixtures/contract"
import { AddMemberDialog, ResetPasswordDialog } from "@/components/business/admin/member-dialogs"
import { rerunEtlRun, useEtlRuns } from "@/lib/data/use-etl-runs"
import { assetKindLabel, assetsFixture, assetStatusMeta, calendarFixture, etlJobLabel, etlRunsFixture, normalizeEtlRun, eventTypeLabel, flagMeta, flagsFixture, grantsFixtures, membersFixture, reconcileFixture, roleLabel, type AssetItem, type CalendarEvent, type EtlRun, type FlagKey, type Member } from "@/lib/fixtures/admin"
import { connectionsFixture, providerLabel } from "@/lib/fixtures/integrations"
import { coefficientText, coefficientsFixture, decisionPolicyFixture } from "@/lib/fixtures/settings"
import { cn } from "@/lib/utils"

// 治理后台（F-007 §11，admin 才显）：tabs 成员与授权｜连接与拉数｜口径与日历｜灰度开关｜资产｜诊断
const tabs = [
  { value: "members", label: "成员与授权" },
  { value: "etl", label: "连接与拉数" },
  { value: "calendar", label: "口径与日历" },
  { value: "flags", label: "灰度开关" },
  { value: "assets", label: "资产" },
  { value: "diagnostics", label: "诊断" },
  { value: "naming", label: "归属清洗" },
] as const
type Tab = (typeof tabs)[number]["value"]

const identitySourceLabel: Record<string, string> = { internal_test: "内测账号", buc: "公司统一登录", sso: "统一身份" }
const memberHelper = createColumnHelper<GridFeatures, Member>()
function makeMemberColumns(onGrants: (member: Member) => void, onToggle: (member: Member) => void, onResetPassword: (member: Member) => void) {
  return memberHelper.columns([
    dragColumn<Member>(),
    selectionColumn<Member>(),
    memberHelper.accessor("displayName", { header: "成员", enableHiding: false, meta: { label: "成员" }, cell: ({ row }) => (
      <span className="flex items-center gap-1.5">
        <span className={cn("font-medium", !row.original.isActive && "text-muted-foreground line-through")}>{row.original.displayName}</span>
        {/* 初始密码还没改过：这号还在用管理员发的那串密码（契约 v1.9.5 mustChangePassword） */}
        {row.original.mustChangePassword ? <Badge variant="outline" className="text-[10px] text-status-warning">未改初始密码</Badge> : null}
      </span>
    ) }),
    memberHelper.accessor("role", { header: "角色", meta: { label: "角色" }, cell: ({ getValue }) => <TypeChip>{roleLabel[getValue()]}</TypeChip> }),
    memberHelper.accessor("isActive", { header: "状态", meta: { label: "状态" }, cell: ({ getValue }) => getValue() ? <StatusChip tone="success">在职</StatusChip> : <StatusChip tone="muted">已停用</StatusChip> }),
    memberHelper.accessor("provider", { header: "身份源", meta: { label: "身份源" }, cell: ({ getValue }) => <span className="text-xs">{identitySourceLabel[getValue()] ?? getValue()}</span> }),
    memberHelper.accessor("grantsCount", { header: "授权账户", meta: { label: "授权账户", align: "right" }, cell: ({ row }) => <Button variant="link" className="h-auto px-0 tabular-nums" onClick={() => onGrants(row.original)}>{row.original.grantsCount}</Button> }),
    // 列表行的 joinedAt 是 "2026-09-05"，但新建响应回的是完整时间戳；这列只显日期，别把 ISO 原文甩出来
    memberHelper.accessor("joinedAt", { header: "加入", meta: { label: "加入" }, cell: ({ getValue }) => <span className="tabular-nums">{getValue().slice(0, 10)}</span> }),
    memberHelper.accessor((row) => row.lastSeenAt ?? "", { id: "seen", header: "最近活跃", meta: { label: "最近活跃" }, cell: ({ row }) => row.original.lastSeenAt ? <span className="tabular-nums">{fmtTime(row.original.lastSeenAt)}</span> : <MissingValue title="从未登录" /> }),
    actionsColumn<Member>((member) => (
      <>
        <DropdownMenuItem onSelect={() => onGrants(member)}>账户授权</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => toast("改角色", { description: `接口接入后生效（当前为示例）` })}>改角色</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onResetPassword(member)}>重置密码</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant={member.isActive ? "destructive" : "default"} onSelect={() => onToggle(member)}>{member.isActive ? "停用（立刻踢下线，记录保留）" : "恢复"}</DropdownMenuItem>
      </>
    )),
  ])
}

function MembersTab() {
  const [active, setActive] = useState<Record<string, boolean>>({})
  const [grantsFor, setGrantsFor] = useState<Member | null>(null)
  const [adding, setAdding] = useState(false)
  const [resetFor, setResetFor] = useState<Member | null>(null)
  // 新建出来的成员先落在本地：真实模式下列表要等下次拉取才有，别让人以为没建上
  const [addedMembers, setAddedMembers] = useState<Member[]>([])
  const [mustChange, setMustChange] = useState<Record<string, boolean>>({})
  const items = useMemo(() => [...(isOk(membersFixture) ? membersFixture.data.items : []), ...addedMembers]
    .map((item) => ({ ...item, isActive: active[item.identityId] ?? item.isActive, mustChangePassword: mustChange[item.identityId] ?? item.mustChangePassword })), [active, addedMembers, mustChange])
  const columns = useMemo(() => makeMemberColumns(setGrantsFor, (member) => { setActive((prev) => ({ ...prev, [member.identityId]: !member.isActive })); toast(member.isActive ? "已已停用：成员失效并踢下线" : "已恢复", { description: `接口接入后生效（当前为示例）` }) }, setResetFor), [])
  const table = useGridTable({ data: items, columns, pageSize: 20, getRowId: (item) => item.identityId })
  const grantsFixture = grantsFor ? grantsFixtures[grantsFor.identityId] : undefined
  const grants = grantsFixture && isOk(grantsFixture) ? grantsFixture.data.items : null
  return (
    <>
      <DataGrid table={table} empty="没有成员" toolbar={<p className="text-xs text-muted-foreground">停用 = 成员失效并立刻踢下线，记录不删；该成员的长期令牌一并吊销</p>} actions={<Button size="sm" onClick={() => setAdding(true)}><IconPlus />新增成员</Button>} showPagination={false} />
      <AddMemberDialog open={adding} onOpenChange={setAdding} onCreated={(member) => setAddedMembers((prev) => [...prev, member])} />
      <ResetPasswordDialog member={resetFor} onOpenChange={(open) => { if (!open) setResetFor(null) }} onReset={(identityId) => setMustChange((prev) => ({ ...prev, [identityId]: true }))} />
      <Dialog open={grantsFor !== null} onOpenChange={(open) => { if (!open) setGrantsFor(null) }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>账户授权 · {grantsFor?.displayName}</DialogTitle><DialogDescription>admin/grants · read 只看，execute 可执行写操作（仍走变更集确认）</DialogDescription></DialogHeader>
          {grants ? (
            <Table>
              <TableHeader className="bg-muted"><TableRow><TableHead>账户</TableHead><TableHead>级别</TableHead><TableHead>授权于</TableHead><TableHead /></TableRow></TableHeader>
              <TableBody>{grants.map((grant) => <TableRow key={`${grant.media}-${grant.accountId}`}><TableCell>{mediaLabel(grant.media)} · {grant.accountId}</TableCell><TableCell><StatusChip tone={grant.accessLevel === "execute" ? "warning" : "muted"}>{grant.accessLevel === "execute" ? "可执行" : "只读"}</StatusChip></TableCell><TableCell className="tabular-nums">{grant.grantedAt}</TableCell><TableCell className="text-right"><Button size="sm" variant="ghost" onClick={() => toast("已撤销", { description: "接口接入后生效（当前为示例）" })}>撤销</Button></TableCell></TableRow>)}</TableBody>
            </Table>
          ) : <p className="text-sm text-muted-foreground">该成员没有授权样例（示例给了两位成员）；共 {grantsFor?.grantsCount ?? 0} 条。</p>}
          <DialogFooter><Button size="sm" variant="outline" onClick={() => toast("新增授权", { description: "接口接入后生效（当前为示例）" })}><IconPlus />新增授权</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

const etlHelper = createColumnHelper<GridFeatures, EtlRun>()
const etlColumns = etlHelper.columns([
  dragColumn<EtlRun>(),
  selectionColumn<EtlRun>(),
  etlHelper.accessor("jobType", { header: "任务", enableHiding: false, meta: { label: "任务" }, cell: ({ row }) => (
    <span className="flex items-center gap-1.5">
      <TypeChip>{etlJobLabel[row.original.jobType] ?? row.original.jobType}</TypeChip>
      {/* 同一个 job 失败重跑会有多次 attempt；旧 run 没这条记录，显「次数未记录」而不是编个 1 */}
      {row.original.attempt === null ? <span className="text-xs text-muted-foreground">次数未记录</span>
        : row.original.attempt > 1 ? <span className="text-xs tabular-nums text-status-warning">第 {row.original.attempt} 次</span> : null}
    </span>
  ) }),
  etlHelper.accessor("businessDate", { header: "业务日", meta: { label: "业务日" }, cell: ({ getValue }) => <span className="tabular-nums">{getValue()}</span> }),
  etlHelper.accessor("status", { header: "状态", meta: { label: "状态" }, cell: ({ row }) => <StatusChip tone={row.original.status === "done" ? "success" : row.original.status === "failed" ? "critical" : "progress"}>{row.original.status === "done" ? "完成" : row.original.status === "failed" ? `失败${row.original.failedStage ? ` · ${row.original.failedStage}` : ""}` : row.original.status === "running" ? "运行中" : "排队"}</StatusChip> }),
  etlHelper.accessor("startedAt", { header: "开始", meta: { label: "开始" }, cell: ({ getValue }) => <span className="tabular-nums">{fmtTime(getValue())}</span> }),
  etlHelper.accessor((row) => row.finishedAt ?? "", { id: "finished", header: "结束", meta: { label: "结束" }, cell: ({ row }) => row.original.finishedAt ? <span className="tabular-nums">{fmtTime(row.original.finishedAt)}</span> : <MissingValue /> }),
  // raw / canonical 各自可 null（只跑到 raw 阶段就不知道清洗后行数），缺哪个显哪个的缺值，不补 0
  etlHelper.accessor((row) => row.rows?.raw ?? null, { id: "rows", header: "行数 原始 / 清洗后", meta: { label: "行数", align: "right" }, cell: ({ row }) => row.original.rows === null ? <MissingValue /> : (
    <span className="tabular-nums">{row.original.rows.raw ?? <MissingValue />} / {row.original.rows.canonical ?? <MissingValue />}</span>
  ) }),
  etlHelper.accessor((row) => row.warnings.map((warning) => warning.code).join(","), { id: "warnings", header: "警告", meta: { label: "警告" }, cell: ({ row }) => row.original.warnings.length ? <span className="flex flex-wrap gap-1">{row.original.warnings.map((warning) => <Badge key={warning.code} variant="outline" title={warning.message ?? undefined} className="text-[10px] text-status-warning">{warning.code}</Badge>)}</span> : <span className="text-xs text-muted-foreground">−</span> }),
  actionsColumn<EtlRun>((run) => <DropdownMenuItem onSelect={() => { void rerunEtlRun(run.runId) }}><IconRefresh />重跑</DropdownMenuItem>),
])

function EtlTab() {
  // getRowId 原来取 item.id —— 契约里这张表的主键叫 runId，取到的是 undefined，
  // 于是所有行共用同一个 id，勾选一行等于勾选全部。
  const { isMock } = useSession()
  const remote = useEtlRuns(!isMock)
  const fixtureRuns = isOk(etlRunsFixture) ? etlRunsFixture.data.items.map(normalizeEtlRun) : []
  const runs = isMock ? fixtureRuns : remote.status === "ok" ? remote.items : []
  const total = isMock ? (isOk(etlRunsFixture) ? etlRunsFixture.data.total : fixtureRuns.length) : remote.status === "ok" ? remote.total : 0
  const connections = isOk(connectionsFixture) ? connectionsFixture.data.items : []
  const table = useGridTable({ data: runs, columns: etlColumns, pageSize: 20, getRowId: (item) => item.runId })
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 @3xl/main:grid-cols-3">
        {connections.map((item) => <Card key={item.id}><CardHeader><CardTitle className="flex items-center justify-between text-base">{providerLabel[item.provider]}<StatusChip tone={item.health === "ok" ? "success" : "critical"}>{item.health === "ok" ? "健康" : "异常"}</StatusChip></CardTitle><CardDescription>探活 {fmtTime(item.lastCheckedAt)}</CardDescription></CardHeader></Card>)}
        <Card><CardHeader><CardTitle className="flex items-center justify-between text-base">启航（platform）<StatusChip tone="warning">补拉中</StatusChip></CardTitle><CardDescription>2 户补拉中</CardDescription></CardHeader></Card>
        <Card><CardHeader><CardTitle className="flex items-center justify-between text-base">ka-data（团队源）<StatusChip tone="success">D-1</StatusChip></CardTitle><CardDescription>数据日 2026-09-04</CardDescription></CardHeader></Card>
      </div>
      <DataGrid table={table} empty={!isMock && remote.status === "loading" ? "正在读取拉数记录…" : !isMock && remote.status === "error" ? `读取失败：${remote.message}` : "没有拉数记录"} toolbar={<p className="text-xs text-muted-foreground">每天从启航 / KA Data 拉数的记录（按开始时间倒序，共 {total} 次）；显示「凭证失效」= 启航凭证过期，去「设置 · 三凭证」重绑</p>} actions={<Button size="sm" variant="outline" onClick={() => toast("已触发按日补拉", { description: "接口接入后生效（当前为示例）" })}><IconRefresh />按日补拉</Button>} showPagination={false} />
    </div>
  )
}

function CalendarTab() {
  const events = isOk(calendarFixture) ? calendarFixture.data.items : []
  const coefficients = isOk(coefficientsFixture) ? coefficientsFixture.data.items : []
  const policy = isOk(decisionPolicyFixture) ? decisionPolicyFixture.data : null
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState({ date: "", type: "holiday" as CalendarEvent["eventType"], label: "", affects: true })
  return (
    <div className="grid gap-4 @5xl/main:grid-cols-2">
      <Card className="@5xl/main:col-span-2">
        <CardHeader><div className="flex items-center justify-between gap-2"><div><CardTitle>运营日历</CardTitle><CardDescription>影响基线的事件（节假日 / 口径变更 / 大促）→ 阈值档位</CardDescription></div><Button size="sm" onClick={() => setAdding(true)}><IconPlus />加事件</Button></div></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-muted"><TableRow><TableHead>日期</TableHead><TableHead>类型</TableHead><TableHead>说明</TableHead><TableHead>影响基线</TableHead><TableHead>阈值档</TableHead></TableRow></TableHeader>
            <TableBody>{events.map((event) => <TableRow key={event.id}><TableCell className="tabular-nums">{event.eventDate}</TableCell><TableCell><TypeChip>{eventTypeLabel[event.eventType]}</TypeChip></TableCell><TableCell>{event.label}</TableCell><TableCell>{event.affectsBaseline ? <StatusChip tone="warning">是</StatusChip> : <span className="text-muted-foreground">否</span>}</TableCell><TableCell>{event.thresholdProfile ?? <span className="text-muted-foreground">默认</span>}</TableCell></TableRow>)}</TableBody>
          </Table>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>返点系数（全局）</CardTitle><CardDescription>改动在「设置 · 口径」</CardDescription></CardHeader>
        <CardContent className="flex flex-col gap-1 text-sm">{coefficients.map((item) => <p key={item.media} className="flex items-center justify-between"><span>{mediaLabel(item.media)}</span><span className="tabular-nums text-muted-foreground">{coefficientText(item)} · {item.effectiveDate}</span></p>)}</CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>分级决策策略</CardTitle><CardDescription>自动执行的门槛：达不到就不自动做，转人工</CardDescription></CardHeader>
        <CardContent>{policy ? <dl className="grid grid-cols-2 gap-y-1 text-sm"><dt className="text-muted-foreground">最低置信度</dt><dd className="text-right tabular-nums">{(policy.policy.confidenceMin * 100).toFixed(0)}%</dd><dt className="text-muted-foreground">历史成功率下限</dt><dd className="text-right tabular-nums">{(policy.policy.historicalSuccessRateMin * 100).toFixed(0)}%</dd><dt className="text-muted-foreground">近期人工操作窗口</dt><dd className="text-right tabular-nums">{policy.policy.recentManualOpsWindowHours} 小时</dd><dt className="text-muted-foreground">单日自动执行上限</dt><dd className="text-right tabular-nums">¥{policy.policy.dailyCapCny.toLocaleString("zh-CN")}</dd></dl> : null}<p className="mt-2 text-xs text-muted-foreground">{policy ? `${policy.updatedBy.name} · ${fmtTime(policy.updatedAt)}` : ""}</p><Button size="sm" variant="outline" className="mt-3" onClick={() => toast("改策略", { description: "接口接入后生效（当前为示例）" })}>调整</Button></CardContent>
      </Card>
      <Dialog open={adding} onOpenChange={setAdding}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>加日历事件</DialogTitle><DialogDescription>影响基线的事件会让规则在该日切阈值档</DialogDescription></DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1.5"><Label>日期</Label><Input type="date" value={form.date} onChange={(event) => setForm((prev) => ({ ...prev, date: event.target.value }))} /></div>
            <div className="grid gap-1.5"><Label>类型</Label><Select value={form.type} onValueChange={(value) => setForm((prev) => ({ ...prev, type: value as CalendarEvent["eventType"] }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{(Object.keys(eventTypeLabel) as CalendarEvent["eventType"][]).map((key) => <SelectItem key={key} value={key}>{eventTypeLabel[key]}</SelectItem>)}</SelectContent></Select></div>
            <div className="grid gap-1.5"><Label>说明</Label><Input value={form.label} onChange={(event) => setForm((prev) => ({ ...prev, label: event.target.value }))} /></div>
            <div className="flex items-center gap-2"><Switch checked={form.affects} onCheckedChange={(checked) => setForm((prev) => ({ ...prev, affects: checked }))} /><Label>影响基线</Label></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setAdding(false)}>取消</Button><Button disabled={!form.date || !form.label} onClick={() => { toast.success("已加事件"); setAdding(false) }}>保存</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function FlagsTab() {
  const data = isOk(flagsFixture) ? flagsFixture.data : null
  const [flags, setFlags] = useState<Partial<Record<FlagKey, boolean>>>({})
  if (!data) return null
  return (
    <Card>
      <CardHeader><CardTitle>灰度开关</CardTitle><CardDescription>{data.updatedBy.name} {fmtTime(data.updatedAt)} · 写媒体灰度 = 老板一人 true</CardDescription></CardHeader>
      <CardContent className="flex flex-col gap-2">
        {(Object.keys(flagMeta) as FlagKey[]).map((key) => { const on = flags[key] ?? data.flags[key]; return <div key={key} className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5"><div><p className="text-sm font-medium">{flagMeta[key].label} <span className="ml-1 font-mono text-[11px] text-muted-foreground">{key}</span></p><p className="text-xs text-muted-foreground">{flagMeta[key].hint}</p></div><div className="flex items-center gap-2"><StatusChip tone={on ? "success" : "muted"}>{on ? "开" : "关"}</StatusChip><Switch checked={on} onCheckedChange={(checked) => { setFlags((prev) => ({ ...prev, [key]: checked })); toast(`${flagMeta[key].label}已${checked ? "开" : "关"}`, { description: `${checked ? "开启后对全工作区生效" : "关闭后对全工作区生效"}` }) }} aria-label={flagMeta[key].label} /></div></div> })}
      </CardContent>
    </Card>
  )
}

const assetHelper = createColumnHelper<GridFeatures, AssetItem>()
const assetColumns = assetHelper.columns([
  dragColumn<AssetItem>(),
  selectionColumn<AssetItem>(),
  assetHelper.accessor("name", { header: "资产", enableHiding: false, meta: { label: "资产" }, cell: ({ getValue }) => <span className="font-medium">{getValue()}</span> }),
  assetHelper.accessor("assetKind", { header: "类型", meta: { label: "类型" }, cell: ({ getValue }) => <TypeChip>{assetKindLabel[getValue()]}</TypeChip> }),
  assetHelper.accessor("status", { header: "状态", meta: { label: "状态" }, cell: ({ getValue }) => <StatusChip tone={assetStatusMeta[getValue()].tone}>{assetStatusMeta[getValue()].label}</StatusChip> }),
  assetHelper.accessor((row) => row.owner?.name ?? "", { id: "owner", header: "所有者", meta: { label: "所有者" }, cell: ({ getValue }) => getValue() || <span className="text-muted-foreground">官方</span> }),
  assetHelper.accessor("version", { header: "版本", meta: { label: "版本", align: "right" }, cell: ({ getValue }) => <span className="tabular-nums">v{getValue()}</span> }),
  assetHelper.accessor((row) => row.scope ?? "", { id: "scope", header: "范围", meta: { label: "范围" }, cell: ({ getValue }) => getValue() ? mediaLabel(getValue()) : <span className="text-muted-foreground">全局</span> }),
  assetHelper.accessor((row) => row.successRate.value ?? null, { id: "success", header: "成功率", meta: { label: "成功率", align: "right" }, cell: ({ row }) => <span className="tabular-nums">{rv(row.original.successRate)}</span> }),
  assetHelper.accessor("usageCount", { header: "使用", meta: { label: "使用", align: "right" }, cell: ({ getValue }) => <span className="tabular-nums">{getValue()}</span> }),
  assetHelper.accessor((row) => row.dependencies.join(","), { id: "deps", header: "依赖", meta: { label: "依赖" }, cell: ({ row }) => row.original.dependencies.length ? <span className="flex flex-wrap gap-1">{row.original.dependencies.map((dep) => <Badge key={dep} variant="outline" className="font-mono text-[10px]">{dep}</Badge>)}</span> : <span className="text-xs text-muted-foreground">−</span> }),
  actionsColumn<AssetItem>((asset) => (
    <>
      <DropdownMenuItem disabled={asset.status !== "shared"} onSelect={() => toast("已验证", { description: "负责人或管理员确认后记录验证时间" })}>shared → verified</DropdownMenuItem>
      <DropdownMenuItem disabled={asset.status !== "verified"} onSelect={() => toast("已设官方", { description: "转为官方模板（需管理员）" })}>verified → official</DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem variant="destructive" disabled={asset.status === "deprecated"} onSelect={() => toast("弃用需填 superseded_by", { description: "标记为已弃用，并记录替代版本" })}>弃用</DropdownMenuItem>
    </>
  )),
])

function AssetsTab() {
  const items = isOk(assetsFixture) ? assetsFixture.data.items : []
  const table = useGridTable({ data: items, columns: assetColumns, pageSize: 20, getRowId: (item) => item.id })
  return <DataGrid table={table} empty="没有资产" toolbar={<p className="text-xs text-muted-foreground">资产流转：草稿 →（本人）共享 →（负责人 / 管理员）已验证 →（管理员）官方 → 弃用（须填替代版本）；界面起步只露草稿 / 共享</p>} showPagination={false} />
}

function DiagnosticsTab() {
  const data = isOk(reconcileFixture) ? reconcileFixture.data : null
  if (!data) return null
  const sides = [{ key: "kaData", label: "KA Data（权威源）", side: data.kaData }, { key: "platform", label: "启航（对照源）", side: data.platform }]
  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader><CardTitle>对账 reconcile</CardTitle><CardDescription>同账户同日两源并排；差异引擎 {data.comparison.status === "unavailable" ? `未就绪（${data.comparison.reason}）` : "就绪"} · 前端不算差值</CardDescription></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-muted"><TableRow><TableHead>来源</TableHead><TableHead>账户 · 日</TableHead><TableHead className="text-right">账面消耗</TableHead><TableHead className="text-right">现金消耗</TableHead><TableHead className="text-right">曝光</TableHead><TableHead className="text-right">点击</TableHead><TableHead className="text-right">回传转化</TableHead><TableHead className="text-right">真实转化</TableHead><TableHead>数据截至</TableHead></TableRow></TableHeader>
            <TableBody>{sides.flatMap(({ key, label, side }) => side.rows.map((row) => <TableRow key={`${key}-${row.accountId}-${row.ds}`}><TableCell><TypeChip>{label}</TypeChip></TableCell><TableCell>{row.accountId} · {row.ds}</TableCell><TableCell className="text-right tabular-nums">{row.metrics.cost ?? "−"}</TableCell><TableCell className="text-right tabular-nums">{row.metrics.cashCost ?? "−"}</TableCell><TableCell className="text-right tabular-nums">{row.metrics.exposure ?? "−"}</TableCell><TableCell className="text-right tabular-nums">{row.metrics.click ?? "−"}</TableCell><TableCell className="text-right tabular-nums">{row.metrics.conversion ?? "−"}</TableCell><TableCell className="text-right tabular-nums">{row.metrics.realConversion ?? "−"}</TableCell><TableCell className="text-xs tabular-nums">{fmtTime(side.lineage.dataAsOf)}</TableCell></TableRow>))}</TableBody>
          </Table>
          <p className="border-t px-4 py-2 text-xs text-muted-foreground">comparison.status = {data.comparison.status}：差异行由后端对账引擎给（差值 / 阈值 / 结论），前端只并排展示；引擎上线前不显示「差多少」。</p>
        </CardContent>
      </Card>
    </div>
  )
}

export function AdminPage() {
  const { session } = useSession()
  const state = usePageState()
  const [tab, setTab] = usePageTab<Tab>(tabs, "members")
  const isAdmin = session?.activeWorkspace.role === "admin"
  return (
    <PageBody>
      <PageHeader title="治理后台" description="成员与授权 · 连接与拉数 · 口径与日历 · 灰度开关 · 资产流转 · 对账诊断 · 归属清洗（仅管理员）"  />
      {isAdmin ? <PageTabs tabs={tabs} value={tab} onChange={setTab} /> : null}
      <div className="px-4 lg:px-6">
        {!isAdmin ? (
          <NoAccess title="治理后台只对管理员开放" reason="成员、连接、口径日历、灰度开关这些会影响整个工作区，只有管理员能看。切到你是管理员的空间，或找管理员代办。" />
        ) : (
          <StateFrame state={state} unlock="成员授权 / 口径日历 / 灰度开关 / 拉数记录 / 资产 / 对账诊断接口接入后切换为真数据" empty={{ title: "空空如也", description: "先邀请成员。" }}>
            {tab === "members" ? <MembersTab /> : null}
            {tab === "etl" ? <EtlTab /> : null}
            {tab === "calendar" ? <CalendarTab /> : null}
            {tab === "flags" ? <FlagsTab /> : null}
            {tab === "assets" ? <AssetsTab /> : null}
            {tab === "diagnostics" ? <DiagnosticsTab /> : null}
          {tab === "naming" ? <NamingTab /> : null}
          </StateFrame>
        )}
      </div>
    </PageBody>
  )
}
