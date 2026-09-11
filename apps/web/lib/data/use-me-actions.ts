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
  // 整体替换 + 空数组 = 清空名单。这基本不会是人真想干的事（多半是上游算错了要替换的名单），
  // 而清空之后原名单没处找回——所以这里直接拦下，要清空得走显式的 clearWatchlist()。
  if (items.length === 0) {
    toast.error("没有更新关注名单", { description: "传入的是空名单。整体替换会清空全部关注，要清空请用名单页的「清空」。" })
    return Promise.resolve(false)
  }
  return call("/api/internal/me/watchlist", { method: "PUT", body: JSON.stringify({ items }) }, "已更新关注名单", "更新关注名单失败")
}

/** 明知故犯地清空关注名单。调用方自己负责二次确认——单独一个函数就是为了让「清空」在代码里也得写出来。 */
export function clearWatchlist(): Promise<boolean> {
  return call("/api/internal/me/watchlist", { method: "PUT", body: JSON.stringify({ items: [] }) }, "已清空关注名单", "清空关注名单失败")
}

/**
 * F8-23 任务管理：**按大类整体保存**（`POST /tasks/batch-save`）。
 *
 * 契约是**全部成功才写**：任一条失败返 400 且 `error.details.failed[]` 逐条说明，此时一条也没落库。
 * 所以失败时必须把「一条也没保存」说出来——否则用户会以为只有报错那几条没存，
 * 其余的已经进去了，回头照着改反而把对的也改坏。
 */
export type BatchSaveFailure = { taskId?: string; task_id?: string; code?: string; message?: string }

export async function saveTaskBatch(items: unknown[]): Promise<{ ok: boolean; failed: BatchSaveFailure[] }> {
  if (IS_MOCK) { toast("已保存", { description: "示例数据，改动不落库" }); return { ok: true, failed: [] } }
  try {
    const response = await fetch("/api/internal/tasks/batch-save", {
      method: "POST",
      credentials: "same-origin",
      headers: { accept: "application/json", "content-type": "application/json" },
      body: JSON.stringify({ items }),
    })
    const body = await response.json().catch(() => null)
    if (!response.ok || !body?.ok) {
      const failed = Array.isArray(body?.error?.details?.failed) ? (body.error.details.failed as BatchSaveFailure[]) : []
      toast.error("这一组一条也没保存", {
        description: failed.length
          ? `${failed.length} 条不合要求，整组回滚了：${failed.map((item) => item.message ?? item.code ?? "").filter(Boolean).slice(0, 2).join("；")}`
          : resolveErrorMessage(body?.error?.code ?? "", body?.error?.message ?? `请求失败（${response.status}）`),
      })
      return { ok: false, failed }
    }
    toast.success("已保存")
    return { ok: true, failed: [] }
  } catch {
    toast.error("这一组一条也没保存", { description: "网络异常，稍后重试" })
    return { ok: false, failed: [] }
  }
}

/** 作废某段考核价（`POST /tasks/:id/assessment-price {op:"revoke", effective_date}`）。只增不改，作废行照样留在历史里。 */
export function revokeAssessmentPrice(taskId: string, effectiveDate: string): Promise<boolean> {
  return call(
    `/api/internal/tasks/${encodeURIComponent(taskId)}/assessment-price`,
    { method: "POST", body: JSON.stringify({ op: "revoke", effective_date: effectiveDate }) },
    "已作废这一段考核价",
    "作废考核价失败",
  )
}

/** 新增一段考核价（只增不改：同一天再提交就是又一段，取值按未作废段里最近的一条）。 */
export function addAssessmentPrice(taskId: string, price: number, effectiveDate: string, evidenceUrl?: string): Promise<boolean> {
  return call(
    `/api/internal/tasks/${encodeURIComponent(taskId)}/assessment-price`,
    { method: "POST", body: JSON.stringify({ price, effective_date: effectiveDate, evidence_url: evidenceUrl || null }) },
    "已新增一段考核价",
    "新增考核价失败",
  )
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
