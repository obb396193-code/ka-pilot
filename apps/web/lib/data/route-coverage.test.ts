import assert from "node:assert/strict"
import { readFileSync, readdirSync, statSync } from "node:fs"
import { join } from "node:path"
import test from "node:test"

/**
 * 绊线：**BFF handler 有、浏览器侧路由忘了建**。
 *
 * F8-15 ⑦ 就栽在这——handler、schema、用例都提交了，`app/api/.../rerun/route.ts` 漏在暂存区外，
 * 门禁全绿，但页面上那个按钮点下去是 404。tsc 查不出来（没人 import 它），
 * 用例也查不出来（测的是 handler 不是路由）。
 *
 * 反过来说：`routes-server.ts` 导出一个 handler 却没有任何路由用它，
 * 要么是路由漏了，要么是这个 handler 该删。两种都得有人看见。
 */

const WEB = new URL("../../", import.meta.url).pathname

function walk(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) out.push(...walk(full))
    else if (name.endsWith(".ts") || name.endsWith(".tsx")) out.push(full)
  }
  return out
}

test("routes-server 导出的每个 handler 都要有路由在用", () => {
  const source = readFileSync(join(WEB, "lib/data/r014/routes-server.ts"), "utf8")
  const exported = [...source.matchAll(/^\s{2}(handle[A-Za-z0-9_]+),$/gm)].map((match) => match[1])
  assert.ok(exported.length > 20, `没解析到 handler 列表（只有 ${exported.length} 个），正则可能过时了`)

  const appSource = walk(join(WEB, "app")).map((file) => readFileSync(file, "utf8")).join("\n")
  const orphans = exported.filter((name) => !new RegExp(`\\b${name}\\b`).test(appSource))
  assert.deepEqual(orphans, [], `这些 handler 没有任何路由在用——路由漏建了，还是该删掉它？\n  ${orphans.join("\n  ")}`)
})
