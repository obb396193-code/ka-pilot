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

export async function SectionCards() {
  const { data: summary } = await mockApi.getDashboardSummary()

  return (
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
            需要关注 <IconTrendingDown className="size-4" />
          </div>
          <div className="text-muted-foreground">
            较昨日下降 {Math.abs(summary.compliance_change * 100).toFixed(0)}pp
          </div>
        </CardFooter>
      </Card>

      <Card className="@container/card">
        <CardHeader>
          <CardDescription>真实转化</CardDescription>
          <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
            {summary.total_real_conversion}
          </CardTitle>
          <CardAction>
            <Badge variant="outline">
              <IconTrendingUp />
              +{(summary.real_conversion_change * 100).toFixed(1)}%
            </Badge>
          </CardAction>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className="line-clamp-1 flex gap-2 font-medium">
            转化持续增长 <IconTrendingUp className="size-4" />
          </div>
          <div className="text-muted-foreground">
            较昨日增长 {(summary.real_conversion_change * 100).toFixed(1)}%
          </div>
        </CardFooter>
      </Card>

      <Card className="@container/card">
        <CardHeader>
          <CardDescription>有效账户</CardDescription>
          <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
            {summary.active_accounts}/{summary.total_accounts}
          </CardTitle>
          <CardAction>
            <Badge variant="outline">
              <IconCheck />
              稳定
            </Badge>
          </CardAction>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className="line-clamp-1 flex gap-2 font-medium">
            账户健康度良好 <IconCheck className="size-4" />
          </div>
          <div className="text-muted-foreground">
            {((summary.active_accounts / summary.total_accounts) * 100).toFixed(0)}% 账户活跃
          </div>
        </CardFooter>
      </Card>

      <Card className="@container/card">
        <CardHeader>
          <CardDescription>计划数量</CardDescription>
          <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
            {summary.active_campaigns}
          </CardTitle>
          <CardAction>
            <Badge variant="outline">
              <IconTrendingUp />
              运行中
            </Badge>
          </CardAction>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className="line-clamp-1 flex gap-2 font-medium">
            计划正常投放 <IconTrendingUp className="size-4" />
          </div>
          <div className="text-muted-foreground">
            覆盖 {summary.total_accounts} 个账户
          </div>
        </CardFooter>
      </Card>
    </div>
  )
}
