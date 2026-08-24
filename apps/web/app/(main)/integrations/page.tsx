import { ModulePlaceholder } from "@/components/business/module-placeholder"

export default function IntegrationsPage() {
  return <ModulePlaceholder eyebrow="KA Pilot · 集成" title="集成与通知" description="内网数据、通知和凭证绑定状态入口。" capabilities={["前端支持 mock / internal_api 双 Provider", "Token 只在 Next.js 服务端使用", "当前不展示任何凭证原文"]} />
}
