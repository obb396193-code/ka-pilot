import { useSyncExternalStore } from "react"

import { isOk } from "@/lib/fixtures/contract"
import { flattenTree, kbDocumentFixture, kbTreeFixture, type KbDocument, type KbKind, type KbTreeNode } from "@/lib/fixtures/knowledge"

// 知识库本地 mock 存储（fixture 即契约；写操作只落内存，接口接入后换 PATCH/POST，形状按 api.md 8.x）
type State = { tree: KbTreeNode[]; docs: Record<string, KbDocument>; blocks: Record<string, unknown[]> }
const seedTree = isOk(kbTreeFixture) ? structuredClone(kbTreeFixture.data.items) : []
const seedDoc = isOk(kbDocumentFixture) ? kbDocumentFixture.data : null
const seedDocs: Record<string, KbDocument> = {}
flattenTree(seedTree).forEach((node) => { seedDocs[node.id] = seedDoc && seedDoc.id === node.id ? seedDoc : { id: node.id, title: node.title, kind: node.kind, parentId: node.parentId, contentJson: null, contentText: "", documentLinks: [], businessRefs: [], revision: 1, updatedBy: { userId: "fixture", name: "示例优化师" }, updatedAt: "2026-09-05T09:00:00.000+08:00", readOnly: false } })
let state: State = { tree: seedTree, docs: seedDocs, blocks: {} }
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((listener) => listener())
const subscribe = (listener: () => void) => { listeners.add(listener); return () => listeners.delete(listener) }
const getSnapshot = () => state
export const useKnowledgeStore = () => useSyncExternalStore(subscribe, getSnapshot, getSnapshot)

let seq = 1
const now = () => new Date().toISOString()
const removeFromTree = (nodes: KbTreeNode[], id: string): { rest: KbTreeNode[]; removed: KbTreeNode | null } => {
  let removed: KbTreeNode | null = null
  const rest = nodes.filter((node) => { if (node.id === id) { removed = node; return false } return true }).map((node) => { const inner = removeFromTree(node.children ?? [], id); if (inner.removed) removed = inner.removed; return { ...node, children: inner.rest } })
  return { rest, removed }
}
const insertInto = (nodes: KbTreeNode[], parentId: string | null, child: KbTreeNode): KbTreeNode[] => parentId === null ? [...nodes, child].sort((a, b) => (a.position < b.position ? -1 : 1)) : nodes.map((node) => node.id === parentId ? { ...node, children: [...(node.children ?? []), { ...child, parentId }].sort((a, b) => (a.position < b.position ? -1 : 1)) } : { ...node, children: insertInto(node.children ?? [], parentId, child) })
const mapTree = (nodes: KbTreeNode[], fn: (node: KbTreeNode) => KbTreeNode): KbTreeNode[] => nodes.map((node) => ({ ...fn(node), children: mapTree(node.children ?? [], fn) }))

export const kbActions = {
  createDoc(parentId: string | null, kind: KbKind, title = "新文档", position = "z"): string {
    const id = `kb-local-${Date.now().toString(36)}-${seq++}`
    const node: KbTreeNode = { id, title, kind, parentId, position, children: [] }
    state = { ...state, tree: insertInto(state.tree, parentId, node), docs: { ...state.docs, [id]: { id, title, kind, parentId, contentJson: null, contentText: "", documentLinks: [], businessRefs: [], revision: 1, updatedBy: { userId: "me", name: "我" }, updatedAt: now(), readOnly: false } } }
    emit(); return id
  },
  rename(id: string, title: string) {
    state = { ...state, tree: mapTree(state.tree, (node) => node.id === id ? { ...node, title } : node), docs: { ...state.docs, [id]: { ...state.docs[id], title, revision: state.docs[id].revision + 1, updatedAt: now() } } }
    emit()
  },
  move(id: string, parentId: string | null, position: string) {
    const { rest, removed } = removeFromTree(state.tree, id)
    if (!removed) return
    state = { ...state, tree: insertInto(rest, parentId, { ...removed, parentId, position }), docs: { ...state.docs, [id]: { ...state.docs[id], parentId } } }
    emit()
  },
  remove(id: string) {
    const { rest } = removeFromTree(state.tree, id)
    const docs = { ...state.docs }; delete docs[id]
    state = { ...state, tree: rest, docs }
    emit()
  },
  saveBlocks(id: string, blocks: unknown[]) {
    const doc = state.docs[id]; if (!doc) return
    state = { ...state, blocks: { ...state.blocks, [id]: blocks }, docs: { ...state.docs, [id]: { ...doc, revision: doc.revision + 1, updatedAt: now(), updatedBy: { userId: "me", name: "我" } } } }
    emit()
  },
}
