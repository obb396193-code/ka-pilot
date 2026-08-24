import { ModulePlaceholder } from "@/components/business/module-placeholder"

export default function AutomationPage() {
  return <ModulePlaceholder eyebrow="KA Pilot · 自动化" title="自动化" description="规则、流程和运行状态的统一入口。" capabilities={["规则解释接口已纳入后端 Contract", "媒体写操作必须先预览和二次确认", "运行中心待后端任务队列联调"]} primaryHref="/diagnostics/finding-cost-001" />
}
