"use client"

import { useState } from "react"
import { IconAlertCircle, IconDatabaseOff } from "@tabler/icons-react"

import { PageBody, PageHeader } from "@/components/business/page-header"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import type { QueryRecord } from "@/lib/data/data-view"
import { TasksTable } from "./tasks-table"
import { useTaskList, type TaskListState, type TaskStatusFilter } from "./use-task-list"

function first(value: string | string[] | undefined) { return Array.isArray(value) ? value[0] : value }
const stateLabel: Record<string, string> = { ready: "ready · 正常", empty: "empty · 空", partial: "partial · 部分", stale: "stale · 过期", "401": "401 未登录", "403": "403 无权限", "400": "400 请求错误", "502": "502 上游异常", "503": "503 不可用", "504": "504 超时", "500": "500 内部错误" }

// 投放任务列表：TASK-LIST-001 四态（ready / empty / partial / stale）+ 错误信封；mock 下右上角可切态自查
export function TasksContainer({ query }: { query: QueryRecord }) {
  const [status, setStatus] = useState<TaskStatusFilter>("all")
  const [state, setState] = useState<TaskListState>((first(query.state) as TaskListState) ?? "ready")
  const { response, items, loading, isMock } = useTaskList({ status, state })
  const meta = response?.ok ? response.meta : null

  return (
    <PageBody>
      <PageHeader
        title="投放任务"
        description={meta ? `报告日 ${meta.businessDate} · 来源 ${meta.selectedSource === "qihang" ? "奇航" : meta.selectedSource} · 达成率与 pacing 由后端计算` : "任务卡片流：达标状态与 pacing"}
        isMock={isMock}
        actions={isMock ? (
          <Select value={state} onValueChange={(value) => setState(value as TaskListState)}>
            <SelectTrigger size="sm" className="w-40" aria-label="Mock 状态"><SelectValue /></SelectTrigger>
            <SelectContent>{Object.entries(stateLabel).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent>
          </Select>
        ) : null}
      />
      <div className="flex flex-col gap-4 px-4 lg:px-6">
        {loading ? (
          <div className="grid gap-3"><Skeleton className="h-9 w-72" /><Skeleton className="h-64 w-full" /></div>
        ) : response && !response.ok ? (
          <Card role="alert" className="border-dashed">
            <CardContent className="flex min-h-48 flex-col items-center justify-center gap-2 text-center">
              <span className="rounded-full bg-muted p-3"><IconAlertCircle className="size-6 text-muted-foreground" /></span>
              <div className="text-base font-medium">{response.error.code === "UNAUTHORIZED" ? "登录态已失效" : response.error.code === "FORBIDDEN" ? "当前身份无权查看任务" : "任务列表读取失败"}</div>
              <p className="max-w-md text-sm text-muted-foreground">{response.error.message}</p>
              <p className="font-mono text-xs text-muted-foreground">{response.error.code} · requestId {response.error.requestId}{response.error.retryable ? " · 可重试" : ""}</p>
            </CardContent>
          </Card>
        ) : (
          <>
            {meta?.dataState === "partial" || meta?.dataState === "stale" ? (
              <div role="alert" className="flex items-start gap-2 rounded-lg border border-status-warning/35 bg-status-warning/8 px-4 py-3 text-sm">
                <IconAlertCircle className="mt-0.5 size-4 shrink-0 text-status-warning" />
                <span>{meta.dataState === "partial" ? "覆盖不完整：只展示已返回的任务，不做全量结论，执行入口置灰。" : "业务日数据未到：展示的是上一次同步结果，pacing 可能滞后。"}{meta.dataAsOf ? ` 数据截至 ${meta.dataAsOf.slice(0, 16).replace("T", " ")}` : ""}</span>
              </div>
            ) : null}
            {meta?.dataState === "empty" ? (
              <Card className="border-dashed">
                <CardContent className="flex min-h-48 flex-col items-center justify-center gap-2 text-center">
                  <span className="rounded-full bg-muted p-3"><IconDatabaseOff className="size-6 text-muted-foreground" /></span>
                  <div className="text-base font-medium">当前范围内没有任务</div>
                  <p className="max-w-md text-sm text-muted-foreground">任务由运营在创建接口开放后新建；个人空间只看本人授权账户挂载的任务。</p>
                </CardContent>
              </Card>
            ) : (
              <TasksTable items={items} status={status} onStatusChange={setStatus} />
            )}
            {meta ? <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground"><Badge variant="outline">{meta.dataState}</Badge><span>覆盖{meta.coverage.complete ? "完整" : "不完整"}</span><span className="font-mono">requestId {meta.requestId}</span></div> : null}
          </>
        )}
      </div>
    </PageBody>
  )
}
