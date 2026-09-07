"use client"

import { useState } from "react"
import { IconCheck, IconX } from "@tabler/icons-react"
import { toast } from "sonner"

import { StatusChip, TypeChip } from "@/components/business/data-grid/data-grid"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { fmtTime, isOk } from "@/lib/fixtures/contract"
import { approvalsFixture, dispatchesFixture, escalationsFixture, type Dispatch } from "@/lib/fixtures/workbench"

// 协作 tab（v1.4 派发 / 提审 / 升级链）：派发 → 回执闭环；「不同意」是合法结局；充值协作不入审批
const dispatchStatus: Record<string, { label: string; tone: "pending" | "progress" | "success" | "critical" | "muted" }> = { sent: { label: "已发", tone: "pending" }, received: { label: "已收到", tone: "progress" }, done: { label: "已回执", tone: "success" }, overdue: { label: "超期", tone: "critical" } }

function DispatchRow({ item, mine, onReceipt }: { item: Dispatch; mine: boolean; onReceipt?: (item: Dispatch) => void }) {
  const status = dispatchStatus[item.status] ?? { label: item.status, tone: "muted" as const }
  return (
    <div className="flex flex-col gap-2 rounded-lg border px-3 py-2.5 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2"><StatusChip tone={status.tone}>{status.label}</StatusChip><span className="font-medium">{item.acceptanceCriteria}</span></div>
        <span className="text-xs text-muted-foreground">{mine ? `→ ${item.to.name}` : `← ${item.from.name}`}{item.slaDue ? ` · SLA ${fmtTime(item.slaDue)}` : ""}</span>
      </div>
      {item.acceptanceRule ? <div className="text-xs text-muted-foreground">验收规则：{item.acceptanceRule.metric} {item.acceptanceRule.operator} {item.acceptanceRule.threshold} · {item.acceptanceRule.windowDays} 日内</div> : null}
      {item.receipt ? <div className="rounded-md bg-muted/50 px-2.5 py-1.5 text-xs"><span className="font-medium">{item.receipt.outcome === "disagreed" ? "不同意" : item.receipt.outcome === "agreed" ? "同意" : "已完成"}</span>{item.receipt.reason ? ` · ${item.receipt.reason}` : ""} · {fmtTime(item.receipt.at)}</div> : null}
      {!mine && !item.receipt && onReceipt ? <div className="flex gap-2"><Button size="sm" onClick={() => toast.success("已回执：同意", { description: "接口接入后生效（当前为示例）" })}><IconCheck />同意</Button><Button size="sm" variant="outline" onClick={() => onReceipt(item)}><IconX />不同意</Button></div> : null}
    </div>
  )
}

