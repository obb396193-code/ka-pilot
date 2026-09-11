import assert from "node:assert/strict"
import test from "node:test"

import { semanticQueryRequestSchema } from "./semantic-query-request.ts"
import { tableParams } from "./query-params.ts"

/**
 * `account.table` 的 wire 键名，拿仓里那张 legacy 映射表当基准。
 *
 * `semantic-query-request.ts` 的映射表存在的唯一理由就是**打中后端 Registry**
 * （它自己的注释写着 "Shared test vectors prevent mapping drift"）。
 * 所以「把同一组输入喂给映射表」和「我的构造器」应当产出同一份 params——
 * 两边有一边改了，这条就红。这样我不用再去猜下划线还是驼峰（P0-⑲ 的教训）。
 */

function viaLegacyMapping(input: Record<string, unknown>): Record<string, unknown> {
  const parsed = semanticQueryRequestSchema.safeParse({ query_type: "table", ...input })
  assert.ok(parsed.success, `映射表没接受这组输入：${parsed.success ? "" : JSON.stringify(parsed.error.issues)}`)
  assert.equal(parsed.data.queryId, "account.table")
  return parsed.data.params as Record<string, unknown>
}

test("总表参数和 legacy 映射表产出的一致", () => {
  const mine = tableParams({ from: "2026-09-01", to: "2026-09-05", page: 1, pageSize: 50 })
  const theirs = viaLegacyMapping({ date_from: "2026-09-01", date_to: "2026-09-05", page: 1, page_size: 50 })
  assert.deepEqual(mine, theirs)
})

test("★两个日期是下划线、pageSize 是驼峰 —— 这条路和 data/query 的约定相反", () => {
  const params = tableParams({ from: "2026-09-01", to: "2026-09-05", pageSize: 20 })
  assert.ok("date_from" in params && "date_to" in params)
  assert.equal("dateFrom" in params, false)
  assert.ok("pageSize" in params && !("page_size" in params))
})

test("选列也一致", () => {
  const columns = ["cost", "cashCost"]
  assert.deepEqual(
    tableParams({ from: "2026-09-01", to: "2026-09-05", columns }),
    viaLegacyMapping({ date_from: "2026-09-01", date_to: "2026-09-05", columns }),
  )
})

test("空的列清单不发：那等于「不选列」，和「选了 0 列」不是一回事", () => {
  assert.equal("columns" in tableParams({ from: "2026-09-01", to: "2026-09-05", columns: [] }), false)
})
