"use client"

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { IconChevronRight, IconDotsVertical, IconFileText, IconFolder } from "@tabler/icons-react"
import { generateKeyBetween } from "fractional-indexing"
import { Tree, type MoveHandler, type NodeApi, type NodeRendererProps } from "react-arborist"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { kbKindLabel, type KbKind, type KbTreeNode } from "@/lib/fixtures/knowledge"
import { cn } from "@/lib/utils"
import { kbActions } from "./knowledge-store"

// 复制自 ContentRadar apps/web/components/knowledge-tree.tsx（v0.95 react-arborist 文档树 + R-035 乐观移动 + R-036 Radix 右键菜单 + R-071 窄屏行高）并按 KA kb 契约改：
// KA 没有独立 Category 表，树 = kb_documents 按 parent_id 嵌套（有子节点的文档当文件夹展开）；position = fractional rank 只改一行。
type TNode = { id: string; name: string; kind: KbKind; children?: TNode[]; position: string; backlinks?: number }
const toNodes = (nodes: KbTreeNode[]): TNode[] => nodes.map((node) => ({ id: node.id, name: node.title, kind: node.kind, position: node.position, children: node.children?.length ? toNodes(node.children) : undefined }))
function findNode(nodes: TNode[], id: string): TNode | null { for (const n of nodes) { if (n.id === id) return n; if (n.children) { const f = findNode(n.children, id); if (f) return f } } return null }
function rankAt(siblings: TNode[], index: number, dragIds: Set<string>): string {
  const kept = siblings.filter((s) => !dragIds.has(s.id))
  const before = kept[index - 1]?.position ?? null
  const after = kept[index]?.position ?? null
  try { return generateKeyBetween(before, after) } catch { return generateKeyBetween(null, null) }
}
// react-arborist 无内置 API 按 id 拿 node 触发 edit；模块级 registry 兜（仅用于右键改名）
const arboristNodes = new Map<string, NodeApi<TNode>>()

