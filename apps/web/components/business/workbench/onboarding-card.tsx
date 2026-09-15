"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { IconArrowRight, IconCheck, IconX } from "@tabler/icons-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import { isOk } from "@/lib/fixtures/contract"
import { credentialsFixture } from "@/lib/fixtures/settings"
import { useWatchlist } from "@/lib/data/use-watchlist"

// 新人开工引导：三步都完成（或手动关掉）就不再出现。关闭状态只记在本机浏览器。
const DISMISS_KEY = "ka-pilot.onboarding.dismissed"
const IS_MOCK = process.env.NEXT_PUBLIC_KA_DATA_PROVIDER === "mock"

export function OnboardingCard() {
  const [dismissed, setDismissed] = useState(true)
  useEffect(() => {
    try { setDismissed(window.localStorage.getItem(DISMISS_KEY) === "1") } catch { setDismissed(false) }
  }, [])

  // 名单走真接口：读样例的话，真实模式下这一步永远显示「没做」，哪怕用户已经加过账户
  const watchlist = useWatchlist()
  const watching = watchlist.items.length > 0
  /**
   * 凭证这一步还**查不到真状态**：`/settings/credentials` 没有对应端点（BFF 里也没有）。
   * 真实模式下拿样例判「已绑定」就是假打钩——照着它走的人会以为绑过了，
   * 然后满页「−」不知道为什么。所以真实模式下这一步一律当「未知」：不打钩、照样给入口。
   */
  const credentials = IS_MOCK && isOk(credentialsFixture) ? credentialsFixture.data.items : []
  const boundQihang = IS_MOCK && credentials.some((item) => item.provider === "qihang" && item.bound)

  const steps = [
    { done: boundQihang, title: "绑定启航凭证", hint: IS_MOCK ? "没绑就没有数据，页面只会显示 −" : "没绑就没有数据，页面只会显示 −（绑没绑这里还查不到，去设置页看）", href: "/settings?tab=credentials", cta: "去绑定" },
    { done: watching, title: "挑几个账户加盯盘", hint: "盯盘的账户会出现在工作台和通知里", href: "/accounts", cta: "去账户池" },
    { done: false, title: "让 Agent 帮你看一遍昨天", hint: "右下角球，问「昨天哪些户超成本」", href: "/?agent=1", cta: "试一下" },
  ]
  const remaining = steps.filter((step) => !step.done).length
  if (dismissed || remaining === 0) return null

  return (
    <Card className="border-dashed">
      <CardContent className="flex flex-col gap-3 py-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-sm font-medium">三步开工</p>
            <p className="text-xs text-muted-foreground">还差 {remaining} 步；做完这张卡自动消失。</p>
          </div>
          <Button size="icon" variant="ghost" className="size-7" aria-label="不再显示" onClick={() => { setDismissed(true); try { window.localStorage.setItem(DISMISS_KEY, "1") } catch {} }}><IconX className="size-4" /></Button>
        </div>
        <ol className="grid gap-2 @3xl/main:grid-cols-3">
          {steps.map((step, index) => (
            <li key={step.title} className={cn("flex items-start gap-2.5 rounded-lg border px-3 py-2.5", step.done && "bg-muted/40")}>
              <span className={cn("mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full text-[11px] font-medium tabular-nums", step.done ? "bg-status-success/15 text-status-success" : "bg-muted text-muted-foreground")}>{step.done ? <IconCheck className="size-3.5" /> : index + 1}</span>
              <div className="min-w-0 flex-1">
                <p className={cn("text-sm", step.done && "text-muted-foreground line-through")}>{step.title}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{step.hint}</p>
                {step.done ? null : <Button asChild size="sm" variant="ghost" className="mt-1 h-6 px-1.5 text-xs"><Link href={step.href}>{step.cta}<IconArrowRight className="size-3" /></Link></Button>}
              </div>
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  )
}
