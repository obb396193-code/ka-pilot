"use client"

import Link from "next/link"
import { IconArrowLeft, IconCheck, IconLock, IconPlayerPlay, IconRefresh, IconX } from "@tabler/icons-react"
import { toast } from "sonner"

import { mediaLabel } from "@/components/business/accounts/account-status"
import { StatusChip, TypeChip } from "@/components/business/data-grid/data-grid"
import { PageBody, PageHeader } from "@/components/business/page-header"
import { StateFrame, usePageState } from "@/components/business/state/page-state"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { executorLabel, runDetailFixture, runStatusMeta, runsFixture, fieldText } from "@/lib/fixtures/automation"
import { fmtTime, isOk, targetTypeLabel } from "@/lib/fixtures/contract"
import { cn } from "@/lib/utils"

// 运行详情（契约 ③ GET /workflows/runs/:id）：阶段条 + 节点日志 + 变更集预览 + 权限 + 账户锁 + 链路 + 审计 + 重试 / 回读策略 + UNKNOWN 说明
const stageTone = { done: "success", running: "progress", pending: "pending", failed: "critical", skipped: "muted" } as const
const stageLabel = { done: "完成", running: "进行中", pending: "待执行", failed: "失败", skipped: "跳过" } as const
const excerpt = (value: unknown) => (value == null ? "−" : typeof value === "string" ? value : JSON.stringify(value))


const backoffLabel: Record<string, string> = { exponential: "指数退避", fixed: "固定间隔", linear: "线性退避" }
const onUnknownLabel: Record<string, string> = { read_back_then_decide: "先回读媒体再决定，不重发", retry: "直接重试", abort: "中止" }