export function KnowledgeTree({ items, selectedId, onSelect, searchTerm, readOnly, backlinkCounts }: { items: KbTreeNode[]; selectedId: string | null; onSelect: (id: string | null) => void; searchTerm?: string; readOnly: boolean; backlinkCounts: Record<string, number> }) {
  const data = useMemo(() => { const nodes = toNodes(items); const walk = (list: TNode[]) => list.forEach((node) => { node.backlinks = backlinkCounts[node.id]; if (node.children) walk(node.children) }); walk(nodes); return nodes }, [items, backlinkCounts])
  const wrapRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 260, h: 400 })
  const [narrow, setNarrow] = useState(false)
  useEffect(() => { const mq = window.matchMedia("(max-width: 767px)"); const on = () => setNarrow(mq.matches); on(); mq.addEventListener("change", on); return () => mq.removeEventListener("change", on) }, [])
  useLayoutEffect(() => { if (!wrapRef.current) return; const el = wrapRef.current; const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight })); ro.observe(el); return () => ro.disconnect() }, [])
  const [menu, setMenu] = useState<{ x: number; y: number; node: TNode | null } | null>(null)
  const [delTarget, setDelTarget] = useState<TNode | null>(null)

  const onMove: MoveHandler<TNode> = ({ dragNodes, parentId, index }) => {
    if (readOnly) return
    const node = dragNodes[0]?.data; if (!node) return
    const siblings: TNode[] = parentId ? (findNode(data, parentId)?.children ?? []) : data
    kbActions.move(node.id, parentId, rankAt(siblings, index, new Set(dragNodes.map((n) => n.id))))
  }
  const newDoc = (parentId: string | null, kind: KbKind = "manual") => { const id = kbActions.createDoc(parentId, kind); onSelect(id); toast("已建文档", { description: "POST /kb/documents {title, parent_id, kind}" }); let tries = 0; const tryEdit = () => { const n = arboristNodes.get(id); if (n) { n.edit(); return } if (tries++ < 25) setTimeout(tryEdit, 100) }; setTimeout(tryEdit, 200) }

  return (
    <div ref={wrapRef} className="min-h-0 flex-1" onContextMenu={(e) => { if (readOnly) return; e.preventDefault(); setMenu({ x: e.clientX, y: e.clientY, node: null }) }}>
      <Tree<TNode>
        data={data} width={size.w} height={size.h} rowHeight={narrow ? 44 : 30} indent={16}
        openByDefault searchTerm={searchTerm}
        selection={selectedId ?? undefined}
        onMove={onMove}
        onRename={({ node, name }) => { if (name.trim() && name !== node.data.name) { kbActions.rename(node.data.id, name.trim()); toast("已改名", { description: "PATCH /kb/documents/:id {title}" }) } }}
        disableEdit={readOnly} disableDrag={readOnly} disableDrop={readOnly}
      >
        {(props) => <TreeRow {...props} onSelect={onSelect} onMenu={(x, y, n) => { if (!readOnly) setMenu({ x, y, node: n }) }} />}
      </Tree>
      {menu ? (
        <DropdownMenu open onOpenChange={(open) => { if (!open) setMenu(null) }}>
          <DropdownMenuTrigger asChild><span aria-hidden style={{ position: "fixed", left: menu.x, top: menu.y, width: 0, height: 0 }} /></DropdownMenuTrigger>
          <DropdownMenuContent align="start" sideOffset={2} collisionPadding={8} loop onCloseAutoFocus={(e) => e.preventDefault()}>
            <DropdownMenuItem onSelect={() => newDoc(menu.node?.id ?? null, "manual")}>新建笔记{menu.node ? "（子文档）" : ""}</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => newDoc(menu.node?.id ?? null, "sop")}>新建 SOP</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => newDoc(menu.node?.id ?? null, "case")}>新建案例</DropdownMenuItem>
            {menu.node ? (<><DropdownMenuSeparator /><DropdownMenuItem onSelect={() => arboristNodes.get(menu.node!.id)?.edit()}>重命名</DropdownMenuItem><DropdownMenuItem variant="destructive" onSelect={() => setDelTarget(menu.node)}>删除</DropdownMenuItem></>) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
      <Dialog open={!!delTarget} onOpenChange={(open) => { if (!open) setDelTarget(null) }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>{delTarget?.children?.length ? "不能删除" : "删除文档"}</DialogTitle><DialogDescription>{delTarget?.children?.length ? `「${delTarget.name}」下还有 ${delTarget.children.length} 个子文档，先把它们拖到别处再删。` : `删除「${delTarget?.name}」？软删（DELETE /kb/documents/:id），修订历史保留。`}</DialogDescription></DialogHeader>
          <DialogFooter><Button variant="outline" onClick={() => setDelTarget(null)}>取消</Button><Button variant="destructive" disabled={!!delTarget?.children?.length} onClick={() => { if (delTarget) { kbActions.remove(delTarget.id); if (selectedId === delTarget.id) onSelect(null); toast("已删除") } setDelTarget(null) }}>删除</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function TreeRow({ node, style, dragHandle, onSelect, onMenu }: NodeRendererProps<TNode> & { onSelect: (id: string | null) => void; onMenu: (x: number, y: number, n: TNode) => void }) {
  arboristNodes.set(node.id, node)
  const d = node.data
  const hasChildren = (d.children?.length ?? 0) > 0
  return (
    <div ref={dragHandle} style={style} onClick={() => onSelect(d.id)} onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); onMenu(e.clientX, e.clientY, d) }} className={cn("group flex h-full cursor-pointer items-center gap-1.5 rounded-md pr-1 text-[12.5px]", node.isSelected ? "bg-foreground font-medium text-background" : "hover:bg-muted")}>
      {hasChildren ? <button type="button" onClick={(e) => { e.stopPropagation(); node.toggle() }} aria-label={node.isOpen ? "收起" : "展开"} className="grid size-5 shrink-0 place-items-center rounded hover:bg-muted"><IconChevronRight className={cn("size-3 transition-transform", node.isOpen && "rotate-90")} /></button> : <span className="w-5 shrink-0" />}
      {hasChildren ? <IconFolder className={cn("size-3.5 shrink-0", node.isSelected ? "text-background/80" : "text-muted-foreground")} /> : <IconFileText className={cn("size-3.5 shrink-0", node.isSelected ? "text-background/80" : "text-muted-foreground")} />}
      {node.isEditing ? (
        <input autoFocus defaultValue={d.name} onClick={(e) => e.stopPropagation()} onBlur={(e) => node.submit(e.currentTarget.value)} onKeyDown={(e) => { if (e.key === "Enter") node.submit(e.currentTarget.value); if (e.key === "Escape") node.reset() }} className="h-6 min-w-0 flex-1 rounded border bg-background px-1 text-[12.5px] text-foreground outline-none" />
      ) : <span className="flex-1 truncate">{d.name}</span>}
      <span className={cn("shrink-0 text-[10px]", node.isSelected ? "text-background/70" : "text-muted-foreground")}>{kbKindLabel[d.kind]}</span>
      {(d.backlinks ?? 0) > 0 ? <span className={cn("shrink-0 text-[10px] tabular-nums", node.isSelected ? "text-background/70" : "text-muted-foreground")} title="反链数">⇠{d.backlinks}</span> : null}
      {!node.isEditing ? <button type="button" onClick={(e) => { e.stopPropagation(); const r = e.currentTarget.getBoundingClientRect(); onMenu(Math.min(r.right, window.innerWidth - 160), r.bottom + 2, d) }} onContextMenu={(e) => e.stopPropagation()} aria-label="更多操作" className={cn("grid size-6 shrink-0 place-items-center rounded opacity-0 group-hover:opacity-100 focus-visible:opacity-100", node.isSelected ? "text-background hover:bg-background/20" : "text-muted-foreground hover:bg-muted")}><IconDotsVertical className="size-3.5" /></button> : null}
    </div>
  )
}
