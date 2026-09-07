"use client"

import dynamic from "next/dynamic"

// React Bits 官方 WebGL 背景件（ogl），只在客户端渲染；参数只调颜色/速度，不改源码
const LiquidChrome = dynamic(() => import("@/components/reactbits/LiquidChrome/LiquidChrome"), { ssr: false })
const Iridescence = dynamic(() => import("@/components/reactbits/Iridescence/Iridescence"), { ssr: false })
const Orb = dynamic(() => import("@/components/reactbits/Orb/Orb"), { ssr: false })
const Threads = dynamic(() => import("@/components/reactbits/Threads/Threads"), { ssr: false })

/** 液态金属丝带（≈ 磁力金牛那条丝带的动态版），黑白铬色，鼠标会扰动 */
export function ChromeVisual() {
  return <div className="absolute inset-0"><LiquidChrome baseColor={[0.1, 0.1, 0.1]} speed={0.18} amplitude={0.5} frequencyX={2.2} frequencyY={1.6} interactive /></div>
}

/** 光谱渐变（≈ Stripe 登录页那幅笔刷的动态版），暖调，跟鼠标 */
export function IridescenceVisual() {
  return <div className="absolute inset-0"><Iridescence color={[1, 0.82, 0.68]} speed={0.6} amplitude={0.12} mouseReact /></div>
}

/** 可交互光球：鼠标靠近会形变、旋转，带一点「玩」的成分 */
export function OrbVisual() {
  return (
    <div className="absolute inset-0 flex items-center justify-center">
      <div className="size-[min(70vh,640px)]"><Orb hue={200} hoverIntensity={0.6} rotateOnHover forceHoverState={false} backgroundColor="#000000" /></div>
    </div>
  )
}

/** 细线场：黑底白线随鼠标起伏，最素的一档 */
export function ThreadsVisual() {
  return <div className="absolute inset-0"><Threads color={[1, 1, 1]} amplitude={1.2} distance={0.2} enableMouseInteraction /></div>
}
