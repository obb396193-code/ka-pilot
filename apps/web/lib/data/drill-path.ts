/**
 * 钻取树的路径与账户链接（F8-19b P1 附录）。
 *
 * 从 `drilldown.tsx` 抽出来的**纯逻辑**——原来埋在组件里，
 * 而这个仓没有 jsdom，组件渲染测不了，等于这几条规则一直没被门禁盖住。
 */

/** 每一级维度对应的 filter 键：逐级把上游选中的值带下去 */
export const DRILL_FILTER_KEY: Record<string, string> = {
  optimizer: "optimizer", biz: "biz", task: "task_id", account: "account_id",
}

/**
 * 账户行按 **key 的形态**判，不按层级深度：`<MEDIA>:<accountId>` 才是账户。
 *
 * 按 depth 判是错的——优化师树的账户在第 3 层、任务大类树在第 2 层，
 * 写死 depth 会让后者永远不是链接（审查员 C ⑭ 点名）。
 */
export function accountHref(key: string): string | null {
  const match = /^([A-Z0-9_]{1,32}):([A-Za-z0-9_-]{1,128})$/.exec(key)
  return match ? `/accounts/${encodeURIComponent(match[1]!)}/${encodeURIComponent(match[2]!)}` : null
}

/** 子行的路径 = 父路径 + `|` + 本行 key，和 `drill.json` 的 `byParent` 键一致 */
export function drillPath(parentPath: string, key: string): string {
  return parentPath ? `${parentPath}|${key}` : key
}

/** 展开某一行时带给后端的过滤条件：从祖先累积下来 + 本级 */
export function childFilters(
  filters: Record<string, unknown>,
  levelDimension: string,
  key: string,
): Record<string, unknown> {
  return { ...filters, [DRILL_FILTER_KEY[levelDimension] ?? levelDimension]: [key] }
}
