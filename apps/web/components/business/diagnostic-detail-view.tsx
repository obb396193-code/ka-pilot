import Link from "next/link"
import { IconArrowLeft, IconRobot, IconShieldCheck } from "@tabler/icons-react"

import { ChangeSetConfirmation } from "@/components/business/change-set-confirmation"
import { DataStateFrame } from "@/components/data-view/data-state-frame"
import { PageBody, PageHeader } from "@/components/business/page-header"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { ChangeSetPreviewData, FindingDetailData } from "@/lib/data/contracts"
import type { DataResponse } from "@/lib/data/data-view"

export function DiagnosticDetailView({ response, preview }: { response: DataResponse<FindingDetailData>; preview: ChangeSetPreviewData | null }) {
  const data = response.data
  const blocked = response.state !== "ready"
  const accountHref = data.accountId === "unknown" ? "/accounts?data_view=platform" : `/accounts/${data.accountId}?data_view=platform${data.media ? `&media=${encodeURIComponent(data.media)}` : ""}`
  return (
    <PageBody><PageHeader title={data.title} description={`${data.accountName} · ${data.accountId}。规则结论与证据来自只读工作项详情；AI 仅解释。`} actions={<div className="flex gap-2"><Badge variant={data.severity === "critical" ? "destructive" : "secondary"}>{data.severity === "critical" ? "P0" : "P1"}</Badge></div>} /><div className="flex flex-col gap-4 px-4 lg:px-6">
      <div><Button asChild variant="ghost" size="sm"><Link href={accountHref}><IconArrowLeft />{data.accountId === "unknown" ? "返回账户池" : "返回账户详情"}</Link></Button></div>
      <DataStateFrame response={response}>
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="shadow-xs"><CardHeader><CardTitle className="flex items-center gap-2"><IconShieldCheck className="size-4" />确定性结论</CardTitle></CardHeader><CardContent><p className="text-sm leading-6">{data.deterministicConclusion}</p><dl className="mt-4 space-y-3">{data.evidence.map((item) => <div key={`${item.label}-${item.source}`} className="rounded-lg border p-3"><dt className="text-xs text-muted-foreground">{item.label}</dt><dd className="mt-1 font-medium">{item.value}</dd><dd className="mt-1 font-mono text-[11px] text-muted-foreground">{item.source}</dd></div>)}</dl></CardContent></Card>
          <Card className="shadow-xs"><CardHeader><CardTitle className="flex items-center gap-2"><IconRobot className="size-4" />Agent 解释</CardTitle></CardHeader><CardContent><p className="text-sm leading-6">{data.aiInterpretation ?? "未提供 AI 解释。"}</p><p className="mt-3 text-xs text-muted-foreground">{data.aiConfidence ?? "不构成执行指令"}</p></CardContent></Card>
        </div>
        {preview ? <ChangeSetConfirmation data={preview} blocked={blocked} /> : <Card className="border-dashed"><CardContent className="py-8 text-center"><strong>未生成变更预览</strong><p className="mt-2 text-sm text-muted-foreground">当前 Contract 未返回可确认的 change set；未接执行器，不提供写按钮。</p></CardContent></Card>}
      </DataStateFrame>
    </div></PageBody>
  )
}
