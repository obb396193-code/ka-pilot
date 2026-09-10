"use client"

import Link from "next/link"
import { IconBook2 } from "@tabler/icons-react"

import { useSession } from "@/components/business/session/session-provider"
import { useKbByObject } from "@/lib/data/use-kb-by-object"
import { kbKindLabel, type KbObjectType } from "@/lib/fixtures/knowledge"
import { cn } from "@/lib/utils"

/**
 * 「关联的知识库文档」反查区（契约 `GET /kb/by-object/:type/:id`）。
 * 知识库文档页早就写着「关联的任务 / 账户详情里可反查到本文」，但详情页这边一处 UI 都没有——补上。
 * 一条都没有时**不占地方**（详情页信息已经很密），只在有内容时出现。
 */
export function RelatedDocs({ objectType, objectId, className }: { objectType: KbObjectType; objectId: string; className?: string }) {
  const { isMock } = useSession()
  const state = useKbByObject(objectType, objectId, isMock)
  if (state.status !== "ok" || state.items.length === 0) return null
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <p className="flex items-center gap-1.5 text-xs font-semibold">
        <IconBook2 className="size-3.5 text-muted-foreground" />
        关联文档
        <span className="font-normal text-muted-foreground tabular-nums">{state.items.length}</span>
      </p>
      <div className="flex flex-wrap gap-1.5">
        {state.items.map((item) => (
          <Link key={item.id} href={`/knowledge/${encodeURIComponent(item.id)}`} className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs hover:bg-muted">
            <span className="text-muted-foreground">{kbKindLabel[item.kind] ?? item.kind}</span>
            <span className="max-w-[220px] truncate">{item.title}</span>
          </Link>
        ))}
      </div>
    </div>
  )
}
