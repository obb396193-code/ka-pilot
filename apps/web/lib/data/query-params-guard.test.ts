import assert from "node:assert/strict"
import { readFileSync, readdirSync } from "node:fs"
import test from "node:test"

/**
 * P0-⑲ 的绊线：**不许再手搓 `POST /data/query` 的 params**。
 *
 * 上一次八个请求全 400，根因不是某一处写错，而是三个地方各自拼参数、
 * 谁都可以照着契约文档里的**命名**（下划线）写成 wire 键名。
 * 单元用例只能锁住 `query-params.ts` 自己；这条扫源码，锁住「别处不准拼」。
 */

const DIR = new URL("./", import.meta.url)
/** 只在 params 语境里出问题的键名。命中即红。 */
const FORBIDDEN = ["date_from", "date_to", "dimension_type", "dim_a", "dim_b"]

function readHooks(): { name: string; text: string }[] {
  return readdirSync(DIR)
    .filter((name) => name.startsWith("use-") && name.endsWith(".ts") && !name.includes(".test."))
    .map((name) => ({ name, text: readFileSync(new URL(name, DIR), "utf8") }))
}

test("取数 hook 里不许出现下划线写法的 wire 键名", () => {
  for (const file of readHooks()) {
    for (const key of FORBIDDEN) {
      assert.ok(!file.text.includes(`${key}:`), `${file.name} 里出现了 ${key}: —— 线上 wire 是驼峰，这样发过去整条 400`)
    }
  }
})

test("取数 hook 不许把 workspace_id 塞进 params", () => {
  // 空间由会话 cookie 决定。前端要按空间分缓存是对的，但那走缓存 key，不走 params。
  for (const file of readHooks()) {
    assert.ok(!/workspace_id\s*:/.test(file.text), `${file.name} 把 workspace_id 发出去了——后端 params 是 strict，未知键整条 400`)
  }
})

test("发查询的 hook 必须从 query-params 取参数，不许自己拼 dateFrom", () => {
  for (const file of readHooks()) {
    if (!file.text.includes(".query({")) continue
    assert.ok(
      file.text.includes('from "./query-params"'),
      `${file.name} 在发查询却没引 query-params —— 参数构造只能有一处`,
    )
    assert.ok(
      !/dateFrom\s*:/.test(file.text),
      `${file.name} 自己拼了 dateFrom —— 请改用 windowParams()/dimensionParams()/pivotParams()`,
    )
  }
})
