// 主题 = 模式（颜色用到哪一步）+ 主色（一个 --hue，派生图表/按钮/选中态）。老板 2026-09-05 拍板：
// 默认 黑白·点彩 + D-CON 橙 #ff6a2c（老板 2026-09-05 看橙色全彩演示后改定，正好是 PRD 5.1 品牌色）；三种模式同一套组件只换变量；主色由右上角色卡（Dice UI Color Picker）选。
export type ThemeMode = "bw" | "bwc" | "full"
export type ThemeState = { mode: ThemeMode; hue: string }

export const THEME_STORAGE_KEY = "ka-pilot.theme"
export const DEFAULT_THEME: ThemeState = { mode: "bw", hue: "#ff6a2c" }
export const HEX_PATTERN = /^#[0-9a-f]{6}$/i

export const themeModes: { value: ThemeMode; label: string; hint: string }[] = [
  { value: "bw", label: "黑白", hint: "黑白·点彩：底子黑白，主色只做点染" },
  { value: "bwc", label: "黑白+彩", hint: "壳不变，图表和迷你趋势上色" },
  { value: "full", label: "全彩", hint: "按钮、选中态、logo 也用主色" },
]

// 12 个预设主色（6×2），每个带出处；红绿黄不进预设（那是状态色）
export const huePresets: { name: string; hex: string; source: string }[] = [
  { name: "D-CON 橙", hex: "#ff6a2c", source: "PRD 5.1 品牌色" },
  { name: "靛蓝", hex: "#3e63dd", source: "Radix Indigo 9" },
  { name: "Linear 蓝紫", hex: "#5e6ad2", source: "Linear" },
  { name: "Stripe 紫", hex: "#635bff", source: "Stripe" },
  { name: "蓝紫", hex: "#7c3aed", source: "Tailwind Violet 600" },
  { name: "紫", hex: "#6e56cf", source: "Radix Violet 9" },
  { name: "电光紫", hex: "#8e4ec6", source: "Radix Purple 9" },
  { name: "兰紫", hex: "#9333ea", source: "Tailwind Purple 600" },
  { name: "梅子紫", hex: "#ab4aba", source: "Radix Plum 9" },
  { name: "品红", hex: "#c026d3", source: "Tailwind Fuchsia 600" },
  { name: "玫紫", hex: "#d6409f", source: "Radix Pink 9" },
  { name: "桃粉", hex: "#db2777", source: "Tailwind Pink 600" },
  { name: "绯红", hex: "#e93d82", source: "Radix Crimson 9" },
  { name: "玫瑰红", hex: "#e11d48", source: "Tailwind Rose 600" },
  { name: "青", hex: "#12a594", source: "Radix Teal 9" },
  { name: "翠绿", hex: "#059669", source: "Tailwind Emerald 600" },
  { name: "深橙", hex: "#ea580c", source: "Tailwind Orange 600" },
  { name: "石墨", hex: "#3a3a3a", source: "中性" },
]

export function normalizeTheme(input: unknown): ThemeState {
  const raw = (input ?? {}) as Partial<ThemeState>
  const mode = themeModes.some((item) => item.value === raw.mode) ? (raw.mode as ThemeMode) : DEFAULT_THEME.mode
  const hue = typeof raw.hue === "string" && HEX_PATTERN.test(raw.hue) ? raw.hue.toLowerCase() : DEFAULT_THEME.hue
  return { mode, hue }
}

export function readStoredTheme(): ThemeState {
  try {
    return normalizeTheme(JSON.parse(window.localStorage.getItem(THEME_STORAGE_KEY) ?? "null"))
  } catch {
    return DEFAULT_THEME
  }
}

export function storeTheme(state: ThemeState) {
  try { window.localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify(state)) } catch { /* 隐私模式等：忽略 */ }
}

export function applyTheme(state: ThemeState, root: HTMLElement = document.documentElement) {
  root.setAttribute("data-theme-mode", state.mode)
  root.style.setProperty("--hue", state.hue)
}

// 首屏前执行，避免闪一下默认色（与 readStoredTheme 同规则，必须保持一致）
export const THEME_INIT_SCRIPT = `(function(){try{var s=JSON.parse(localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)})||"null")||{};var m=["bw","bwc","full"].indexOf(s.mode)>=0?s.mode:"bw";var h=typeof s.hue==="string"&&/^#[0-9a-f]{6}$/i.test(s.hue)?s.hue.toLowerCase():"#ff6a2c";var r=document.documentElement;r.setAttribute("data-theme-mode",m);r.style.setProperty("--hue",h);}catch(e){}})()`
