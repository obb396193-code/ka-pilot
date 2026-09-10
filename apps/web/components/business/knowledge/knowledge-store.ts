import { useSyncExternalStore } from "react"
import { toast } from "sonner"

import { KbError, kbCreateDoc, kbDeleteDoc, kbFetchDoc, kbFetchTree, kbPatchDoc } from "@/lib/data/kb-client"
import { isOk } from "@/lib/fixtures/contract"
import { flattenTree, kbDocumentFixture, kbTreeFixture, type KbDocument, type KbKind, type KbTreeNode } from "@/lib/fixtures/knowledge"

/**
 * 知识库状态。**同一份状态、两个来源**：
 * - mock（`NEXT_PUBLIC_KA_DATA_PROVIDER=mock`）：从 fixture 种子起步，写操作只落内存；
 * - 真实：`hydrate()` 从 BFF 拉树，写操作先本地乐观更新、再打接口，**失败整颗回滚并说明原因**。
 *
 * 乐观更新是有意的：树的拖拽/改名如果等一个来回，手感会很糟。代价是失败要回滚——
 * 所以每个写动作都先把旧状态存下来，失败时原样放回去，不留「界面变了但库没变」的假象。
 * 访客（viewer）的写会被后端 403 READ_ONLY_ROLE，回滚 + 固定文案，按钮不藏（老板 v1.9.17）。
 */
type State = { tree: KbTreeNode[]; docs: Record<string, KbDocument>; blocks: Record<string, unknown[]>; status: "idle" | "loading" | "ready" | "error"; error: string | null }
const seedTree = isOk(kbTreeFixture) ? structuredClone(kbTreeFixture.data.items) : []
const seedDoc = isOk(kbDocumentFixture) ? kbDocumentFixture.data : null
const seedDocs: Record<string, KbDocument> = {}
flattenTree(seedTree).forEach((node) => { seedDocs[node.id] = seedDoc && seedDoc.id === node.id ? seedDoc : { id: node.id, title: node.title, kind: node.kind, parentId: node.parentId, contentJson: null, contentText: "", documentLinks: [], businessRefs: [], revision: 1, updatedBy: { userId: "fixture", name: "示例优化师" }, updatedAt: "2026-09-05T09:00:00.000+08:00", readOnly: false } })
const isMock = process.env.NEXT_PUBLIC_KA_DATA_PROVIDER === "mock"
let state: State = isMock
  ? { tree: seedTree, docs: seedDocs, blocks: {}, status: "ready", error: null }
  : { tree: [], docs: {}, blocks: {}, status: "idle", error: null }
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

/** 失败时把整颗状态放回去——不留「界面变了但库没变」的假象 */
async function commit(before: State, action: () => Promise<void>, what: string): Promise<boolean> {
  if (isMock) return true
  try {
    await action()
    return true
  } catch (cause) {
    state = before
    emit()
    const message = cause instanceof KbError ? cause.message : "网络异常，稍后重试"
    const requestId = cause instanceof KbError ? cause.requestId : null
    toast.error(`${what}失败`, { description: requestId ? `${message}（问题编号 ${requestId}）` : message })
    return false
  }
}

/** 从后端拉整棵树；真实模式下页面挂载时调一次 */
export async function hydrateKnowledge(): Promise<void> {
  if (isMock || state.status === "loading") return
  state = { ...state, status: "loading", error: null }
  emit()
  try {
    const page = await kbFetchTree()
    // 树只回目录节点，正文按需再拉；已经拉过的留着，别让切来切去每次都重取
    state = { ...state, tree: page.items, status: "ready", error: null }
  } catch (cause) {
    state = { ...state, status: "error", error: cause instanceof KbError ? cause.message : "网络异常" }
  }
  emit()
}

