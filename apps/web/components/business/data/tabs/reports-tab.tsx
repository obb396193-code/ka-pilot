"use client"

import { useState } from "react"
import { IconBell, IconCheck, IconChevronRight, IconDeviceFloppy, IconSparkles } from "@tabler/icons-react"
import { toast } from "sonner"

import { ExampleBlock } from "@/components/business/state/page-state"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { NotConnected } from "@/components/business/state/not-connected"
import { FIXTURES_ENABLED, fmtTime, isOk, mv, rv } from "@/lib/fixtures/contract"
import { reportConfigFixture, reportRenderFixture, windowLabel, windowPresets, type SavedView, type WindowPreset } from "@/lib/fixtures/data-analysis"
import { cn } from "@/lib/utils"

// 自助报表：四步向导（模板 → 组件 → 筛选 → 预览发布）+ 个人视图；「让 Agent 帮搭」= 示例态（R-010b 后）
const steps = ["模板", "组件", "筛选", "预览发布"] as const
const metricOptions = [
  { key: "cost", label: "账面消耗" },
  { key: "cashCost", label: "现金消耗" },
  { key: "realConversion", label: "真实转化" },
  { key: "cashCpa", label: "现金 CPA" },
  { key: "onTarget", label: "达标" },
  { key: "costSpace", label: "成本空间" },
  { key: "balance", label: "余额" },
]
const groupOptions = [
  { key: "task", label: "任务" },
  { key: "owner", label: "负责人" },
  { key: "account", label: "账户" },
  { key: "media", label: "媒体" },
  { key: "product", label: "产品名" },
]

/**
 * A35（F8-25 ①）：真实模式下不显样例数据。这个 tab 还没接真接口，照实说。
 * 外面包一层是因为**早退必须在所有 hook 之前**，而里面那个组件第一行就开始用 hook——
 * 在它内部早退会违反 rules-of-hooks（真实/mock 两种模式下 hook 数量不一致）。
 */
export function ReportsTab(props: Parameters<typeof ReportsTabInner>[0]) {
  if (!FIXTURES_ENABLED) return <NotConnected endpoint="POST /reports/render · GET /reports/configs" hint="be2 Q-047 登记中。" />
  return <ReportsTabInner {...props} />
}

