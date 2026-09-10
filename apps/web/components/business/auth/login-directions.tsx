import { Suspense } from "react"
import Link from "next/link"
import { IconInnerShadowTop } from "@tabler/icons-react"

import { LoginForm } from "@/components/business/auth/login-form"
import { ChromeVisual, IridescenceVisual, OrbVisual, ThreadsVisual } from "@/components/business/auth/login-visuals"
import { cn } from "@/lib/utils"

// 登录页方向（老板 2026-09-05 三轮）：① 三选一定「左右分屏」；② 粒子/光束/星空/素格四种被否（「像模板动效」）；
// ③ 老板：去看大厂怎么做（图片 / 生图 / 炫动效 / 交互）→ 实测巨量引擎、千川、磁力金牛、腾讯营销、飞书、Stripe、Figma、Linear
//   （笔记 docs/frontend/ui-assets/decisions/login-references-2026-09-05.md）。投放平台的共同做法 = 一张高质量品牌 3D 图撑全场 + 浮卡。
// 本轮候选：全幅图 + 浮卡（巨量式）· 分屏 + 图（飞书式）· 三种 WebGL 材质动效（React Bits 官方件）· 一种可交互光球。
// 图先用 Unsplash 免费 3D 渲染占位并标「示例图」，正式版换老板生图（brief 在笔记里）。
export type LoginVariant = "bleed" | "split" | "minimal" | "glass"
export type SplitPanel = "image" | "chrome" | "iridescence" | "orb" | "threads"

export const loginVariants: { value: LoginVariant; label: string; ref: string; hint: string }[] = [
  { value: "bleed", label: "C1 · 全幅图 + 浮卡", ref: "巨量引擎 / 千川 / Stripe", hint: "整页一张品牌视觉图，表单是浮在右侧的一张白卡；投放平台头部都是这个做法" },
  { value: "split", label: "C2 · 分屏 + 图 / 动效", ref: "飞书 / 磁力金牛", hint: "左面板放图或 WebGL 材质，右表单；左面板五种见下" },
  { value: "minimal", label: "A · 极简居中（落选）", ref: "Figma / Linear", hint: "白底、一个标志、一个主按钮" },
  { value: "glass", label: "C · 品牌底 + 玻璃卡（落选）", ref: "Clerk 演示", hint: "主色晕染的浅底、毛玻璃卡" },
]
export const splitPanels: { value: SplitPanel; label: string; source: string; hint: string }[] = [
  { value: "image", label: "C2-1 · 图", source: "示例图 · Unsplash / Milad Fakurian", hint: "一张 3D 渲染图 + 底部渐变压字；正式版换生图" },
  { value: "chrome", label: "C2-2 · 液态金属", source: "React Bits LiquidChrome", hint: "黑白铬色丝带流动，鼠标扰动；≈ 磁力金牛那条丝带的动态版" },
  { value: "iridescence", label: "C2-3 · 光谱", source: "React Bits Iridescence", hint: "暖调光谱渐变缓慢流动，跟鼠标；≈ Stripe 那幅笔刷的动态版" },
  { value: "orb", label: "C2-4 · 光球", source: "React Bits Orb", hint: "黑底一颗可交互光球，鼠标靠近会形变旋转；带点玩的成分" },
  { value: "threads", label: "C2-5 · 线场", source: "React Bits Threads", hint: "黑底细线随鼠标起伏；最素的一档" },
]

// F8-10：内网出网只放行两个素材 CDN，任何运行时外链都拉不到 → 背景改纯 CSS 渐变，不引图片文件。
// （原来是两张 Unsplash 示例图；老板 2026-09-07 定案登录页不用生图，这两档也不再需要真图。）
const BG_WAVES = "radial-gradient(120% 90% at 20% 15%, oklch(0.38 0.13 258) 0%, transparent 60%), radial-gradient(100% 80% at 85% 80%, oklch(0.32 0.11 285) 0%, transparent 65%), linear-gradient(160deg, oklch(0.16 0.04 260) 0%, oklch(0.10 0.02 265) 100%)"
const BG_CUBES = "conic-gradient(from 210deg at 60% 40%, oklch(0.55 0.02 260) 0deg, oklch(0.28 0.01 260) 120deg, oklch(0.62 0.03 250) 240deg, oklch(0.30 0.01 265) 360deg), linear-gradient(180deg, oklch(0.20 0.01 260) 0%, oklch(0.12 0.01 265) 100%)"

