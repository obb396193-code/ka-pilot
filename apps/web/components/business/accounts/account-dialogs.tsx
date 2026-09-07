"use client"

import { useState } from "react"
import { IconCheck, IconCircleCheckFilled, IconLoader } from "@tabler/icons-react"
import { toast } from "sonner"

import { StatusChip, TypeChip } from "@/components/business/data-grid/data-grid"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"
import { groupPreviewFixture, openFlowFixture, poolStatuses, replicateFixture, replicationCompareFixture, transferFixture, type AccountItem, type PoolStatus } from "@/lib/fixtures/accounts"
import { fmtTime, isOk, mv, rv, changesetStatusText, reasonCodeLabel, riskLevelLabel } from "@/lib/fixtures/contract"
import { cn } from "@/lib/utils"

// 账户池的写动作对话框（全部只到「预览 / 草稿」，执行走 dry-run→confirm 链；mock 期用 fixture 回显）
export type DialogKind = { kind: "batch"; items: AccountItem[]; op: string } | { kind: "open" } | { kind: "transfer"; items: AccountItem[] } | { kind: "poolStatus"; item: AccountItem } | { kind: "product"; item: AccountItem } | { kind: "replicate"; item: AccountItem } | null

const batchOps: Record<string, string> = { budget_up: "提预算 +15%", bid_down: "降价 −5%", pause: "暂停投放", resume: "恢复投放" }

export function AccountDialogs({ dialog, onClose }: { dialog: DialogKind; onClose: () => void }) {
  return (
    <Dialog open={dialog !== null} onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className={cn("sm:max-w-lg", dialog?.kind === "batch" && "sm:max-w-2xl", dialog?.kind === "replicate" && "sm:max-w-3xl")}>
        {dialog?.kind === "batch" ? <BatchPreview items={dialog.items} op={dialog.op} onClose={onClose} /> : null}
        {dialog?.kind === "open" ? <OpenFlow onClose={onClose} /> : null}
        {dialog?.kind === "transfer" ? <Transfer items={dialog.items} onClose={onClose} /> : null}
        {dialog?.kind === "poolStatus" ? <PoolStatusForm item={dialog.item} onClose={onClose} /> : null}
        {dialog?.kind === "product" ? <ProductForm item={dialog.item} onClose={onClose} /> : null}
        {dialog?.kind === "replicate" ? <Replicate item={dialog.item} onClose={onClose} /> : null}
      </DialogContent>
    </Dialog>
  )
}

