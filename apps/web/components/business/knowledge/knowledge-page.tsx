"use client"

import { useEffect, useMemo, useState } from "react"
import dynamic from "next/dynamic"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { IconArrowLeft, IconPlus, IconSearch, IconSparkles } from "@tabler/icons-react"
import { toast } from "sonner"

import { openAgentDrawer } from "@/components/business/command/events"
import { StatusChip, TypeChip } from "@/components/business/data-grid/data-grid"
import { PageBody, PageHeader } from "@/components/business/page-header"
import { useSession } from "@/components/business/session/session-provider"
import { LoadingBlock, StateFrame, StateSwitch, usePageState } from "@/components/business/state/page-state"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { fmtTime, isOk } from "@/lib/fixtures/contract"
import { businessRefHref, businessRefLabel, flattenTree, kbKindLabel, kbSearchFixture } from "@/lib/fixtures/knowledge"
import { cn } from "@/lib/utils"
import { kbActions, useKnowledgeStore } from "./knowledge-store"

// BlockNote / react-arborist 依赖 DOM：关 SSR（ContentRadar 里编辑器只在 react-query 拿到数据后才挂载，天然不 SSR；这里 fixture 同步可得，须显式 ssr:false）
const KnowledgeEditor = dynamic(() => import("./knowledge-editor").then((m) => m.KnowledgeEditor), { ssr: false, loading: () => <LoadingBlock /> })
const KnowledgeTree = dynamic(() => import("./knowledge-tree").then((m) => m.KnowledgeTree), { ssr: false, loading: () => <LoadingBlock /> })

