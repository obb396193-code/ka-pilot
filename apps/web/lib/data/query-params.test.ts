import assert from "node:assert/strict"
import test from "node:test"

import {
  DATA_QUERY_PARAM_KEYS,
  PREV_WINDOW_COMPARE_READY,
  buildFilters,
  dimensionParams,
  dimensionSupported,
  pivotDimensionSupported,
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

test("★维度键是 dimensionType —— 另外两种拼法都 400", () => {
  // 我先后写错过两次：`dimension_type`（照契约散文的命名）、`dimension`（照 v1.9.30）。
  // v1.9.34 是 arch 在联调库逐键实测的结论：只有 dimensionType 过。
  const { params } = dimensionParams("optimizer", WINDOW)
  assert.equal(params.dimensionType, "optimizer")
  assert.equal(params.dimension, undefined)
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

test("★透视是另一套键：window_from/window_to + media 必填（v1.9.34 现状）", () => {
  // pivot2 的注册表比其它 queryId 早一版：不收 dateFrom、不收 filters。
  // be2 Q-041 ⑩ 统一后这条要跟着改回驼峰。
  assert.deepEqual(
    pivotParams("task", "biz", WINDOW, "KUAISHOU"),
    { window_from: "2026-09-01", window_to: "2026-09-02", media: "KUAISHOU", dimA: "task", dimB: "biz" },
  )
  assert.equal("dateFrom" in pivotParams("task", null, WINDOW, "KUAISHOU"), false)
  assert.equal("dimB" in pivotParams("biz", null, WINDOW, "KUAISHOU"), false)
})

test("透视只支持 账户/任务/业务 —— 其余维度界面上要标「待接源」", () => {
  for (const value of ["account", "task", "biz"]) assert.ok(pivotDimensionSupported(value), value)
  for (const value of ["resource_position", "optimizer", "segment:bid_mode"]) {
    assert.equal(pivotDimensionSupported(value), false, `${value} 现在会 DIMENSION_UNSUPPORTED`)
  }
})

test("★兜底：任何构造出的顶层键都必须在 wire 白名单里", () => {
  const bodies = [
    windowParams(WINDOW),
    dimensionParams("biz", WINDOW, { optimizer: ["张"] }).params,
    pivotParams("biz", "task", WINDOW, "KUAISHOU"),
  ]
  for (const body of bodies) {
    for (const key of Object.keys(body)) {
      assert.ok(ALLOWED.has(key), `顶层键 ${key} 不在 api.md v1.9.34 的实测表里，会 400`)
    }
  }
})

test("★驼峰规则只管 pivot2 以外的 queryId —— pivot2 那两个下划线键是后端现状", () => {
  // 原来这条写的是「任何顶层键都不许带下划线」。那是把 v1.9.30 当成了全局规则，
  // 而 v1.9.34 实测 pivot2 收的就是 window_from/window_to。规则按 queryId 分开写，
  // 别再拿一个 queryId 的约定去管另一个。
  const camelOnly = [windowParams(WINDOW), dimensionParams("biz", WINDOW).params]
  for (const body of camelOnly) {
    for (const key of Object.keys(body)) assert.ok(!key.includes("_"), `${key} 带下划线——这几个 queryId 是驼峰`)
  }
  const pivot = pivotParams("biz", "task", WINDOW, "KUAISHOU")
  assert.ok("window_from" in pivot && "window_to" in pivot, "pivot2 就是下划线，别顺手统一成驼峰")
})

test("★可分组维度只有六个 —— schema 里合法 ≠ 查得出来（v1.9.41）", () => {
  // 这条锁的是一个反直觉的事实：`dimensionTypeSchema` 里合法的维度里，
  // 有一半没有任何解析器产出，一查就是 DIMENSION_UNSUPPORTED。
  // 所以下拉选项**不能**照着「合法维度表」生成。
  for (const value of ["account", "task", "biz", "optimizer", "goal", "placement"]) {
    assert.ok(dimensionSupported(value), `${value} 应当可分组`)
  }
  for (const value of ["resource_position", "agent_type", "bid_tool", "ubp", "deduction_range"]) {
    assert.equal(dimensionSupported(value), false, `${value} 合法但查不出来，必须标「待接源」`)
  }
})

test("快手的「资源位」查的是 placement，不是 resource_position", () => {
  // 界面上仍叫「资源位」（业务的叫法），查询用 placement（后端的键）。
  // 两者不是一回事，别为了「统一」把界面文案也改了。
  const { params } = dimensionParams("placement", WINDOW)
  assert.equal(params.dimensionType, "placement")
  assert.ok(dimensionSupported("placement"))
})

test("pivot2 比 account.dimension 还窄：只有三个", () => {
  // segment:<key> 本批只对 pivot2 开放，但 be2 ⑦⑩ 还没合——合了之后把段加进来
  for (const value of ["optimizer", "goal", "placement"]) {
    assert.equal(pivotDimensionSupported(value), false, `${value} 在 dimension 可用、在 pivot2 还不行`)
  }
})
