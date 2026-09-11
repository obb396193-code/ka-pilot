"use client"

import { toast } from "sonner"

import { resolveErrorMessage } from "@/lib/data/contracts"

// 「未开放入口清单」第 0 批：这几条的 BFF 早就在 main，只是页面还挂着占位 toast。
// 统一放这里，各页面只管调——别每处再抄一遍 fetch + 错误翻译。

const IS_MOCK = process.env.NEXT_PUBLIC_KA_DATA_PROVIDER === "mock"

async function call(path: string, init: RequestInit, okText: string, failText: string): Promise<boolean> {
  if (IS_MOCK) { toast(okText, { description: "示例数据，改动不落库" }); return true }
  try {
    const response = await fetch(path, {
      credentials: "same-origin",
      ...init,
      headers: { accept: "application/json", ...(init.body ? { "content-type": "application/json" } : {}), ...init.headers },
    })
    const body = await response.json().catch(() => null)
    if (!response.ok || !body?.ok) {
      toast.error(failText, { description: resolveErrorMessage(body?.error?.code ?? "", body?.error?.message ?? `请求失败（${response.status}）`) })
      return false
    }
    toast.success(okText)
    return true
  } catch {
    toast.error(failText, { description: "网络异常，稍后重试" })
    return false
  }
}

/**
 * 盯盘名单整体替换（`PUT /me/watchlist`）。
 * ★契约是**整体替换**不是增删单条，所以调用方必须把**替换后的完整名单**传进来；
 * 只传要删的那条会把名单清空。
 */
export function saveWatchlist(items: unknown[]): Promise<boolean> {
  return call("/api/internal/me/watchlist", { method: "PUT", body: JSON.stringify({ items }) }, "已更新关注名单", "更新关注名单失败")
}

/** 人工勾就绪（`PUT /tasks/:id/readiness/:dimension`）。note 让人写明凭什么勾——审计要看 */
export function markReadiness(taskId: string, dimension: string, ready: boolean, note?: string): Promise<boolean> {
  return call(
    `/api/internal/tasks/${encodeURIComponent(taskId)}/readiness/${encodeURIComponent(dimension)}`,
    { method: "PUT", body: JSON.stringify({ ready, note: note ?? null }) },
    ready ? "已勾为就绪" : "已取消就绪",
    "标记就绪失败",
  )
}
