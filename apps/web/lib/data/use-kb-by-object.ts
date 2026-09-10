"use client"

import { useEffect, useState } from "react"

import { kbByObjectFixture, type KbObjectType, type KbRefRow } from "@/lib/fixtures/knowledge"
import { isOk } from "@/lib/fixtures/contract"

// 反查某个业务对象关联的知识库文档（BFF `GET /api/internal/kb/by-object/:type/:id`，be2 Q-030 透传）。
// 知识库文档页那句「关联的任务 / 账户详情里可反查到本文」原来是句空头支票——这边一处 UI 都没有。
// 无关联时后端返回 items:[] 而不是 404，所以「没有关联」走空态，不当失败。
export type KbByObjectState =
  | { status: "loading" }
  | { status: "ok"; items: KbRefRow[] }
  | { status: "error" }

export function useKbByObject(objectType: KbObjectType, objectId: string, isMock: boolean): KbByObjectState {
  const [state, setState] = useState<KbByObjectState>({ status: "loading" })

  useEffect(() => {
    if (isMock) {
      // 示例只覆盖 fixture 里那一个对象；其余对象诚实显「没有关联」，不把同一批文档到处挂
      const data = isOk(kbByObjectFixture) ? kbByObjectFixture.data : null
      const hit = data && data.objectType === objectType && data.objectId === objectId
      setState({ status: "ok", items: hit ? data.items : [] })
      return
    }
    let active = true
    setState({ status: "loading" })
    fetch(`/api/internal/kb/by-object/${encodeURIComponent(objectType)}/${encodeURIComponent(objectId)}`, {
      credentials: "same-origin", headers: { accept: "application/json" },
    })
      .then(async (response) => {
        const body = await response.json().catch(() => null)
        if (!active) return
        if (!response.ok || !body?.ok) { setState({ status: "error" }); return }
        setState({ status: "ok", items: (body.data?.items ?? []) as KbRefRow[] })
      })
      .catch(() => { if (active) setState({ status: "error" }) })
    return () => { active = false }
  }, [objectType, objectId, isMock])

  return state
}
