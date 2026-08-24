import Link from "next/link"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import type { AnalysisData } from "@/lib/data/contracts"
import type { DataViewMode, MetricValue } from "@/lib/data/data-view"

function ValueCell({ cell }: { cell: MetricValue }) {
  if (cell.availability === "available") return <span className="font-mono tabular-nums">{cell.displayValue}</span>
  const labels: Record<Exclude<MetricValue["availability"], "available">, string> = { missing: "该来源缺失", denominator_zero: "分母为 0", partial: "部分", stale: "过期", error: "错误" }
  const displayValue = cell.availability === "missing" ? "该来源缺失" : cell.displayValue
  return <span className="text-xs text-muted-foreground" title={labels[cell.availability]}>{displayValue}</span>
}

const statusLabel = { healthy: "健康", watch: "关注", critical: "高风险", unavailable: "不可判断" }
const authorityLabel = { ka_data: "KA Data", platform: "platform", source_versioned: "分来源版本" }

export function AnalysisTable({ data, dataView }: { data: AnalysisData; dataView: DataViewMode }) {
  const reconcile = dataView === "reconcile"
  return (
    <section className="overflow-hidden rounded-lg border bg-card shadow-xs" aria-label="账户数据表">
      <div className="flex flex-col gap-2 border-b px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-medium">账户经营明细</h2>
          <p className="mt-1 text-xs text-muted-foreground">{data.summary}</p>
        </div>
        <Badge variant="outline">共 {data.rows.length} 行</Badge>
      </div>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="min-w-48">账户</TableHead>
              <TableHead>负责人</TableHead>
              {reconcile ? <><TableHead className="text-right">KA 消耗</TableHead><TableHead className="text-right">平台消耗</TableHead><TableHead className="text-right">KA CPA</TableHead><TableHead className="text-right">平台 CPA</TableHead></> : <><TableHead className="text-right">消耗</TableHead><TableHead className="text-right">CPA</TableHead></>}
              <TableHead className="text-right">考核价</TableHead>
              {reconcile ? <><TableHead className="text-right">差异</TableHead><TableHead className="text-right">差异率</TableHead></> : null}
              <TableHead>状态</TableHead>
              <TableHead className="min-w-44">后端默认来源</TableHead>
              <TableHead className="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.rows.map((row) => {
              const selected = dataView === "ka_data" ? row.kaData : row.platform
              return (
              <TableRow key={row.accountId}>
                <TableCell><div className="font-medium">{row.accountName}</div><div className="font-mono text-[11px] text-muted-foreground">{row.accountId}</div></TableCell>
                <TableCell>{row.owner}</TableCell>
                {reconcile ? <><TableCell className="text-right"><ValueCell cell={row.kaData.spend} /></TableCell><TableCell className="text-right"><ValueCell cell={row.platform.spend} /></TableCell><TableCell className="text-right"><ValueCell cell={row.kaData.cpa} /></TableCell><TableCell className="text-right"><ValueCell cell={row.platform.cpa} /></TableCell></> : <><TableCell className="text-right"><ValueCell cell={selected.spend} /></TableCell><TableCell className="text-right"><ValueCell cell={selected.cpa} /></TableCell></>}
                <TableCell className="text-right"><ValueCell cell={row.assessmentCpa} /></TableCell>
                {reconcile ? <><TableCell className="text-right"><ValueCell cell={row.comparison.delta} /></TableCell><TableCell className="text-right"><ValueCell cell={row.comparison.deltaRate} /></TableCell></> : null}
                <TableCell><Badge variant={row.status === "critical" ? "destructive" : "outline"}>{statusLabel[row.status]}</Badge></TableCell>
                <TableCell><div className="text-xs">CPA · {authorityLabel[row.authorityByMetric.cpa.defaultSource]}</div><div className="mt-1 text-xs text-muted-foreground">{row.authorityByMetric.cpa.status}</div></TableCell>
                <TableCell className="text-right"><Button asChild size="sm" variant="outline"><Link href={`/accounts/${row.accountId}?data_view=${dataView}`}>账户详情</Link></Button></TableCell>
              </TableRow>
            )})}
          </TableBody>
        </Table>
      </div>
    </section>
  )
}
