import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { mockApi } from "@/lib/api/mock"

export default async function TasksPage() {
  const { data: tasks } = await mockApi.getTasks()

  return (
    <div className="flex-1 space-y-4 p-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">投放任务</h1>
        <p className="text-sm text-muted-foreground">任务跑得咋样</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {tasks.map((task) => (
          <Card key={task.task_id}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>{task.task_name}</CardTitle>
                <Badge variant={task.status === "in_progress" ? "default" : "secondary"}>
                  {task.status === "in_progress" ? "进行中" : "已暂停"}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">真实CPA</p>
                  <p className="text-2xl font-bold tabular-nums">¥{task.real_cpa.toFixed(2)}</p>
                  <p className="text-xs text-muted-foreground">考核 ¥{task.assessment_cost}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">达标率</p>
                  <p className="text-2xl font-bold tabular-nums">
                    {(task.compliance_rate * 100).toFixed(0)}%
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">消耗</p>
                  <p className="text-lg font-semibold tabular-nums">
                    ¥{task.total_cost.toLocaleString()}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">真实转化</p>
                  <p className="text-lg font-semibold tabular-nums">
                    {task.total_real_conversion.toLocaleString()}
                  </p>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">进度 (Pacing)</span>
                  <span className="font-medium tabular-nums">{(task.pacing * 100).toFixed(0)}%</span>
                </div>
                <div className="mt-2 h-2 w-full rounded-full bg-secondary">
                  <div
                    className="h-2 rounded-full bg-primary transition-all"
                    style={{ width: `${task.pacing * 100}%` }}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
