"use client"

import { useMemo, useState } from "react"
import { IconChevronDown, IconPlus, IconTrash, IconX } from "@tabler/icons-react"

import { AssessmentPriceHistory } from "./assessment-price-history"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { saveTaskBatch, type BatchSaveFailure } from "@/lib/data/use-me-actions"
import { groupByBiz, sortForManage, taskManageRows, type TaskManageRow } from "@/lib/fixtures/task-manage"
import { cn } from "@/lib/utils"

/**
 * F8-23 投放任务 ·「任务管理」视图（契约 v1.9.28）。
 * 内容布局参照同事工作台 v7 的任务管理（**只借布局，不借样式**——老板 2026-09-10）。
 *
 * 一张卡 = 一个业务大类，**整卡一起存**（`POST /tasks/batch-save` 的语义就是按大类整体保存、
 * 全部成功才写）。所以「保存」也在卡头上，不做逐行保存——逐行保存会让人以为
 * 每行独立成功/失败，和后端的全有全无对不上。
 *
 * 改动全在本地 draft 里，点保存才发。没改过的卡保存按钮是灰的——
 * 免得有人为了「确认一下」去点保存，白白触发一次全量写。
 */

const MAX_ROWS_COLLAPSED = 8

type Draft = Pick<TaskManageRow, "taskName" | "status" | "aliases" | "monitorUrl" | "productName">
type Drafts = Record<string, Draft>

function toDraft(row: TaskManageRow): Draft {
  return { taskName: row.taskName, status: row.status, aliases: row.aliases, monitorUrl: row.monitorUrl, productName: row.productName }
}

function sameDraft(left: Draft, right: Draft): boolean {
  return left.taskName === right.taskName && left.status === right.status
    && left.monitorUrl === right.monitorUrl && left.productName === right.productName
    && left.aliases.length === right.aliases.length && left.aliases.every((alias, index) => alias === right.aliases[index])
}

/** 在投 ↔ 停投。`preparing`/`ended` 不在这个开关的语义里，点一下先落到在投。 */
function nextStatus(status: TaskManageRow["status"]): TaskManageRow["status"] {
  return status === "active" ? "paused" : "active"
}

const STATUS_LABEL: Record<TaskManageRow["status"], string> = { active: "在投", paused: "停投", preparing: "准备中", ended: "已结束" }

function AliasChips({ aliases, onChange }: { aliases: string[]; onChange: (next: string[]) => void }) {
  const [text, setText] = useState("")
  const add = () => {
    const value = text.trim()
    // 空的不加、重复的不加：别名是用来在账户昵称里做**最长命中**匹配的，
    // 重复项不会多匹配到任何东西，只会让这一列越来越长。
    if (!value || aliases.includes(value)) { setText(""); return }
    onChange([...aliases, value])
    setText("")
  }
  return (
    <div className="flex min-w-48 flex-wrap items-center gap-1">
      {aliases.map((alias) => (
        <Badge key={alias} variant="secondary" className="gap-0.5 pr-0.5 font-normal">
          {alias}
          <button type="button" aria-label={`删除别名 ${alias}`} className="rounded-sm p-0.5 hover:bg-foreground/10" onClick={() => onChange(aliases.filter((item) => item !== alias))}>
            <IconX className="size-3" />
          </button>
        </Badge>
      ))}
      <Input
        value={text}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); add() } }}
        onBlur={add}
        placeholder="回车添加"
        aria-label="添加别名"
        className="h-6 w-24 border-dashed px-1.5 text-xs shadow-none"
      />
    </div>
  )
}

