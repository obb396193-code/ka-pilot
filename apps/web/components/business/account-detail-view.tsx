import Link from "next/link"
import { IconAlertTriangle, IconArrowLeft } from "@tabler/icons-react"

import { AccountCpaTrend } from "@/components/charts/account-cpa-trend"
import { PageBody, PageHeader } from "@/components/business/page-header"
import { DataStateFrame } from "@/components/data-view/data-state-frame"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import type { AccountDetailData } from "@/lib/data/contracts"
import type { DataResponse } from "@/lib/data/data-view"
import { accountStatus } from "@/components/business/accounts/account-status"
import { StatusChip } from "@/components/business/data-grid/data-grid"

// 账户详情（PRD 2.3.4）：小传 + 趋势 + 诊断；计划层 / 操作史随接口开放
export function AccountDetailView({ response }: { response: DataResponse<AccountDetailData> }) {
  const data = response.data
  const chip = accountStatus[data.status]
  return (
    <PageBody>
      <PageHeader
        title={<span className="flex items-center gap-3">{data.accountName}<StatusChip tone={chip.tone} className="text-sm font-normal">{chip.label}</StatusChip></span>}
        description={<span className="font-mono text-xs">{data.media} · {data.accountId} · {data.owner}</span>}
        isMock={response.isMock}
        actions={<Button asChild variant="outline" size="sm"><Link href="/accounts"><IconArrowLeft />账户池</Link></Button>}
      />
      <DataStateFrame response={response} lineage="inline">
        <div className="grid gap-4 px-4 lg:px-6 @3xl/main:grid-cols-4">
          {data.metrics.map((metric) => (
            <Card key={metric.key} className="bg-gradient-to-t from-primary/5 to-card">
              <CardHeader><CardDescription>{metric.label}</CardDescription><CardTitle className="text-2xl font-semibold tabular-nums tracking-tight">{metric.value}</CardTitle></CardHeader>
              {metric.delta ? <CardContent className="text-xs text-muted-foreground">考核价 {metric.delta}</CardContent> : null}
            </Card>
          ))}
          <Card><CardHeader><CardDescription>余额 · 断量倒计时</CardDescription><CardTitle className="text-2xl font-semibold text-muted-foreground">−</CardTitle></CardHeader><CardContent className="text-xs text-muted-foreground">资金接口接入后显示</CardContent></Card>
          <Card><CardHeader><CardDescription>关联任务</CardDescription><CardTitle className="text-2xl font-semibold text-muted-foreground">−</CardTitle></CardHeader><CardContent className="text-xs text-muted-foreground">任务接口接入后显示</CardContent></Card>
        </div>
        <div className="grid gap-4 px-4 lg:px-6 @5xl/main:grid-cols-12">
          <Card className="@5xl/main:col-span-8">
            <CardHeader><CardTitle>CPA 与考核价趋势</CardTitle><CardDescription>操作点标注随操作史接口开放</CardDescription></CardHeader>
            <CardContent>{data.trend.length ? <AccountCpaTrend data={data.trend} /> : <p className="py-10 text-center text-sm text-muted-foreground">后端未返回可展示趋势</p>}</CardContent>
          </Card>
          <div className="flex flex-col gap-4 @5xl/main:col-span-4">
            <Card>
              <CardHeader><CardTitle>当前诊断</CardTitle></CardHeader>
              <CardContent>{data.currentFindingId ? <Button asChild variant="outline"><Link href={`/diagnostics/${data.currentFindingId}`}><IconAlertTriangle />{data.currentFindingTitle ?? "查看诊断详情"}</Link></Button> : <p className="text-sm text-muted-foreground">当前没有关联的诊断工作项</p>}</CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>计划层与操作历史</CardTitle></CardHeader>
              <CardContent className="text-sm text-muted-foreground">campaign → unit 树、批量关停、带外变更标注随对应接口开放</CardContent>
            </Card>
          </div>
        </div>
      </DataStateFrame>
    </PageBody>
  )
}
