"use client"

import { useMemo, useState } from "react"
import { IconExternalLink, IconHistory } from "@tabler/icons-react"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { addAssessmentPrice, revokeAssessmentPrice } from "@/lib/data/use-me-actions"
import { changeLogFixture, fmtChangeValue, type ChangeLogItem } from "@/lib/fixtures/tasks"
import { isOk } from "@/lib/fixtures/contract"

/**
 * 考核价历史弹层（契约 v1.9.28）。**任务管理视图和任务详情共用这一个组件**——
 * 两处各写一份的话，「只增不改」「作废怎么算」这类规则迟早会在一处被写歪。
 *
 * 口径：分段只增不改。取值 = `effective_date ≤ D` 的最近一条**未作废**段。
 * 所以作废行照样列出来（划掉 + 标「已作废」），不是删掉——历史要能复盘当时为什么算成那个数。
 */

const REVOKED_HINT = "这一段已作废：取值时跳过它，落到上一段"

function isRevoked(item: ChangeLogItem): boolean {
  // 后端用 newValue=null 表示这条是作废行（v1.9.28 的 `op:"revoke"`）
  return item.newValue === null
}

export function AssessmentPriceHistory({ taskId, taskName, current }: {
  taskId: string
  taskName: string
  current?: { value: number; effectiveDate: string } | null
}) {
  const [open, setOpen] = useState(false)
  const [price, setPrice] = useState("")
  const [effectiveDate, setEffectiveDate] = useState("")
  const [evidence, setEvidence] = useState("")
  const [busy, setBusy] = useState(false)

  const segments = useMemo(() => {
    const items = isOk(changeLogFixture) ? changeLogFixture.data.items : []
    return items
      .filter((item) => item.kind === "assessment_price" && item.scope.taskId === taskId)
      .sort((left, right) => right.effectiveDate.localeCompare(left.effectiveDate))
  }, [taskId])

  const submit = async () => {
    const value = Number(price)
    if (!Number.isFinite(value) || value <= 0 || !effectiveDate) return
    setBusy(true)
    const ok = await addAssessmentPrice(taskId, value, effectiveDate, evidence)
    setBusy(false)
    if (ok) { setPrice(""); setEvidence("") }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="h-6 px-1.5 text-xs font-normal text-muted-foreground">
          <IconHistory className="size-3" />历史
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>考核价历史 · {taskName}</DialogTitle>
          <DialogDescription>
            分段只增不改。某天算成多少，看的是<b className="font-medium text-foreground">生效日不晚于那天、且没被作废</b>的最近一段。
            {current ? <>当前生效：¥{current.value.toFixed(2)}（{current.effectiveDate} 起）。</> : null}
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-72 overflow-y-auto">
          <Table>
            <TableHeader className="bg-muted">
              <TableRow>
                <TableHead>生效日</TableHead>
                <TableHead className="text-right">值</TableHead>
                <TableHead>改的人</TableHead>
                <TableHead>证据</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {segments.length === 0 ? (
                <TableRow><TableCell colSpan={5} className="text-center text-sm text-muted-foreground">
                  {/* ★有当前生效价却列不出分段，是自相矛盾的——只能是记录没取到，不能说成「还没有分段」。
                      变更记录目前只有 fixture，`GET /settings/change-log` 的 BFF 还没接（已报 arch）。 */}
                  {current
                    ? <>没取到这个任务的变更记录。当前确实有一段在生效（¥{current.value.toFixed(2)}，{current.effectiveDate} 起），所以记录是缺的不是没有。</>
                    : "这个任务还没有考核价分段"}
                </TableCell></TableRow>
              ) : segments.map((item, index) => {
                const revoked = isRevoked(item)
                return (
                  <TableRow key={`${item.effectiveDate}|${item.at}|${index}`} className={revoked ? "text-muted-foreground" : undefined}>
                    <TableCell className="tabular-nums">{item.effectiveDate}</TableCell>
                    <TableCell className={`text-right tabular-nums ${revoked ? "line-through" : ""}`}>
                      {fmtChangeValue(revoked ? item.oldValue : item.newValue)}
                    </TableCell>
                    <TableCell>{item.changedBy.name}</TableCell>
                    <TableCell>
                      {item.evidenceUrl
                        ? <a href={item.evidenceUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs underline underline-offset-4">凭证<IconExternalLink className="size-3" /></a>
                        : <span className="text-xs">未附凭证</span>}
                    </TableCell>
                    <TableCell className="text-right">
                      {revoked
                        ? <span className="text-xs" title={REVOKED_HINT}>已作废</span>
                        : (
                          <Button
                            variant="ghost" size="sm" disabled={busy}
                            className="h-6 px-1.5 text-xs font-normal text-status-critical"
                            onClick={async () => { setBusy(true); await revokeAssessmentPrice(taskId, item.effectiveDate); setBusy(false) }}
                          >作废</Button>
                        )}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>

        <div className="grid gap-2 border-t pt-3 @lg/main:grid-cols-[8rem_10rem_1fr]">
          <div className="flex flex-col gap-1">
            <Label htmlFor={`price-${taskId}`} className="text-xs">新一段的值</Label>
            <Input id={`price-${taskId}`} inputMode="decimal" value={price} onChange={(event) => setPrice(event.target.value)} placeholder="42.00" />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor={`from-${taskId}`} className="text-xs">生效日</Label>
            <Input id={`from-${taskId}`} type="date" value={effectiveDate} onChange={(event) => setEffectiveDate(event.target.value)} />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor={`evidence-${taskId}`} className="text-xs">证据链接（审计要看，尽量填）</Label>
            <Input id={`evidence-${taskId}`} value={evidence} onChange={(event) => setEvidence(event.target.value)} placeholder="审批单 / 邮件链接" />
          </div>
        </div>

        <DialogFooter>
          <p className="mr-auto text-xs text-muted-foreground">新增一段会让生效日之后的派生指标跟着变，后端会告诉你影响多少天。</p>
          <Button size="sm" disabled={busy || !price || !effectiveDate} onClick={submit}>加这一段</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
