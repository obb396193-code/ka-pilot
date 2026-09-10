"use client"

import { useState } from "react"
import { IconBrandDingtalk, IconFileTypePdf, IconRefresh } from "@tabler/icons-react"
import { toast } from "sonner"

import { StatusChip, TypeChip } from "@/components/business/data-grid/data-grid"
import { KpiCards } from "@/components/business/workbench/kpi-cards"
import { useSession } from "@/components/business/session/session-provider"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useDailyReport, yesterdayInShanghai } from "@/lib/data/use-daily-report"
import type { DisplayMetric } from "@/lib/data/contracts"
import { fmtTime, isOk, mv, rv, schemaText } from "@/lib/fixtures/contract"
import { dailyFixture, dailyRoleLabel, type DailyDimensionRow, type DailyModule, type DailyReport, type DailyTrendPoint, dailyDeliveryMeta } from "@/lib/fixtures/reports"
import { cn } from "@/lib/utils"

// 日报 daily-report/v1（F8-13 接真后端）：13 模块 + 分角色 + 一键推钉钉 / 导出 PDF。
// 缺数三态严格分开：**有数** / **本日无数据**（后端没返回行，不用 0 代）/ **UNSUPPORTED**（源还没接上）。

/** 维度行表：各维度模块的 rows 一律是 `account.dimension/v3` 的行，共用这一张表。 */
function DimensionRows({ rows }: { rows: DailyDimensionRow[] }) {
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader className="bg-muted">
          <TableRow>
            <TableHead>维度值</TableHead>
            <TableHead className="text-right">账面消耗</TableHead>
            <TableHead className="text-right">现金消耗</TableHead>
            <TableHead className="text-right">真实转化</TableHead>
            <TableHead className="text-right">现金 CPA</TableHead>
            <TableHead className="text-right">成本空间</TableHead>
            <TableHead>达标</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.key}>
              <TableCell className="font-medium">{row.label}{row.media ? <span className="ml-1 text-xs text-muted-foreground">{row.media}</span> : null}</TableCell>
              <TableCell className="text-right tabular-nums">{mv(row.metrics.cost, "money0")}</TableCell>
              <TableCell className="text-right tabular-nums">{mv(row.metrics.cashCost, "money0")}</TableCell>
              <TableCell className="text-right tabular-nums">{mv(row.metrics.realConversion)}</TableCell>
              <TableCell className="text-right tabular-nums">{rv(row.metrics.ratios.cashCpa, "money")}</TableCell>
              <TableCell className="text-right tabular-nums">{mv(row.metrics.costSpace, "money0")}</TableCell>
              <TableCell>
                {/* onTarget 为 null = 缺数判不了，和「没达标」不是一回事 */}
                {row.assessment?.onTarget === true ? <StatusChip tone="success">达标</StatusChip>
                  : row.assessment?.onTarget === false ? <StatusChip tone="critical">未达标</StatusChip>
                  : <span className="text-muted-foreground">−</span>}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

