"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { IconArrowLeft, IconArrowsExchange, IconCopy, IconEye, IconSparkles } from "@tabler/icons-react"
import { toast } from "sonner"

import { openAgentDrawer } from "@/components/business/command/events"
import { StatusChip, TypeChip } from "@/components/business/data-grid/data-grid"
import { PageBody, PageHeader } from "@/components/business/page-header"
import { useSession } from "@/components/business/session/session-provider"
import { StateFrame, StateSwitch, usePageState } from "@/components/business/state/page-state"
import { KpiCards } from "@/components/business/workbench/kpi-cards"
import { SpendRealCpaTrend } from "@/components/charts/spend-real-cpa-trend"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import type { DisplayMetric } from "@/lib/data/contracts"
import { accountsFixture, accountTrendFixtures, cutoffLabel, detailFixtures, lifecycleLabel, overlayFixture, poolStatusMap, structureFixtures, timelineFixtures, type AccountItem, type StructureUnit } from "@/lib/fixtures/accounts"
import { fmtTime, isOk, mv, rv } from "@/lib/fixtures/contract"
import { cn } from "@/lib/utils"
import { AccountDialogs, type DialogKind } from "./account-dialogs"
import { accountStatusTone, mediaLabel } from "./account-status"
import { TimelineList } from "./timeline-list"

// 账户详情（F-007 §2 详情行，契约 v1.5 4.2/4.3）：小传 + 趋势（操作打点）+ 计划层树（垃圾计划批量关停 → 变更集）+ 操作史。
// fixture 只有 account-1 的小传/操作史/结构；其他账户显诚实空态 + TODO-fixture。
const tone = (status: "green" | "yellow" | "red" | null): DisplayMetric["tone"] => status === "green" ? "positive" : status === "yellow" ? "warning" : status === "red" ? "critical" : "neutral"

