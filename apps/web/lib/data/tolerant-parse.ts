import type { z } from "zod"

/**
 * 「发出去的严、收回来的宽」——响应校验的统一判定（F8-28）。
 *
 * 三次同根因的事故都是：契约加了个**可选**字段，我的 `.strict()` 镜像没跟上，
 * 于是整条响应被判废、用户看到整页读取失败，**而数据本身是好的**
 * （`lineage.warnings` 对象形 / `assessmentPriceChangeSchema` 少 `op` / `savedViewConfigSchema` 少 `charts`）。
 *
 * 规则：
 *   · **只多了不认识的键** → 放行，控制台点名（提醒补镜像）；
 *   · 缺必填 / 类型不对 / 枚举越界 → 照旧判废。那是真的对不上，放行等于把脏数据端给用户。
 *
 * ★不是「什么都放过」：调用方自己的硬校验（requestId 对不对、状态码合不合）一条都不能省。
 *
 * `forwarder.ts` 走的是同一条规则（那边内联实现，因为它还要处理信封与状态码）；
 * 这里给不经 forwarder 的两条路用：BFF 的 `data/query` 和浏览器客户端。
 */

type Issue = { code: string; errors?: unknown[][] }

/** 信封常是 `z.union([成功, 错误])`，失败会包成 `invalid_union`，真正的原因藏在 `errors` 里 */
function unknownKeysOnly(issues: readonly Issue[]): boolean {
  return issues.length > 0 && issues.every((issue) => {
    if (issue.code === "unrecognized_keys") return true
    if (issue.code === "invalid_union" && Array.isArray(issue.errors) && issue.errors.length > 0) {
      // 只要**有一个分支**是「仅多了未知键」，就说明形状本身是对的
      return issue.errors.some((branch) => unknownKeysOnly(branch as Issue[]))
    }
    return false
  })
}

export type TolerantResult<T> = { ok: true; data: T; extraKeys: string[] } | { ok: false }

/**
 * 按上面的规则解析。`extraKeys` 非空表示放行了未知键——调用方可以据此打日志。
 * 放行时返回的是**原始 payload**（多出来的字段前端本来也不读）。
 */
export function parseTolerant<S extends z.ZodTypeAny>(schema: S, payload: unknown, label: string): TolerantResult<z.infer<S>> {
  const parsed = schema.safeParse(payload)
  if (parsed.success) return { ok: true, data: parsed.data as z.infer<S>, extraKeys: [] }
  if (!unknownKeysOnly(parsed.error.issues as unknown as Issue[])) return { ok: false }
  const extraKeys = collectKeys(parsed.error.issues as unknown as Issue[])
  console.warn(`[contract] ${label} 返回了镜像里没有的字段，已放行并丢弃：`, extraKeys)
  return { ok: true, data: payload as z.infer<S>, extraKeys }
}

function collectKeys(issues: readonly Issue[]): string[] {
  return issues.flatMap((issue) => {
    if (issue.code === "unrecognized_keys") return (issue as { keys?: string[] }).keys ?? []
    if (issue.code === "invalid_union" && Array.isArray(issue.errors)) {
      return issue.errors.flatMap((branch) => collectKeys(branch as Issue[]))
    }
    return []
  })
}
