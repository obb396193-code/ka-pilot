"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { IconCopy, IconGitCompare, IconLink, IconPlus, IconSparkles } from "@tabler/icons-react"
import { toast } from "sonner"

import { openAgentDrawer } from "@/components/business/command/events"
import { StatusChip, TypeChip } from "@/components/business/data-grid/data-grid"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { fmtTime, isOk, mv, rv } from "@/lib/fixtures/contract"
import { tasksFixture, taskStageMap, type TaskStage } from "@/lib/fixtures/tasks"
import { playbookFieldLabel, strategiesFixture, strategyCompareFixture, strategyDetailFixture, strategyStatusMeta, validationStatusMeta, type StrategyItem } from "@/lib/fixtures/v17"
import { cn } from "@/lib/utils"

// 策略分析 · 方案库（v1.7 3.11b，原型 P07/P08）：卡片列表（官方 / 团队已验证 / 我的 / 草稿）→ 方案详情抽屉（策略地图七步 / 商品素材规则 / 适用条件 / 历史验证 / 版本 / 对比）；只显样本数与验证计数，不显置信度
const libraryTabs = [
  { value: "all", label: "全部" },
  { value: "official", label: "官方" },
  { value: "team_verified", label: "团队已验证" },
  { value: "mine", label: "我的" },
  { value: "draft", label: "草稿" },
] as const
type LibraryTab = (typeof libraryTabs)[number]["value"]
const stageLabel = (stage: string) => taskStageMap[stage as TaskStage]?.label ?? stage

function StrategyCard({ item, onOpen, onCompare }: { item: StrategyItem; onOpen: (item: StrategyItem) => void; onCompare: (item: StrategyItem) => void }) {
  const meta = strategyStatusMeta[item.status]
  return (
    <Card className="flex flex-col">
      <CardHeader>
        <div className="flex items-start justify-between gap-2"><CardTitle className="text-base">{item.name} <span className="text-xs font-normal text-muted-foreground">v{item.version}</span></CardTitle><StatusChip tone={meta.tone}>{meta.label}</StatusChip></div>
        <CardDescription>适用 {item.applicable.stages.map(stageLabel).join(" / ")} · {item.applicable.biz.join(" / ")} · {item.applicable.objectives.join(" / ")}{item.owner ? ` · ${item.owner.name}` : ""}</CardDescription>
      </CardHeader>
      <CardContent className="flex-1">
        <dl className="grid grid-cols-3 gap-2 text-xs">
          <div><dt className="text-muted-foreground">样本任务</dt><dd className="font-medium tabular-nums">{item.evidence?.sampleTasks ?? "−"}</dd></div>
          <div><dt className="text-muted-foreground">现金 CPA</dt><dd className="font-medium tabular-nums">{item.evidence ? rv(item.evidence.metrics.ratios.cashCpa, "money") : "−"}</dd></div>
          <div><dt className="text-muted-foreground">验证</dt><dd className="font-medium tabular-nums">{item.validations.count}<span className="ml-1 font-normal text-muted-foreground">改善 {item.validations.improved} · 不足 {item.validations.insufficient}</span></dd></div>
        </dl>
        <div className="mt-2 flex flex-wrap gap-1"><TypeChip>{item.playbook.bid.tool} · {item.playbook.bid.style}</TypeChip><TypeChip>{item.playbook.placement.length} 版位</TypeChip>{item.playbook.rta.enabled ? <TypeChip>RTA</TypeChip> : null}</div>
        {item.boundTasks.length ? <p className="mt-2 text-xs text-muted-foreground">已绑：{item.boundTasks.map((task) => task.taskName).join("、")}</p> : null}
      </CardContent>
      <CardFooter className="gap-2">
        <Button size="sm" variant="outline" onClick={() => onOpen(item)}>详情</Button>
        <Button size="sm" variant="ghost" onClick={() => onCompare(item)}><IconGitCompare />对比</Button>
      </CardFooter>
    </Card>
  )
}

