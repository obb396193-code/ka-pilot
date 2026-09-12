import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { existsSync, readFileSync } from "node:fs"
import { dirname, join, relative, resolve } from "node:path"
import test from "node:test"

/**
 * 绊线：**源文件 import 了一个没进 git 的文件**。
 *
 * 这个错我犯了三次：F8-15 ⑦ 漏了 rerun 的 `route.ts`、㉑ 漏了 `partial-mark.tsx`
 * （arch 的门禁树两条 tsc 红，而我本地全绿）。根因是同一个：
 * **路径限定提交只带已跟踪文件，新文件不 `git add` 就带不上**；
 * 而本地 tsc/测试/构建都从磁盘读，磁盘上有，所以一路绿到别人检出才炸。
 *
 * 前两次我都只是「下次注意」，没做防线——所以它又发生了。这条就是那道防线：
 * 把每个被跟踪源文件里的相对/别名 import 解析到磁盘路径，
 * **只要指向的文件不在 git 索引里就红**。自觉挡不住的事，交给门禁挡。
 */

const WEB = resolve(new URL("../../", import.meta.url).pathname)
const REPO = resolve(WEB, "../..")

function git(...args: string[]): string {
  return execFileSync("git", args, { cwd: REPO, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 })
}

/** 解析一个 import 说明符到磁盘文件；解析不出（第三方包等）返回 null */
function resolveSpecifier(fromFile: string, specifier: string): string | null {
  let base: string
  if (specifier.startsWith("@/")) base = join(WEB, specifier.slice(2))
  else if (specifier.startsWith("./") || specifier.startsWith("../")) base = resolve(dirname(fromFile), specifier)
  else return null // 包名 / @contract 别名（指向 packages/，另有门禁管）

  const candidates = [base, `${base}.ts`, `${base}.tsx`, `${base}.js`, join(base, "index.ts"), join(base, "index.tsx")]
  for (const candidate of candidates) {
    if (existsSync(candidate) && !candidate.endsWith("/")) {
      try { if (readFileSync(candidate).length >= 0) return candidate } catch { /* 目录 */ }
    }
  }
  return null
}

/**
 * 「没进 git」分两种，只有一种是错：
 *   · **被 .gitignore 忽略**的（MiSans 字体切片是 `postinstall` 生成的）——故意的，放过；
 *   · 既没跟踪、也没被忽略的——**就是忘了 `git add`**，红。
 */
function isDeliberatelyIgnored(path: string): boolean {
  try {
    git("check-ignore", "-q", relative(REPO, path))
    return true
  } catch {
    return false
  }
}

test("★每个源文件 import 的本地文件都必须在 git 索引里", () => {
  // 扫全仓而不只是 apps/web：BFF 会 import `packages/domain/src/*.ts`
  const tracked = new Set(
    git("ls-files").split("\n").filter(Boolean).map((path) => resolve(REPO, path)),
  )
  const sources = [...tracked].filter((path) => /\.(ts|tsx)$/.test(path) && !path.includes("/node_modules/"))

  const missing: string[] = []
  for (const file of sources) {
    const text = readFileSync(file, "utf8")
    for (const match of text.matchAll(/(?:from|import)\s+["']([^"']+)["']/g)) {
      const target = resolveSpecifier(file, match[1]!)
      // 解析得到文件、但它不在 git 里 = 这次提交漏了它
      if (target && !tracked.has(target) && !isDeliberatelyIgnored(target)) {
        missing.push(`${relative(REPO, file)} → ${match[1]} （${relative(REPO, target)} 未跟踪）`)
      }
    }
  }
  assert.deepEqual(missing, [], `这些 import 指向的文件没进 git，别人检出会「Module not found」：\n  ${missing.join("\n  ")}`)
})
