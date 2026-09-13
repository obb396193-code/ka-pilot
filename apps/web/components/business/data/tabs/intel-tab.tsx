"use client"

import { useState } from "react"
import Link from "next/link"
import { IconLink, IconPlus, IconUpload } from "@tabler/icons-react"
import { toast } from "sonner"

import { StatusChip, TypeChip } from "@/components/business/data-grid/data-grid"
import { ExampleBlock } from "@/components/business/state/page-state"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { NotConnected } from "@/components/business/state/not-connected"
import { FIXTURES_ENABLED, fmtTime, isOk } from "@/lib/fixtures/contract"
import { tasksFixture } from "@/lib/fixtures/tasks"
import { costTierLabel, intelFixture, type IntelMaterial } from "@/lib/fixtures/v17"

// 数据分析 · 竞情 tab（v1.7 3.12，AppGrowing；接入方式 = OS 联调项 → 示例态）：竞品素材流卡片 + 导入 CSV / 登记链接 + 关联到任务/素材；一期只显 estCostTier 档位，不显消耗估算数值
/**
 * A35（F8-25 ①）：真实模式下不显样例数据。这个 tab 还没接真接口，照实说。
 * 外面包一层是因为**早退必须在所有 hook 之前**，而里面那个组件第一行就开始用 hook——
 * 在它内部早退会违反 rules-of-hooks（真实/mock 两种模式下 hook 数量不一致）。
 */
export function IntelTab() {
  if (!FIXTURES_ENABLED) return <NotConnected endpoint="AppGrowing 接入（OS 联调项）" hint="契约 §3.12 定的示例态，接通一处撤一处。" />
  return <IntelTabInner  />
}

function IntelTabInner() {
  const data = isOk(intelFixture) ? intelFixture.data : null
  const tasks = isOk(tasksFixture) ? tasksFixture.data.items : []
  const [dialog, setDialog] = useState<"import" | "link" | null>(null)
  const [linking, setLinking] = useState<IntelMaterial | null>(null)
  const [linkTask, setLinkTask] = useState("")
  if (!data) return null
  return (
    <ExampleBlock unlock="AppGrowing 的接入方式待实证（导表 / 贴链接 / 接口）；接入后按行业 / 竞品 / 版位 / 时间窗筛，示例角标自动消失">
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <TypeChip>来源 {data.sourceStatus.mode}</TypeChip>
          <span>最近导入 {data.sourceStatus.lastIngestAt ? fmtTime(data.sourceStatus.lastIngestAt) : "−"}</span>
          <span>· {data.sourceStatus.note}</span>
          <div className="ml-auto flex gap-2"><Button size="sm" variant="outline" onClick={() => setDialog("import")}><IconUpload />导入 CSV</Button><Button size="sm" variant="outline" onClick={() => setDialog("link")}><IconPlus />登记链接</Button></div>
        </div>
        <div className="grid gap-4 @3xl/main:grid-cols-2 @6xl/main:grid-cols-3">
          {data.items.map((item) => (
            <Card key={item.id} className="flex flex-col">
              <div className="m-3 mb-0 flex aspect-video items-center justify-center rounded-lg bg-muted text-xs text-muted-foreground">{item.thumbnailRef ? "缩略图" : "无缩略图"}</div>
              <CardHeader className="pb-2"><CardTitle className="flex items-center justify-between gap-2 text-sm"><span>{item.competitor}</span><StatusChip tone={item.estCostTier === "high" ? "critical" : item.estCostTier === "mid" ? "warning" : "muted"}>消耗档 {costTierLabel[item.estCostTier]}</StatusChip></CardTitle><CardDescription>{item.industry} · {item.placements.join(" / ")}</CardDescription></CardHeader>
              <CardContent className="flex-1 text-xs">
                <dl className="grid grid-cols-3 gap-1"><div><dt className="text-muted-foreground">首见</dt><dd className="tabular-nums">{item.firstSeen.slice(5)}</dd></div><div><dt className="text-muted-foreground">末见</dt><dd className="tabular-nums">{item.lastSeen.slice(5)}</dd></div><div><dt className="text-muted-foreground">活跃天</dt><dd className="tabular-nums">{item.activeDays}</dd></div></dl>
                <div className="mt-2 flex flex-wrap gap-1"><Badge variant="outline">{item.ingestMode}</Badge>{item.linked.taskId ? <Link href={`/tasks/${encodeURIComponent(item.linked.taskId)}`}><Badge variant="secondary">任务 {item.linked.taskId}</Badge></Link> : null}{item.linked.materialId ? <Badge variant="secondary">素材 {item.linked.materialId}</Badge> : null}</div>
              </CardContent>
              <CardFooter className="gap-2"><Button size="sm" variant="outline" asChild><a href={item.materialRef} target="_blank" rel="noreferrer">看原素材</a></Button><Button size="sm" variant="ghost" onClick={() => { setLinking(item); setLinkTask(item.linked.taskId ?? "") }}><IconLink />关联</Button></CardFooter>
            </Card>
          ))}
        </div>
        <Dialog open={dialog !== null} onOpenChange={(open) => { if (!open) setDialog(null) }}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader><DialogTitle>{dialog === "import" ? "导入 CSV" : "登记竞品素材链接"}</DialogTitle><DialogDescription>{dialog === "import" ? "上传后返回导入 / 跳过条数" : "手工登记一条竞品素材链接"}</DialogDescription></DialogHeader>
            <div className="grid gap-3">{dialog === "import" ? <div className="grid gap-1.5"><Label>CSV 文件</Label><Input type="file" accept=".csv" /></div> : <><div className="grid gap-1.5"><Label>素材链接</Label><Input placeholder="https://" /></div><div className="grid gap-1.5"><Label>竞品</Label><Input placeholder="竞品名" /></div></>}</div>
            <DialogFooter><Button variant="outline" onClick={() => setDialog(null)}>取消</Button><Button onClick={() => { toast.success(dialog === "import" ? "已导入（示例）" : "已登记（示例）", { description: "接入后返回导入 / 跳过条数" }); setDialog(null) }}>提交</Button></DialogFooter>
          </DialogContent>
        </Dialog>
        <Dialog open={linking !== null} onOpenChange={(open) => { if (!open) setLinking(null) }}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader><DialogTitle>关联 · {linking?.competitor}</DialogTitle><DialogDescription>把这条竞品素材挂到任务或我们的素材上</DialogDescription></DialogHeader>
            <div className="grid gap-1.5"><Label>关联任务</Label><Select value={linkTask} onValueChange={setLinkTask}><SelectTrigger><SelectValue placeholder="选任务" /></SelectTrigger><SelectContent>{tasks.map((task) => <SelectItem key={task.taskId} value={task.taskId}>{task.taskName}</SelectItem>)}</SelectContent></Select></div>
            <DialogFooter><Button variant="outline" onClick={() => setLinking(null)}>取消</Button><Button disabled={!linkTask} onClick={() => { toast.success("已关联"); setLinking(null) }}>保存</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </ExampleBlock>
  )
}
