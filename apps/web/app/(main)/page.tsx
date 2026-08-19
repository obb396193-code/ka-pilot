import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { ArrowUpIcon, ArrowDownIcon, CheckCircle2 } from "lucide-react"
import { mockApi } from "@/lib/api/mock"

export default async function DashboardPage() {
  const { data: summary } = await mockApi.getDashboardSummary()
  const { data: workItems } = await mockApi.getWorkItems()

  return (
    <div className="flex-1 space-y-4 p-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">早上好</h1>
          <p className="text-sm text-muted-foreground">
            数据截至 {new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })} ✓ 新鲜
          </p>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">消耗</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tabular-nums">¥{(summary.total_cost / 10000).toFixed(1)}万</div>
            <div className="flex items-center text-xs text-muted-foreground">
              <ArrowUpIcon className="mr-1 h-3 w-3 text-green-500" />
              <span className="tabular-nums">+{(summary.total_cost_change * 100).toFixed(1)}%</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">真实CPA</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tabular-nums">¥{summary.avg_real_cpa.toFixed(1)}</div>
            <div className="flex items-center text-xs text-muted-foreground">
              <CheckCircle2 className="mr-1 h-3 w-3 text-green-500" />
              <span>考核¥{summary.assessment_cost}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">达标率</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tabular-nums">{(summary.compliance_rate * 100).toFixed(0)}%</div>
            <div className="flex items-center text-xs text-muted-foreground">
              <ArrowDownIcon className="mr-1 h-3 w-3 text-red-500" />
              <span className="tabular-nums">{(summary.compliance_change * 100).toFixed(0)}pp</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">成本空间</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tabular-nums">+¥{(summary.cost_margin / 10000).toFixed(1)}万</div>
            <div className="text-xs text-muted-foreground">&nbsp;</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">BI量级</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tabular-nums">{summary.bi_volume.toLocaleString()}</div>
            <div className="flex items-center text-xs text-muted-foreground">
              <ArrowDownIcon className="mr-1 h-3 w-3 text-red-500" />
              <span className="tabular-nums">{(summary.bi_volume_change * 100).toFixed(1)}%</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">待处理</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tabular-nums">{summary.pending_items}</div>
            <div className="text-xs text-muted-foreground">{summary.p0_count}条P0</div>
          </CardContent>
        </Card>
      </div>

      {/* Work Items */}
      <Card>
        <CardHeader>
          <CardTitle>今日待处理 ({workItems.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {workItems.map((item) => (
              <div
                key={item.id}
                className="flex items-start gap-3 rounded-lg border p-3 hover:bg-accent/50 transition-colors"
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
        </CardContent>
      </Card>
    </div>
  )
}