/** 批量 → 变更集组预览（复用 P13 布局：清单 / 跳过 / 权限校验 / 账户锁）；一次预览一次确认，执行仍逐账户 */
function BatchPreview({ items, op, onClose }: { items: AccountItem[]; op: string; onClose: () => void }) {
  const preview = isOk(groupPreviewFixture) ? groupPreviewFixture.data : null
  const [stage, setStage] = useState<"preview" | "dry-run" | "confirm">("preview")
  if (!preview) return null
  return (
    <>
      <DialogHeader>
        <DialogTitle>变更预览 · {batchOps[op] ?? op}</DialogTitle>
        <DialogDescription>对 {items.length} 户生成变更集组；试运行通过才能确认，执行逐账户，三键不变（当前为示例数据）。</DialogDescription>
      </DialogHeader>
      <div className="flex flex-col gap-4 text-sm">
        <div className="flex flex-wrap items-center gap-2"><Badge variant="outline">{preview.status}</Badge><span className="text-muted-foreground">原因码 {reasonCodeLabel[preview.reasonCode] ?? preview.reasonCode} · 过期 {fmtTime(preview.expiresAt)}</span></div>
        <div className="overflow-hidden rounded-lg border">
          <Table>
            <TableHeader className="bg-muted"><TableRow><TableHead>账户</TableHead><TableHead>变更项</TableHead><TableHead>风险</TableHead><TableHead>状态</TableHead><TableHead>数据截至</TableHead></TableRow></TableHeader>
            <TableBody>
              {preview.changesets.map((row) => <TableRow key={row.changesetId}><TableCell className="font-mono text-xs">{row.accountId}</TableCell><TableCell>{row.items} 项</TableCell><TableCell><StatusChip tone={row.riskLevel === "low" ? "success" : "warning"}>{riskLevelLabel[row.riskLevel] ?? row.riskLevel}</StatusChip></TableCell><TableCell><TypeChip>{changesetStatusText(stage === "preview" ? row.status : stage === "dry-run" ? "dry_run_ok" : "confirmed")}</TypeChip></TableCell><TableCell className="text-xs text-muted-foreground tabular-nums">{fmtTime(row.dataAsOf)}</TableCell></TableRow>)}
              {preview.skipped.map((row) => <TableRow key={row.accountId} className="text-muted-foreground"><TableCell className="font-mono text-xs">{row.accountId}</TableCell><TableCell colSpan={4}>跳过 · {row.reason}</TableCell></TableRow>)}
            </TableBody>
          </Table>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-lg border p-3"><div className="text-xs font-medium">权限校验</div><ul className="mt-1 space-y-1 text-xs">{preview.permissionChecks.map((check) => <li key={check.check} className="flex items-center gap-1.5">{check.pass ? <IconCircleCheckFilled className="size-3.5 fill-green-500" /> : <IconLoader className="size-3.5" />}{check.check}</li>)}</ul></div>
          <div className="rounded-lg border p-3"><div className="text-xs font-medium">账户锁</div><ul className="mt-1 space-y-1 text-xs">{preview.accountLocks.map((lock) => <li key={lock.accountId} className="flex items-center gap-1.5 font-mono">{lock.accountId} · {lock.conflict ? <span className="text-status-critical">冲突 · {lock.lockedBy}</span> : "无冲突"}</li>)}</ul></div>
        </div>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>取消</Button>
        {stage === "preview" ? <Button onClick={() => { setStage("dry-run"); toast("试运行完成", { description: "全部通过" }) }}>试运行</Button> : null}
        {stage === "dry-run" ? <Button onClick={() => { setStage("confirm"); toast.success("已确认，逐账户执行", { description: "未开写权限时会被拒绝" }) }}>确认执行</Button> : null}
        {stage === "confirm" ? <Button onClick={onClose}><IconCheck />完成</Button> : null}
      </DialogFooter>
    </>
  )
}

