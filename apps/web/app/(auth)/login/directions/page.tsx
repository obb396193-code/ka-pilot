import Link from "next/link"
import { IconArrowRight } from "@tabler/icons-react"

import { loginVariants, splitPanels } from "@/components/business/auth/login-directions"
import { Badge } from "@/components/ui/badge"

// 登录页方向索引（dev 对比用）；每个是整页，点进去看真实观感（动效类要动一动鼠标）
function Row({ href, label, tag, hint }: { href: string; label: string; tag: string; hint: string }) {
  return (
    <Link href={href} className="group flex items-center justify-between gap-4 rounded-xl border bg-card p-5 transition-colors hover:bg-muted/50">
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2 text-sm font-medium">{label}<Badge variant="outline" className="text-muted-foreground">{tag}</Badge></div>
        <div className="text-sm text-muted-foreground">{hint}</div>
      </div>
      <IconArrowRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
    </Link>
  )
}

export default function LoginDirectionsPage() {
  const bleed = loginVariants.find((item) => item.value === "bleed")!
  const rejected = loginVariants.filter((item) => item.value === "minimal" || item.value === "glass")
  return (
    <div className="mx-auto flex min-h-svh w-full max-w-3xl flex-col gap-8 px-6 py-12">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold tracking-tight">登录页 · 第三轮候选（照大厂做法）</h1>
        <p className="text-sm text-muted-foreground">
          实测巨量引擎 / 千川 / 磁力金牛 / 腾讯营销 / 飞书 / Stripe / Figma / Linear 的登录页，笔记在 <code className="rounded bg-muted px-1">docs/frontend/ui-assets/decisions/login-references-2026-09-05.md</code>。
          投放平台的共同做法是「一张高质量品牌视觉图 + 浮卡」。图先用 Unsplash 免费 3D 渲染占位，正式版换生图（brief 在笔记里）。五块 shadcn 官方原样 Block 见 <Link href="/login/candidates" className="underline underline-offset-4">/login/candidates</Link>。
        </p>
      </div>
      <div className="flex flex-col gap-3">
        <Row href="/login/directions/bleed" label={bleed.label} tag={`参考 ${bleed.ref}`} hint={bleed.hint} />
        {splitPanels.map((panel) => <Row key={panel.value} href={`/login/directions/split?panel=${panel.value}`} label={panel.label} tag={panel.source} hint={panel.hint} />)}
      </div>
      <div className="flex flex-col gap-3">
        <div className="text-xs font-medium text-muted-foreground">落选方向（留作对照）</div>
        {rejected.map((variant) => <Row key={variant.value} href={`/login/directions/${variant.value}`} label={variant.label} tag={`参考 ${variant.ref}`} hint={variant.hint} />)}
      </div>
    </div>
  )
}
