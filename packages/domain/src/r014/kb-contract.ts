import { createHash } from "node:crypto";

import { z } from "zod";

/**
 * v1.4 知识库 8.x。fixture `kb/document.json` / `kb/tree.json` / `kb/search.json` 即契约。
 * 表在 migration 019（此前四张表只在参考 SQL 里，从未建过）。
 */
export const KB_KINDS = ["manual", "ai_report", "case", "sop"] as const;
export const KB_VISIBILITIES = ["private", "team", "workspace"] as const;
/** 8.4 反查支持的业务对象类型（schema.sql `kb_business_refs.object_type` 注释原文）。 */
export const KB_OBJECT_TYPES = ["account", "task", "changeset", "work_item", "material"] as const;

export const kbKindSchema = z.enum(KB_KINDS);
export const kbVisibilitySchema = z.enum(KB_VISIBILITIES);
export const kbObjectTypeSchema = z.enum(KB_OBJECT_TYPES);

export const kbDocumentSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  kind: kbKindSchema,
  parentId: z.string().uuid().nullable(),
  contentJson: z.unknown().nullable(),
  contentText: z.string(),
  documentLinks: z.array(z.object({ toId: z.string().uuid(), label: z.string() }).strict()),
  businessRefs: z.array(z.object({ type: kbObjectTypeSchema, id: z.string() }).strict()),
  revision: z.number().int().nonnegative(),
  /** 最后一次改动的人；没有修订历史（例如刚导入的文档）时为 null，不编一个作者。 */
  updatedBy: z.object({ userId: z.string().uuid(), name: z.string() }).strict().nullable(),
  updatedAt: z.string(),
  /** team 空间只读（api.md 8.x「team 空间只读」）。 */
  readOnly: z.boolean(),
}).strict();
export type KbDocument = z.infer<typeof kbDocumentSchema>;

export const kbTreeNodeSchema: z.ZodType<KbTreeNode> = z.lazy(() => z.object({
  id: z.string().uuid(),
  title: z.string(),
  kind: kbKindSchema,
  parentId: z.string().uuid().nullable(),
  position: z.string().nullable(),
  children: z.array(kbTreeNodeSchema),
}).strict());
export interface KbTreeNode {
  id: string; title: string; kind: (typeof KB_KINDS)[number];
  parentId: string | null; position: string | null; children: KbTreeNode[];
}

export const kbSearchItemSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  kind: kbKindSchema,
  snippet: z.string(),
  score: z.number(),
}).strict();
export type KbSearchItem = z.infer<typeof kbSearchItemSchema>;

/** 反查行 = search 行去掉 snippet/score 的三件套（fixture `kb/backlinks.json`）。 */
export const kbRefItemSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  kind: kbKindSchema,
}).strict();
export type KbRefItem = z.infer<typeof kbRefItemSchema>;

export const kbByObjectSchema = z.object({
  objectType: kbObjectTypeSchema,
  objectId: z.string(),
  items: z.array(kbRefItemSchema),
}).strict();

export const kbCreateRequestSchema = z.object({
  title: z.string().trim().min(1).max(512),
  parentId: z.string().uuid().nullable().optional(),
  kind: kbKindSchema,
  contentJson: z.unknown().optional(),
  visibility: kbVisibilitySchema,
}).strict();
export type KbCreateRequest = z.infer<typeof kbCreateRequestSchema>;

export const kbPatchRequestSchema = z.object({
  title: z.string().trim().min(1).max(512).optional(),
  contentJson: z.unknown().optional(),
  parentId: z.string().uuid().nullable().optional(),
  position: z.string().max(64).nullable().optional(),
  tags: z.array(z.string().max(64)).max(64).optional(),
  visibility: kbVisibilitySchema.optional(),
}).strict().refine((patch) => Object.keys(patch).length > 0, { message: "patch must change something" });
export type KbPatchRequest = z.infer<typeof kbPatchRequestSchema>;

/** 文档正文里的引用，来自 BlockNote/ProseMirror 的 `mention` 节点或正文里的 `[[标题]]`。 */
export interface KbMention {
  type: string;
  id: string | null;
  label: string;
}

