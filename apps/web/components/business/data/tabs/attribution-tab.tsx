"use client"

import { useState } from "react"
import { IconSparkles } from "@tabler/icons-react"

import { openAgentDrawer } from "@/components/business/command/events"
import { GapTree } from "@/components/business/data/gap-tree"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { isOk } from "@/lib/fixtures/contract"
import { tasksFixture } from "@/lib/fixtures/tasks"
import { attributionFixtures } from "@/lib/fixtures/v17"

// 数据分析 · 归因树 tab（v1.7 3.7）：任务选择器 + 树形卡 + 证据抽屉；mode=volume|cost（fixture 只给 volume，cost 显诚实空态）
export function AttributionTab() {
  const tasks = isOk(tasksFixture) ? tasksFixture.data.items : []
  const [taskId, setTaskId] = useState(tasks[0]?.taskId ?? "")
  const [mode, setMode] = useState<"volume" | "cost">("volume")
  const fixture = attributionFixtures[taskId]
  const tree = fixture && isOk(fixture) && fixture.data.mode === mode ? fixture.data : null
  const task = tasks.find((item) => item.taskId === taskId)
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={taskId} onValueChange={setTaskId}><SelectTrigger size="sm" className="w-56" aria-label="任务"><SelectValue placeholder="选任务" /></SelectTrigger><SelectContent>{tasks.map((item) => <SelectItem key={item.taskId} value={item.taskId}>{item.taskName}</SelectItem>)}</SelectContent></Select>
        <Tabs value={mode} onValueChange={(value) => setMode(value as typeof mode)}><TabsList><TabsTrigger value="volume">量级差距</TabsTrigger><TabsTrigger value="cost">成本差距</TabsTrigger></TabsList></Tabs>
        <span className="text-xs text-muted-foreground">只算有公式的节点</span>
        <Button size="sm" variant="outline" className="ml-auto" disabled={!tree} onClick={() => openAgentDrawer(`解释任务「${task?.taskName ?? taskId}」目标差距树里占比最大的一支，并给可逆的下一步`)}><IconSparkles />问 AI</Button>
      </div>
      {tree ? <GapTree tree={tree} /> : (
        <div className="flex min-h-56 flex-col items-center justify-center gap-2 rounded-xl border border-dashed px-6 py-10 text-center text-sm">
          <p className="font-medium">{task?.taskName ?? taskId} 的{mode === "cost" ? "成本" : "量级"}归因树没有样例</p>
          <p className="max-w-md text-xs text-muted-foreground">示例只有「AAC 拉新」的量级模式；接口接入后按任务 × 模式返回，数据不足的节点灰显。</p>
        </div>
      )}
    </div>
  )
}
