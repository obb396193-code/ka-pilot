"use client"

import { useState } from "react"
import Link from "next/link"
import { IconBellOff, IconChevronDown, IconExternalLink, IconEye, IconFileDiff } from "@tabler/icons-react"
import { toast } from "sonner"

import { StatusChip, TypeChip } from "@/components/business/data-grid/data-grid"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { fmtTime, isOk, mv, rv, changesetStatusText } from "@/lib/fixtures/contract"
import { changesetFixture, severityMeta, workItemActionsFixture, workItemDetailFixture, type WorkItem, type WorkItemDetail } from "@/lib/fixtures/workbench"
import { cn } from "@/lib/utils"

// 今日队列的四件套卡（原型 P01）：户 / 为什么 / 建议 / 按钮组（查看证据 · 跳后台 · 生成变更集 · 忽略▾ · 静音 3 天）
const causeLabel: Record<string, string> = { bid_too_high: "出价偏高", creative_fatigue: "素材疲劳", budget_cap: "预算受限", low_volume: "量不足" }
const actionLabel: Record<string, string> = { lower_bid: "降价", raise_budget: "提预算", pause: "暂停", replace_creative: "换素材" }

export function WorkItemCard({ item, detail, disabled = false }: { item: WorkItem; detail: WorkItemDetail | null; disabled?: boolean }) {
  const [evidenceOpen, setEvidenceOpen] = useState(false)
  const [changesetOpen, setChangesetOpen] = useState(false)
  const actions = isOk(workItemActionsFixture) ? workItemActionsFixture.data : null
  const severity = severityMeta[item.severity]
  const suggestion = detail?.diagnosis?.suggestions[0] ?? null
  const changeset = isOk(changesetFixture) ? changesetFixture.data : null
  const accountLabel = item.account ? (item.account.accountName ?? item.account.accountId) : "—"

  return (
    <article className={cn("grid gap-3 rounded-xl border bg-card p-4 @3xl/main:grid-cols-12", severity.tone === "critical" && "border-l-2 border-l-status-critical", severity.tone === "warning" && "border-l-2 border-l-status-warning", severity.tone === "success" && "border-l-2 border-l-status-success")}>
      <div className="flex flex-col gap-1 @3xl/main:col-span-3">
        <div className="flex items-center gap-2"><StatusChip tone={severity.tone === "success" ? "success" : severity.tone === "critical" ? "critical" : severity.tone === "warning" ? "warning" : "muted"}>{severity.label}</StatusChip><span className="text-xs text-muted-foreground">{item.type === "diagnosis" ? "诊断" : item.type}</span></div>
        {item.account ? <Link href={`/accounts/${encodeURIComponent(item.account.media)}/${encodeURIComponent(item.account.accountId)}`} className="text-sm font-medium underline-offset-4 hover:underline">{accountLabel}</Link> : <span className="text-sm font-medium">—</span>}
        <div className="text-xs text-muted-foreground">{item.task ? item.task.taskName : "未挂任务"} · {item.assignee ? item.assignee.name : "未指派"}{item.slaDue ? ` · SLA ${fmtTime(item.slaDue)}` : ""}</div>
      </div>
      <div className="flex flex-col gap-1 @3xl/main:col-span-4">
        <div className="text-xs text-muted-foreground">为什么</div>
        <div className="text-sm font-medium">{item.title}</div>
        {detail?.rule ? <div className="text-xs text-muted-foreground">规则 {detail.rule.name} · {detail.rule.version} · 第 {detail.occurrenceCount} 次</div> : null}
        {detail?.evidenceSnapshot ? <div className="flex flex-wrap gap-1.5">{detail.evidenceSnapshot.leaves.map((leaf) => <TypeChip key={leaf.metric} className={cn(leaf.pass && "text-status-critical")}>{leaf.metric} {leaf.operator} {leaf.threshold} · 实际 {leaf.value ?? "−"}</TypeChip>)}</div> : null}
      </div>
      <div className="flex flex-col gap-1 @3xl/main:col-span-3">
        <div className="text-xs text-muted-foreground">建议</div>
        {suggestion ? (
          <>
            <div className="text-sm font-medium">{actionLabel[suggestion.action] ?? suggestion.action} {suggestion.target} {suggestion.delta > 0 ? "+" : ""}{Math.round(suggestion.delta * 100)}%</div>
            <div className="text-xs text-muted-foreground">预期现金 CPA → {rv(suggestion.expected.cashCpa, "money")} · 置信 {Math.round((detail?.diagnosis?.confidence ?? 0) * 100)}%{suggestion.reversible ? " · 可回滚" : ""}</div>
            {detail?.decision ? <Badge variant="outline" className="w-fit text-[10px]">{detail.decision.tier} · {detail.decision.reason}</Badge> : null}
          </>
        ) : <div className="text-xs text-muted-foreground">诊断未返回建议；系统不生成假建议。</div>}
      </div>
      <div className="flex flex-wrap items-start gap-1.5 @3xl/main:col-span-2 @3xl/main:justify-end">
        <Button size="sm" variant="outline" onClick={() => setEvidenceOpen(true)}><IconEye />证据</Button>
        <Button size="sm" variant="outline" disabled={disabled || !changeset} onClick={() => setChangesetOpen(true)}><IconFileDiff />变更集</Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild><Button size="sm" variant="ghost">忽略<IconChevronDown /></Button></DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>原因（3 秒点选）</DropdownMenuLabel>
            {actions?.ignore.reasons.map((reason) => <DropdownMenuItem key={reason} onSelect={() => toast(`已忽略：${reason}`, { description: "接口接入后生效（当前为示例）" })}>{reason}</DropdownMenuItem>)}
            <DropdownMenuSeparator />
            {actions?.ignore.muteDays.map((days) => <DropdownMenuItem key={days} onSelect={() => toast(`已静音 ${days} 天`, { description: "接口接入后生效（当前为示例）" })}><IconBellOff />静音 {days} 天</DropdownMenuItem>)}
          </DropdownMenuContent>
        </DropdownMenu>
        <Tooltip>
          <TooltipTrigger asChild><span className="inline-flex"><Button size="sm" variant="ghost" disabled><IconExternalLink />后台</Button></span></TooltipTrigger>
          <TooltipContent side="bottom">媒体后台深链随账户结构同步开放</TooltipContent>
        </Tooltip>
      </div>

      <Dialog open={evidenceOpen} onOpenChange={setEvidenceOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader><DialogTitle>证据 · {item.title}</DialogTitle><DialogDescription>规则真值表每个叶子带 availability；缺数叶子 → 不触发不消触（12.8）。</DialogDescription></DialogHeader>
          {detail?.evidenceSnapshot ? (
            <div className="flex flex-col gap-4 text-sm">
              <div className="text-xs text-muted-foreground">快照 {fmtTime(detail.evidenceSnapshot.snapshotAt)} · 窗口 {detail.evidenceSnapshot.window.from} ～ {detail.evidenceSnapshot.window.to}</div>
              <div className="overflow-hidden rounded-lg border">
                <Table>
                  <TableHeader className="bg-muted"><TableRow><TableHead>指标</TableHead><TableHead>条件</TableHead><TableHead className="text-right">实际</TableHead><TableHead>可用性</TableHead><TableHead>命中</TableHead></TableRow></TableHeader>
                  <TableBody>{detail.evidenceSnapshot.leaves.map((leaf) => <TableRow key={leaf.metric}><TableCell className="font-mono text-xs">{leaf.metric}</TableCell><TableCell className="tabular-nums">{leaf.operator} {leaf.threshold}</TableCell><TableCell className="text-right tabular-nums">{leaf.value ?? "−"}</TableCell><TableCell><TypeChip>{leaf.availability}</TypeChip></TableCell><TableCell>{leaf.pass ? <StatusChip tone="critical">命中</StatusChip> : <StatusChip tone="muted">未命中</StatusChip>}</TableCell></TableRow>)}</TableBody>
                </Table>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded-lg border p-3"><div className="text-xs font-medium">窗口指标</div><dl className="mt-1 grid grid-cols-2 gap-y-1 text-xs"><dt className="text-muted-foreground">现金消耗</dt><dd className="text-right tabular-nums">{mv(detail.evidenceSnapshot.metrics.cashCost, "money0")}</dd><dt className="text-muted-foreground">真实转化</dt><dd className="text-right tabular-nums">{mv(detail.evidenceSnapshot.metrics.realConversion)}</dd><dt className="text-muted-foreground">现金 CPA</dt><dd className="text-right tabular-nums">{rv(detail.evidenceSnapshot.metrics.ratios.cashCpa, "money")}</dd><dt className="text-muted-foreground">考核价</dt><dd className="text-right tabular-nums">{detail.evidenceSnapshot.assessment.price ? `¥${detail.evidenceSnapshot.assessment.price.value.toFixed(2)}` : "−"}</dd></dl></div>
                <div className="rounded-lg border p-3"><div className="text-xs font-medium">诊断（{detail.diagnosis?.schema}）</div>{detail.diagnosis ? <div className="mt-1 text-xs"><div>{causeLabel[detail.diagnosis.causeCategory] ?? detail.diagnosis.causeCategory} · {detail.diagnosis.subCause}</div><div className="mt-1 text-muted-foreground">{detail.diagnosis.caveats.join("；")}</div></div> : <div className="text-xs text-muted-foreground">无</div>}</div>
              </div>
              {detail.decision ? <div className="rounded-lg bg-muted/50 p-3 text-xs"><span className="font-medium">分级决策 {detail.decision.tier}</span> · 置信 {rv(detail.decision.gates.confidence)} · 历史成功率 {rv(detail.decision.gates.historicalSuccessRate)} · 近 24h 人工操作 {detail.decision.gates.recentManualOps} · {detail.decision.gates.reversible ? "可回滚" : "不可回滚"} · {detail.decision.gates.withinCap ? "在日上限内" : "超日上限"} · {detail.decision.reason}</div> : null}
            </div>
          ) : <p className="text-sm text-muted-foreground">证据快照样例只有一条；其余工作项接口接入后返回。</p>}
        </DialogContent>
      </Dialog>

      <Dialog open={changesetOpen} onOpenChange={setChangesetOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader><DialogTitle>变更集草稿 · {changeset?.title}</DialogTitle><DialogDescription>只到草稿：先 dry-run（试运行）通过才能确认；过了有效期自动作废；确认后由一个执行者逐项做。</DialogDescription></DialogHeader>
          {changeset ? (
            <div className="flex flex-col gap-3 text-sm">
              <div className="flex flex-wrap items-center gap-2"><TypeChip>{changesetStatusText(changeset.status)}</TypeChip><span className="text-xs text-muted-foreground">账户 {changeset.accountId} · 原因码 {changeset.reasonCode} · {fmtTime(changeset.ttlExpireAt)} 前有效</span></div>
              <div className="overflow-hidden rounded-lg border">
                <Table>
                  <TableHeader className="bg-muted"><TableRow><TableHead>目标</TableHead><TableHead>字段</TableHead><TableHead className="text-right">从</TableHead><TableHead className="text-right">到</TableHead><TableHead>状态</TableHead></TableRow></TableHeader>
                  <TableBody>{changeset.items.map((row) => <TableRow key={row.id}><TableCell className="font-mono text-xs">{row.targetType} {row.targetId}</TableCell><TableCell>{row.field}</TableCell><TableCell className="text-right tabular-nums">{String(row.fromValue.value)}</TableCell><TableCell className="text-right tabular-nums">{String(row.toValue.value)}</TableCell><TableCell><TypeChip>{row.itemStatus}</TypeChip></TableCell></TableRow>)}</TableBody>
                </Table>
              </div>
              {changeset.simulation ? <div className="rounded-lg bg-muted/50 p-3 text-xs">What-if：现金 CPA {changeset.simulation.expected.cashCpa.from} → {changeset.simulation.expected.cashCpa.to} · 消耗 {changeset.simulation.expected.cost.from} → {changeset.simulation.expected.cost.to} · 风险 {changeset.simulation.riskLevel} · {changeset.simulation.note}</div> : null}
              <div className="flex justify-end gap-2">
                <Button variant="outline" size="sm" onClick={() => toast("dry-run 通过", { description: `校验指纹 ${changeset.dryRunHash?.slice(0, 8)}` })}>dry-run</Button>
                <Button size="sm" onClick={() => { toast.success("已确认，等待执行", { description: "未开写权限时会被拒绝" }); setChangesetOpen(false) }}>确认</Button>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </article>
  )
}