const MAX_WALK_NODES = 20_000;

/**
 * 正文 JSON → 纯文本投影（`content_text`，搜索用）。
 * 块内直接拼接、块间用一个空格分隔——fixture `document.json` 的 `contentText`
 * 正是这么来的（标题块 + 空格 + 段落，段落里 `关联任务 ` 后紧跟 mention 的 label）。
 */
export function projectContentText(contentJson: unknown): string {
  if (contentJson === null || typeof contentJson !== "object") return "";
  const blocks: string[] = [];
  let budget = MAX_WALK_NODES;

  const walk = (node: unknown, into: string[]): void => {
    if (budget-- <= 0 || node === null || typeof node !== "object") return;
    const record = node as Record<string, unknown>;
    if (typeof record.text === "string") into.push(record.text);
    // mention 的可读值是 label；没有 label 就没有可读文本，不拿 id 冒充。
    const attrs = record.attrs as Record<string, unknown> | undefined;
    if (record.type === "mention" && attrs !== undefined && typeof attrs.label === "string") {
      into.push(attrs.label);
    }
    if (Array.isArray(record.content)) for (const child of record.content) walk(child, into);
  };

  const root = contentJson as Record<string, unknown>;
  const topLevel = Array.isArray(root.content) ? root.content : [root];
  for (const block of topLevel) {
    const parts: string[] = [];
    walk(block, parts);
    const text = parts.join("");
    if (text.length > 0) blocks.push(text);
  }
  return blocks.join(" ").trim();
}

/** `content_fingerprint`：正文纯文本的 sha256，用来判「这次编辑真的改了正文吗」。 */
export function contentFingerprint(contentText: string): string {
  return createHash("sha256").update(contentText, "utf8").digest("hex");
}

const WIKI_LINK = /\[\[([^[\]]{1,512})\]\]/g;

/**
 * 收集正文里的引用。两种写法都收：
 * - `mention` 节点（fixture 里 `{type:"task", id, label}` 就是这种，直接对应 `kb_business_refs`）；
 * - 正文里的 `[[标题]]`（api.md 明写「解析 `[[…]]` 重建 `kb_links`」），按标题解析到文档 id。
 *
 * 注意：fixture 只证到 mention(type=task) → businessRefs 这一半，
 * `documentLinks` 的书写形式没有 fixture。所以两种都收，多收不会错，少收会丢链接。
 */
export function collectMentions(contentJson: unknown): KbMention[] {
  const mentions: KbMention[] = [];
  let budget = MAX_WALK_NODES;

  const walk = (node: unknown): void => {
    if (budget-- <= 0 || node === null || typeof node !== "object") return;
    const record = node as Record<string, unknown>;
    const attrs = record.attrs as Record<string, unknown> | undefined;
    if (record.type === "mention" && attrs !== undefined) {
      const type = typeof attrs.type === "string" ? attrs.type : "";
      if (type !== "") {
        mentions.push({
          type,
          id: typeof attrs.id === "string" && attrs.id !== "" ? attrs.id : null,
          label: typeof attrs.label === "string" ? attrs.label : "",
        });
      }
    }
    if (typeof record.text === "string") {
      for (const match of record.text.matchAll(WIKI_LINK)) {
        const title = match[1]!.trim();
        if (title !== "") mentions.push({ type: "document", id: null, label: title });
      }
    }
    if (Array.isArray(record.content)) for (const child of record.content) walk(child);
  };

  walk(contentJson);
  return mentions;
}

