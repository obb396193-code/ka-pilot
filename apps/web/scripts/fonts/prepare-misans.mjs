// 生成 Windows 兜底中文字体（MiSans 切片）并修正字重映射。
// 为什么：npm 包 misans 把常规体登记成 font-weight 330 / 380 / 520 / 630，浏览器要 400 时会抓到 Medium，字看着发粗；
// 这里改成 400 / 500 / 600，并把 woff2 拷到 app/fonts/misans/files/ 供 Next 打包。输出目录已 gitignore，postinstall 自动跑。
// 字体栈：Geist → PingFang SC（Mac 系统）→ MiSans（此处）→ Microsoft YaHei。Mac 有苹方时兜底文件不会被请求。
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs"
import { createRequire } from "node:module"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const here = dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)
const weights = [
  ["Regular", "330", "400"],
  ["Medium", "380", "500"],
  ["Semibold", "520", "600"],
]
let src
try { src = join(dirname(require.resolve("misans/package.json")), "lib", "Normal") } catch { console.warn("[fonts] misans 未安装，跳过"); process.exit(0) }
const outDir = resolve(here, "../../app/fonts/misans")
const filesDir = join(outDir, "files")
mkdirSync(filesDir, { recursive: true })

let css = "/* 自动生成：scripts/fonts/prepare-misans.mjs（勿手改）。MiSans © Xiaomi，免费商用许可见 node_modules/misans/LICENSE */\n"
let copied = 0
for (const [name, from, to] of weights) {
  const file = join(src, `MiSans-${name}.min.css`)
  if (!existsSync(file)) { console.warn(`[fonts] 缺 ${file}，跳过`); continue }
  const text = readFileSync(file, "utf8")
    .replaceAll(`font-weight:${from}`, `font-weight:${to}`)
    .replaceAll("font-family:MiSans", 'font-family:"MiSans"')
    .replaceAll(/url\('(MiSans-[^']+\.woff2)'\)/g, "url('./files/$1')")
  css += `\n/* ${name} → ${to} */\n${text}\n`
  for (const woff of readdirSync(src).filter((entry) => entry.startsWith(`MiSans-${name}.`) && entry.endsWith(".woff2"))) {
    copyFileSync(join(src, woff), join(filesDir, woff)); copied += 1
  }
}
writeFileSync(join(outDir, "misans.css"), css)
console.log(`[fonts] MiSans 就绪：${copied} 个切片 → app/fonts/misans/`)