/** 树只给目录节点，正文要单独取；选中一篇时按需拉，拉过的留在 docs 里 */
export async function loadKnowledgeDoc(id: string): Promise<void> {
  if (isMock || state.docs[id]) return
  try {
    const doc = await kbFetchDoc(id)
    state = { ...state, docs: { ...state.docs, [doc.id]: doc } }
    emit()
  } catch (cause) {
    // 已软删的文档再 GET 是 404 —— 页面按「没有这篇文档」空态处理，不弹错
    if (!(cause instanceof KbError && cause.status === 404)) {
      toast.error("读取文档失败", { description: cause instanceof KbError ? cause.message : "网络异常" })
    }
  }
}

export const kbActions = {
  /**
   * 建文档。真实模式下**等后端给 id 再插树**——不用本地临时 id 占位：
   * 临时 id 一旦被选中、被双链引用，服务端 id 回来时就得满树替换，得不偿失。
   */
  async createDoc(parentId: string | null, kind: KbKind, title = "新文档", position = "z"): Promise<string | null> {
    if (isMock) {
      const id = `kb-local-${Date.now().toString(36)}-${seq++}`
      const node: KbTreeNode = { id, title, kind, parentId, position, children: [] }
      state = { ...state, tree: insertInto(state.tree, parentId, node), docs: { ...state.docs, [id]: { id, title, kind, parentId, contentJson: null, contentText: "", documentLinks: [], businessRefs: [], revision: 1, updatedBy: { userId: "me", name: "我" }, updatedAt: now(), readOnly: false } } }
      emit(); return id
    }
    try {
      const doc = await kbCreateDoc({ title, kind, parent_id: parentId })
      const node: KbTreeNode = { id: doc.id, title: doc.title, kind: doc.kind, parentId: doc.parentId, position, children: [] }
      state = { ...state, tree: insertInto(state.tree, parentId, node), docs: { ...state.docs, [doc.id]: doc } }
      emit()
      return doc.id
    } catch (cause) {
      const message = cause instanceof KbError ? cause.message : "网络异常，稍后重试"
      toast.error("新建文档失败", { description: message })
      return null
    }
  },
  async rename(id: string, title: string) {
    const before = state
    state = { ...state, tree: mapTree(state.tree, (node) => node.id === id ? { ...node, title } : node), docs: { ...state.docs, [id]: { ...state.docs[id], title, revision: state.docs[id].revision + 1, updatedAt: now() } } }
    emit()
    await commit(before, async () => { await kbPatchDoc(id, { title }) }, "改名")
  },
  async move(id: string, parentId: string | null, position: string) {
    const before = state
    const { rest, removed } = removeFromTree(state.tree, id)
    if (!removed) return
    state = { ...state, tree: insertInto(rest, parentId, { ...removed, parentId, position }), docs: { ...state.docs, [id]: { ...state.docs[id], parentId } } }
    emit()
    await commit(before, async () => { await kbPatchDoc(id, { parent_id: parentId, position }) }, "移动")
  },
  async remove(id: string) {
    const before = state
    const { rest } = removeFromTree(state.tree, id)
    const docs = { ...state.docs }; delete docs[id]
    state = { ...state, tree: rest, docs }
    emit()
    // 软删：库里行还在（置 deleted_at），只是列表/搜索/反查不再出它
    await commit(before, async () => { await kbDeleteDoc(id) }, "删除")
  },
  async saveBlocks(id: string, blocks: unknown[]) {
    const doc = state.docs[id]; if (!doc) return
    const before = state
    state = { ...state, blocks: { ...state.blocks, [id]: blocks }, docs: { ...state.docs, [id]: { ...doc, revision: doc.revision + 1, updatedAt: now(), updatedBy: { userId: "me", name: "我" } } } }
    emit()
    // 后端据此写 kb_revisions、重算 content_text、重建 [[双链]]
    await commit(before, async () => {
      const saved = await kbPatchDoc(id, { content_json: { type: "doc", content: blocks } })
      state = { ...state, docs: { ...state.docs, [saved.id]: saved } }
      emit()
    }, "保存")
  },
}
