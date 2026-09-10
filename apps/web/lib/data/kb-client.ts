"use client"

import { resolveErrorMessage } from "@/lib/data/contracts"
import type { KbDocument, KbKind, KbSearchHit, KbTreeNode } from "@/lib/fixtures/knowledge"

// F8-16：知识库接真接口（BFF `/api/internal/kb/*`，be2 Q-030 透传，契约 api.md 8.x）。
// 这一层只做「发请求 + 把错误翻成人话」，不碰状态；状态在 knowledge-store。
// 写操作对访客会被后端 403 READ_ONLY_ROLE —— 按老板 v1.9.17 的口径**按钮照常显示照常可点**，
// 失败了用固定文案解释，不靠藏按钮把人挡在门外。

export class KbError extends Error {
  constructor(message: string, readonly code: string, readonly status: number, readonly requestId: string | null) {
    super(message)
    this.name = "KbError"
  }
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/internal/kb${path}`, {
    credentials: "same-origin",
    ...init,
    headers: { accept: "application/json", ...(init?.body ? { "content-type": "application/json" } : {}), ...init?.headers },
  })
  const body = await response.json().catch(() => null)
  if (!response.ok || !body?.ok) {
    const code = body?.error?.code ?? ""
    throw new KbError(
      resolveErrorMessage(code, body?.error?.message ?? `请求失败（${response.status}）`),
      code, response.status, body?.error?.requestId ?? null,
    )
  }
  return body.data as T
}

/** 整棵树（不带 parent_id）。契约 F-Q027-1：与 etl-runs 同形 {items,page,pageSize,total} */
export const kbFetchTree = () => call<{ items: KbTreeNode[]; page: number; pageSize: number; total: number }>("/documents")
export const kbFetchDoc = (id: string) => call<KbDocument>(`/documents/${encodeURIComponent(id)}`)
export const kbFetchBacklinks = (id: string) => call<{ items: { id: string; title: string; kind: KbKind }[] }>(`/documents/${encodeURIComponent(id)}/backlinks`)
export const kbSearch = (q: string) => call<{ items: KbSearchHit[] }>(`/search?q=${encodeURIComponent(q)}`)

/** 建文档回单篇（不是树），所以建完要么把它并进本地树、要么重拉树 */
export const kbCreateDoc = (input: { title: string; kind: KbKind; parent_id?: string | null }) =>
  call<KbDocument>("/documents", { method: "POST", body: JSON.stringify(input) })

/** 改标题 / 挪位置 / 存正文都走这一条；后端据此写 revision、重算 content_text、重建双链 */
export const kbPatchDoc = (id: string, patch: { title?: string; parent_id?: string | null; position?: string; content_json?: unknown }) =>
  call<KbDocument>(`/documents/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(patch) })

/** 软删：行还在，只置 deleted_at；列表/搜索/反查默认过滤，再 GET 会 404 */
export const kbDeleteDoc = (id: string) => call<{ deletedAt: string }>(`/documents/${encodeURIComponent(id)}`, { method: "DELETE" })