function Wordmark({ className, inverted = false }: { className?: string; inverted?: boolean }) {
  return (
    <Link href="/" className={cn("inline-flex items-center gap-2 font-medium", className)}>
      <span className={cn("flex size-7 items-center justify-center rounded-lg", inverted ? "bg-white text-black" : "bg-foreground text-background")}>
        <IconInnerShadowTop className="size-4" />
      </span>
      KA Pilot
    </Link>
  )
}

function Heading({ align = "left" }: { align?: "left" | "center" }) {
  const isMock = process.env.NEXT_PUBLIC_KA_DATA_PROVIDER === "mock"
  return (
    <div className={cn("flex flex-col gap-1.5", align === "center" && "items-center text-center")}>
      <h1 className="text-2xl font-semibold tracking-tight">登录 KA Pilot</h1>
      <p className="text-sm text-muted-foreground">{isMock ? "本地 Mock 模式无需账号，直接进入" : "使用内测账号登录；正式期切换为 BUC"}</p>
    </div>
  )
}

function Footer({ className }: { className?: string }) {
  return <p className={cn("text-xs text-muted-foreground", className)}>内测版 · 仅限已授权账户 · 数据按空间隔离</p>
}

function Form() {
  return <Suspense fallback={null}><LoginForm frame="plain" /></Suspense>
}

function Credit({ text, className }: { text: string; className?: string }) {
  return <span className={cn("rounded-md bg-black/40 px-2 py-1 text-[11px] text-white/70 backdrop-blur", className)}>{text}</span>
}

// 文案：一句话 + 一行注（老板：不要模板感装饰）
function Slogan({ dark, size = "md" }: { dark: boolean; size?: "md" | "lg" }) {
  return (
    <div className="relative flex flex-col gap-4 animate-in fade-in slide-in-from-bottom-2 duration-700">
      <p className={cn("text-xs font-medium tracking-[0.2em] uppercase", dark ? "text-white/60" : "text-muted-foreground")}>KA Pilot · 投放经营工作台</p>
      <h2 className={cn("font-semibold tracking-tight text-balance", size === "lg" ? "max-w-xl text-5xl leading-[1.12]" : "max-w-md text-[2.5rem] leading-[1.15]")}>账户、任务、异常，<br />一处看完，一处处理。</h2>
      <p className={cn("max-w-sm text-sm leading-6", dark ? "text-white/60" : "text-muted-foreground")}>达标判定与投放进度由后端算好再展示，待处理按严重度排队，随时带着上下文问 AI。</p>
    </div>
  )
}

// C1 · 全幅图 + 浮卡（巨量引擎 / 千川 / Stripe 的做法）
function Bleed() {
  return (
    <div className="relative flex min-h-svh flex-col overflow-hidden bg-black text-white">
      <div aria-hidden className="absolute inset-0" style={{ backgroundImage: BG_WAVES }} />
      <div aria-hidden className="absolute inset-0 bg-gradient-to-r from-black/70 via-black/30 to-black/10" />
      <div className="relative flex items-center justify-between px-6 py-5 md:px-10">
        <Wordmark inverted />
        <Footer className="hidden text-white/50 sm:block" />
      </div>
      <main className="relative grid flex-1 items-center gap-10 px-6 pb-16 md:px-10 lg:grid-cols-2">
        <div className="hidden lg:block"><Slogan dark size="lg" /></div>
        <div className="flex justify-center lg:justify-end">
          <div className="w-full max-w-[400px] rounded-2xl bg-white p-8 text-foreground shadow-[0_32px_80px_-24px_rgba(0,0,0,0.6)]">
            <div className="flex flex-col gap-8">
              <Heading />
              <Form />
            </div>
          </div>
        </div>
      </main>
      <Credit text="示例图 · Unsplash / SIMON LEE · 正式版换生图（brief 见参考笔记）" className="absolute bottom-4 left-6 md:left-10" />
    </div>
  )
}

