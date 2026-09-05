"use client"

import { useState } from "react"
import { IconSparkles } from "@tabler/icons-react"

import { openAgentDrawer } from "@/components/business/command/events"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import type { AnalysisRow } from "@/lib/data/contracts"
import { FullDataTable } from "./full-data-table"

// 维度透视（PRD 2.3.3）：8 维 tab。账户维现在可用；其余维随 query{dimension} 开放；资源位/出价工具两维数据源待确认。
const dimensions = [
  { id: "task", label: "任务", state: "unsupported" },
  { id: "biz", label: "业务", state: "unsupported" },
  { id: "account", label: "账户", state: "ready" },
  { id: "agent", label: "代理 / 自投", state: "unsupported" },
  { id: "placement", label: "资源位", state: "source_pending" },
  { id: "bidding", label: "出价工具", state: "source_pending" },
  { id: "ubp", label: "UBP", state: "unsupported" },
  { id: "deduction", label: "扣量区间", state: "unsupported" },
] as const

export function PivotView({ rows }: { rows: AnalysisRow[] }) {
  const [dimension, setDimension] = useState<(typeof dimensions)[number]["id"]>("account")
  const [selected, setSelected] = useState<string[]>([])
  const current = dimensions.find((item) => item.id === dimension) ?? dimensions[2]
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Tabs value={dimension} onValueChange={(value) => setDimension(value as typeof dimension)}>
          <TabsList className="flex-wrap">
            {dimensions.map((item) => <TabsTrigger key={item.id} value={item.id}>{item.label}</TabsTrigger>)}
          </TabsList>
        </Tabs>
        {current.state === "ready" ? (
          <Button variant="outline" size="sm" onClick={() => openAgentDrawer(selected.length ? `分析这 ${selected.length} 个账户的成本与量级：${selected.join("、")}` : `分析账户维度当前这 ${rows.length} 个账户的成本与量级`)}>
            <IconSparkles />{selected.length ? `分析所选 ${selected.length} 个` : `分析这 ${rows.length} 个`}
          </Button>
        ) : null}
      </div>
      {current.state === "ready" ? (
        <FullDataTable rows={rows} onSelectionChange={setSelected} />
      ) : (
        <div className="flex min-h-56 flex-col items-center justify-center gap-2 rounded-xl border border-dashed px-6 py-10 text-center">
          <Badge variant="secondary">示例</Badge>
          <div className="text-sm font-medium">{current.label} 维度{current.state === "source_pending" ? "的数据源待确认" : "尚未开放"}</div>
          <p className="max-w-md text-xs leading-5 text-muted-foreground">
            {current.state === "source_pending" ? "奇航现有接口没有这一维的字段，等数据源确认后接入；不会用猜测的数据填充。" : "该维度的透视查询接口开放后自动出现（DIMENSION_UNSUPPORTED）。异常行着色、勾选后「分析这 N 个」与账户维一致。"}
          </p>
        </div>
      )}
    </div>
  )
}
