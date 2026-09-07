// 九项一级导航（PRD 2.1 顺序）——侧栏、面包屑、命令面板共用一份，避免各处各写一遍
export const primaryNavigation = [
  { title: "工作台", url: "/", hint: "今天我干啥" },
  { title: "投放任务", url: "/tasks", hint: "任务跑得咋样" },
  { title: "数据分析", url: "/data", hint: "数据到底咋样" },
  { title: "账户池", url: "/accounts", hint: "户咋样" },
  { title: "自动化", url: "/automation", hint: "流程和规则" },
  { title: "商品素材", url: "/materials", hint: "素材和品咋样" },
  { title: "报告", url: "/reports", hint: "要交的东西" },
  { title: "知识库", url: "/knowledge", hint: "沉淀与检索" },
  { title: "集成与通知", url: "/integrations", hint: "触达与值守" },
] as const

export function pageTitleFor(pathname: string): string {
  if (pathname === "/") return "经营工作台"
  if (pathname.startsWith("/diagnostics")) return "工作项详情"
  if (pathname.startsWith("/settings")) return "设置"
  if (pathname.startsWith("/admin")) return "治理后台"
  const hit = primaryNavigation.find((item) => item.url !== "/" && (pathname === item.url || pathname.startsWith(`${item.url}/`)))
  return hit ? hit.title : "KA Pilot"
}