function PanelBackground({ panel }: { panel: SplitPanel }) {
  switch (panel) {
    case "image":
      return (
        <>
          <div aria-hidden className="absolute inset-0" style={{ backgroundImage: BG_CUBES }} />
          <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-black/10" />
        </>
      )
    case "chrome":
      return <ChromeVisual />
    case "iridescence":
      return <IridescenceVisual />
    case "orb":
      return <OrbVisual />
    case "threads":
      return <ThreadsVisual />
  }
}

// C2 · 分屏：左面板（图 / 材质动效）+ 右表单
function Split({ panel }: { panel: SplitPanel }) {
  const dark = panel !== "iridescence"
  const sloganPosition = panel === "orb" ? "justify-end" : "justify-between"
  return (
    <div className="grid min-h-svh lg:grid-cols-2">
      <aside className={cn("relative hidden overflow-hidden lg:flex lg:flex-col lg:p-12", sloganPosition, dark ? "bg-black text-white" : "bg-[#f4efe9] text-foreground")}>
        <PanelBackground panel={panel} />
        {panel === "orb" ? null : <Wordmark inverted={dark} className="relative" />}
        {panel === "orb" ? (
          <div className="relative flex items-end justify-between gap-6">
            <Slogan dark />
          </div>
        ) : (
          <Slogan dark={dark} />
        )}
        <div className="relative flex items-center justify-between">
          <Footer className={cn(dark && "text-white/40")} />
          {panel === "image" ? <Credit text="示例图 · Unsplash / Milad Fakurian · 正式版换生图" /> : null}
        </div>
      </aside>
      <main className="flex flex-col p-6 md:p-10">
        <div className="flex items-center justify-between lg:hidden"><Wordmark /></div>
        <div className="flex flex-1 items-center justify-center">
          <div className="flex w-full max-w-[360px] flex-col gap-8">
            <Heading />
            <Form />
          </div>
        </div>
        <Footer className="lg:hidden" />
      </main>
    </div>
  )
}

// A · 极简居中（落选，留作对照）
function Minimal() {
  return (
    <div className="flex min-h-svh flex-col bg-background">
      <div className="flex items-center justify-between px-6 py-5 md:px-10">
        <Wordmark />
        <Footer className="hidden sm:block" />
      </div>
      <main className="flex flex-1 items-start justify-center px-6 pt-[12vh] pb-16">
        <div className="flex w-full max-w-[360px] flex-col gap-8">
          <div className="flex flex-col items-center gap-5 text-center">
            <span className="flex size-12 items-center justify-center rounded-2xl bg-foreground text-background shadow-[0_8px_24px_-12px_rgba(0,0,0,0.6)]">
              <IconInnerShadowTop className="size-6" />
            </span>
            <Heading align="center" />
          </div>
          <Form />
        </div>
      </main>
    </div>
  )
}

// C · 全屏品牌底 + 玻璃卡（落选，留作对照）
function Glass() {
  const noise = "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.5'/%3E%3C/svg%3E\")"
  return (
    <div className="relative flex min-h-svh flex-col overflow-hidden bg-[#f6f6f7]">
      <div aria-hidden className="pointer-events-none absolute inset-0" style={{ background: "radial-gradient(60% 50% at 18% 12%, color-mix(in oklch, var(--kp-tone) 32%, transparent), transparent 70%), radial-gradient(50% 45% at 85% 90%, color-mix(in oklch, var(--kp-tone) 16%, transparent), transparent 70%)" }} />
      <div aria-hidden className="pointer-events-none absolute inset-0 opacity-[0.35] mix-blend-multiply" style={{ backgroundImage: noise }} />
      <div className="relative flex items-center justify-between px-6 py-5 md:px-10">
        <Wordmark />
        <Footer className="hidden sm:block" />
      </div>
      <main className="relative flex flex-1 items-center justify-center px-6 pb-16">
        <div className="kp-glass w-full max-w-[400px] rounded-2xl border border-white/60 bg-white/70 p-8 shadow-[0_24px_64px_-24px_rgba(0,0,0,0.28)] backdrop-blur-xl">
          <div className="flex flex-col gap-8">
            <Heading />
            <Form />
          </div>
        </div>
      </main>
    </div>
  )
}

export function LoginDirection({ variant, panel = "image" }: { variant: LoginVariant; panel?: SplitPanel }) {
  if (variant === "bleed") return <Bleed />
  if (variant === "split") return <Split panel={panel} />
  if (variant === "glass") return <Glass />
  return <Minimal />
}