export function AccountDetailPage({ media, accountId }: { media: string; accountId: string }) {
  const { isMock } = useSession()
  const state = usePageState()
  const listItem = useMemo(() => (isOk(accountsFixture) ? accountsFixture.data.items.find((item) => item.accountId === accountId && item.media === media) ?? null : null), [media, accountId])
  const detailFixture = detailFixtures[accountId]
  const detail = detailFixture && isOk(detailFixture) ? detailFixture.data : null
  const structureFixture = structureFixtures[accountId]
  const structure = structureFixture && isOk(structureFixture) ? structureFixture.data : null
  const timelineFixture = timelineFixtures[accountId]
  const timeline = timelineFixture && isOk(timelineFixture) ? timelineFixture.data.items : []
  const overlay = isOk(overlayFixture) && accountId === "account-1" ? overlayFixture.data.points : []
  const accountTrendFixture = accountTrendFixtures[accountId]
  const trendRows = accountTrendFixture && isOk(accountTrendFixture) ? accountTrendFixture.data.source.rows : []
  const [junkSelected, setJunkSelected] = useState<string[]>([])
  const [dialog, setDialog] = useState<DialogKind>(null)
  const name = detail?.account.accountName ?? listItem?.accountName ?? accountId

  const kpis = useMemo<DisplayMetric[]>(() => {
    const summary = detail?.summary ?? null
    const assessment = summary?.assessment ?? listItem?.assessment ?? null
    const metrics = summary?.metrics ?? listItem?.metrics ?? null
    const cutoff = detail?.cutoff ?? (listItem?.balance ? { hours: listItem.balance.cutoff.hours, at: null, state: listItem.balance.cutoff.state } : null)
    return [
      { key: "cashCost", label: "现金消耗", value: mv(metrics?.cashCost, "money0"), delta: null, tone: "neutral" },
      { key: "cashCpa", label: "现金 CPA", value: rv(metrics?.ratios.cashCpa, "money"), delta: assessment?.price ? `考核 ¥${assessment.price.value.toFixed(2)}` : null, tone: tone(assessment?.costStatus ?? null) },
      { key: "realConversion", label: "真实转化", value: mv(metrics?.realConversion), delta: null, tone: "neutral" },
      { key: "costSpace", label: "成本空间", value: mv(metrics?.costSpace, "money0"), delta: null, tone: "neutral" },
      { key: "balance", label: "余额", value: detail ? mv(detail.balance.balance, "money0") : listItem?.balance?.value != null ? `¥${Math.round(listItem.balance.value).toLocaleString("zh-CN")}` : "−", delta: cutoff ? cutoffLabel[cutoff.state].label : null, tone: cutoff?.state === "critical" ? "critical" : cutoff?.state === "warning" ? "warning" : "neutral" },
      { key: "cutoff", label: "断量倒计时", value: cutoff && cutoff.hours.availability === "available" ? `${mv(cutoff.hours, "num")}h` : "−", delta: cutoff?.at ? `约 ${fmtTime(cutoff.at)}` : null, tone: cutoff?.state === "critical" ? "critical" : cutoff?.state === "warning" ? "warning" : "neutral" },
    ]
  }, [detail, listItem])
  const chartData = useMemo(() => trendRows.map((row) => ({ label: row.ds.slice(5), spend: row.metrics.cost.availability === "available" ? row.metrics.cost.value : null, realCpa: row.metrics.ratios.cashCpa.state === "finite" ? row.metrics.ratios.cashCpa.value : null })), [trendRows])
  const markers = useMemo(() => overlay.map((point) => ({ label: point.label, x: point.at.slice(5, 10) })), [overlay])
  const chip = accountStatusTone(detail?.summary.assessment ?? listItem?.assessment)
  const poolStatus = detail?.account.poolStatus ?? listItem?.poolStatus ?? null
  const lifecycle = detail?.account.lifecycleStage ?? listItem?.lifecycleStage ?? "unknown"
  const asItem: AccountItem | null = listItem

  return (
    <PageBody>
      <PageHeader
        title={<span className="flex flex-wrap items-center gap-2">{name}<StatusChip tone={chip.tone}>{chip.label}</StatusChip>{poolStatus ? <TypeChip className="gap-1.5"><span className={cn("size-1.5 rounded-full", poolStatusMap[poolStatus].dot)} />{poolStatusMap[poolStatus].label}</TypeChip> : null}{lifecycle !== "unknown" ? <TypeChip>{lifecycleLabel[lifecycle]}</TypeChip> : null}</span>}
        description={<span className="font-mono text-xs">{mediaLabel(media)} · {accountId} · {detail?.account.owner?.name ?? listItem?.owner?.displayName ?? "待分配"}{detail?.account.product ? ` · ${detail.account.product.name}` : listItem?.product ? ` · ${listItem.product.name}` : ""}{detail?.bio.openedAt ? ` · 开户 ${detail.bio.openedAt}` : ""}</span>}
        isMock={isMock}
        actions={
          <>
            <StateSwitch />
            <Button variant="outline" size="sm" onClick={() => openAgentDrawer(`分析账户「${name}」的成本、余额与结构`)}><IconSparkles />问 AI</Button>
            {asItem ? <Button variant="outline" size="sm" onClick={() => setDialog({ kind: "replicate", item: asItem })}><IconCopy />优质户复制</Button> : null}
            {asItem ? <Button variant="outline" size="sm" onClick={() => setDialog({ kind: "transfer", items: [asItem] })}><IconArrowsExchange />交接</Button> : null}
            <Button asChild variant="outline" size="sm"><Link href="/accounts"><IconArrowLeft />账户池</Link></Button>
          </>
        }
      />
      <div className="px-4 lg:px-6">
        <StateFrame state={state} unlock="账户小传 / 操作史 / 结构接口接入后切换为真数据" empty={{ title: "没有这个账户", description: "检查媒体与账户 ID，或回账户池重新选。" }}>
          <div className="flex flex-col gap-4">
            <KpiCards metrics={kpis} className="px-0 lg:px-0" />

            <div className="grid gap-4 @5xl/main:grid-cols-12">
              <Card className="@5xl/main:col-span-8">
                <CardHeader>
                  <CardTitle>消耗与现金 CPA · 操作打点</CardTitle>
                  <CardDescription>竖线 = 变更集 / 后台手动 / 考核价 / 日预算卡；趋势为账户级样例</CardDescription>
                </CardHeader>
                <CardContent>
                  {chartData.length ? <SpendRealCpaTrend data={chartData} labels={{ spend: "账面消耗", cpa: "现金 CPA" }} markers={markers} /> : <p className="text-sm text-muted-foreground">后端未返回趋势</p>}
                  {overlay.length ? <ul className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">{overlay.map((point) => <li key={`${point.at}-${point.label}`} className="inline-flex items-center gap-1"><span className="inline-block h-3 w-px bg-foreground" />{point.at.slice(5, 16).replace("T", " ")} {point.label}</li>)}</ul> : null}
                </CardContent>
              </Card>
              <Card className="@5xl/main:col-span-4">
                <CardHeader><CardTitle>小传</CardTitle><CardDescription>资金七项（缺数显 −）· 断量倒计时 = 余额 / 消耗速度</CardDescription></CardHeader>
                <CardContent className="flex flex-col gap-3 text-sm">
                  {detail ? (
                    <>
                      <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
                        {([["余额", detail.balance.balance], ["充值余额", detail.balance.rechargeBalance], ["框返", detail.balance.contractRebate], ["直返", detail.balance.directRebate], ["扩展余额", detail.balance.extendedBalance], ["共享钱包", detail.balance.sharedWallet]] as const).map(([label, value]) => <div key={label} className="contents"><dt className="text-muted-foreground">{label}</dt><dd className="text-right tabular-nums">{mv(value, "money0")}</dd></div>)}
                        <dt className="text-muted-foreground">消耗速度</dt><dd className="text-right tabular-nums">{mv(detail.velocity.costPerHour, "money0")}/h</dd>
                        <dt className="text-muted-foreground">断量</dt><dd className={cn("text-right tabular-nums", cutoffLabel[detail.cutoff.state].tone)}>{detail.cutoff.hours.availability === "available" ? `${mv(detail.cutoff.hours, "num")} h · ${cutoffLabel[detail.cutoff.state].label}` : cutoffLabel[detail.cutoff.state].label}</dd>
                      </dl>
                      <div className="text-xs text-muted-foreground">资金截至 {fmtTime(detail.balance.asOf)} · 开户 {detail.bio.openedBy?.name ?? "−"} · 认领 {fmtTime(detail.account.claimedAt)}</div>
                      <div className="flex flex-col gap-1">
                        <div className="text-xs font-medium">挂载任务</div>
                        {detail.bio.tasks.map((task) => <Link key={task.taskId} href={`/tasks/${encodeURIComponent(task.taskId)}`} className="flex items-center justify-between rounded-lg border px-3 py-1.5 text-xs hover:bg-muted/50"><span>{task.taskName}{task.current ? <Badge variant="outline" className="ml-2 text-[10px]">当前</Badge> : null}</span><span className="text-muted-foreground tabular-nums">{task.validFrom.slice(5)} – {task.validTo?.slice(5) ?? "至今"}</span></Link>)}
                      </div>
                      <div className="flex flex-wrap gap-1.5">{detail.account.tags.map((tag) => <TypeChip key={tag}>{tag}</TypeChip>)}{detail.account.starred ? <TypeChip>★ 星标</TypeChip> : null}</div>
                    </>
                  ) : <p className="text-xs text-muted-foreground">该账户没有小传样例（样例只有 account-1 / 2 / 5）；余额 / 断量取自列表项。</p>}
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div><CardTitle>计划层</CardTitle><CardDescription>计划 → 单元（消耗 / 转化 / 出价 / 时段）· 垃圾计划标记 · 勾选批量关停 → 变更集{structure ? ` · 同步 ${fmtTime(structure.syncedAt)}` : ""}</CardDescription></div>
                  <Button size="sm" variant="outline" disabled={junkSelected.length === 0} onClick={() => { if (asItem) setDialog({ kind: "batch", items: [asItem], op: "pause" }); else toast("生成关停变更集", { description: `${junkSelected.length} 个单元` }) }}><IconEye />关停 {junkSelected.length || ""} 个单元 → 变更集</Button>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {structure ? (
                  <Table>
                    <TableHeader className="bg-muted"><TableRow><TableHead className="w-10" /><TableHead>计划 / 单元</TableHead><TableHead>状态</TableHead><TableHead className="text-right">出价</TableHead><TableHead className="text-right">CPA 出价</TableHead><TableHead className="text-right">日预算</TableHead><TableHead className="text-right">消耗</TableHead><TableHead className="text-right">真实转化</TableHead><TableHead className="text-right">现金 CPA</TableHead><TableHead>标记</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {structure.campaigns.map((campaign) => (
                        <CampaignRows key={campaign.campaignId} campaign={campaign} selected={junkSelected} onToggle={(unit) => setJunkSelected((prev) => prev.includes(unit.unitId) ? prev.filter((id) => id !== unit.unitId) : [...prev, unit.unitId])} />
                      ))}
                    </TableBody>
                  </Table>
                ) : <p className="px-4 py-6 text-sm text-muted-foreground">该账户没有结构样例（示例只有 account-1 / 2）；结构同步联调后自动出现。</p>}
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>操作史</CardTitle><CardDescription>变更集 / 后台手动（带外变更）/ 考核价 / 日预算卡 / 派发 / 交接 … 倒序；T+1 回收挂在项下</CardDescription></CardHeader>
              <CardContent>{timeline.length ? <TimelineList items={timeline} /> : <p className="text-sm text-muted-foreground">该账户没有操作史样例（示例只有 account-1 / 2）。</p>}</CardContent>
            </Card>
          </div>
        </StateFrame>
      </div>
      <AccountDialogs dialog={dialog} onClose={() => setDialog(null)} />
    </PageBody>
  )
}

const unitStatusLabel: Record<string, string> = { active: "投放中", paused: "暂停", deleted: "已删除", pending: "待审核" }

function CampaignRows({ campaign, selected, onToggle }: { campaign: { campaignId: string; name: string; status: string; dayBudget: { value: number | null; availability: string }; units: StructureUnit[] }; selected: string[]; onToggle: (unit: StructureUnit) => void }) {
  return (
    <>
      <TableRow className="bg-muted/30 hover:bg-muted/30">
        <TableCell />
        <TableCell className="font-medium">{campaign.name}<span className="ml-2 font-mono text-[11px] text-muted-foreground">{campaign.campaignId}</span></TableCell>
        <TableCell><TypeChip>{unitStatusLabel[campaign.status] ?? campaign.status}</TypeChip></TableCell>
        <TableCell /><TableCell />
        <TableCell className="text-right tabular-nums">{mv(campaign.dayBudget as never, "money0")}</TableCell>
        <TableCell colSpan={4} />
      </TableRow>
      {campaign.units.map((unit) => (
        <TableRow key={unit.unitId} className={cn(unit.junk && "bg-status-critical/5")}>
          <TableCell><Checkbox checked={selected.includes(unit.unitId)} onCheckedChange={() => onToggle(unit)} aria-label="选择单元" /></TableCell>
          <TableCell className="pl-8">{unit.name}<span className="ml-2 font-mono text-[11px] text-muted-foreground">{unit.unitId}</span></TableCell>
          <TableCell><TypeChip>{unitStatusLabel[unit.status] ?? unit.status}</TypeChip></TableCell>
          <TableCell className="text-right tabular-nums">{mv(unit.bid, "money")}</TableCell>
          <TableCell className="text-right tabular-nums">{mv(unit.cpaBid, "money")}</TableCell>
          <TableCell className="text-right tabular-nums">{mv(unit.dayBudget, "money0")}</TableCell>
          <TableCell className="text-right tabular-nums">{mv(unit.metrics.cost, "money0")}</TableCell>
          <TableCell className="text-right tabular-nums">{mv(unit.metrics.realConversion)}</TableCell>
          <TableCell className="text-right tabular-nums">{rv(unit.metrics.ratios.cashCpa, "money")}</TableCell>
          <TableCell>{unit.junk ? <StatusChip tone="critical">垃圾计划</StatusChip> : null}</TableCell>
        </TableRow>
      ))}
    </>
  )
}
