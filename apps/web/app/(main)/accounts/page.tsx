import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { mockApi } from "@/lib/api/mock"
import { CheckCircle2, XCircle } from "lucide-react"

export default async function AccountsPage() {
  const { data: accounts } = await mockApi.getAccounts()

  return (
    <div className="flex-1 space-y-4 p-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">账户资源</h1>
        <p className="text-sm text-muted-foreground">户咋样</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {accounts.map((account) => (
          <Card key={account.account_id}>
            <CardHeader>
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <CardTitle className="text-base">{account.account_name}</CardTitle>
                  <p className="text-xs text-muted-foreground">{account.advertiser_id}</p>
                </div>
                <Badge variant={account.status === "active" ? "default" : "secondary"}>
                  {account.status === "active" ? "运行中" : "已暂停"}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">今日真实CPA</span>
                  <div className="flex items-center gap-2">
                    <span className="text-lg font-bold tabular-nums">
                      ¥{account.real_cpa_today.toFixed(2)}
                    </span>
                    {account.is_compliant ? (
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                    ) : (
                      <XCircle className="h-4 w-4 text-red-500" />
                    )}
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">考核 ¥{account.assessment_cost}</p>
              </div>

              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">今日消耗</p>
                  <p className="font-semibold tabular-nums">¥{account.cost_today.toFixed(1)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">真实转化</p>
                  <p className="font-semibold tabular-nums">{account.real_conversion_today}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">日预算</p>
                  <p className="font-semibold tabular-nums">¥{account.daily_budget.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">余额</p>
                  <p className="font-semibold tabular-nums">¥{account.balance.toFixed(1)}</p>
                </div>
              </div>

              <div className="pt-2 border-t">
                <p className="text-xs text-muted-foreground">
                  负责人: <span className="text-foreground">{account.负责人}</span>
                </p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
