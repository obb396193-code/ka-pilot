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

// 首屏预载的切片（F8-10）：Windows 上 300 片按需加载，首屏先用微软雅黑排版、切片到了再换 → 行宽变、换行跳。
// 用界面里实际出现的 917 个汉字反查落点，Regular 的 115–119 五片覆盖 88% 的字（合计 105KB）。
// Next 会给 app/ 下的字体加内容哈希，preload 的 href 拿不到，所以这五片另拷一份到 public/（路径稳定）。
const PRELOAD_SLICES = [115, 116, 117, 118, 119]
const publicDir = resolve(here, "../../public/fonts/misans")
mkdirSync(publicDir, { recursive: true })

let regularCss = ""
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
  if (name === "Regular") regularCss = text
  for (const woff of readdirSync(src).filter((entry) => entry.startsWith(`MiSans-${name}.`) && entry.endsWith(".woff2"))) {
    copyFileSync(join(src, woff), join(filesDir, woff)); copied += 1
  }
}
writeFileSync(join(outDir, "misans.css"), css)

// preload.css 复用原切片的 unicode-range，只把 src 改成 public 稳定路径；
// 在 layout 里 misans.css 之后引入，覆盖同 range 的规则，避免同一段字被请求两次。
let preload = "/* 自动生成：scripts/fonts/prepare-misans.mjs（勿手改）。首屏预载切片，覆盖 misans.css 里同 unicode-range 的规则。 */\n"
let preloaded = 0
for (const index of PRELOAD_SLICES) {
  const woff = `MiSans-Regular.${index}.woff2`
  const rule = (regularCss.match(/@font-face\{[^}]*\}/g) ?? []).find((item) => item.includes(`/${woff}'`))
  if (!rule || !existsSync(join(src, woff))) { console.warn(`[fonts] 缺预载切片 ${woff}，跳过`); continue }
  preload += `${rule.replace(/url\('[^']+'\)/, `url('/fonts/misans/${woff}')`)}\n`
  copyFileSync(join(src, woff), join(publicDir, woff)); preloaded += 1
}
writeFileSync(join(outDir, "preload.css"), preload)
console.log(`[fonts] MiSans 就绪：${copied} 个切片 → app/fonts/misans/，其中 ${preloaded} 片预载 → public/fonts/misans/`)