export function RunDetailPage({ runId }: { runId: string }) {
  const state = usePageState()
  const detail = isOk(runDetailFixture) ? runDetailFixture.data : null
  const listItem = isOk(runsFixture) ? runsFixture.data.items.find((item) => item.runId === runId) ?? null : null
  if (!detail) return null
  const isFixtureRun = detail.run.id === runId
  const status = isFixtureRun ? detail.run.status : listItem?.status ?? detail.run.status
  const permissionsOk = detail.permission_checks.every((item) => item.pass)
  const lockConflict = detail.account_locks.some((item) => item.conflict)
  const canConfirm = status === "WAITING_CONFIRMATION" && permissionsOk && !lockConflict
  const blockReason = status !== "WAITING_CONFIRMATION" ? "当前状态不需要确认" : !permissionsOk ? "权限校验未过" : lockConflict ? "账户锁冲突：等另一次运行释放" : ""

  return (
    <PageBody>
      <PageHeader
        title={<span className="flex flex-wrap items-center gap-2">{listItem?.name ?? "新任务开户到基建"}<TypeChip>{detail.run.version}</TypeChip><StatusChip tone={runStatusMeta[status].tone}>{runStatusMeta[status].label}</StatusChip></span>}
        description={<span>发起人 {detail.run.initiator.name} · 执行身份 {executorLabel[detail.run.executor_identity]}{detail.run.taskId ? <> · 任务 <Link href={`/tasks/${encodeURIComponent(detail.run.taskId)}`} className="underline-offset-4 hover:underline">{detail.run.taskId}</Link></> : null} · 运行 …{runId.slice(-6)}{!isFixtureRun ? "（示例只有 …1001 的详情，这里展示该样例）" : ""}</span>}
        actions={
          <>
            
            <Button size="sm" disabled={!canConfirm} title={blockReason} onClick={() => toast.success("已确认执行", { description: "同一份变更集不会重复执行" })}><IconCheck />确认执行</Button>
            <Button size="sm" variant="outline" disabled={status !== "WAITING_CONFIRMATION"} onClick={() => toast("已拒绝", { description: "记录原因；该次运行标记为已驳回" })}><IconX />拒绝</Button>
            <Button size="sm" variant="outline" disabled={status !== "WAITING_CONFIRMATION"} onClick={() => toast("重新生成预览", { description: "草稿过期或数据更新后需重新生成" })}><IconRefresh />重新预览</Button>
            <Button asChild variant="outline" size="sm"><Link href="/automation?tab=runs"><IconArrowLeft />运行中心</Link></Button>
          </>
        }
      />
      <div className="px-4 lg:px-6">
        <StateFrame state={state} unlock="运行详情接口接入后切换为真数据" empty={{ title: "没有这个运行", description: "回运行中心重新选。" }}>
          <div className="flex flex-col gap-4">
            {blockReason && status === "WAITING_CONFIRMATION" ? <div className="rounded-lg border border-status-critical/30 bg-status-critical/10 px-4 py-2.5 text-sm text-status-critical">无法确认执行：{blockReason}</div> : null}
            <Card>
              <CardHeader><CardTitle>阶段</CardTitle><CardDescription>按节点顺序</CardDescription></CardHeader>
              <CardContent>
                <ol className="flex flex-wrap items-center gap-2">{detail.stages.map((stage, index) => <li key={stage.node_id} className="flex items-center gap-2"><div className={cn("flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm", stage.status === "running" && "border-foreground bg-foreground text-background", stage.status === "pending" && "text-muted-foreground", stage.status === "failed" && "border-status-critical text-status-critical")}>{stage.status === "done" ? <IconCheck className="size-3.5" /> : stage.status === "running" ? <IconPlayerPlay className="size-3.5" /> : <span className="size-3.5 rounded-full border" />}{stage.label}<span className="font-mono text-[10px] opacity-60">{stage.node_id}</span></div>{index < detail.stages.length - 1 ? <span className="h-px w-4 bg-border" /> : null}</li>)}</ol>
              </CardContent>
            </Card>
            <div className="grid gap-4 @5xl/main:grid-cols-12">
              <Card className="@5xl/main:col-span-7">
                <CardHeader><CardTitle>节点日志</CardTitle><CardDescription>输入 / 输出摘录（受限，不含凭证）</CardDescription></CardHeader>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader className="bg-muted"><TableRow><TableHead>节点</TableHead><TableHead>状态</TableHead><TableHead>开始</TableHead><TableHead>结束</TableHead><TableHead>输入</TableHead><TableHead>输出</TableHead></TableRow></TableHeader>
                    <TableBody>{detail.stages.map((stage) => <TableRow key={stage.node_id}><TableCell className="font-medium">{stage.label}</TableCell><TableCell><StatusChip tone={stageTone[stage.status]}>{stageLabel[stage.status]}</StatusChip></TableCell><TableCell className="tabular-nums">{stage.started_at ? fmtTime(stage.started_at) : "−"}</TableCell><TableCell className="tabular-nums">{stage.finished_at ? fmtTime(stage.finished_at) : "−"}</TableCell><TableCell className="max-w-40 truncate font-mono text-xs" title={excerpt(stage.input_excerpt)}>{excerpt(stage.input_excerpt)}</TableCell><TableCell className="max-w-40 truncate font-mono text-xs" title={excerpt(stage.output_excerpt)}>{excerpt(stage.output_excerpt)}</TableCell></TableRow>)}</TableBody>
                  </Table>
                </CardContent>
              </Card>
              <div className="flex flex-col gap-4 @5xl/main:col-span-5">
                <Card>
                  <CardHeader><CardTitle>变更集预览</CardTitle><CardDescription>{detail.changeset_preview ? <span className="font-mono">校验指纹 {detail.changeset_preview.hash.slice(0, 12)}… · 到期 {fmtTime(detail.changeset_preview.expires_at)}</span> : "本次运行没有变更集"}</CardDescription></CardHeader>
                  <CardContent className="p-0">
                    {detail.changeset_preview ? (
                      <Table>
                        <TableHeader className="bg-muted"><TableRow><TableHead>对象</TableHead><TableHead>字段</TableHead><TableHead className="text-right">从 → 到</TableHead><TableHead>风险</TableHead></TableRow></TableHeader>
                        <TableBody>{detail.changeset_preview.items.map((item) => <TableRow key={`${item.targetType}-${item.targetId}-${item.field}`}><TableCell><TypeChip>{targetTypeLabel[item.targetType] ?? item.targetType}</TypeChip> {item.targetId}</TableCell><TableCell>{fieldText(item.field)}</TableCell><TableCell className="text-right tabular-nums">{excerpt(item.from.value)} → {excerpt(item.to.value)}</TableCell><TableCell><StatusChip tone={item.riskLevel === "low" ? "success" : item.riskLevel === "medium" ? "warning" : "critical"}>{item.riskLevel === "low" ? "低" : item.riskLevel === "medium" ? "中" : "高"}</StatusChip></TableCell></TableRow>)}</TableBody>
                      </Table>
                    ) : null}
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader><CardTitle>权限校验 · 账户锁</CardTitle></CardHeader>
                  <CardContent className="flex flex-col gap-1.5 text-sm">
                    {detail.permission_checks.map((item) => <div key={item.check} className="flex items-center justify-between"><span>{item.check}</span>{item.pass ? <StatusChip tone="success">通过</StatusChip> : <StatusChip tone="critical">未过</StatusChip>}</div>)}
                    {detail.account_locks.map((lock) => <div key={`${lock.media}-${lock.account_id}`} className="flex items-center justify-between"><span className="flex items-center gap-1.5"><IconLock className="size-3.5 text-muted-foreground" />{mediaLabel(lock.media)} · {lock.account_id}</span>{lock.conflict ? <StatusChip tone="critical">冲突 · …{lock.locked_by?.slice(-4)}</StatusChip> : <StatusChip tone="success">可执行</StatusChip>}</div>)}
                  </CardContent>
                </Card>
              </div>
            </div>
            <div className="grid gap-4 @5xl/main:grid-cols-3">
              <Card>
                <CardHeader><CardTitle>审计</CardTitle></CardHeader>
                <CardContent><ol className="flex flex-col gap-2 text-sm">{detail.audit.map((item, index) => <li key={`${item.at}-${index}`} className="flex flex-col"><span className="font-medium">{item.action} <span className="text-xs font-normal text-muted-foreground">{item.detail}</span></span><span className="text-xs text-muted-foreground tabular-nums">{fmtTime(item.at)} · {item.actor === "system" ? "系统" : item.actor.name}</span></li>)}</ol></CardContent>
              </Card>
              <Card>
                <CardHeader><CardTitle>重试 · 回读策略</CardTitle></CardHeader>
                <CardContent><dl className="grid grid-cols-2 gap-y-1 text-xs"><dt className="text-muted-foreground">最多重试</dt><dd className="text-right tabular-nums">{detail.retry_policy.max}</dd><dt className="text-muted-foreground">退避</dt><dd className="text-right">{backoffLabel[detail.retry_policy.backoff] ?? detail.retry_policy.backoff} · 起步 {detail.retry_policy.base_ms} 毫秒</dd><dt className="text-muted-foreground">结果未知时</dt><dd className="text-right">{onUnknownLabel[detail.reconcile_policy.on_unknown] ?? detail.reconcile_policy.on_unknown}</dd><dt className="text-muted-foreground">回读窗口</dt><dd className="text-right tabular-nums">{detail.reconcile_policy.window_min} 分</dd></dl><p className="mt-3 rounded-lg bg-muted px-3 py-2 text-xs">{detail.unknown_explain}</p></CardContent>
              </Card>
              <Card>
                <CardHeader><CardTitle>链路</CardTitle></CardHeader>
                <CardContent><dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 font-mono text-xs"><dt className="text-muted-foreground">correlation</dt><dd>{detail.trace.correlation_id}</dd><dt className="text-muted-foreground">trace</dt><dd>{detail.trace.trace_id}</dd><dt className="text-muted-foreground">span</dt><dd>{detail.trace.span_id}</dd></dl></CardContent>
              </Card>
            </div>
          </div>
        </StateFrame>
      </div>
    </PageBody>
  )
}
