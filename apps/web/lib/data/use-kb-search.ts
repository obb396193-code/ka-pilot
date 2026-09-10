"use client"

import { useEffect, useState } from "react"

import { kbFetchBacklinks, kbSearch } from "@/lib/data/kb-client"
import type { KbSearchHit } from "@/lib/fixtures/knowledge"

// F8-16：真实模式的知识库搜索走后端 FTS（`GET /kb/search?q=`），不是前端在内存里筛——
// 内存里只有已经拉过正文的那几篇，用它搜等于漏掉大半个库。
// 300ms 防抖：搜索框是边打边搜，不防抖等于每个字母一次请求。
export function useKbSearch(query: string, isMock: boolean): KbSearchHit[] {
  const [hits, setHits] = useState<KbSearchHit[]>([])

  useEffect(() => {
    if (isMock || query.length === 0) { setHits([]); return }
    let active = true
    const timer = setTimeout(() => {
      kbSearch(query)
        .then((data) => { if (active) setHits(data.items) })
        // 搜不出来就当没结果，不打断打字
        .catch(() => { if (active) setHits([]) })
    }, 300)
    return () => { active = false; clearTimeout(timer) }
  }, [query, isMock])

  return hits
}

// 反链：真实模式走 `GET /kb/documents/:id/backlinks`。
// mock 下仍从本地 store 里按 documentLinks 反推（页面自己算），这里不介入。
export function useKbBacklinks(documentId: string | null, isMock: boolean): { id: string; title: string }[] {
  const [items, setItems] = useState<{ id: string; title: string }[]>([])

  useEffect(() => {
    if (isMock || !documentId) { setItems([]); return }
    let active = true
    kbFetchBacklinks(documentId)
      .then((data) => { if (active) setItems(data.items) })
      // 反链读不到就不显示这一块，不打断读文档
      .catch(() => { if (active) setItems([]) })
    return () => { active = false }
  }, [documentId, isMock])

  return items
}
