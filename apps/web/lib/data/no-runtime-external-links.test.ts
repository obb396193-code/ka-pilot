import assert from "node:assert/strict"
import { readdirSync, readFileSync, statSync } from "node:fs"
import { join, relative } from "node:path"
import test from "node:test"

// F8-10 守卫：内网沙箱出网只放行两个素材 CDN，**任何运行时外链都拉不到**（图 / 脚本 / 样式 / 字体 / fetch）。
// 所以 apps/web 的源码里不许出现运行时用的 http(s) 地址；注释里写来源、写文档链接不算。
// 白名单只有这两个域名（内网放行的素材 CDN）。
const ROOTS = ["app", "components", "lib"]
const EXTENSIONS = [".ts", ".tsx", ".css"]
const ALLOWED_HOSTS = ["hwmov.a.kwimgs.com", "tx2.a.yximgs.com"]
// 测试文件自身、以及只在 Node 侧跑的服务端代码（BFF 上游地址来自环境变量，不是硬编码外链）
const SKIP = [".test.ts", ".test.tsx", "no-runtime-external-links"]

const here = new URL("../..", import.meta.url).pathname

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry.startsWith(".")) continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (EXTENSIONS.some((extension) => entry.endsWith(extension))) out.push(full)
  }
  return out
}

/** 去掉行注释、块注释和 JSX 注释里的内容——注释里放来源链接是允许的 */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/^\s*\/\/.*$/gm, " ")
    .replace(/\/\/[^\n"'`]*$/gm, " ")
}

test("apps/web 源码里没有运行时外链（内网出网只放行两个素材 CDN）", () => {
  const offenders: string[] = []
  for (const root of ROOTS) {
    let files: string[]
    try { files = walk(join(here, root)) } catch { continue }
    for (const file of files) {
      const name = relative(here, file)
      if (SKIP.some((skip) => name.includes(skip))) continue
      const code = stripComments(readFileSync(file, "utf8"))
      for (const match of code.matchAll(/https?:\/\/([a-zA-Z0-9.-]+)/g)) {
        const host = match[1]
        // localhost / 127.0.0.1 是本地开发与测试，schema.org 这类命名空间不发请求
        if (host === "localhost" || host.startsWith("127.") || host.endsWith(".local")) continue
        if (host === "www.w3.org" || host === "schema.org") continue
        if (ALLOWED_HOSTS.includes(host)) continue
        offenders.push(`${name}: ${match[0]}`)
      }
    }
  }
  assert.deepEqual(offenders, [], `发现运行时外链（内网拉不到，请改成仓库内资源或纯 CSS）：\n${offenders.join("\n")}`)
})
