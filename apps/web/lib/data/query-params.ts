/**
 * `POST /data/query` 的 params 构造 —— **所有查询参数只在这里产出**（P0-⑲）。
 *
 * 起因：2026-09-10 联调，首屏八个请求全 400 `INVALID_REQUEST: Invalid query parameter set`。
 * 我照契约文档里的下划线写法发了 `date_from` / `dimension_type` / `workspace_id`，
 * 但那些是**命名**不是**线上键名**；后端 params 是 **strict**，多一个未知键整条就废。
 * 线上键名以 `packages/contract/api.md`（v1.9.30，搜 `dateFrom`）为准。
 *
 * 抽成这个没有 React 依赖的纯模块，是为了能**用例锁住请求体形状**——
 * 键名错了要在 `npm test` 里红，不能等到浏览器里八个请求一起 400 才发现。
 */

/** 线上允许的顶层键。改这里之前先改 `packages/contract/api.md` 的 wire 清单。 */
export const DATA_QUERY_PARAM_KEYS = ["dateFrom", "dateTo", "media", "dimension", "dimA", "dimB", "filters", "compare"] as const

/** `filters` **内部**保持下划线（Codex de98a243 已落地），和顶层键名规则不同，别顺手改成驼峰。 */
export const DATA_QUERY_FILTER_KEYS = ["optimizer", "biz", "resource_position", "goal", "task_id"] as const
export type DataQueryFilterKey = (typeof DATA_QUERY_FILTER_KEYS)[number]

/**
 * 环比开关：`compare:"prev_window"` 后端还没接（be2 Q-041 ③）。
 * strict params 下**带上就整条 400**，所以落地前一律不发。
 * be2 那条合流后把这里改 `true`，页面的环比数字自然就出来了（页面代码不用动）。
 */
export const PREV_WINDOW_COMPARE_READY = false

export type QueryWindow = { from: string; to: string }
export type QueryParams = Record<string, unknown>

/**
 * 窗口 → 基础参数。上海 03:00 切日的口径在后端，前端只传日历日。
 *
 * **不发 `workspace_id`**：空间由会话 cookie 决定，前端传了反而是未知键。
 * 但前端仍要按空间分缓存——那个用本地变量做 key，不进 params（见 `use-dashboard.ts`）。
 */
export function windowParams(window: QueryWindow): QueryParams {
  return {
    dateFrom: window.from,
    dateTo: window.to,
    ...(PREV_WINDOW_COMPARE_READY ? { compare: "prev_window" } : {}),
  }
}

/**
 * 过滤条件。**不认识的键不静默丢掉**——丢掉会让下钻悄悄放宽成「全部」，
 * 看起来正常其实是错数；而原样发出去又会 400 整条。所以原样返回给调用方，
 * 由调用方决定「这层不查、明说不支持」。
 */
export function buildFilters(input: Record<string, unknown> | undefined): { filters?: Record<string, unknown>; unsupported: string[] } {
  if (!input) return { unsupported: [] }
  const allowed = new Set<string>(DATA_QUERY_FILTER_KEYS)
  const filters: Record<string, unknown> = {}
  const unsupported: string[] = []
  for (const [key, value] of Object.entries(input)) {
    if (!allowed.has(key)) { unsupported.push(key); continue }
    // 空数组不发：它既可能被读成「不过滤」也可能被读成「过滤到空」，含义不确定的参数不发
    if (Array.isArray(value) && value.length === 0) continue
    filters[key] = value
  }
  return { ...(Object.keys(filters).length ? { filters } : {}), unsupported }
}

/** `account.dimension`：维度键是 **`dimension`**，不是 `dimension_type`。 */
export function dimensionParams(dimension: string, window: QueryWindow, filters?: Record<string, unknown>): { params: QueryParams; unsupported: string[] } {
  const built = buildFilters(filters)
  return { params: { ...windowParams(window), dimension, ...(built.filters ? { filters: built.filters } : {}) }, unsupported: built.unsupported }
}

/** `account.pivot2`：行维 `dimA`、列维 `dimB`；不分列时不发 `dimB`。 */
export function pivotParams(dimA: string, dimB: string | null, window: QueryWindow): QueryParams {
  return { ...windowParams(window), dimA, ...(dimB ? { dimB } : {}) }
}


/* ------------------------------------------------------------------------- *
 * 盯盘 / 差异对账：**另一条路、另一套键名约定**
 *
 * 这两个查询走 `POST /api/v1/query`（前端 `/api/internal/query`），不是 data/query。
 * 它们的 params schema 是 **`.strict()`** 且和上面那套**不一样**：
 *   · gap 的日期是 **`date_from` / `date_to`（下划线）**，不是驼峰；
 *   · hourly 只有一个 **`date`**；
 *   · **两者 `media` 都必填**（data/query 那边是可选）。
 *
 * 权威来源是 `packages/domain/src/operational-query-request.ts` 里的 zod schema——
 * 不是 api.md 的散文。`operational-query-params.test.ts` 直接拿那两个 schema 来 parse
 * 我这里造出来的参数：后端改了 schema，用例当场红。
 * ------------------------------------------------------------------------- */

export type HourlyQuery = { date: string; media: string; accountIds?: string[]; hhFrom?: number; hhTo?: number }
export type GapQuery = { from: string; to: string; media: string; accountIds?: string[]; groupBy: "account" | "task" | "biz" }

export function hourlyParams(query: HourlyQuery): QueryParams {
  return {
    date: query.date,
    media: query.media,
    ...(query.accountIds?.length ? { accountIds: query.accountIds } : {}),
    ...(query.hhFrom !== undefined ? { hhFrom: query.hhFrom } : {}),
    ...(query.hhTo !== undefined ? { hhTo: query.hhTo } : {}),
  }
}

export function gapParams(query: GapQuery): QueryParams {
  return {
    date_from: query.from,
    date_to: query.to,
    media: query.media,
    ...(query.accountIds?.length ? { accountIds: query.accountIds } : {}),
    groupBy: query.groupBy,
  }
}


/**
 * 数据总表 `account.table`。也走 `/api/v1/query`，所以**跟着那条路的约定**：
 * `date_from` / `date_to` 下划线、`pageSize` 驼峰。
 *
 * 依据不是散文，是仓里的 `semantic-query-request.ts`——那张 legacy 映射表就是为了
 * 打中后端 Registry 才存在的，它把 `page_size` 映成 `pageSize`、把两个日期原样留下划线。
 * `table-query-params.test.ts` 拿那张表当基准比对，改哪边都会红。
 */
export type TableQuery = { from: string; to: string; page?: number; pageSize?: number; columns?: string[]; media?: string }

export function tableParams(query: TableQuery): QueryParams {
  return {
    date_from: query.from,
    date_to: query.to,
    ...(query.page !== undefined ? { page: query.page } : {}),
    ...(query.pageSize !== undefined ? { pageSize: query.pageSize } : {}),
    ...(query.columns?.length ? { columns: query.columns } : {}),
    ...(query.media ? { media: query.media } : {}),
  }
}
