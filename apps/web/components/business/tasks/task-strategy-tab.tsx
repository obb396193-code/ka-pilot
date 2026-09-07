"use client"

import Link from "next/link"
import { IconLink, IconUnlink } from "@tabler/icons-react"
import { toast } from "sonner"

import { StatusChip, TypeChip } from "@/components/business/data-grid/data-grid"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { fmtTime, isOk } from "@/lib/fixtures/contract"
import { playbookFieldLabel, strategiesFixture, strategyStatusMeta, strategyTaskBindingFixture } from "@/lib/fixtures/v17"

// 任务详情第九页签「投放策略」（v1.7 3.11b）：已绑方案 + playbook + 与实际配置差异（actual 来自 structure 同步，未同步 = null）
export function TaskStrategyTab({ taskId }: { taskId: string }) {
  const binding = isOk(strategyTaskBindingFixture) && strategyTaskBindingFixture.data.taskId === taskId ? strategyTaskBindingFixture.data : null
  const strategy = binding && isOk(strategiesFixture) ? strategiesFixture.data.items.find((item) => item.id === binding.strategy.id) ?? null : null
  if (!binding) {
    return (
      <Card>
        <CardHeader><CardTitle>投放策略</CardTitle><CardDescription>本任务未绑定方案（fixture 只有 fixture-task-ready 的绑定）</CardDescription></CardHeader>
        <CardContent><Button asChild size="sm" variant="outline"><Link href="/data?tab=strategy&view=library"><IconLink />去方案库绑定</Link></Button></CardContent>
      </Card>
    )
  }
  const mismatch = binding.diff.filter((item) => item.match === false).length
  const unknown = binding.diff.filter((item) => item.match === null).length
  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div><CardTitle className="flex items-center gap-2">{binding.strategy.name} <span className="text-sm font-normal text-muted-foreground">v{binding.strategy.version}</span><StatusChip tone={strategyStatusMeta[binding.strategy.status].tone}>{strategyStatusMeta[binding.strategy.status].label}</StatusChip></CardTitle><CardDescription>绑定于 {fmtTime(binding.boundAt)} · 验证窗口从绑定时刻起算</CardDescription></div>
            <div className="flex gap-2"><Button asChild size="sm" variant="outline"><Link href="/data?tab=strategy&view=library">看方案详情</Link></Button><Button size="sm" variant="ghost" onClick={() => toast("已解绑", { description: `接口接入后生效（当前为示例）` })}><IconUnlink />解绑</Button></div>
          </div>
        </CardHeader>
        {strategy ? <CardContent><div className="flex flex-wrap gap-1"><TypeChip>{strategy.playbook.bid.tool} · {strategy.playbook.bid.style}</TypeChip><TypeChip>版位 {strategy.playbook.placement.join(" / ")}</TypeChip>{strategy.playbook.rta.enabled ? <TypeChip>RTA {strategy.playbook.rta.audience_packs.length} 包</TypeChip> : null}<TypeChip>冷启 {strategy.playbook.budget_rhythm.cold_start_days} 天</TypeChip><TypeChip>{strategy.playbook.account_matrix.accounts} 户 × {strategy.playbook.account_matrix.campaigns_per_account} 计划 × {strategy.playbook.account_matrix.units_per_campaign} 单元</TypeChip></div></CardContent> : null}
      </Card>
      <Card>
        <CardHeader><CardTitle>方案 vs 实际配置</CardTitle><CardDescription>diff · {mismatch} 处不一致 · {unknown} 处未同步（structure 同步后自动出现）</CardDescription></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-muted"><TableRow><TableHead>字段</TableHead><TableHead>方案</TableHead><TableHead>实际</TableHead><TableHead>一致</TableHead></TableRow></TableHeader>
            <TableBody>{binding.diff.map((row) => <TableRow key={row.field}><TableCell className="text-muted-foreground">{playbookFieldLabel[row.field] ?? row.field}</TableCell><TableCell>{row.playbook}</TableCell><TableCell>{row.actual ?? <span className="text-muted-foreground">未同步</span>}</TableCell><TableCell>{row.match === null ? <StatusChip tone="muted">未知</StatusChip> : row.match ? <StatusChip tone="success">一致</StatusChip> : <StatusChip tone="warning">不一致</StatusChip>}</TableCell></TableRow>)}</TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
