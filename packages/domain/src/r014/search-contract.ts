import { z } from "zod";

// v1.7.4 G6 全局搜索：五类、每类 ≤5、**无 LLM**（纯前缀/包含匹配，不做语义检索）。
export const searchTypeSchema = z.enum(["account", "task", "work_item", "material", "document"]);
export type SearchType = z.infer<typeof searchTypeSchema>;
export const SEARCH_TYPES: readonly SearchType[] = searchTypeSchema.options;

/** 每类最多 5 条（G6 冻结）。 */
export const SEARCH_LIMIT_PER_TYPE = 5;

export const searchItemSchema = z.object({
  type: searchTypeSchema,
  id: z.string().min(1),
  title: z.string().min(1),
  subtitle: z.string(),
  href: z.string().min(1),
  workspaceKind: z.enum(["personal", "team"]),
}).strict();
export type SearchItem = z.infer<typeof searchItemSchema>;

/** 最近访问项（fixture system/search.json 的 `recent`）：只有四个键，没有 subtitle/workspaceKind。 */
export const recentSearchItemSchema = z.object({
  type: searchTypeSchema,
  id: z.string().min(1),
  title: z.string().min(1),
  href: z.string().min(1),
}).strict();
export type RecentSearchItem = z.infer<typeof recentSearchItemSchema>;

export const searchResultSchema = z.object({
  items: z.array(searchItemSchema),
  recent: z.array(recentSearchItemSchema).max(10).optional(),
}).strict().superRefine((value, context) => {
  for (const type of SEARCH_TYPES) {
    const n = value.items.filter((item) => item.type === type).length;
    if (n > SEARCH_LIMIT_PER_TYPE) {
      context.addIssue({
        code: "custom",
        message: `search returns at most ${SEARCH_LIMIT_PER_TYPE} ${type} items`,
        path: ["items"],
      });
    }
  }
});
export type SearchResult = z.infer<typeof searchResultSchema>;

/** 结果按类型的固定顺序分组，组内保持仓储给的相关性顺序——前端按此分节渲染。 */
export function orderSearchItems(items: readonly SearchItem[]): SearchItem[] {
  return SEARCH_TYPES.flatMap((type) => items.filter((item) => item.type === type));
}

/**
 * 查询词规整：去首尾空白、压缩内部空白、限长。
 * 空串直接判为「不搜」——空查询返回全部会让 ⌘K 一打开就把整库拉出来。
 */
export function normalizeSearchQuery(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim().replace(/\s+/g, " ");
  if (trimmed.length === 0 || trimmed.length > 128) return null;
  return trimmed;
}

/** LIKE 通配符转义：用户搜 `100%` 不该变成匹配一切。 */
export function toLikePattern(query: string): string {
  return `%${query.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
}
