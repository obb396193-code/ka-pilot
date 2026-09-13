import assert from "node:assert/strict"
import test from "node:test"

import { accountHref, childFilters, drillPath } from "./drill-path.ts"

test("★账户链接按 key 形态判，不按层级深度", () => {
  // 优化师树的账户在第 3 层、任务大类树在第 2 层——写死 depth 会让后者永远不是链接
  assert.equal(accountHref("KUAISHOU:account-1"), "/accounts/KUAISHOU/account-1")
  assert.equal(accountHref("biz-aac"), null, "没有冒号的不是账户")
  assert.equal(accountHref("opt-zhang"), null)
})

test("媒体和账户 ID 都要转义 —— 账户 ID 里可能有特殊字符", () => {
  assert.equal(accountHref("KUAISHOU:a b"), null, "空格不在允许字符集里，直接不当账户")
  assert.equal(accountHref("KUAISHOU:a-1_2"), "/accounts/KUAISHOU/a-1_2")
})

test("非法形态一律返回 null，不生成半个链接", () => {
  for (const key of ["", ":", "kuaishou:x", "KUAISHOU:", ":account-1", "A".repeat(40) + ":x"]) {
    assert.equal(accountHref(key), null, key)
  }
})

test("path 拼接与 drill.json 的 byParent 键一致", () => {
  assert.equal(drillPath("", "opt-zhang"), "opt-zhang")
  assert.equal(drillPath("opt-zhang", "biz-aac"), "opt-zhang|biz-aac")
  assert.equal(drillPath("opt-zhang|biz-aac", "task-1"), "opt-zhang|biz-aac|task-1")
})

test("下钻的过滤条件逐级累积，且用后端认的键名", () => {
  const first = childFilters({}, "optimizer", "张三")
  assert.deepEqual(first, { optimizer: ["张三"] })
  // task 这一级的键名是 task_id 不是 task
  assert.deepEqual(childFilters(first, "task", "T-1"), { optimizer: ["张三"], task_id: ["T-1"] })
})
