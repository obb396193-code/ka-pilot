import Link from "next/link"
import { IconAlertTriangle, IconArrowLeft } from "@tabler/icons-react"

import { AccountCpaTrend } from "@/components/charts/account-cpa-trend"
import { DataStateFrame } from "@/components/data-view/data-state-frame"
import { DataViewSwitcher } from "@/components/data-view/data-view-switcher"
import { MetricGrid } from "@/components/data-view/metric-grid"
import { PageShell } from "@/components/data-view/page-shell"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { AccountDetailData } from "@/lib/data/contracts"
import type { DataResponse, DataViewMode, QueryRecord } from "@/lib/data/data-view"

export function AccountDetailView({ response, dataView, query }: { response: DataResponse<AccountDetailData>; dataView: DataViewMode; query: QueryRecord }) {
  const data = response.data
  return (
    <PageShell eyebrow="KA Pilot · 账户详情" title={data.accountName} description={`账户 ${data.media} · ${data.accountId} · ${data.owner}。指标由 account.detail 返回；缺失 CPA 保持为 −。`} actions={<div className="flex gap-2"><Badge variant="outline">只读</Badge>{response.isMock ? <Badge variant="secondary">脱敏 Mock</Badge> : null}</div>}>
      <div><Button asChild variant="ghost" size="sm"><Link href={`/accounts?data_view=${dataView}`}><IconArrowLeft />返回账户池</Link></Button></div>
      <DataViewSwitcher pathname={`/accounts/${data.accountId}`} current={dataView} query={query} />
      <DataStateFrame response={response}>
        <MetricGrid metrics={data.metrics} />
        <Card className="shadow-xs"><CardHeader><CardTitle>CPA 与考核价趋势</CardTitle></CardHeader><CardContent>{data.trend.length ? <AccountCpaTrend data={data.trend} /> : <p className="py-10 text-center text-sm text-muted-foreground">后端未返回可展示趋势。</p>}</CardContent></Card>
        <Card className="shadow-xs"><CardHeader><CardTitle>当前诊断</CardTitle></CardHeader><CardContent>{data.currentFindingId ? <Button asChild variant="outline"><Link href={`/diagnostics/${data.currentFindingId}`}><IconAlertTriangle />{data.currentFindingTitle ?? "查看诊断详情"}</Link></Button> : <p className="text-sm text-muted-foreground">当前 account.detail 未返回诊断关联。</p>}</CardContent></Card>
      </DataStateFrame>
    </PageShell>
  )
}
