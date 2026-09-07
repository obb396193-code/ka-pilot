import type { Metadata } from "next"
import localFont from "next/font/local"
import "./globals.css"
import "./fonts/misans/misans.css"
import { THEME_INIT_SCRIPT } from "@/lib/theme/theme"

// 字体（老板 2026-09-05 定）：Geist 管英文数字；中文 Mac 走苹方，Windows 走自带 MiSans 切片兜底（scripts/fonts/prepare-misans.mjs 生成）。
// woff2 复制自 geist@1.7.2（SIL OFL 1.1，见 app/fonts/GEIST-LICENSE.txt），本地加载，不依赖外网。
const geistSans = localFont({
  src: "./fonts/Geist-Variable.woff2",
  variable: "--font-geist-sans",
  weight: "100 900",
  display: "swap",
})
const geistMono = localFont({
  src: "./fonts/GeistMono-Variable.woff2",
  variable: "--font-geist-mono",
  weight: "100 900",
  display: "swap",
})

export const metadata: Metadata = {
  title: "KA Pilot · 投放经营工作台",
  description: "KA Pilot 快手优化师经营工作台",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="zh-CN" className={`${geistSans.variable} ${geistMono.variable}`} data-theme-mode="bw" suppressHydrationWarning>
      <body>
        {/* 首屏前按本机记忆设置主题模式与主色，避免闪默认色；规则与 lib/theme/theme.ts 一致 */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        {children}
      </body>
    </html>
  )
}
