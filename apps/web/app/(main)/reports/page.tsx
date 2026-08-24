import { ModulePlaceholder } from "@/components/business/module-placeholder"

export default function ReportsPage() {
  return <ModulePlaceholder eyebrow="KA Pilot · 报告" title="报告" description="日报、周报和对账输出的统一入口。" capabilities={["报告路由与导航已就绪", "来源、截止时间与版本将随数据集展示", "导出端点待后端联调"]} primaryHref="/data" />
}