function ReportsTabInner({ views, onSaveView }: { views: SavedView[]; onSaveView: (name: string, columns: string[]) => void }) {
  const template = isOk(reportConfigFixture) ? reportConfigFixture.data : null
  const render = isOk(reportRenderFixture) ? reportRenderFixture.data : null
  const [step, setStep] = useState(0)
  const [name, setName] = useState(template?.name ?? "")
  const [groupBy, setGroupBy] = useState<string[]>(template?.config.groupBy ?? ["task"])
  const [columns, setColumns] = useState<string[]>(template?.config.columns.map((column) => column.metric) ?? ["cost", "cashCpa", "onTarget"])
  const [preset, setPreset] = useState<WindowPreset>("last_7d")
  const [media, setMedia] = useState("KUAISHOU")
  const [schedule, setSchedule] = useState<{ cron: string; format: "png" | "xlsx"; target: "group" | "dm" }>({ cron: "0 9 * * *", format: "png", target: "group" })
  const toggle = (list: string[], key: string, set: (next: string[]) => void) => set(list.includes(key) ? list.filter((item) => item !== key) : [...list, key])

  return (
    <div className="grid gap-4 @5xl/main:grid-cols-12">
      <Card className="@5xl/main:col-span-8">
        <CardHeader>
          <CardTitle>报表设计器</CardTitle>
          <CardDescription>配置可保存；数据由后端渲染，前端不算数</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <ol className="flex flex-wrap items-center gap-1 text-sm">
            {steps.map((label, index) => (
              <li key={label} className="flex items-center gap-1">
                <button type="button" onClick={() => setStep(index)} className={cn("flex items-center gap-1.5 rounded-full border px-3 py-1", index === step ? "border-foreground bg-foreground text-background" : index < step ? "border-foreground/40" : "text-muted-foreground")}>
                  <span className="flex size-4 items-center justify-center rounded-full border text-[10px] tabular-nums">{index < step ? <IconCheck className="size-3" /> : index + 1}</span>{label}
                </button>
                {index < steps.length - 1 ? <IconChevronRight className="size-3.5 text-muted-foreground" /> : null}
              </li>
            ))}
          </ol>

          {step === 0 ? (
            <div className="grid gap-3 md:grid-cols-3">
              <button type="button" onClick={() => { if (template) { setName(template.name); setGroupBy(template.config.groupBy); setColumns(template.config.columns.map((column) => column.metric)) } setStep(1) }} className="flex flex-col gap-1 rounded-xl border p-4 text-left hover:bg-muted/50">
                <span className="text-sm font-medium">从模板</span>
                <span className="text-xs text-muted-foreground">{template?.name ?? "−"}</span>
                <span className="text-[11px] text-muted-foreground">{template ? `${template.config.groupBy.length} 个分组 · ${template.config.columns.length} 列 · ${template.version}` : ""}</span>
              </button>
              <button type="button" onClick={() => { setName("未命名报表"); setGroupBy([]); setColumns([]); setStep(1) }} className="flex flex-col gap-1 rounded-xl border p-4 text-left hover:bg-muted/50">
                <span className="text-sm font-medium">从空白</span>
                <span className="text-xs text-muted-foreground">自己选分组与列</span>
              </button>
              <ExampleBlock unlock="Agent 帮做表随助手写作能力一起开放" inline>
                <div className="flex flex-col gap-1 rounded-xl border p-4"><span className="flex items-center gap-1.5 text-sm font-medium"><IconSparkles className="size-4" />让 Agent 帮搭</span><span className="text-xs text-muted-foreground">一句话描述想看的表</span></div>
              </ExampleBlock>
            </div>
          ) : null}

          {step === 1 ? (
            <div className="grid gap-4 md:grid-cols-2">
              <div className="flex flex-col gap-2">
                <Label>报表名</Label>
                <Input value={name} onChange={(event) => setName(event.target.value)} />
                <Label className="mt-2">分组维度</Label>
                <div className="flex flex-wrap gap-2">{groupOptions.map((option) => <Button key={option.key} type="button" size="sm" variant={groupBy.includes(option.key) ? "default" : "outline"} onClick={() => toggle(groupBy, option.key, setGroupBy)}>{option.label}</Button>)}</div>
              </div>
              <div className="flex flex-col gap-2">
                <Label>指标列</Label>
                {metricOptions.map((option) => (
                  <label key={option.key} className="flex items-center gap-2 text-sm"><Checkbox checked={columns.includes(option.key)} onCheckedChange={() => toggle(columns, option.key, setColumns)} />{option.label}</label>
                ))}
              </div>
            </div>
          ) : null}

          {step === 2 ? (
            <div className="grid gap-4 md:grid-cols-2">
              <div className="flex flex-col gap-2">
                <Label>时间窗口</Label>
                <Select value={preset} onValueChange={(value) => setPreset(value as WindowPreset)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{windowPresets.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent></Select>
              </div>
              <div className="flex flex-col gap-2">
                <Label>媒体</Label>
                <Select value={media} onValueChange={setMedia}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="KUAISHOU">快手</SelectItem><SelectItem value="all">全部</SelectItem></SelectContent></Select>
              </div>
              <p className="text-xs text-muted-foreground md:col-span-2">高亮规则沿用模板：达标 = 否 → 红。容忍带在个人视图设置。</p>
            </div>
          ) : null}

          {step === 3 ? (
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="font-medium">{name || "未命名报表"}</span>
                <Badge variant="outline">{windowLabel(preset)}</Badge>
                <Badge variant="outline">{groupBy.map((key) => groupOptions.find((option) => option.key === key)?.label).join(" × ") || "无分组"}</Badge>
                <span className="text-xs text-muted-foreground">预览为示例数据（按模板分组）；配置改动接入渲染接口后实时生效</span>
              </div>
              <div className="overflow-x-auto rounded-xl border">
                <Table>
                  <TableHeader className="bg-muted">
                    <TableRow>
                      {render?.columns.filter((column) => !["cost", "cashCpa", "onTarget"].includes(column.key) || columns.includes(column.key)).map((column) => <TableHead key={column.key}>{column.label}</TableHead>)}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {render?.rows.map((row, index) => {
                      const highlighted = render.highlights.some((item) => item.rowIndex === index)
                      return (
                        <TableRow key={index} className={cn(highlighted && "bg-status-critical/5")}>
                          {render.columns.filter((column) => !["cost", "cashCpa", "onTarget"].includes(column.key) || columns.includes(column.key)).map((column) => (
                            <TableCell key={column.key} className="tabular-nums">
                              {column.key === "cost" ? mv(row.metrics.cost, "money0") : column.key === "cashCpa" ? rv(row.metrics.ratios.cashCpa, "money") : column.key === "onTarget" ? (row.assessment.onTarget === null ? "−" : row.assessment.onTarget ? "达标" : <span className="text-status-critical">超线</span>) : (row.group[column.key] ?? "−")}
                            </TableCell>
                          ))}
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button onClick={() => { onSaveView(name || "未命名报表", columns); toast.success(`已保存「${name || "未命名报表"}」为个人视图`, { description: "接入后同步到账号" }) }}><IconDeviceFloppy />保存为个人视图</Button>
                <Dialog>
                  <DialogTrigger asChild><Button variant="outline"><IconBell />定时推送</Button></DialogTrigger>
                  <DialogContent className="sm:max-w-md">
                    <DialogHeader><DialogTitle>定时推送</DialogTitle><DialogDescription>到点渲染成图或表，推到群 / 私聊。</DialogDescription></DialogHeader>
                    <div className="grid gap-3">
                      <div className="grid gap-1.5"><Label>cron</Label><Input value={schedule.cron} onChange={(event) => setSchedule((prev) => ({ ...prev, cron: event.target.value }))} /></div>
                      <div className="grid gap-1.5"><Label>格式</Label><Select value={schedule.format} onValueChange={(value) => setSchedule((prev) => ({ ...prev, format: value as "png" | "xlsx" }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="png">PNG（带口径戳）</SelectItem><SelectItem value="xlsx">XLSX</SelectItem></SelectContent></Select></div>
                      <div className="grid gap-1.5"><Label>推到</Label><Select value={schedule.target} onValueChange={(value) => setSchedule((prev) => ({ ...prev, target: value as "group" | "dm" }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="group">钉钉群</SelectItem><SelectItem value="dm">私聊</SelectItem></SelectContent></Select></div>
                    </div>
                    <DialogFooter><Button onClick={() => toast.success("定时推送已登记", { description: `${schedule.cron} · ${schedule.format} · ${schedule.target === "group" ? "钉钉群" : "私聊"} 接入后生效` })}>登记</Button></DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
            </div>
          ) : null}

          <div className="flex justify-between">
            <Button variant="ghost" size="sm" disabled={step === 0} onClick={() => setStep((prev) => Math.max(0, prev - 1))}>上一步</Button>
            <Button size="sm" disabled={step === steps.length - 1} onClick={() => setStep((prev) => Math.min(steps.length - 1, prev + 1))}>下一步</Button>
          </div>
        </CardContent>
      </Card>

      <Card className="@5xl/main:col-span-4">
        <CardHeader>
          <CardTitle>个人视图</CardTitle>
          <CardDescription>总表「存列」和这里保存的视图都在这儿</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {views.length ? views.map((view) => (
            <div key={view.id} className="flex flex-col gap-1 rounded-lg border px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium">{view.name}</span>
                <Badge variant="outline" className="text-[10px]">{view.page}</Badge>
              </div>
              <div className="text-xs text-muted-foreground">{view.config.columns.length} 列 · {windowLabel(view.config.window?.preset)} · 更新 {fmtTime(view.updatedAt)}{view.isShared ? " · 已共享" : ""}</div>
            </div>
          )) : <p className="text-sm text-muted-foreground">还没有个人视图</p>}
        </CardContent>
      </Card>
    </div>
  )
}
