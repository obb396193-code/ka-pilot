import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

import { gapParams, hourlyParams } from "./query-params.ts"

/**
 * 盯盘 / 差异对账的请求体形状，**以后端那份 schema 为准**。
 *
 * 这两个查询走 `POST /api/v1/query`，params 是 `.strict()`，键名约定和 data/query
 * **相反**（gap 用 `date_from` 下划线、hourly 只有 `date`、两者 media 必填）。
 * P0-⑲ 就是照着散文里的命名写 wire 键名栽的，所以这里不自己抄一份期望值。
 *
 * 本想直接 import `operational-query-request.ts` 让 zod 自己说话，但它内部用 `./x.js`
 * 后缀导入，`node --test`（`npm test` 用的就是它）解析不了——只有 tsx 能。
 * 与其为一条用例改全仓的门禁命令，不如**从那份源码里解析出键名**：
 * 后端改了字段名或必填性，这里照样红，而且裸 node 也跑得动。
 */

const SOURCE = readFileSync(new URL("../../../../packages/domain/src/operational-query-request.ts", import.meta.url), "utf8")

/** 取出 `export const <name> = z.object({ ... })` 里第一层的键名，以及哪些是可选的 */
function schemaKeys(name: string): { all: Set<string>; required: Set<string> } {
  const start = SOURCE.indexOf(`export const ${name} = z.object({`)
  assert.notEqual(start, -1, `没在 domain 源码里找到 ${name}——它被改名或挪走了`)
  const body = SOURCE.slice(start, SOURCE.indexOf("}).strict()", start))
  const all = new Set<string>()
  const required = new Set<string>()
  // 形如 `date: dateInput,` / `media,`（简写）/ `accountIds: accountIds.optional(),`
  for (const match of body.matchAll(/(?:^|[{,\s])([A-Za-z_][A-Za-z0-9_]*)\s*(?::\s*([^,\n]*))?(?=[,\n])/g)) {
    const key = match[1]!
    if (["z", "object", "strict", "refine", "export", "const"].includes(key)) continue
    all.add(key)
    if (!(match[2] ?? "").includes(".optional()")) required.add(key)
  }
  return { all, required }
}

function check(name: string, params: Record<string, unknown>) {
  const { all, required } = schemaKeys(name)
  for (const key of Object.keys(params)) assert.ok(all.has(key), `${name} 不认识键 ${key}（strict schema 会整条 400）`)
  for (const key of required) assert.ok(key in params, `${name} 要求必填 ${key}，但没发`)
}

test("盯盘参数的键名与必填项都对得上后端 schema", () => {
  check("accountHourlyParamsSchema", hourlyParams({ date: "2026-09-05", media: "KUAISHOU" }))
})

test("盯盘可选项：小时区间和账户名单也是 schema 认识的键", () => {
  check("accountHourlyParamsSchema", hourlyParams({ date: "2026-09-05", media: "KUAISHOU", accountIds: ["account-1"], hhFrom: 0, hhTo: 12 }))
})

test("★两者的 media 都是必填 —— 从 schema 里读出来的，不是我写死的", () => {
  assert.ok(schemaKeys("accountHourlyParamsSchema").required.has("media"))
  assert.ok(schemaKeys("accountGapParamsSchema").required.has("media"))
})

test("对账参数：日期是下划线，不是驼峰", () => {
  const params = gapParams({ from: "2026-09-01", to: "2026-09-05", media: "KUAISHOU", groupBy: "account" })
  assert.ok("date_from" in params && !("dateFrom" in params), "gap 用 date_from，和 data/query 那套相反")
  check("accountGapParamsSchema", params)
})

test("对账三种分组都只用 schema 认识的键", () => {
  for (const groupBy of ["account", "task", "biz"] as const) {
    check("accountGapParamsSchema", gapParams({ from: "2026-09-01", to: "2026-09-05", media: "KUAISHOU", accountIds: ["a"], groupBy }))
  }
})

test("空的账户名单不发：schema 要求至少一条，发空数组会整条 400", () => {
  const params = gapParams({ from: "2026-09-01", to: "2026-09-05", media: "KUAISHOU", accountIds: [], groupBy: "biz" })
  assert.equal("accountIds" in params, false)
})