function TrendRows({ trend }: { trend: DailyTrendPoint[] }) {
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader className="bg-muted">
          <TableRow>
            <TableHead>日期</TableHead>
            <TableHead className="text-right">账面消耗</TableHead>
            <TableHead className="text-right">现金消耗</TableHead>
            <TableHead className="text-right">真实转化</TableHead>
            <TableHead className="text-right">现金 CPA</TableHead>
            <TableHead className="text-right">点击率</TableHead>
            <TableHead className="text-right">转化率</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {trend.map((point) => (
            <TableRow key={point.ds}>
              <TableCell className="tabular-nums">{point.ds}</TableCell>
              <TableCell className="text-right tabular-nums">{mv(point.metrics.cost, "money0")}</TableCell>
              <TableCell className="text-right tabular-nums">{mv(point.metrics.cashCost, "money0")}</TableCell>
              <TableCell className="text-right tabular-nums">{mv(point.metrics.realConversion)}</TableCell>
              <TableCell className="text-right tabular-nums">{rv(point.metrics.ratios.cashCpa, "money")}</TableCell>
              <TableCell className="text-right tabular-nums">{rv(point.metrics.ratios.ctr)}</TableCell>
              <TableCell className="text-right tabular-nums">{rv(point.metrics.ratios.cvr)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

function ModuleBody({ module }: { module: DailyModule }) {
  if (module.cards) {
    const metrics: DisplayMetric[] = [
      { key: "cost", label: "账面消耗", value: mv(module.cards.cost, "money0"), delta: null, tone: "neutral" },
      { key: "cashCost", label: "现金消耗", value: mv(module.cards.cashCost, "money0"), delta: null, tone: "neutral" },
      { key: "realConversion", label: "真实转化", value: mv(module.cards.realConversion), delta: null, tone: "neutral" },
      { key: "cashCpa", label: "现金 CPA", value: rv(module.cards.cashCpa, "money"), delta: null, tone: "neutral" },
      { key: "onTargetRate", label: "达标率", value: rv(module.cards.onTargetRate), delta: null, tone: "neutral" },
      { key: "costSpace", label: "成本空间", value: mv(module.cards.costSpace, "money0"), delta: null, tone: "neutral" },
    ]
    return (
      <div className="flex flex-col gap-3">
        <KpiCards metrics={metrics} className="px-0 lg:px-0" />
        {module.anomalies?.length ? <ul className="flex flex-col gap-1 text-sm">{module.anomalies.map((item) => <li key={item} className="flex items-center gap-2"><span className={cn("size-1.5 rounded-full", item.includes("P0") ? "bg-status-critical" : "bg-status-warning")} />{item}</li>)}</ul> : <p className="text-sm text-muted-foreground">无异常</p>}
      </div>
    )
  }
  // UNSUPPORTED = 这个维度的源还没接上（出价工具映射未就绪、UBP 后端永久不出），不是「今天恰好没数」
  if (module.unsupported) return <p className="text-sm text-muted-foreground">待接源：这个维度的数据源还没接上（出价工具映射未就绪、UBP 后端不出），日报暂时不出此模块。</p>
  if (module.status) return <p className="text-sm text-muted-foreground">{module.status === "p1_pending" ? "健康度模块 P1 待接入" : module.status}</p>
  if (module.trend?.length) return <TrendRows trend={module.trend} />
  if (module.rows?.length) return <DimensionRows rows={module.rows} />
  return <p className="text-sm text-muted-foreground">本模块本日无数据（后端未返回行；不用 0 代）</p>
}

export function DailyReportView() {
  const { isMock } = useSession()
  const fixture = isOk(dailyFixture) ? dailyFixture.data : null
  const [date, setDate] = useState(() => yesterdayInShanghai())
  const [role, setRole] = useState<DailyReport["role"]>("optimizer")
  const [active, setActive] = useState<string>("")
  const remote = useDailyReport(date, role, !isMock)

  const report = isMock ? fixture : remote.status === "ok" ? remote.data : null
  const modules = report?.modules ?? []
  const current = modules.find((module) => module.key === active) ?? modules[0]

  const header = (
    <div className="flex flex-wrap items-center gap-2">
      {report ? <TypeChip>{schemaText(report.schema)}</TypeChip> : null}
      <label className="flex items-center gap-1.5 text-sm">
        <span className="text-muted-foreground">日期</span>
        <Input type="date" value={date} max={yesterdayInShanghai()} onChange={(event) => setDate(event.target.value)} className="h-8 w-36 tabular-nums" aria-label="日报日期" />
      </label>
      <Select value={role} onValueChange={(value) => setRole(value as DailyReport["role"])}>
        <SelectTrigger size="sm" className="w-32" aria-label="角色"><SelectValue /></SelectTrigger>
        <SelectContent>{(Object.keys(dailyRoleLabel) as DailyReport["role"][]).map((key) => <SelectItem key={key} value={key}>{dailyRoleLabel[key]}</SelectItem>)}</SelectContent>
      </Select>
      {report ? <span className="text-sm text-muted-foreground">数据截至 {report.dataAsOf ? fmtTime(report.dataAsOf) : "−"}</span> : null}
      {isMock && report && (role !== report.role || date !== report.date) ? <StatusChip tone="muted">示例固定为 {report.date} · {dailyRoleLabel[report.role]} 视角</StatusChip> : null}
      <div className="ml-auto flex items-center gap-2">
        {report?.delivery ? <StatusChip tone={dailyDeliveryMeta[report.delivery.status].tone}>{dailyDeliveryMeta[report.delivery.status].label}{report.delivery.at ? ` · ${fmtTime(report.delivery.at)}` : ""}{report.delivery.target ? ` · ${report.delivery.target.replace(/^dingtalk:/, "钉钉 ")}` : ""}</StatusChip> : null}
        {/* actions 双 false = 后端还没开这两个动作；置灰并说清为什么，别让人反复点 */}
        <Button size="sm" variant="outline" disabled={!report?.actions.exportPdf} title={report && !report.actions.exportPdf ? "导出 PDF 还没开放" : undefined} onClick={() => toast("已排队导出 PDF", { description: "排队后完成（签名链接有效期内下载）" })}><IconFileTypePdf />导出 PDF</Button>
        <Button size="sm" disabled={!report?.actions.pushDingtalk} title={report && !report.actions.pushDingtalk ? "钉钉推送还没开放" : undefined} onClick={() => toast.success("已推送到钉钉群", { description: "发到日报订阅的目标群" })}><IconBrandDingtalk />{report?.delivery?.status === "sent" ? "再推一次" : "一键发钉钉"}</Button>
      </div>
    </div>
  )

  if (!isMock && remote.status !== "ok") {
    return (
      <div className="flex flex-col gap-4">
        {header}
        <div className="rounded-xl border border-dashed px-3 py-10 text-center text-sm text-muted-foreground">
          {remote.status === "loading" ? `正在读取 ${date} 的日报…`
            : remote.status === "empty" ? `${date} 还没有生成日报。日报在次日凌晨随拉数任务生成，换个日期或稍后再看。`
            : remote.status === "error" ? <>读取失败：{remote.message}{remote.requestId ? <span className="ml-1 text-xs">（问题编号 {remote.requestId}）</span> : null}<div className="mt-3"><Button size="sm" variant="outline" onClick={remote.reload}><IconRefresh />重试</Button></div></>
            : "日报未就绪"}
        </div>
      </div>
    )
  }
  if (!report || !current) return null

  return (
    <div className="flex flex-col gap-4">
      {header}
      <div className="grid gap-4 @5xl/main:grid-cols-[200px_minmax(0,1fr)]">
        <nav className="flex flex-col gap-1 rounded-xl border bg-card p-2">
          {modules.map((module, index) => <button key={module.key} type="button" onClick={() => setActive(module.key)} className={cn("flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm hover:bg-muted", current.key === module.key && "bg-foreground text-background hover:bg-foreground")}><span className={cn("w-4 text-xs tabular-nums", current.key === module.key ? "text-background/70" : "text-muted-foreground")}>{index + 1}</span><span className="flex-1 truncate">{module.title}</span>{module.unsupported ? <span className="size-1.5 rounded-full bg-muted-foreground/40" title="待接源" /> : null}</button>)}
        </nav>
        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader><CardTitle>{current.title}</CardTitle><CardDescription>模块 {current.key}{current.unsupported ? " · 待接源" : ""}</CardDescription></CardHeader>
            <CardContent><ModuleBody module={current} /></CardContent>
          </Card>
          <p className="text-xs text-muted-foreground">{modules.length} 个模块按 docs/18 KA 日报规范；口径 = 考核用现金口径，缺数显 −。侧栏灰点 = 该维度待接源。</p>
        </div>
      </div>
    </div>
  )
}