/** 新建账户向导 = POST /accounts/open-flow（快手无开户 API，只跟踪状态） */
function OpenFlow({ onClose }: { onClose: () => void }) {
  const flow = isOk(openFlowFixture) ? openFlowFixture.data : null
  const [form, setForm] = useState({ media: "KUAISHOU", product: "", task: "" })
  const [submitted, setSubmitted] = useState(false)
  return (
    <>
      <DialogHeader><DialogTitle>新建账户</DialogTitle><DialogDescription>{flow?.note ?? "开户向导"}；写入 pool_status = pending_open，后续步骤在这里跟踪。</DialogDescription></DialogHeader>
      {!submitted ? (
        <div className="grid gap-3">
          <div className="grid gap-1.5"><Label>媒体</Label><Select value={form.media} onValueChange={(value) => setForm((prev) => ({ ...prev, media: value }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="KUAISHOU">快手</SelectItem></SelectContent></Select></div>
          <div className="grid gap-1.5"><Label>产品名</Label><Input value={form.product} onChange={(event) => setForm((prev) => ({ ...prev, product: event.target.value }))} placeholder="如 AAC 拉新包" /></div>
          <div className="grid gap-1.5"><Label>预挂任务（可选）</Label><Input value={form.task} onChange={(event) => setForm((prev) => ({ ...prev, task: event.target.value }))} placeholder="任务 ID" /></div>
          {form.product.trim() === "" ? <p className="text-xs text-status-warning">产品名必填（老板：每个账户有一个产品名）。</p> : null}
        </div>
      ) : (
        <ol className="flex flex-col gap-2">
          {flow?.steps.map((step) => <li key={step.key} className="flex items-center gap-2 text-sm"><StatusChip tone={step.status === "done" ? "success" : step.status === "running" ? "progress" : "pending"}>{step.status === "done" ? "完成" : step.status === "running" ? "进行中" : "待办"}</StatusChip>{step.label}{step.at ? <span className="text-xs text-muted-foreground">{step.at}</span> : null}</li>)}
        </ol>
      )}
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>{submitted ? "关闭" : "取消"}</Button>
        {!submitted ? <Button disabled={form.product.trim() === ""} onClick={() => { setSubmitted(true); toast.success("开户流程已创建", { description: `flowId ${flow?.flowId.slice(-6) ?? ""} · pool_status=pending_open` }) }}>创建</Button> : null}
      </DialogFooter>
    </>
  )
}

/** 交接 = POST /accounts/transfer（工作项 / 派发 / 星标一并转；有 running 变更集 → 409） */
function Transfer({ items, onClose }: { items: AccountItem[]; onClose: () => void }) {
  const [to, setTo] = useState("")
  const [note, setNote] = useState("")
  const result = isOk(transferFixture) ? transferFixture.data : null
  return (
    <>
      <DialogHeader><DialogTitle>转移负责人</DialogTitle><DialogDescription>{items.length} 户 → 目标用户；关联工作项 / 派发单 / 星标一并转移，双方钉钉通知。</DialogDescription></DialogHeader>
      <div className="grid gap-3">
        <div className="flex flex-wrap gap-1.5">{items.map((item) => <TypeChip key={item.accountId}>{item.accountName}</TypeChip>)}</div>
        <div className="grid gap-1.5"><Label>转给</Label><Select value={to} onValueChange={setTo}><SelectTrigger><SelectValue placeholder="选择同空间成员" /></SelectTrigger><SelectContent><SelectItem value="u-b">示例优化师 B</SelectItem><SelectItem value="u-c">示例优化师 C</SelectItem></SelectContent></Select></div>
        <div className="grid gap-1.5"><Label>备注</Label><Textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="交接说明（离职场景由治理后台 transfer-all 打包）" /></div>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>取消</Button>
        <Button disabled={!to} onClick={() => { toast.success(`已转移 ${result?.moved.accounts ?? items.length} 户`, { description: `工作项 ${result?.moved.workItems ?? "−"} · 派发 ${result?.moved.dispatches ?? "−"} · 通知 ${result?.notifiedUserIds.length ?? 0} 人；有 running 变更集的账户会 409 TRANSFER_BLOCKED_BY_CHANGESET` }); onClose() }}>转移</Button>
      </DialogFooter>
    </>
  )
}

/** PATCH /accounts/:media/:id/pool-status（人工覆盖，source=manual；DELETE 回系统推导） */
function PoolStatusForm({ item, onClose }: { item: AccountItem; onClose: () => void }) {
  const [value, setValue] = useState<PoolStatus>(item.poolStatus)
  const [note, setNote] = useState("")
  return (
    <>
      <DialogHeader><DialogTitle>改账户状态 · {item.accountName}</DialogTitle><DialogDescription>当前 {poolStatuses.find((meta) => meta.value === item.poolStatus)?.label}（{item.poolStatusSource === "manual" ? "人工覆盖" : "系统推导"}）；改后写 timeline kind=pool_status。</DialogDescription></DialogHeader>
      <div className="grid gap-3">
        <Select value={value} onValueChange={(next) => setValue(next as PoolStatus)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{poolStatuses.map((meta) => <SelectItem key={meta.value} value={meta.value}>{meta.label} · {meta.hint}</SelectItem>)}</SelectContent></Select>
        <Textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="备注（必填）" />
      </div>
      <DialogFooter>
        {item.poolStatusSource === "manual" ? <Button variant="ghost" onClick={() => { toast("已清除人工覆盖，回系统推导", { description: "接口接入后生效（当前为示例）" }); onClose() }}>清除覆盖</Button> : null}
        <Button variant="outline" onClick={onClose}>取消</Button>
        <Button disabled={!note.trim()} onClick={() => { toast.success("账户状态已改", { description: `PATCH pool-status → ${value}（manual）` }); onClose() }}>保存</Button>
      </DialogFooter>
    </>
  )
}

function ProductForm({ item, onClose }: { item: AccountItem; onClose: () => void }) {
  const [name, setName] = useState(item.product?.name ?? "")
  return (
    <>
      <DialogHeader><DialogTitle>改产品名 · {item.accountName}</DialogTitle><DialogDescription>账户级字段（如 淘宝 / 手淘软件）。</DialogDescription></DialogHeader>
      <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="产品名" />
      <DialogFooter><Button variant="outline" onClick={onClose}>取消</Button><Button disabled={!name.trim()} onClick={() => { toast.success(`产品名已改为「${name.trim()}」`); onClose() }}>保存</Button></DialogFooter>
    </>
  )
}

/** 优质户复制（4.8）：母户 structure → 目标户变更集组；素材不复制；母子 7 日并排 */
function Replicate({ item, onClose }: { item: AccountItem; onClose: () => void }) {
  const plan = isOk(replicateFixture) ? replicateFixture.data : null
  const compare = isOk(replicationCompareFixture) ? replicationCompareFixture.data : null
  const [target, setTarget] = useState("account-3")
  const [started, setStarted] = useState(false)
  return (
    <>
      <DialogHeader><DialogTitle>优质户复制 · 母户 {item.accountName}</DialogTitle><DialogDescription>复制结构 / 出价 / 时段到目标户（目标账户须是「可用 / 已分配 / 待建」），生成变更集组后先试运行再确认；素材不复制，人工选。</DialogDescription></DialogHeader>
      {!started ? (
        <div className="grid gap-3">
          <div className="grid gap-1.5"><Label>目标户</Label><Select value={target} onValueChange={setTarget}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="account-3">闲鱼潜客_快手_03 · 已分配</SelectItem><SelectItem value="account-4">account-4 · 可用</SelectItem></SelectContent></Select></div>
          {plan ? <div className="rounded-lg border p-3 text-sm"><div className="font-medium">方案预览</div><div className="mt-1 text-xs text-muted-foreground">{plan.plan.campaigns} 个 campaign · {plan.plan.units} 个 unit · 字段 {plan.plan.fields.join(" / ")} · {plan.plan.materialsNote}</div></div> : null}
        </div>
      ) : compare ? (
        <div className="flex flex-col gap-2">
          <div className="text-sm font-medium">母子并排（{compare.days} 日 · 样例 {compare.source.trend.length} 日）</div>
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader className="bg-muted"><TableRow><TableHead>日期</TableHead><TableHead className="text-right">母户现金消耗</TableHead><TableHead className="text-right">母户现金 CPA</TableHead><TableHead className="text-right">目标户现金消耗</TableHead><TableHead className="text-right">目标户现金 CPA</TableHead></TableRow></TableHeader>
              <TableBody>
                {compare.source.trend.map((row, index) => { const t = compare.target.trend[index]; return <TableRow key={row.ds}><TableCell className="tabular-nums">{row.ds.slice(5)}</TableCell><TableCell className="text-right tabular-nums">{mv(row.metrics.cashCost, "money0")}</TableCell><TableCell className="text-right tabular-nums">{rv(row.metrics.ratios.cashCpa, "money")}</TableCell><TableCell className="text-right tabular-nums">{t ? mv(t.metrics.cashCost, "money0") : "−"}</TableCell><TableCell className="text-right tabular-nums">{t ? rv(t.metrics.ratios.cashCpa, "money") : "−"}</TableCell></TableRow> })}
              </TableBody>
            </Table>
          </div>
          <p className="text-xs text-muted-foreground">applied 后目标户加 tag replicated_from:{item.media}:{item.accountId} 并进 lifecycle=cold_start。</p>
        </div>
      ) : null}
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>{started ? "关闭" : "取消"}</Button>
        {!started ? <Button onClick={() => { setStarted(true); toast.success("复制方案已生成", { description: `变更集组 ${plan?.changesetGroupId.slice(-6) ?? ""} · 先整组试运行，通过后再确认` }) }}>生成方案并预览</Button> : null}
      </DialogFooter>
    </>
  )
}
