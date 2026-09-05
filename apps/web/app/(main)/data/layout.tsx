import { DataNav } from "@/components/business/data/data-nav"
import { PageBody } from "@/components/business/page-header"

// 数据分析：页内收敛 tab（大盘 / 数据总表 / 维度透视），路由按 PRD 2.2
export default function DataLayout({ children }: { children: React.ReactNode }) {
  return (
    <PageBody>
      <DataNav />
      {children}
    </PageBody>
  )
}
