"use client"

import { useEffect, useState } from "react"

import { toast } from "sonner"

import { resolveErrorMessage } from "@/lib/data/contracts"
import { normalizeEtlRun, type EtlRun } from "@/lib/fixtures/admin"

// F8-15 ①：拉数记录接真后端（BFF `GET /api/internal/system/etl-runs`，契约 v1.9.12 分页形）。
// mock 模式不请求，页面照旧用 fixture。
export type EtlRunsState =
  | { status: "loading" }
  | { status: "ok"; items: EtlRun[]; total: number }
  | { status: "error"; message: string; requestId: string | null }

export function useEtlRuns(enabled: boolean, pageSize = 50): EtlRunsState {
  const [state, setState] = useState<EtlRunsState>({ status: "loading" })

  useEffect(() => {
    if (!enabled) return
    let active = true
    setState({ status: "loading" })
    fetch(`/api/internal/system/etl-runs?page=1&pageSize=${pageSize}`, { credentials: "same-origin", headers: { accept: "application/json" } })
      .then(async (response) => {
        const body = await response.json().catch(() => null)
        if (!active) return
        if (!response.ok || !body?.ok) {
          setState({ status: "error", message: resolveErrorMessage(body?.error?.code ?? "", body?.error?.message ?? `请求失败（${response.status}）`), requestId: body?.error?.requestId ?? null })
          return
        }
        // warnings 两种形状并存（旧的纯字符串码 / 新的 {code,message}），归一后再进表，否则 React 渲染对象会整页崩
        setState({ status: "ok", items: (body.data?.items ?? []).map(normalizeEtlRun), total: body.data?.total ?? 0 })
      })
      .catch((cause: unknown) => {
        if (!active) return
        setState({ status: "error", message: cause instanceof Error ? cause.message : "网络异常", requestId: null })
      })
    return () => { active = false }
  }, [enabled, pageSize])

  return state
}

/**
 * 重跑一次拉数。返回是否成功——失败原因已经 toast 过，调用方只需要知道要不要刷新列表。
 * 409 撞车时**指出那个已经在跑的 job**（`details.jobId`），而不是让人一直点。
 */
export async function rerunEtlRun(runId: string): Promise<boolean> {
  try {
    const response = await fetch(`/api/internal/system/etl-runs/${encodeURIComponent(runId)}/rerun`, {
      method: "POST", credentials: "same-origin", headers: { accept: "application/json" },
    })
    const body = await response.json().catch(() => null)
    if (response.status === 409) {
      const jobId = (body?.error?.details as { jobId?: string } | undefined)?.jobId
      toast("这次拉数已经在重跑了", { description: jobId ? `已有任务 ${jobId} 在排队或运行中，等它跑完再看` : "已有一次重跑在排队或运行中" })
      return false
    }
    if (!response.ok || !body?.ok) {
      toast.error("重跑失败", { description: resolveErrorMessage(body?.error?.code ?? "", body?.error?.message ?? `请求失败（${response.status}）`) })
      return false
    }
    // 202 = 排队了，不是跑完了——文案不能说「已重跑」
    toast.success("已排队重跑", { description: `任务 ${body.data.jobId}；跑完后这张表会出现新的一次 attempt` })
    return true
  } catch {
    toast.error("重跑失败", { description: "网络异常，稍后重试" })
    return false
  }
}
