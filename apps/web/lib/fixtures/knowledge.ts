import { isOk, type Fixture } from "@/lib/fixtures/contract"
import { tasksFixture } from "@/lib/fixtures/tasks"
import { accountsFixture } from "@/lib/fixtures/accounts"
import { materialsFixture } from "@/lib/fixtures/materials"
import tree from "@contract/fixtures/kb/tree.json"
import document from "@contract/fixtures/kb/document.json"
import search from "@contract/fixtures/kb/search.json"

// 知识库（F-007 §8，契约 v1.4 8.x kb 四表）fixture 读取层；编辑器代码复制自 ContentRadar（/Users/aik/cr-r128 只读）
export type KbKind = "sop" | "ai_report" | "case" | "manual"
export const kbKindLabel: Record<KbKind, string> = { sop: "SOP", ai_report: "AI 报告", case: "案例", manual: "笔记" }
export type KbTreeNode = { id: string; title: string; kind: KbKind; parentId: string | null; position: string; children: KbTreeNode[] }
export const kbTreeFixture = tree as unknown as Fixture<{ items: KbTreeNode[] }>
/** contentJson = ProseMirror 风格 doc（契约 kb_documents.content_json）；mention = 业务对象引用 */
export type PmInline = { type: "text"; text: string; marks?: { type: string }[] } | { type: "mention"; attrs: { type: string; id: string; label: string } } | { type: "wikilink"; attrs: { id: string; title: string } }
export type PmBlock = { type: "heading"; attrs: { level: number }; content?: PmInline[] } | { type: "paragraph"; content?: PmInline[] } | { type: "bulletList" | "orderedList"; content?: { type: "listItem"; content?: PmBlock[] }[] }
export type KbDocument = { id: string; title: string; kind: KbKind; parentId: string | null; contentJson: { type: "doc"; content: PmBlock[] } | null; contentText: string; documentLinks: { toId: string; label: string }[]; businessRefs: { type: string; id: string }[]; revision: number; updatedBy: { userId: string; name: string }; updatedAt: string; readOnly: boolean }
export const kbDocumentFixture = document as unknown as Fixture<KbDocument>
export type KbSearchHit = { id: string; title: string; kind: KbKind; snippet: string; score: number }
export const kbSearchFixture = search as unknown as Fixture<{ items: KbSearchHit[] }>

export const flattenTree = (nodes: KbTreeNode[]): KbTreeNode[] => nodes.flatMap((node) => [node, ...flattenTree(node.children ?? [])])
export const findNode = (nodes: KbTreeNode[], id: string): KbTreeNode | null => { for (const node of nodes) { if (node.id === id) return node; const hit = findNode(node.children ?? [], id); if (hit) return hit } return null }
export const businessRefHref = (ref: { type: string; id: string }): string => ref.type === "task" ? `/tasks/${encodeURIComponent(ref.id)}` : ref.type === "account" ? `/accounts/KUAISHOU/${encodeURIComponent(ref.id)}` : ref.type === "work_item" ? `/diagnostics/${encodeURIComponent(ref.id)}` : "#"
export const businessRefLabel: Record<string, string> = { task: "任务", account: "账户", work_item: "工作项", material: "素材" }

// 关联对象在界面上显名字，不显 ID（fixture 里查不到就退回 ID，不编名字）
export function businessRefName(ref: { type: string; id: string }): string {
  if (ref.type === "task" && isOk(tasksFixture)) return tasksFixture.data.items.find((item) => item.taskId === ref.id)?.taskName ?? ref.id
  if (ref.type === "account" && isOk(accountsFixture)) return accountsFixture.data.items.find((item) => item.accountId === ref.id)?.accountName ?? ref.id
  if (ref.type === "material" && isOk(materialsFixture)) return materialsFixture.data.items.find((item) => item.materialId === ref.id)?.name ?? ref.id
  return ref.id
}