// 复制自 ContentRadar apps/web/app/knowledge/page.tsx（v0.95 可编辑化：左树右文、R-071 窄屏 master-detail、?sel 同步）并按 KA 改：
// 选中 ↔ URL = /knowledge/[id]；kind = SOP / AI 报告归档 / 案例库 / 错题本（笔记）；团队空间只读；搜索 = FTS（kb/search，非 LLM）
export function KnowledgePage({ initialId = null }: { initialId?: string | null }) {
  const { isMock, session } = useSession()
  const state = usePageState()
  const router = useRouter()
  const pathname = usePathname()
  const store = useKnowledgeStore()
  const [selId, setSelId] = useState<string | null>(initialId)
  const [search, setSearch] = useState("")
  const readOnly = session?.activeWorkspace.kind === "team"
  const doc = selId ? store.docs[selId] ?? null : null
  const allNodes = useMemo(() => flattenTree(store.tree), [store.tree])
  const backlinkCounts = useMemo(() => { const counts: Record<string, number> = {}; Object.values(store.docs).forEach((item) => item.documentLinks.forEach((link) => { counts[link.toId] = (counts[link.toId] ?? 0) + 1 })); return counts }, [store.docs])
  const backlinks = useMemo(() => (selId ? Object.values(store.docs).filter((item) => item.documentLinks.some((link) => link.toId === selId)) : []), [store.docs, selId])
  const q = search.trim().toLowerCase()
  const hits = useMemo(() => { if (!q) return []; const local = Object.values(store.docs).filter((item) => item.title.toLowerCase().includes(q) || item.contentText.toLowerCase().includes(q)).map((item) => ({ id: item.id, title: item.title, kind: item.kind, snippet: item.contentText ? item.contentText.slice(0, 60) + (item.contentText.length > 60 ? "…" : "") : "（无正文）", score: null as number | null })); const fixture = isOk(kbSearchFixture) ? kbSearchFixture.data.items.filter((hit) => hit.title.toLowerCase().includes(q) && !local.some((item) => item.id === hit.id)) : []; return [...local, ...fixture] }, [q, store.docs])

  // 编辑器里点双链派 kb-navigate → 切文档
  useEffect(() => { const h = (e: Event) => { const id = (e as CustomEvent).detail; if (typeof id === "string") setSelId(id) }; window.addEventListener("kb-navigate", h); return () => window.removeEventListener("kb-navigate", h) }, [])
  // 选中 ↔ URL 同步（/knowledge/[id]；replace 不堆历史）
  useEffect(() => { const target = selId ? `/knowledge/${encodeURIComponent(selId)}` : "/knowledge"; if (pathname !== target) router.replace(target, { scroll: false }) }, [selId, pathname, router])

  return (
    <PageBody>
      <PageHeader title="知识库" description={<span>SOP · AI 报告归档 · 案例库 · 错题本；富文本编辑，输入 <code className="rounded bg-muted px-1">@</code> 插入文档双链或业务对象；双链解析在后端保存时重建</span>} isMock={isMock} actions={<><StateSwitch />{readOnly ? <StatusChip tone="muted">团队空间只读</StatusChip> : null}<Button variant="outline" size="sm" onClick={() => openAgentDrawer(doc ? `把文档「${doc.title}」归纳成三句话，并列出关联任务` : "把今天的日报归档到知识库")}><IconSparkles />问 AI</Button><Button size="sm" disabled={readOnly} onClick={() => { const id = kbActions.createDoc(null, "manual", "新文档"); setSelId(id); toast("已建文档", { description: "接口接入后生效（当前为示例）" }) }}><IconPlus />新建文档</Button></>} />
      <div className="px-4 lg:px-6">
        <StateFrame state={state} unlock="知识库接口（文档 / 搜索 / 修订 / 双链 / 业务关联）接入后切换为真数据" empty={{ title: "知识库还是空的", description: "新建文档，或从报告页把日报归档进来。" }}>
          <div className="grid min-h-[640px] gap-0 rounded-xl border bg-card @3xl/main:grid-cols-[280px_minmax(0,1fr)]">
            <div className={cn("flex min-h-0 flex-col border-b p-3 @3xl/main:border-r @3xl/main:border-b-0", doc ? "hidden @3xl/main:flex" : "flex")}>
              <div className="relative mb-2 shrink-0"><IconSearch className="absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" /><Input value={search} onChange={(e) => setSearch(e.target.value)} aria-label="搜文档" placeholder="搜文档（FTS，非 LLM）" className="h-8 pl-8 text-xs" /></div>
              {q ? (
                <div className="flex flex-col gap-1 overflow-auto">{hits.length ? hits.map((hit) => <button key={hit.id} type="button" onClick={() => { setSelId(hit.id); setSearch("") }} className="rounded-md px-2 py-1.5 text-left hover:bg-muted"><span className="flex items-center gap-2 text-sm font-medium">{hit.title}<TypeChip className="text-[10px]">{kbKindLabel[hit.kind]}</TypeChip>{hit.score !== null ? <span className="ml-auto text-[10px] text-muted-foreground tabular-nums">{hit.score.toFixed(2)}</span> : null}</span><span className="block truncate text-xs text-muted-foreground">{hit.snippet}</span></button>) : <p className="px-2 py-6 text-center text-xs text-muted-foreground">没有匹配「{search}」的文档</p>}</div>
              ) : allNodes.length ? (
                <KnowledgeTree items={store.tree} selectedId={selId} onSelect={setSelId} readOnly={readOnly} backlinkCounts={backlinkCounts} />
              ) : (
                <p className="px-2 py-10 text-center text-xs text-muted-foreground">还没有内容<br />右键新建，或上方「新建文档」</p>
              )}
              <p className="shrink-0 pt-2 text-[10.5px] leading-relaxed text-muted-foreground">拖拽 = 移动 / 排序（position 只改一行）· 右键 = 新建 / 改名 / 删</p>
            </div>
            <div className={cn("overflow-auto px-4 py-4 @3xl/main:px-10", doc ? "" : "hidden @3xl/main:block")}>
              {!doc ? (
                <div className="grid h-full place-items-center text-center text-sm text-muted-foreground"><div><p className="mb-1 font-medium text-foreground">选一篇文档</p><p>左侧树里点文档看正文；拖拽移动、右键新建。<br /><span className="text-xs">富文本编辑，输入 <code className="rounded bg-muted px-1">@</code> 插入双链。</span></p></div></div>
              ) : (
                <div className="mx-auto max-w-[760px] pb-16">
                  <Button variant="ghost" size="sm" className="-ml-2 mb-2 @3xl/main:hidden" onClick={() => setSelId(null)}><IconArrowLeft />文档树</Button>
                  <div className="mb-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground"><TypeChip>{kbKindLabel[doc.kind]}</TypeChip><span>修订 v{doc.revision}</span><span>·</span><span>{doc.updatedBy.name} {fmtTime(doc.updatedAt)}</span>{doc.readOnly || readOnly ? <StatusChip tone="muted">只读</StatusChip> : null}</div>
                  <h2 className="mb-3 text-[21px] font-bold tracking-tight">{doc.title}</h2>
                  <KnowledgeEditor key={doc.id} doc={doc} readOnly={readOnly || doc.readOnly} />
                  {doc.businessRefs.length ? <div className="mt-7 border-t pt-4"><p className="mb-2 text-xs font-semibold">关联业务对象 <span className="font-normal text-muted-foreground tabular-nums">{doc.businessRefs.length}</span></p><div className="flex flex-wrap gap-2">{doc.businessRefs.map((ref) => <Link key={`${ref.type}-${ref.id}`} href={businessRefHref(ref)} className="inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs hover:bg-muted"><span className="text-muted-foreground">{businessRefLabel[ref.type] ?? ref.type}</span>{ref.id}</Link>)}</div><p className="mt-1 text-[11px] text-muted-foreground">关联的任务 / 账户详情里可反查到本文</p></div> : null}
                  {doc.documentLinks.length ? <div className="mt-7 border-t pt-4"><p className="mb-2 text-xs font-semibold">出链 <span className="font-normal text-muted-foreground tabular-nums">{doc.documentLinks.length}</span></p><div className="flex flex-col gap-0.5">{doc.documentLinks.map((link) => <button key={link.toId} type="button" onClick={() => setSelId(link.toId)} className="rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted">→ {link.label}</button>)}</div></div> : null}
                  {backlinks.length ? <div className="mt-7 border-t pt-4"><p className="mb-2 text-xs font-semibold">反链 · 引用本文的文档 <span className="font-normal text-muted-foreground tabular-nums">{backlinks.length}</span></p><div className="flex flex-col gap-0.5">{backlinks.map((item) => <button key={item.id} type="button" onClick={() => setSelId(item.id)} className="rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted">⇠ {item.title}</button>)}</div></div> : null}
                  {!doc.contentJson && !store.blocks[doc.id] ? <p className="mt-6 text-xs text-muted-foreground">该文档只有目录节点、没有正文（kb/document.json 只给了「新任务开户到基建 SOP」）；可直接编辑，保存落本地。</p> : null}
                </div>
              )}
            </div>
          </div>
        </StateFrame>
      </div>
    </PageBody>
  )
}