/** 引用分流：业务对象进 `kb_business_refs`，文档引用进 `kb_links`。两者都按原样去重。 */
export function splitMentions(mentions: KbMention[]): {
  businessRefs: { type: (typeof KB_OBJECT_TYPES)[number]; id: string }[];
  documentRefs: { id: string | null; label: string }[];
} {
  const businessSeen = new Set<string>();
  const businessRefs: { type: (typeof KB_OBJECT_TYPES)[number]; id: string }[] = [];
  const documentSeen = new Set<string>();
  const documentRefs: { id: string | null; label: string }[] = [];

  for (const mention of mentions) {
    if (mention.type === "document" || mention.type === "doc" || mention.type === "kb") {
      const key = mention.id ?? `title:${mention.label}`;
      if (mention.id === null && mention.label === "") continue;
      if (documentSeen.has(key)) continue;
      documentSeen.add(key);
      documentRefs.push({ id: mention.id, label: mention.label });
      continue;
    }
    const parsed = kbObjectTypeSchema.safeParse(mention.type);
    // 未知类型直接丢：`kb_business_refs.object_type` 是有限枚举，塞进去等于污染反查。
    if (!parsed.success || mention.id === null) continue;
    const key = `${parsed.data}:${mention.id}`;
    if (businessSeen.has(key)) continue;
    businessSeen.add(key);
    businessRefs.push({ type: parsed.data, id: mention.id });
  }
  return { businessRefs, documentRefs };
}

/** 扁平行 → 文档树。孤儿（父被删/父不可见）按顶层返回，**不丢文档**。 */
export function buildDocumentTree(
  rows: { id: string; title: string; kind: (typeof KB_KINDS)[number]; parentId: string | null; position: string | null }[],
): KbTreeNode[] {
  const nodes = new Map<string, KbTreeNode>();
  for (const row of rows) nodes.set(row.id, { ...row, children: [] });

  const roots: KbTreeNode[] = [];
  for (const row of rows) {
    const node = nodes.get(row.id)!;
    const parent = row.parentId === null ? undefined : nodes.get(row.parentId);
    if (parent === undefined) roots.push(node);
    else parent.children.push(node);
  }

  const byPosition = (left: KbTreeNode, right: KbTreeNode): number => {
    // position 是分数索引字符串（fixture 的 "a"/"b"/"c"/"d"）；没有 position 的排在后面按标题定序。
    if (left.position !== null && right.position !== null) return left.position.localeCompare(right.position);
    if (left.position !== null) return -1;
    if (right.position !== null) return 1;
    return left.title.localeCompare(right.title);
  };
  const sortTree = (list: KbTreeNode[]): void => {
    list.sort(byPosition);
    for (const node of list) sortTree(node.children);
  };
  sortTree(roots);
  return roots;
}

/**
 * 搜索相关度。**不是 `ts_rank`**：PG 的 `simple` 分词把整段中文当成一个词
 * （实测 `to_tsvector('simple','新任务开户到基建 SOP')` = `'新任务开户到基建':1 'sop':2`），
 * 所以搜「开户」用 FTS 匹配不到任何中文文档。中文只能靠子串匹配，相关度也只能自己定：
 * 标题命中 > 正文命中，命中越靠前、占标题比例越大分越高。这是**可解释的排序启发式**，
 * 不是概率也不是相似度；装了 `pg_trgm` 之后应换成 `similarity()`（已在 Q-021 提请裁）。
 */
export function relevanceScore(query: string, title: string, contentText: string): number {
  const needle = query.trim().toLowerCase();
  if (needle === "") return 0;
  const inTitle = title.toLowerCase().indexOf(needle);
  const inBody = contentText.toLowerCase().indexOf(needle);
  if (inTitle < 0 && inBody < 0) return 0;

  if (inTitle >= 0) {
    const coverage = needle.length / Math.max(title.length, 1);
    const position = 1 - inTitle / Math.max(title.length, 1);
    return Number((0.6 + 0.25 * coverage + 0.15 * position).toFixed(4));
  }
  const position = 1 - inBody / Math.max(contentText.length, 1);
  return Number((0.3 + 0.2 * position).toFixed(4));
}

/** 命中处前后各截一段作为 snippet；没命中就取开头。 */
export function buildSnippet(query: string, contentText: string, radius = 24): string {
  const text = contentText.trim();
  if (text === "") return "";
  const at = text.toLowerCase().indexOf(query.trim().toLowerCase());
  const start = at < 0 ? 0 : Math.max(0, at - radius);
  const end = Math.min(text.length, start + radius * 3);
  return (start > 0 ? "…" : "") + text.slice(start, end) + (end < text.length ? " …" : "");
}
