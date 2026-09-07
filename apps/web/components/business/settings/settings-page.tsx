"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { IconEye, IconKey, IconLink, IconPencil, IconPlus, IconUnlink } from "@tabler/icons-react"
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
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { DropdownMenuItem } from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"
import { fmtTime, isOk } from "@/lib/fixtures/contract"
import { preferencesFixture } from "@/lib/fixtures/me"
import { themeModes } from "@/lib/theme/theme"
import { useTheme } from "@/components/business/theme/theme-provider"
import { mediaLabel } from "@/components/business/accounts/account-status"
import { subscriptionKindLabel, subscriptionsFixture, type Subscription } from "@/lib/fixtures/reports"
import { coefficientText, coefficientsFixture, credentialHint, credentialsFixture, viewPageLabel, viewsFixture, watchlistFixture, type ChannelCoefficient, type Credential, type SavedView } from "@/lib/fixtures/settings"
import { changeLogFixture, changeLogKindLabel, fmtChangeValue } from "@/lib/fixtures/tasks"
import { cn } from "@/lib/utils"

// 设置（F-007 §10）：tabs 个人资料｜三凭证｜通知偏好｜我的负载｜口径｜个人视图
const tabs = [
  { value: "profile", label: "个人资料" },
  { value: "credentials", label: "三凭证" },
  { value: "notifications", label: "通知偏好" },
  { value: "workload", label: "我的负载" },
  { value: "metrics", label: "口径" },
  { value: "views", label: "个人视图" },
] as const
type Tab = (typeof tabs)[number]["value"]

const roleLabel: Record<string, string> = { optimizer: "优化师", operator: "运营", lead: "负责人", admin: "管理员" }

/** 个人资料：身份来自登录源（只读），界面偏好本地生效、me/preferences 接入后跟人走 */
function ProfileTab() {
  const { session } = useSession()
  const { theme, setMode } = useTheme()
  const prefs = isOk(preferencesFixture) ? preferencesFixture.data : null
  const identityName = session?.identity.displayName ?? "−"
  const active = session?.activeWorkspace ?? null
  return (
    <div className="grid gap-4 @3xl/main:grid-cols-2">
      <Card>
        <CardHeader><CardTitle className="text-base">身份</CardTitle><CardDescription>来自登录源，不在这里改；要改名或换手机号找管理员。</CardDescription></CardHeader>
        <CardContent className="flex flex-col gap-3 text-sm">
          <div className="flex items-center gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-medium">{identityName.slice(0, 1)}</span>
            <div className="min-w-0"><p className="font-medium">{identityName}</p><p className="text-xs text-muted-foreground">当前空间 {active ? active.name : "−"} · {active ? roleLabel[active.role] ?? active.role : "−"}{active?.readOnly ? " · 只读" : ""}</p></div>
          </div>
          <dl className="grid grid-cols-[5rem_1fr] gap-y-1.5">
            <dt className="text-muted-foreground">登录方式</dt><dd>账号密码（内测）</dd>
            <dt className="text-muted-foreground">改密码</dt><dd className="text-muted-foreground">改密接口未开放，先找管理员重置</dd>
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">我的空间</CardTitle><CardDescription>个人空间可写，团队空间只读；切空间在左下角。</CardDescription></CardHeader>
        <CardContent className="flex flex-col gap-2 text-sm">
          {(session?.workspaces ?? []).map((workspace) => (
            <div key={workspace.id} className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2">
              <div className="min-w-0"><p className="truncate font-medium">{workspace.name}</p><p className="text-xs text-muted-foreground">{workspace.kind === "team" ? "团队空间" : "个人空间"} · {roleLabel[workspace.role] ?? workspace.role}</p></div>
              <div className="flex shrink-0 items-center gap-2">{workspace.readOnly ? <StatusChip tone="muted">只读</StatusChip> : <StatusChip tone="success">可写</StatusChip>}{workspace.id === active?.id ? <TypeChip>当前</TypeChip> : null}</div>
            </div>
          ))}
          {(session?.workspaces ?? []).length === 0 ? <p className="text-muted-foreground">还没有空间授权，找管理员开通。</p> : null}
        </CardContent>
      </Card>

      <Card className="@3xl/main:col-span-2">
        <CardHeader><CardTitle className="text-base">界面偏好</CardTitle><CardDescription>先记在本机；账号同步接入后跟人走，换电脑也一样。红绿黄是状态色，不受这里影响。</CardDescription></CardHeader>
        <CardContent className="flex flex-col gap-3 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <span className="w-20 shrink-0 text-muted-foreground">配色</span>
            {themeModes.map((mode) => <Button key={mode.value} size="sm" variant={theme.mode === mode.value ? "default" : "outline"} onClick={() => setMode(mode.value)}>{mode.label}</Button>)}
            <span className="text-xs text-muted-foreground">{themeModes.find((mode) => mode.value === theme.mode)?.hint}</span>
          </div>
          <div className="flex items-center gap-2"><span className="w-20 shrink-0 text-muted-foreground">主色</span><span className="size-5 rounded-full border" style={{ background: theme.hue }} /><span className="font-mono text-xs text-muted-foreground">{theme.hue}</span><span className="text-xs text-muted-foreground">在右上角色盘里换</span></div>
          <div className="flex items-center gap-2"><span className="w-20 shrink-0 text-muted-foreground">语言</span><span>{prefs?.locale === "zh-CN" ? "简体中文" : prefs?.locale ?? "简体中文"}</span><span className="text-xs text-muted-foreground">暂只有中文</span></div>
          <div className="flex items-center gap-2"><span className="w-20 shrink-0 text-muted-foreground">同步状态</span><span className="text-muted-foreground">{prefs ? `示例：上次同步 ${fmtTime(prefs.updatedAt)}` : "接口接入后显示"}</span></div>
        </CardContent>
      </Card>
    </div>
  )
}

