"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

import { PageHeader } from "@/components/business/page-header"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"

// 视图收敛 tab（不进侧栏、不开独立导航项）：大盘 / 数据总表 / 维度透视
const views = [
  { href: "/data", label: "大盘" },
  { href: "/data/table", label: "数据总表" },
  { href: "/data/pivot", label: "维度透视" },
]

export function DataNav() {
  const pathname = usePathname()
  const current = views.find((view) => view.href !== "/data" && pathname.startsWith(view.href))?.href ?? "/data"
  return (
    <>
      <PageHeader title="数据分析" description="全量明细不聚合不裁剪；指标、环比、达标全部由后端给，前端只展示" />
      <div className="px-4 lg:px-6">
        <Tabs value={current}>
          <TabsList variant="line">
            {views.map((view) => (
              <TabsTrigger key={view.href} value={view.href} asChild>
                <Link href={view.href}>{view.label}</Link>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>
    </>
  )
}
