import assert from "node:assert/strict"
import test from "node:test"

import {
  DATA_QUERY_PARAM_KEYS,
  PREV_WINDOW_COMPARE_READY,
  buildFilters,
  dimensionParams,
  pivotParams,
  windowParams,
} from "./query-params.ts"

/**
 * P0-⑲ 的锁：`POST /data/query` 的请求体形状。
 *
 * 2026-09-10 联调首屏八个请求全 400，就是因为这几个键名照着契约文档里的**命名**写
 * （`date_from`/`dimension_type`/`workspace_id`），而线上 wire 是驼峰且 strict。
 * 这组用例把线上键名钉死：再写错要在 `npm test` 里红，不能等浏览器里八个请求一起 400。
 */

const WINDOW = { from: "2026-09-01", to: "2026-09-02" }
const ALLOWED = new Set<string>(DATA_QUERY_PARAM_KEYS)

test("窗口参数就是 dateFrom/dateTo —— 没有下划线、没有 workspace_id", () => {
  const params = windowParams(WINDOW)
  assert.equal(params.dateFrom, "2026-09-01")
  assert.equal(params.dateTo, "2026-09-02")
  assert.equal(params.workspace_id, undefined, "空间由会话 cookie 定，发出去就是未知键")
  assert.equal(params.date_from, undefined)
})

test("环比开关关着时不发 compare —— strict params 下带上就整条 400", () => {
  const params = windowParams(WINDOW)
  if (PREV_WINDOW_COMPARE_READY) assert.equal(params.compare, "prev_window")
  else assert.equal("compare" in params, false, "be2 Q-041 ③ 落地前不许发 compare")
})

test("维度键是 dimension，不是 dimension_type", () => {
  const { params } = dimensionParams("optimizer", WINDOW)
  assert.equal(params.dimension, "optimizer")
  assert.equal(params.dimension_type, undefined)
})

test("filters 内部保持下划线，且和顶层键名规则相反", () => {
  const { params, unsupported } = dimensionParams("account", WINDOW, { task_id: ["T-1"], resource_position: ["通投"] })
  assert.deepEqual(unsupported, [])
  assert.deepEqual(params.filters, { task_id: ["T-1"], resource_position: ["通投"] })
})

test("不认识的过滤键原样报出来，既不静默丢也不发出去", () => {
  // 静默丢 = 下钻悄悄放宽成「全部」，看着正常其实是错数；原样发 = 整条 400。两个都不行。
  const { params, unsupported } = dimensionParams("account", WINDOW, { account_id: ["KS:1"], biz: ["AAC"] })
  assert.deepEqual(unsupported, ["account_id"])
  assert.deepEqual(params.filters, { biz: ["AAC"] })
})

test("空数组过滤条件不发：含义不确定的参数不发", () => {
  assert.deepEqual(buildFilters({ optimizer: [] }), { unsupported: [] })
})

test("透视是 dimA/dimB；不分列时不发 dimB", () => {
  assert.deepEqual(pivotParams("resource_position", "task", WINDOW), { dateFrom: "2026-09-01", dateTo: "2026-09-02", dimA: "resource_position", dimB: "task" })
  assert.equal("dimB" in pivotParams("biz", null, WINDOW), false)
})

test("★兜底：任何构造出的顶层键都必须在 wire 白名单里", () => {
  const bodies = [
    windowParams(WINDOW),
    dimensionParams("biz", WINDOW, { optimizer: ["张"] }).params,
    pivotParams("biz", "task", WINDOW),
  ]
  for (const body of bodies) {
    for (const key of Object.keys(body)) {
      assert.ok(ALLOWED.has(key), `顶层键 ${key} 不在 api.md 的 wire 清单里，会 400`)
      assert.ok(!key.includes("_"), `顶层键 ${key} 带下划线——线上是驼峰（filters 内部才是下划线）`)
    }
  }
})