function CredentialsTab() {
  const items = isOk(credentialsFixture) ? credentialsFixture.data.items : []
  const [binding, setBinding] = useState<Credential | null>(null)
  const [value, setValue] = useState("")
  return (
    <div className="grid gap-4 @3xl/main:grid-cols-3">
      {items.map((item) => (
        <Card key={item.provider} className={cn(!item.bound && "border-dashed")}>
          <CardHeader><div className="flex items-start justify-between gap-2"><CardTitle className="flex items-center gap-2 text-base"><IconKey className="size-4" />{item.label}</CardTitle>{item.bound ? <StatusChip tone="success">已绑定</StatusChip> : <StatusChip tone="pending">未绑定</StatusChip>}</div><CardDescription>{credentialHint[item.provider]}</CardDescription></CardHeader>
          <CardContent className="text-sm">{item.bound ? <p className="font-mono text-xs">{item.maskedRef} <span className="ml-2 font-sans text-muted-foreground">绑定于 {item.boundAt ? fmtTime(item.boundAt) : "−"}</span></p> : <p className="text-muted-foreground">未绑定：相关能力灰（{item.provider === "qihang" ? "个人空间无数据" : item.provider === "multica" ? "不能执行写操作" : "不能拆片 / AIGC"}）</p>}<p className="mt-2 text-[11px] text-muted-foreground">只显绑定状态，不显值；值只在 PUT 时经过前端，不回显。</p></CardContent>
          <CardFooter className="gap-2">
            <Button size="sm" variant={item.bound ? "outline" : "default"} onClick={() => { setBinding(item); setValue("") }}><IconLink />{item.bound ? "重新绑定" : "绑定"}</Button>
            {item.bound ? <Button size="sm" variant="ghost" onClick={() => toast("已解绑", { description: `接口接入后生效（当前为示例）` })}><IconUnlink />解绑</Button> : null}
          </CardFooter>
        </Card>
      ))}
      <Dialog open={binding !== null} onOpenChange={(open) => { if (!open) setBinding(null) }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>绑定 {binding?.label}</DialogTitle><DialogDescription>凭证在服务端加密存储；保存后只显示脱敏引用，不回显</DialogDescription></DialogHeader>
          <div className="grid gap-1.5"><Label>{binding?.label}</Label><Input type="password" value={value} onChange={(event) => setValue(event.target.value)} autoComplete="off" placeholder="粘贴凭证" /></div>
          <DialogFooter><Button variant="outline" onClick={() => setBinding(null)}>取消</Button><Button disabled={!value} onClick={() => { toast.success("已绑定", { description: "已探活；后续只显示脱敏引用" }); setBinding(null) }}>保存</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

const subHelper = createColumnHelper<GridFeatures, Subscription>()
function makeSubColumns(onToggle: (sub: Subscription, enabled: boolean) => void) {
  return subHelper.columns([
    dragColumn<Subscription>(),
    selectionColumn<Subscription>(),
    subHelper.accessor("kind", { header: "类型", enableHiding: false, meta: { label: "类型" }, cell: ({ getValue }) => <TypeChip>{subscriptionKindLabel[getValue()]}</TypeChip> }),
    subHelper.accessor((row) => row.target, { id: "target", header: "送到", meta: { label: "送到" }, cell: ({ row }) => row.original.target === "dm" ? "钉钉私聊我" : <span>群 <span className="font-mono text-xs text-muted-foreground">{row.original.targetRef}</span></span> }),
    subHelper.accessor((row) => JSON.stringify(row.config), { id: "config", header: "内容", meta: { label: "内容" }, cell: ({ row }) => { const c = row.original.config as Record<string, unknown>; const parts = [Array.isArray(c.severities) ? `只收 ${(c.severities as string[]).join("/")}` : null, c.time ? `每天 ${String(c.time)}` : null, c.role ? `${String(c.role)} 视角` : null, c.cron ? `cron ${String(c.cron)}` : null].filter(Boolean); return parts.length ? <span className="text-xs">{parts.join(" · ")}</span> : <MissingValue /> } }),
    subHelper.accessor((row) => row.quietHours ? `${row.quietHours.from}-${row.quietHours.to}` : "", { id: "quiet", header: "免打扰", meta: { label: "免打扰" }, cell: ({ row }) => row.original.quietHours ? <span className="text-xs tabular-nums">{row.original.quietHours.from} – {row.original.quietHours.to}<span className="ml-1 text-muted-foreground">只压 P1/P2</span></span> : <span className="text-xs text-muted-foreground">无</span> }),
    subHelper.accessor("enabled", { header: "开", meta: { label: "开" }, cell: ({ row }) => <Switch checked={row.original.enabled} onCheckedChange={(checked) => onToggle(row.original, checked)} aria-label="启用" /> }),
    actionsColumn<Subscription>((sub) => <DropdownMenuItem onSelect={() => toast("编辑订阅", { description: `接口接入后生效（当前为示例）` })}>编辑</DropdownMenuItem>),
  ])
}

function NotificationsTab() {
  const [enabled, setEnabled] = useState<Record<number, boolean>>({})
  const [quiet, setQuiet] = useState({ from: "23:00", to: "07:00" })
  const items = useMemo(() => (isOk(subscriptionsFixture) ? subscriptionsFixture.data.items : []).map((item) => ({ ...item, enabled: enabled[item.id] ?? item.enabled })), [enabled])
  const columns = useMemo(() => makeSubColumns((sub, next) => { setEnabled((prev) => ({ ...prev, [sub.id]: next })); toast(`${subscriptionKindLabel[sub.kind]}已${next ? "开" : "关"}`) }), [])
  const table = useGridTable({ data: items, columns, pageSize: 20, getRowId: (item) => String(item.id) })
  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader><CardTitle>免打扰</CardTitle><CardDescription>免打扰 · 只压 P1 / P2，P0 破静默直达</CardDescription></CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3">
          <div className="grid gap-1.5"><Label>从</Label><Input type="time" value={quiet.from} onChange={(event) => setQuiet((prev) => ({ ...prev, from: event.target.value }))} className="w-32" /></div>
          <div className="grid gap-1.5"><Label>到</Label><Input type="time" value={quiet.to} onChange={(event) => setQuiet((prev) => ({ ...prev, to: event.target.value }))} className="w-32" /></div>
          <Button size="sm" onClick={() => toast.success("免打扰已保存", { description: `静默 ${quiet.from}–${quiet.to}；P0 仍会破静默` })}>保存</Button>
        </CardContent>
      </Card>
      <DataGrid table={table} empty="没有订阅" toolbar={<p className="text-xs text-muted-foreground">我收什么、送到哪</p>} actions={<Button size="sm" variant="outline" asChild><Link href="/integrations?tab=subscriptions"><IconPlus />去集成页新建</Link></Button>} showPagination={false} showColumnPicker={false} />
    </div>
  )
}

const coefHelper = createColumnHelper<GridFeatures, ChannelCoefficient>()
function makeCoefColumns(editable: boolean, onEdit: (item: ChannelCoefficient) => void) {
  return coefHelper.columns([
    dragColumn<ChannelCoefficient>(),
    selectionColumn<ChannelCoefficient>(),
    coefHelper.accessor("media", { header: "媒体", enableHiding: false, meta: { label: "媒体" }, cell: ({ getValue }) => <span className="font-medium">{mediaLabel(getValue())}</span> }),
    coefHelper.accessor((row) => coefficientText(row), { id: "formula", header: "返点系数", meta: { label: "返点系数" }, cell: ({ getValue }) => <span className="tabular-nums">{getValue()}</span> }),
    coefHelper.accessor("effectiveDate", { header: "生效", meta: { label: "生效" }, cell: ({ getValue }) => <span className="tabular-nums">{getValue()}</span> }),
    coefHelper.accessor((row) => row.changedBy.name, { id: "by", header: "改动人", meta: { label: "改动人" } }),
    coefHelper.accessor("historyCount", { header: "历史", meta: { label: "历史", align: "right" }, cell: ({ getValue }) => <span className="tabular-nums">{getValue()} 版</span> }),
    coefHelper.accessor((row) => row.evidenceUrl ?? "", { id: "evidence", header: "证据", meta: { label: "证据" }, cell: ({ getValue }) => getValue() ? <a href={getValue()} className="text-xs underline-offset-4 hover:underline">链接</a> : <MissingValue /> }),
    actionsColumn<ChannelCoefficient>((item) => <DropdownMenuItem disabled={!editable} onSelect={() => onEdit(item)}><IconPencil />改系数（新版本）</DropdownMenuItem>),
  ])
}

function MetricsTab() {
  const { session } = useSession()
  const editable = session?.activeWorkspace.kind !== "team"
  const [editing, setEditing] = useState<ChannelCoefficient | null>(null)
  const [form, setForm] = useState({ coefficient: "", effectiveDate: "2026-10-01", evidenceUrl: "", note: "" })
  const items = isOk(coefficientsFixture) ? coefficientsFixture.data.items : []
  const columns = useMemo(() => makeCoefColumns(editable, (item) => { setEditing(item); setForm({ coefficient: String(item.coefficient), effectiveDate: "2026-10-01", evidenceUrl: "", note: "" }) }), [editable])
  const table = useGridTable({ data: items, columns, pageSize: 20, getRowId: (item) => item.media })
  const changeLog = isOk(changeLogFixture) ? changeLogFixture.data.items : []
  return (
    <div className="flex flex-col gap-4">
      <DataGrid table={table} empty="没有系数" toolbar={<p className="text-xs text-muted-foreground">现金消耗口径 = 账面消耗 × / ÷ 返点系数；考核用现金口径 · {editable ? "改一次留一行，回溯改触发重算" : "团队空间只读（POST 403 FORBIDDEN）"}{editable ? "" : ""}</p>} actions={!editable ? <StatusChip tone="muted">团队空间只读</StatusChip> : null} showPagination={false} />
      <Card>
        <CardHeader><CardTitle>统一变更记录</CardTitle><CardDescription>考核价 / 日预算卡 / 返点系数的改动合在一起，按时间倒序</CardDescription></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-muted"><TableRow><TableHead>时间</TableHead><TableHead>类型</TableHead><TableHead>范围</TableHead><TableHead className="text-right">从</TableHead><TableHead className="text-right">到</TableHead><TableHead>生效</TableHead><TableHead>改动人</TableHead></TableRow></TableHeader>
            <TableBody>{changeLog.map((item, index) => <TableRow key={`${item.at}-${index}`}><TableCell className="tabular-nums">{fmtTime(item.at)}</TableCell><TableCell><TypeChip>{changeLogKindLabel[item.kind]}</TypeChip></TableCell><TableCell className="text-xs">{item.scope.taskId ? <Link href={`/tasks/${encodeURIComponent(item.scope.taskId)}`} className="underline-offset-4 hover:underline">任务 {item.scope.taskId}</Link> : item.scope.media ? mediaLabel(item.scope.media) : "−"}</TableCell><TableCell className="text-right tabular-nums">{fmtChangeValue(item.oldValue)}</TableCell><TableCell className="text-right tabular-nums">{fmtChangeValue(item.newValue)}{item.recomputedDays ? <span className="ml-1 text-xs text-muted-foreground">重算 {item.recomputedDays} 日</span> : null}</TableCell><TableCell className="tabular-nums">{item.effectiveDate}</TableCell><TableCell>{item.changedBy.name}</TableCell></TableRow>)}</TableBody>
          </Table>
        </CardContent>
      </Card>
      <Dialog open={editing !== null} onOpenChange={(open) => { if (!open) setEditing(null) }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>改 {editing ? mediaLabel(editing.media) : ""} 返点系数</DialogTitle><DialogDescription>新版本新一行；生效日早于最新生效日 = 回溯改，重算窗口内现金口径</DialogDescription></DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1.5"><Label>系数（{editing?.op === "multiply" ? "×" : "÷"}）</Label><Input type="number" step="0.0001" value={form.coefficient} onChange={(event) => setForm((prev) => ({ ...prev, coefficient: event.target.value }))} /></div>
            <div className="grid gap-1.5"><Label>生效日期</Label><Input type="date" value={form.effectiveDate} onChange={(event) => setForm((prev) => ({ ...prev, effectiveDate: event.target.value }))} /></div>
            <div className="grid gap-1.5"><Label>证据链接（可选）</Label><Input value={form.evidenceUrl} onChange={(event) => setForm((prev) => ({ ...prev, evidenceUrl: event.target.value }))} placeholder="https://" /></div>
            <div className="grid gap-1.5"><Label>备注</Label><Textarea value={form.note} onChange={(event) => setForm((prev) => ({ ...prev, note: event.target.value }))} /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setEditing(null)}>取消</Button><Button disabled={!form.coefficient} onClick={() => { toast.success("已追加新版本", { description: `生效 ${form.effectiveDate}；变更记录已加一行` }); setEditing(null) }}>保存</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

const viewHelper = createColumnHelper<GridFeatures, SavedView>()
const viewColumns = viewHelper.columns([
  dragColumn<SavedView>(),
  selectionColumn<SavedView>(),
  viewHelper.accessor("name", { header: "视图", enableHiding: false, meta: { label: "视图" }, cell: ({ getValue }) => <span className="font-medium">{getValue()}</span> }),
  viewHelper.accessor("page", { header: "页面", meta: { label: "页面" }, cell: ({ getValue }) => <TypeChip>{viewPageLabel[getValue()] ?? getValue()}</TypeChip> }),
  viewHelper.accessor((row) => row.config.columns.join(","), { id: "columns", header: "列", meta: { label: "列" }, cell: ({ row }) => <span className="text-xs text-muted-foreground">{row.original.config.columns.length} 列 · 窗口 {row.original.config.window.preset} · 排序 {row.original.config.sort.map((item) => `${item.by} ${item.dir}`).join(", ")}</span> }),
  viewHelper.accessor("isShared", { header: "共享", meta: { label: "共享" }, cell: ({ getValue }) => getValue() ? <StatusChip tone="progress">已分享</StatusChip> : <StatusChip tone="pending">私有</StatusChip> }),
  viewHelper.accessor("updatedAt", { header: "更新", meta: { label: "更新" }, cell: ({ getValue }) => <span className="tabular-nums">{fmtTime(getValue())}</span> }),
  actionsColumn<SavedView>((view) => (
    <>
      <DropdownMenuItem asChild><Link href="/data?tab=table"><IconEye />打开</Link></DropdownMenuItem>
      <DropdownMenuItem onSelect={() => toast(view.isShared ? "已取消分享" : "已分享到团队", { description: `接口接入后生效（当前为示例）` })}>{view.isShared ? "取消分享" : "分享"}</DropdownMenuItem>
      <DropdownMenuItem variant="destructive" onSelect={() => toast("已删除视图")}>删除</DropdownMenuItem>
    </>
  )),
])

function ViewsTab() {
  const items = isOk(viewsFixture) ? viewsFixture.data.items : []
  const watchlist = isOk(watchlistFixture) ? watchlistFixture.data : null
  const table = useGridTable({ data: items, columns: viewColumns, pageSize: 20, getRowId: (item) => item.id })
  return (
    <div className="flex flex-col gap-4">
      <DataGrid table={table} empty="还没保存视图；在数据分析总表里「另存为视图」" toolbar={<p className="text-xs text-muted-foreground">保存的视图 · Agent 的修改建议可全部或局部接受</p>} showPagination={false} />
      <Card>
        <CardHeader><CardTitle>关注账户</CardTitle><CardDescription>me/watchlist · 工作台「关注」筛选用 · 更新 {watchlist ? fmtTime(watchlist.updatedAt) : "−"}</CardDescription></CardHeader>
        <CardContent className="flex flex-wrap gap-2">{watchlist?.items.map((item) => <Link key={`${item.media}-${item.accountId}`} href={`/accounts/${encodeURIComponent(item.media)}/${encodeURIComponent(item.accountId)}`}><Badge variant="outline" className="gap-1">{mediaLabel(item.media)} · {item.accountId}</Badge></Link>)}</CardContent>
      </Card>
    </div>
  )
}

export function SettingsPage() {
  const { isMock } = useSession()
  const state = usePageState()
  const [tab, setTab] = usePageTab<Tab>(tabs, "profile")
  return (
    <PageBody>
      <PageHeader title="设置" description="个人资料与界面偏好 · 三凭证只显绑定状态 · 通知偏好 · 我的负载 · 口径（返点系数 + 统一变更记录）· 个人视图" isMock={isMock} actions={<StateSwitch />} />
      <PageTabs tabs={tabs} value={tab} onChange={setTab} />
      <div className="px-4 lg:px-6">
        <StateFrame state={state} unlock="me/credentials · subscriptions · channel-coefficients · me/views 接入后切换为真数据" empty={{ title: "没有设置项", description: "先绑定凭证。" }}>
          {tab === "profile" ? <ProfileTab /> : null}
          {tab === "credentials" ? <CredentialsTab /> : null}
          {tab === "notifications" ? <NotificationsTab /> : null}
          {tab === "workload" ? (
            <ExampleBlock unlock="我的负载（4.9，P1）：按负责任务 / 账户数 / 待处理工作项算负载分，接口接入后显示">
              <Card><CardHeader><CardTitle>我的负载</CardTitle><CardDescription>负责任务数 · 账户数 · 待处理 · 值班 · 负载分</CardDescription></CardHeader><CardContent><dl className="grid grid-cols-2 gap-3 text-sm @3xl/main:grid-cols-5">{["负责任务", "负责账户", "待处理", "本周值班", "负载分"].map((label) => <div key={label}><dt className="text-xs text-muted-foreground">{label}</dt><dd className="text-lg font-semibold">−</dd></div>)}</dl></CardContent></Card>
            </ExampleBlock>
          ) : null}
          {tab === "metrics" ? <MetricsTab /> : null}
          {tab === "views" ? <ViewsTab /> : null}
        </StateFrame>
      </div>
    </PageBody>
  )
}
