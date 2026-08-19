import { IconTrendingDown, IconTrendingUp, IconCheck } from "@tabler/icons-react"
import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardAction,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { mockApi } from "@/lib/api/mock"

export default async function DashboardPage() {
  const { data: summary } = await mockApi.getDashboardSummary()
  const { data: workItems } = await mockApi.getWorkItems()

  return (
    <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-1 gap-4 px-4 *:data-[slot=card]:bg-gradient-to-t *:data-[slot=card]:from-primary/5 *:data-[slot=card]:to-card *:data-[slot=card]:shadow-xs lg:px-6 @xl/main:grid-cols-2 @3xl/main:grid-cols-3 @5xl/main:grid-cols-6 dark:*:data-[slot=card]:bg-card">
        <Card className="@container/card">
          <CardHeader>
            <CardDescription>消耗</CardDescription>
            <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
              ¥{(summary.total_cost / 10000).toFixed(1)}万
            </CardTitle>
            <CardAction>
              <Badge variant="outline">
                <IconTrendingUp />
                +{(summary.total_cost_change * 100).toFixed(1)}%
              </Badge>
            </CardAction>
          </CardHeader>
          <CardFooter className="flex-col items-start gap-1.5 text-sm">
            <div className="line-clamp-1 flex gap-2 font-medium">
              投放量级增长 <IconTrendingUp className="size-4" />
            </div>
            <div className="text-muted-foreground">
              较昨日上涨 {(summary.total_cost_change * 100).toFixed(1)}%
            </div>
          </CardFooter>
        </Card>

        <Card className="@container/card">
          <CardHeader>
            <CardDescription>真实CPA</CardDescription>
            <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
              ¥{summary.avg_real_cpa.toFixed(1)}
            </CardTitle>
            <CardAction>
              <Badge variant="outline">
                <IconCheck />
                达标
              </Badge>
            </CardAction>
          </CardHeader>
          <CardFooter className="flex-col items-start gap-1.5 text-sm">
            <div className="line-clamp-1 flex gap-2 font-medium">
              成本表现健康 <IconCheck className="size-4" />
            </div>
            <div className="text-muted-foreground">
              考核目标 ¥{summary.assessment_cost}
            </div>
          </CardFooter>
        </Card>

        <Card className="@container/card">
          <CardHeader>
            <CardDescription>达标率</CardDescription>
            <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
              {(summary.compliance_rate * 100).toFixed(0)}%
            </CardTitle>
            <CardAction>
              <Badge variant="outline">
                <IconTrendingDown />
                {(summary.compliance_change * 100).toFixed(0)}pp
              </Badge>
            </CardAction>
          </CardHeader>
          <CardFooter className="flex-col items-start gap-1.5 text-sm">
            <div className="line-clamp-1 flex gap-2 font-medium">
              较上周下降 <IconTrendingDown className="size-4" />
            </div>
            <div className="text-muted-foreground">需要优化成本结构</div>
          </CardFooter>
        </Card>

        <Card className="@container/card">
          <CardHeader>
            <CardDescription>成本空间</CardDescription>
            <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
              +¥{(summary.cost_margin / 10000).toFixed(1)}万
            </CardTitle>
            <CardAction>
              <Badge variant="outline">
                <IconTrendingUp />
                健康
              </Badge>
            </CardAction>
          </CardHeader>
          <CardFooter className="flex-col items-start gap-1.5 text-sm">
            <div className="line-clamp-1 flex gap-2 font-medium">
              盈余空间充足 <IconTrendingUp className="size-4" />
            </div>
            <div className="text-muted-foreground">可支撑量级扩张</div>
          </CardFooter>
        </Card>

        <Card className="@container/card">
          <CardHeader>
            <CardDescription>BI量级</CardDescription>
            <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
              {summary.bi_volume.toLocaleString()}
            </CardTitle>
            <CardAction>
              <Badge variant="outline">
                <IconTrendingDown />
                {(summary.bi_volume_change * 100).toFixed(1)}%
              </Badge>
            </CardAction>
          </CardHeader>
          <CardFooter className="flex-col items-start gap-1.5 text-sm">
            <div className="line-clamp-1 flex gap-2 font-medium">
              转化量下滑 <IconTrendingDown className="size-4" />
            </div>
            <div className="text-muted-foreground">需关注转化链路</div>
          </CardFooter>
        </Card>

        <Card className="@container/card">
          <CardHeader>
            <CardDescription>待处理</CardDescription>
            <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
              {summary.pending_items}
            </CardTitle>
            <CardAction>
              <Badge variant="destructive">
                {summary.p0_count}条P0
              </Badge>
            </CardAction>
          </CardHeader>
          <CardFooter className="flex-col items-start gap-1.5 text-sm">
            <div className="line-clamp-1 flex gap-2 font-medium">
              紧急事项待处理
            </div>
            <div className="text-muted-foreground">包含 {summary.p0_count} 条高优先级</div>
          </CardFooter>
        </Card>
      </div>

      {/* Work Items Table */}
      <div className="px-4 lg:px-6">
        <Card>
          <CardHeader>
            <CardTitle>今日待处理 ({workItems.length})</CardTitle>
            <CardDescription>需要关注的任务和预警</CardDescription>
          </CardHeader>
          <div className="px-6 pb-4">
            <div className="space-y-3">
              {workItems.map((item) => (
                <div
                  key={item.id}
                  className="flex items-start gap-3 rounded-lg border p-3 transition-colors hover:bg-accent/50"
                >
                  <Badge variant={item.severity === "P0" ? "destructive" : "secondary"}>
                    {item.severity}
                  </Badge>
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{item.title}</span>
                      <span className="text-sm text-muted-foreground">|</span>
                      <span className="text-sm text-muted-foreground">{item.task_name}</span>
                      <span className="text-sm text-muted-foreground">-</span>
                      <span className="text-sm text-muted-foreground">{item.account_name}</span>
                    </div>
                    <p className="text-sm text-muted-foreground">{item.description}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(item.created_at).toLocaleString("zh-CN")}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Card>
      </div>
    </div>
  )
}
