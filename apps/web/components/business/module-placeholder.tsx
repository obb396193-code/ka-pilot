import { IconArrowRight, IconCircleCheck } from "@tabler/icons-react"
import Link from "next/link"

import { PageShell } from "@/components/data-view/page-shell"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export function ModulePlaceholder({
  eyebrow,
  title,
  description,
  capabilities,
  primaryHref = "/",
}: {
  eyebrow: string
  title: string
  description: string
  capabilities: string[]
  primaryHref?: string
}) {
  return (
    <PageShell eyebrow={eyebrow} title={title} description={description} actions={<Badge variant="secondary">页面框架已就绪</Badge>}>
      <Card className="max-w-4xl shadow-xs">
        <CardHeader><CardTitle className="text-base">当前可用边界</CardTitle></CardHeader>
        <CardContent className="space-y-5">
          <ul className="grid gap-3 sm:grid-cols-2">
            {capabilities.map((capability) => (
              <li key={capability} className="flex items-start gap-2 rounded-lg border p-3 text-sm"><IconCircleCheck className="mt-0.5 size-4 shrink-0 text-muted-foreground" /><span>{capability}</span></li>
            ))}
          </ul>
          <p className="text-sm leading-6 text-muted-foreground">本页不伪造未接入的业务能力；可操作的纵向切片已在工作台、数据分析和账户链路中提供。</p>
          <Button asChild variant="outline"><Link href={primaryHref}>前往可用功能<IconArrowRight /></Link></Button>
        </CardContent>
      </Card>
    </PageShell>
  )
}