export function StrategyLibrary() {
  const items = isOk(strategiesFixture) ? strategiesFixture.data.items : []
  const tasks = isOk(tasksFixture) ? tasksFixture.data.items : []
  const [tab, setTab] = useState<LibraryTab>("all")
  const [active, setActive] = useState<StrategyItem | null>(null)
  const [compareWith, setCompareWith] = useState<StrategyItem | null>(null)
  const [binding, setBinding] = useState<StrategyItem | null>(null)
  const [bindTask, setBindTask] = useState("")
  const filtered = useMemo(() => items.filter((item) => tab === "all" || item.status === tab || (tab === "mine" && item.owner && item.status !== "draft")), [items, tab])
  const detail = active && isOk(strategyDetailFixture) && strategyDetailFixture.data.id === active.id ? strategyDetailFixture.data : null
  const compare = compareWith && isOk(strategyCompareFixture) ? strategyCompareFixture.data : null
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Tabs value={tab} onValueChange={(value) => setTab(value as LibraryTab)}><TabsList>{libraryTabs.map((item) => <TabsTrigger key={item.value} value={item.value}>{item.label}</TabsTrigger>)}</TabsList></Tabs>
        <span className="text-xs text-muted-foreground">无置信度，只显样本与验证计数</span>
        <div className="ml-auto flex gap-2"><Button size="sm" variant="outline" onClick={() => openAgentDrawer("基于「双成本控量起量」生成一个对比方案：把预算节奏改成 30/70，其他不变")}><IconSparkles />生成对比方案</Button><Button size="sm" onClick={() => toast("新建方案草稿", { description: "已保存为草稿" })}><IconPlus />新建方案</Button></div>
      </div>
      {filtered.length ? <div className="grid gap-4 @3xl/main:grid-cols-2 @6xl/main:grid-cols-3">{filtered.map((item) => <StrategyCard key={item.id} item={item} onOpen={setActive} onCompare={setCompareWith} />)}</div> : <div className="rounded-xl border border-dashed px-6 py-10 text-center text-sm text-muted-foreground">这一类还没有方案</div>}

      <Sheet open={active !== null} onOpenChange={(open) => { if (!open) setActive(null) }}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-3xl">
          <SheetHeader><SheetTitle className="flex items-center gap-2">{active?.name} <span className="text-sm font-normal text-muted-foreground">v{active?.version}</span>{active ? <StatusChip tone={strategyStatusMeta[active.status].tone}>{strategyStatusMeta[active.status].label}</StatusChip> : null}</SheetTitle><SheetDescription>更新 {active ? fmtTime(active.updatedAt) : ""}</SheetDescription></SheetHeader>
          <div className="flex flex-col gap-4 px-4 pb-6">
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={() => { setBinding(active); setBindTask("") }}><IconLink />绑定任务</Button>
              <Button size="sm" variant="outline" onClick={() => toast("已复制为草稿", { description: `新方案会记录复制来源` })}><IconCopy />复制修改</Button>
              <Button size="sm" variant="outline" onClick={() => { if (active) setCompareWith(active) }}><IconGitCompare />对比</Button>
              <Button size="sm" variant="ghost" onClick={() => openAgentDrawer(`基于方案「${active?.name}」生成一个变体，只改预算节奏，给出证据引用`)}><IconSparkles />Agent 生成变体</Button>
            </div>
            {detail ? (
              <>
                <Card>
                  <CardHeader><CardTitle>策略地图 · 七步</CardTitle><CardDescription>playbookMap（原型 P08）</CardDescription></CardHeader>
                  <CardContent><ol className="grid gap-2 @3xl/main:grid-cols-2">{detail.playbookMap.map((step) => <li key={step.key} className="flex gap-3 rounded-lg border px-3 py-2"><span className="grid size-6 shrink-0 place-items-center rounded-full bg-foreground text-xs font-semibold text-background">{step.step}</span><span><span className="block text-xs text-muted-foreground">{step.label}</span><span className="text-sm">{step.value}</span></span></li>)}</ol></CardContent>
                </Card>
                <div className="grid gap-4 @3xl/main:grid-cols-2">
                  <Card><CardHeader><CardTitle>商品素材规则</CardTitle></CardHeader><CardContent><ul className="flex flex-col gap-1 text-sm">{detail.playbook.product_material_rules.map((rule) => <li key={rule}>· {rule}</li>)}</ul></CardContent></Card>
                  <Card><CardHeader><CardTitle>适用条件</CardTitle></CardHeader><CardContent className="text-sm"><p className="mb-1 text-xs text-muted-foreground">适用</p><ul className="mb-2 flex flex-col gap-1">{detail.conditions.applicable.map((item) => <li key={item}>✓ {item}</li>)}</ul><p className="mb-1 text-xs text-muted-foreground">不适用</p><ul className="flex flex-col gap-1">{detail.conditions.not_applicable.map((item) => <li key={item} className="text-muted-foreground">✕ {item}</li>)}</ul></CardContent></Card>
                </div>
                <Card>
                  <CardHeader><CardTitle>历史验证</CardTitle><CardDescription>绑定前后各窗口的现金 CPA / 量 / 达标 · 操作后观察结果，非因果 · 样本不足不出结论</CardDescription></CardHeader>
                  <CardContent className="p-0">
                    <Table>
                      <TableHeader className="bg-muted"><TableRow><TableHead>任务</TableHead><TableHead>窗口</TableHead><TableHead className="text-right">现金 CPA 前 → 后</TableHead><TableHead className="text-right">量 前 → 后</TableHead><TableHead>达标</TableHead><TableHead>结果</TableHead></TableRow></TableHeader>
                      <TableBody>{detail.validationsDetail.map((row) => <TableRow key={`${row.taskId}-${row.window.from}`}><TableCell><Link href={`/tasks/${encodeURIComponent(row.taskId)}`} className="underline-offset-4 hover:underline">{tasks.find((task) => task.taskId === row.taskId)?.taskName ?? row.taskId}</Link></TableCell><TableCell className="tabular-nums text-xs">{row.window.from.slice(5)} – {row.window.to.slice(5)}</TableCell><TableCell className="text-right tabular-nums">{row.before && row.after ? `${rv(row.before.cashCpa, "money")} → ${rv(row.after.cashCpa, "money")}` : "−"}</TableCell><TableCell className="text-right tabular-nums">{row.before && row.after ? `${mv(row.before.volume)} → ${mv(row.after.volume)}` : "−"}</TableCell><TableCell>{row.after ? (row.after.onTarget ? <StatusChip tone="success">达标</StatusChip> : <StatusChip tone="critical">未达标</StatusChip>) : "−"}</TableCell><TableCell><span className="flex items-center gap-1"><StatusChip tone={validationStatusMeta[row.status]?.tone ?? "muted"}>{validationStatusMeta[row.status]?.label ?? row.status}</StatusChip><span className="text-[11px] text-muted-foreground">{row.note}</span></span></TableCell></TableRow>)}</TableBody>
                    </Table>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader><CardTitle>版本</CardTitle><CardDescription>发布 / 验证 / 官方走 assets/:id/transition；只有草稿可改</CardDescription></CardHeader>
                  <CardContent><ol className="flex flex-col gap-1 text-sm">{detail.versions.map((version) => <li key={version.version} className="flex items-center gap-2"><TypeChip>v{version.version}</TypeChip><span className="text-xs text-muted-foreground tabular-nums">{version.at}</span><span>{version.note}</span></li>)}</ol></CardContent>
                </Card>
              </>
            ) : active ? (
              <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">该方案没有详情样例（示例只有「双成本控量起量」）；列表字段照常。<div className="mt-3 flex flex-wrap justify-center gap-1">{Object.entries(playbookFieldLabel).slice(0, 4).map(([key, label]) => <Badge key={key} variant="outline">{label}</Badge>)}</div></CardContent></Card>
            ) : null}
          </div>
        </SheetContent>
      </Sheet>

      <Dialog open={compareWith !== null} onOpenChange={(open) => { if (!open) setCompareWith(null) }}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader><DialogTitle>方案对比</DialogTitle><DialogDescription>逐字段并排（示例固定为这两个方案）</DialogDescription></DialogHeader>
          {compare ? (
            <Table>
              <TableHeader className="bg-muted"><TableRow><TableHead>字段</TableHead><TableHead>{compare.left.name}</TableHead><TableHead>{compare.right.name}</TableHead></TableRow></TableHeader>
              <TableBody>
                {compare.fields.map((field) => <TableRow key={field.key}><TableCell className="text-muted-foreground">{playbookFieldLabel[field.key] ?? field.key}</TableCell><TableCell className={cn(field.left !== field.right && "font-medium")}>{field.left}</TableCell><TableCell className={cn(field.left !== field.right && "font-medium")}>{field.right}</TableCell></TableRow>)}
                <TableRow className="bg-muted/40"><TableCell className="text-muted-foreground">现金 CPA · 样本</TableCell><TableCell className="tabular-nums">{rv(compare.evidence.left.cashCpa, "money")} · {compare.evidence.left.sampleTasks} 任务</TableCell><TableCell className="tabular-nums">{rv(compare.evidence.right.cashCpa, "money")} · {compare.evidence.right.sampleTasks} 任务</TableCell></TableRow>
              </TableBody>
            </Table>
          ) : null}
          <DialogFooter><Button variant="outline" onClick={() => setCompareWith(null)}>关闭</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={binding !== null} onOpenChange={(open) => { if (!open) setBinding(null) }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>绑定任务 · {binding?.name}</DialogTitle><DialogDescription>绑定后任务详情「投放策略」页签显示 playbook 与实际配置差异</DialogDescription></DialogHeader>
          <div className="grid gap-1.5"><Label>任务</Label><Select value={bindTask} onValueChange={setBindTask}><SelectTrigger><SelectValue placeholder="选任务" /></SelectTrigger><SelectContent>{tasks.map((task) => <SelectItem key={task.taskId} value={task.taskId}>{task.taskName} · {stageLabel(task.stage)}</SelectItem>)}</SelectContent></Select></div>
          <DialogFooter><Button variant="outline" onClick={() => setBinding(null)}>取消</Button><Button disabled={!bindTask} onClick={() => { toast.success("已绑定", { description: "验证窗口从绑定时刻起算" }); setBinding(null) }}>绑定</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
