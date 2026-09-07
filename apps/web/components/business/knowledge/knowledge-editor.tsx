"use client"

import { useEffect, useRef, useState } from "react"
import { BlockNoteSchema, defaultInlineContentSpecs, type PartialBlock } from "@blocknote/core"
import { zh as bnZh } from "@blocknote/core/locales"
import { BlockNoteView } from "@blocknote/mantine"
import { createReactInlineContentSpec, SuggestionMenuController, useCreateBlockNote } from "@blocknote/react"
import "@blocknote/mantine/style.css"

import { businessRefHref, businessRefLabel, flattenTree, type KbDocument, type PmBlock, type PmInline } from "@/lib/fixtures/knowledge"
import { kbActions, useKnowledgeStore } from "./knowledge-store"

// 复制自 ContentRadar apps/web/components/knowledge-editor.tsx（v0.95 P2/P3 + R-031 汉化 + R-032 @ 触发）并按 KA v1.4 kb 契约改：
// - 双链内联块 wikilink {itemId,title}（id 为真相、title 只是渲染缓存）；@ 触发文档选择器，同时可 @ 业务对象（任务/账户）插 mention
// - 保存：打字停 ~500ms 整篇保存（这里落本地 store；接口接入后换 PATCH /kb/documents/:id {content_json}，后端重算 content_text/fingerprint + 解析双链重建 kb_links）
const wikilink = createReactInlineContentSpec(
  { type: "wikilink", propSchema: { itemId: { default: "" }, title: { default: "" } }, content: "none" },
  { render: (props) => <span contentEditable={false} onClick={() => { const id = props.inlineContent.props.itemId; if (id) window.dispatchEvent(new CustomEvent("kb-navigate", { detail: id })) }} className="cursor-pointer rounded bg-muted px-1 font-medium underline-offset-2 hover:underline" title="跳到该文档">{props.inlineContent.props.title || "未命名文档"}</span> },
)
const mention = createReactInlineContentSpec(
  { type: "mention", propSchema: { refType: { default: "task" }, refId: { default: "" }, label: { default: "" } }, content: "none" },
  { render: (props) => <a contentEditable={false} href={businessRefHref({ type: props.inlineContent.props.refType, id: props.inlineContent.props.refId })} className="inline-flex items-center gap-1 rounded-full border px-1.5 text-[0.85em] font-medium no-underline hover:bg-muted" title={`${businessRefLabel[props.inlineContent.props.refType] ?? props.inlineContent.props.refType} · ${props.inlineContent.props.refId}`}><span className="text-muted-foreground">@</span>{props.inlineContent.props.label || props.inlineContent.props.refId}</a> },
)
const schema = BlockNoteSchema.create({ inlineContentSpecs: { ...defaultInlineContentSpecs, wikilink, mention } })

/** 契约 content_json（ProseMirror 风格 doc）→ BlockNote 块数组；只转 heading / paragraph / 列表 + text / mention / wikilink */
function inlineOf(items: PmInline[] | undefined): unknown[] {
  return (items ?? []).map((item) => item.type === "text" ? { type: "text", text: item.text, styles: Object.fromEntries((item.marks ?? []).map((mark) => [mark.type, true])) } : item.type === "mention" ? { type: "mention", props: { refType: item.attrs.type, refId: item.attrs.id, label: item.attrs.label } } : { type: "wikilink", props: { itemId: item.attrs.id, title: item.attrs.title } })
}
export function docToBlocks(doc: KbDocument["contentJson"]): PartialBlock[] | undefined {
  if (!doc?.content?.length) return undefined
  const blocks: unknown[] = []
  const walk = (block: PmBlock) => {
    if (block.type === "heading") blocks.push({ type: "heading", props: { level: Math.min(3, Math.max(1, block.attrs.level)) }, content: inlineOf(block.content) })
    else if (block.type === "paragraph") blocks.push({ type: "paragraph", content: inlineOf(block.content) })
    else (block.content ?? []).forEach((li) => (li.content ?? []).forEach((inner) => { if (inner.type === "paragraph") blocks.push({ type: block.type === "orderedList" ? "numberedListItem" : "bulletListItem", content: inlineOf(inner.content) }) }))
  }
  doc.content.forEach(walk)
  return blocks as PartialBlock[]
}

const businessObjects = [
  { type: "task", id: "fixture-task-ready", label: "AAC 拉新" },
  { type: "task", id: "fixture-task-nocap", label: "闲鱼潜客转化" },
  { type: "account", id: "account-1", label: "AAC拉新_快手_01" },
  { type: "account", id: "account-2", label: "AAC拉新_快手_02" },
]

export function KnowledgeEditor({ doc, readOnly }: { doc: KbDocument; readOnly: boolean }) {
  const store = useKnowledgeStore()
  const localBlocks = store.blocks[doc.id] as PartialBlock[] | undefined
  const initialContent = localBlocks ?? docToBlocks(doc.contentJson)
  const editor = useCreateBlockNote({ initialContent, schema, dictionary: bnZh })
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [status, setStatus] = useState<"idle" | "saving" | "saved">("idle")
  const onChange = () => {
    if (readOnly) return
    setStatus("saving")
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => { kbActions.saveBlocks(doc.id, editor.document as unknown[]); setStatus("saved") }, 500)
  }
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])
  const allDocs = flattenTree(store.tree).filter((node) => node.id !== doc.id)

  return (
    <div>
      <div className="kp-blocknote text-[15px]">
        <BlockNoteView editor={editor} theme="light" editable={!readOnly} onChange={onChange}>
          {/* R-032：@ 触发（老板要 @ 提及）；空查询「最近编辑」优先；同一菜单混排 文档 / 任务 / 账户 */}
          <SuggestionMenuController
            triggerCharacter="@"
            getItems={async (query) => {
              const q = query.trim().toLowerCase()
              const docs = (q ? allDocs.filter((node) => node.title.toLowerCase().includes(q)) : [...allDocs].sort((a, b) => (store.docs[b.id]?.updatedAt ?? "").localeCompare(store.docs[a.id]?.updatedAt ?? ""))).slice(0, 6)
              const refs = (q ? businessObjects.filter((item) => item.label.toLowerCase().includes(q) || item.id.includes(q)) : businessObjects).slice(0, 4)
              return [
                ...docs.map((node) => ({ title: node.title, subtext: "文档 · 双链", group: "文档", onItemClick: () => editor.insertInlineContent([{ type: "wikilink", props: { itemId: node.id, title: node.title } }, " "] as never) })),
                ...refs.map((item) => ({ title: item.label, subtext: `${businessRefLabel[item.type]} · ${item.id}`, group: "业务对象", onItemClick: () => editor.insertInlineContent([{ type: "mention", props: { refType: item.type, refId: item.id, label: item.label } }, " "] as never) })),
              ]
            }}
          />
        </BlockNoteView>
      </div>
      <div className="mt-1 h-4 px-1 text-[11px] text-muted-foreground">{readOnly ? "团队空间只读" : status === "saving" ? "保存中…" : status === "saved" ? "✓ 已保存（本地示例，接口接入后同步）" : "输入 @ 插入文档双链或 @任务 / @账户"}</div>
    </div>
  )
}
