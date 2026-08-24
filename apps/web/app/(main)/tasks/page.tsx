import { ModulePlaceholder } from "@/components/business/module-placeholder"

export default function TasksPage() {
  return <ModulePlaceholder eyebrow="KA Pilot · 任务" title="AAC 拉新" description="首项任务的经营框架；指标、进度与达标结论将由 domain/API 直接提供。" capabilities={["任务名称已按冻结文案固定为 AAC 拉新", "页面不计算 CPA、达标率、Gap 或环比", "任务详情等待 /api/v1/tasks/:id 内网响应样本"]} primaryHref="/accounts" />
}