function BizCard({ biz, rows }: { biz: string; rows: TaskManageRow[] }) {
  const original = useMemo(() => Object.fromEntries(rows.map((row) => [row.taskId, toDraft(row)])) as Drafts, [rows])
  const [drafts, setDrafts] = useState<Drafts>(original)
  // 「已存到后端的那一版」。保存成功后要把它推进到当前草稿，否则卡头会一直挂着
  // 「有未保存的改动」，保存按钮也一直亮着——人会以为没存上，再点一次。
  const [baseline, setBaseline] = useState<Drafts>(original)
  // 行删除只标记，等保存时一起提交——误点一下就掉一行、还没法撤销，太脆
  const [removed, setRemoved] = useState<Set<string>>(new Set())
  const [expanded, setExpanded] = useState(false)
  const [failed, setFailed] = useState<BatchSaveFailure[]>([])
  const [saving, setSaving] = useState(false)
  const [confirmEnd, setConfirmEnd] = useState(false)

  const dirty = rows.some((row) => removed.has(row.taskId) || !sameDraft(drafts[row.taskId], baseline[row.taskId]))
  // 排序**只按服务端那一版算一次**：把 drafts 放进依赖的话，
  // 把一行从「在投」点成「停投」，这行会当场沉到底、从光标下跑掉——正在改的东西不该自己跳走。
  // 顺序等下次拉数再更新。
  const order = useMemo(() => sortForManage(rows).map((row) => row.taskId), [rows])
  const byId = useMemo(() => new Map(rows.map((row) => [row.taskId, row])), [rows])
  const ordered = order.map((taskId) => ({ ...byId.get(taskId)!, ...drafts[taskId] }))
  const visible = expanded ? ordered : ordered.slice(0, MAX_ROWS_COLLAPSED)
  const failedIds = new Set(failed.map((item) => item.taskId ?? item.task_id))

  const patch = (taskId: string, next: Partial<Draft>) => setDrafts((prev) => ({ ...prev, [taskId]: { ...prev[taskId], ...next } }))

  const save = async () => {
    setSaving(true)
    // **只发改过的行**。契约是「一个大类整体保存」，但没要求把没动过的也一起发——
    // 全发出去意味着别人这会儿改的同一批任务会被我手上这份旧值盖掉（丢更新）。
    // 改了几条发几条，原子性只覆盖我真的动过的那部分。
    const items = rows.filter((row) => removed.has(row.taskId) || !sameDraft(drafts[row.taskId], baseline[row.taskId])).map((row) => ({
      task_id: row.taskId,
      ...(removed.has(row.taskId)
        // 「删除」在契约里没有硬删——落成 ended（任务期结束），历史数据还查得到
        ? { status: "ended" as const }
        : {
          task_name: drafts[row.taskId].taskName,
          status: drafts[row.taskId].status,
          aliases: drafts[row.taskId].aliases,
          monitor_url: drafts[row.taskId].monitorUrl,
          product_name: drafts[row.taskId].productName,
        }),
    }))
    const result = await saveTaskBatch(items)
    setFailed(result.failed)
    if (result.ok) {
      // 标了删除的那几行落成「已结束」——本地也要跟上，它们会自己沉到底部。
      // （接真接口后这里该改成重新拉一次列表，`taskManageRows` 目前是静态 fixture。）
      const next = Object.fromEntries(Object.entries(drafts).map(([taskId, draft]) =>
        [taskId, removed.has(taskId) ? { ...draft, status: "ended" as const } : draft])) as Drafts
      setDrafts(next)
      setBaseline(next)
      setRemoved(new Set())
    }
    setSaving(false)
  }

  const endBiz = async () => {
    setSaving(true)
    const result = await saveTaskBatch(rows.map((row) => ({ task_id: row.taskId, status: "ended" as const })))
    setFailed(result.failed)
    if (result.ok) {
      const next = Object.fromEntries(Object.entries(drafts).map(([taskId, draft]) => [taskId, { ...draft, status: "ended" as const }])) as Drafts
      setDrafts(next)
      setBaseline(next)
      setRemoved(new Set())
    }
    setSaving(false)
  }

  return (
    <Card>
      {/* CardHeader 默认是 grid：不写 `flex` 只写 `flex-row` 改不掉 display，三个元素会各占一行 */}
      <CardHeader className="flex flex-row flex-wrap items-center gap-2 space-y-0">
        <CardTitle className="text-base">{biz}</CardTitle>
        <Badge variant="secondary" className="font-normal">{rows.length}</Badge>
        {dirty ? <span className="text-xs text-status-warning">有未保存的改动</span> : null}
        <div className="ml-auto flex items-center gap-2">
          <Button size="sm" variant={dirty ? "default" : "outline"} disabled={!dirty || saving} onClick={save}>保存</Button>
          <Dialog open={confirmEnd} onOpenChange={setConfirmEnd}>
            <DialogTrigger asChild>
              <Button size="sm" variant="ghost" className="border border-status-critical/40 text-status-critical hover:bg-status-critical/10 hover:text-status-critical">
                <IconTrash className="size-3.5" />删除大类
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>把「{biz}」下的 {rows.length} 个任务全部结束？</DialogTitle>
                <DialogDescription>
                  任务不会被真的删掉，而是状态置为「已结束」——历史数据还查得到，报表也不会缺一块。
                  但这 {rows.length} 个任务会从在投名单里消失；正在投的先确认停投影响再动。
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button variant="outline" size="sm" onClick={() => setConfirmEnd(false)}>再想想</Button>
                <Button size="sm" disabled={saving} onClick={async () => { await endBiz(); setConfirmEnd(false) }}>全部置为已结束</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        {failed.length ? (
          <p className="mb-2 rounded-md border border-status-critical/40 bg-status-critical/5 px-3 py-2 text-xs text-status-critical">
            这一组<b>一条也没保存</b>（后端是全部成功才写）。{failed.length} 条不合要求，已在下面标出来，改完再存一次。
          </p>
        ) : null}
        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-muted">
              <TableRow>
                <TableHead className="min-w-44">任务</TableHead>
                <TableHead className="min-w-48">别名</TableHead>
                <TableHead className="text-right">考核价</TableHead>
                <TableHead className="min-w-40">监测链接</TableHead>
                <TableHead className="min-w-28">产品名</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map((row) => {
                const draft = drafts[row.taskId]
                const gone = removed.has(row.taskId)
                return (
                  <TableRow key={row.taskId} className={cn(gone && "opacity-50", failedIds.has(row.taskId) && "bg-status-critical/5")}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Input
                          value={draft.taskName}
                          onChange={(event) => patch(row.taskId, { taskName: event.target.value })}
                          aria-label={`任务名 ${row.taskName}`}
                          disabled={gone}
                          className="h-7 border-transparent px-1.5 shadow-none hover:border-input focus-visible:border-input"
                        />
                        <button
                          type="button"
                          disabled={gone}
                          aria-label={`${draft.status === "active" ? "改为停投" : "改为在投"} ${row.taskName}`}
                          onClick={() => patch(row.taskId, { status: nextStatus(draft.status) })}
                          className={cn(
                            "shrink-0 rounded-full border px-2 py-0.5 text-[11px] transition-colors",
                            draft.status === "active" ? "border-status-success/40 bg-status-success/10 text-status-success" : "border-input text-muted-foreground",
                          )}
                        >{STATUS_LABEL[draft.status]}</button>
                      </div>
                    </TableCell>
                    <TableCell>
                      <AliasChips aliases={draft.aliases} onChange={(next) => patch(row.taskId, { aliases: next })} />
                    </TableCell>
                    <TableCell className="text-right">
                      <span className="inline-flex items-center gap-1 tabular-nums">
                        {row.assessmentPrice ? `¥${row.assessmentPrice.value.toFixed(2)}` : "−"}
                        <AssessmentPriceHistory taskId={row.taskId} taskName={row.taskName} current={row.assessmentPrice} />
                      </span>
                    </TableCell>
                    <TableCell>
                      <Input
                        value={draft.monitorUrl ?? ""}
                        onChange={(event) => patch(row.taskId, { monitorUrl: event.target.value || null })}
                        placeholder="未设置"
                        aria-label={`监测链接 ${row.taskName}`}
                        disabled={gone}
                        className="h-7 border-transparent px-1.5 text-xs shadow-none hover:border-input focus-visible:border-input"
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        value={draft.productName ?? ""}
                        onChange={(event) => patch(row.taskId, { productName: event.target.value || null })}
                        placeholder="未设置"
                        aria-label={`产品名 ${row.taskName}`}
                        disabled={gone}
                        className="h-7 border-transparent px-1.5 text-xs shadow-none hover:border-input focus-visible:border-input"
                      />
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost" size="sm"
                        aria-label={gone ? `撤销删除 ${row.taskName}` : `删除 ${row.taskName}`}
                        className="h-7 w-7 p-0 text-muted-foreground"
                        onClick={() => setRemoved((prev) => {
                          const next = new Set(prev)
                          if (next.has(row.taskId)) next.delete(row.taskId); else next.add(row.taskId)
                          return next
                        })}
                      >{gone ? <IconPlus className="size-3.5" /> : <IconTrash className="size-3.5" />}</Button>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
        {ordered.length > MAX_ROWS_COLLAPSED ? (
          <Button variant="ghost" size="sm" className="mt-2 w-full text-xs font-normal text-muted-foreground" onClick={() => setExpanded((value) => !value)}>
            <IconChevronDown className={cn("size-3.5 transition-transform", expanded && "rotate-180")} />
            {expanded ? "收起" : `展开全部 ${ordered.length} 条`}
          </Button>
        ) : null}
        <p className="mt-2 text-[11px] text-muted-foreground">
          删除是把任务置为「已结束」，不是真删——历史数据还查得到。停投的任务排在下面。
          别名用于账户昵称里没有任务号时按<b className="font-medium">最长命中</b>把账户绑到任务。
        </p>
      </CardContent>
    </Card>
  )
}

export function TaskManageTab() {
  const groups = useMemo(() => groupByBiz(taskManageRows), [])
  if (groups.length === 0) {
    return <p className="rounded-lg border border-dashed px-3 py-10 text-center text-sm text-muted-foreground">还没有任务可维护</p>
  }
  return (
    <div className="flex flex-col gap-4">
      {groups.map((group) => <BizCard key={group.biz} biz={group.biz} rows={group.rows} />)}
    </div>
  )
}