export function CollabTab() {
  const dispatches = isOk(dispatchesFixture) ? dispatchesFixture.data : null
  const approvals = isOk(approvalsFixture) ? approvalsFixture.data : null
  const escalations = isOk(escalationsFixture) ? escalationsFixture.data.items : []
  const [dispatchTab, setDispatchTab] = useState<"received" | "sent">("received")
  const [approvalTab, setApprovalTab] = useState<"toApprove" | "mine">("toApprove")
  const [disagree, setDisagree] = useState<Dispatch | null>(null)
  const [reason, setReason] = useState("")

  return (
    <div className="grid gap-4 @5xl/main:grid-cols-12">
      <Card className="@5xl/main:col-span-5">
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            <div><CardTitle>派发</CardTitle><CardDescription>带验收标准的任务派发；回执 = 同意 / 不同意 / 完成</CardDescription></div>
            <Tabs value={dispatchTab} onValueChange={(value) => setDispatchTab(value as typeof dispatchTab)}><TabsList><TabsTrigger value="received">派给我的</TabsTrigger><TabsTrigger value="sent">我派的</TabsTrigger></TabsList></Tabs>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {(dispatchTab === "received" ? dispatches?.received : dispatches?.sent)?.map((item) => <DispatchRow key={item.dispatchId} item={item} mine={dispatchTab === "sent"} onReceipt={setDisagree} />) ?? null}
          {(dispatchTab === "received" ? dispatches?.received : dispatches?.sent)?.length === 0 ? <p className="text-sm text-muted-foreground">暂无</p> : null}
        </CardContent>
      </Card>
      <Card className="@5xl/main:col-span-4">
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            <div><CardTitle>提审</CardTitle><CardDescription>自愿动作；自动通过规则见下</CardDescription></div>
            <Tabs value={approvalTab} onValueChange={(value) => setApprovalTab(value as typeof approvalTab)}><TabsList><TabsTrigger value="toApprove">待我批</TabsTrigger><TabsTrigger value="mine">我提的</TabsTrigger></TabsList></Tabs>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {(approvalTab === "toApprove" ? approvals?.toApprove : approvals?.mine)?.map((item) => (
            <div key={item.approvalId} className="flex flex-col gap-2 rounded-lg border px-3 py-2.5 text-sm">
              <div className="flex items-center justify-between gap-2"><div className="flex items-center gap-2"><TypeChip>{item.kind}</TypeChip><span className="font-medium">{item.title}</span></div><StatusChip tone={item.status === "pending" ? "pending" : item.status === "approved" ? "success" : "muted"}>{item.status}</StatusChip></div>
              <div className="text-xs text-muted-foreground">{approvalTab === "toApprove" ? `申请人 ${item.requester?.name ?? "−"}` : `审批人 ${item.approver?.name ?? "−"}`} · {fmtTime(item.createdAt)}{item.autoPass ? " · 自动通过" : ""}</div>
              {approvalTab === "toApprove" && item.status === "pending" ? <div className="flex gap-2"><Button size="sm" onClick={() => toast.success("已批准", { description: item.changesetId ? `关联变更集 ${item.changesetId.slice(-4)} 进入可执行` : "接口接入后生效（当前为示例）" })}><IconCheck />批准</Button><Button size="sm" variant="outline" onClick={() => toast("已驳回", { description: "接口接入后生效（当前为示例）" })}><IconX />驳回</Button></div> : null}
            </div>
          ))}
          {approvals?.autoPassRules.length ? <div className="rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground">自动通过：{approvals.autoPassRules.map((rule) => `${rule.kind} · ${rule.condition}（近 7 天 ${rule.count7d} 次）`).join("；")}</div> : null}
        </CardContent>
      </Card>
      <Card className="@5xl/main:col-span-3">
        <CardHeader><CardTitle>升级链</CardTitle><CardDescription>P0 未确认 30 分钟 → 备班 → 负责人</CardDescription></CardHeader>
        <CardContent className="flex flex-col gap-3">
          {escalations.map((item) => (
            <div key={item.escalationId} className="flex flex-col gap-1.5">
              <div className="flex items-center gap-2 text-xs text-muted-foreground"><Badge variant="outline" className="font-mono text-[10px]">{item.escalationId.slice(-4)}</Badge>{item.paused ? "已暂停" : "进行中"}</div>
              <ol className="flex flex-col gap-1.5">
                {item.chain.map((step) => <li key={step.level} className="flex items-center gap-2 text-sm"><StatusChip tone={step.status === "acked" ? "success" : step.status === "unacked" ? "critical" : "pending"}>{step.status === "acked" ? "已确认" : step.status === "unacked" ? "未确认" : "待触发"}</StatusChip><span>L{step.level} {step.to.name}</span><span className="ml-auto text-xs text-muted-foreground tabular-nums">{fmtTime(step.at)}</span></li>)}
              </ol>
            </div>
          ))}
          {escalations.length === 0 ? <p className="text-sm text-muted-foreground">没有升级中的告警</p> : null}
        </CardContent>
      </Card>

      <Dialog open={disagree !== null} onOpenChange={(open) => { if (!open) setDisagree(null) }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>不同意 · 回执</DialogTitle><DialogDescription>不同意是合法结局，写明理由即可；派发方会收到通知。</DialogDescription></DialogHeader>
          <Textarea value={reason} onChange={(event) => setReason(event.target.value)} placeholder="理由" />
          <DialogFooter><Button variant="outline" onClick={() => setDisagree(null)}>取消</Button><Button disabled={!reason.trim()} onClick={() => { toast.success("已回执：不同意", { description: reason.trim() }); setDisagree(null); setReason("") }}>提交回执</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
