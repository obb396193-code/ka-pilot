export type RoleMode = "optimizer" | "manager" | "hybrid";
export type RiskLevel = "critical" | "warning" | "healthy";

export const dashboardTotals = {
  spend: 128640.72,
  conversions: 2080,
  realCpa: 61.85,
  targetCpa: 58,
  completion: 0.824,
  gap: 0.068,
  activeAccounts: 46,
  riskyAccounts: 3,
};

export const accounts = [
  {
    id: "DEMO-A01",
    name: "演示账户-A01",
    task: "新客增长计划",
    owner: "演示成员-甲",
    spend: 28640.18,
    conversions: 402,
    cpa: 71.24,
    target: 58,
    trend: 0.124,
    risk: "critical" as RiskLevel,
    synthetic: true,
  },
  {
    id: "DEMO-A02",
    name: "演示账户-A02",
    task: "重点单品放量",
    owner: "演示成员-乙",
    spend: 24680.32,
    conversions: 448,
    cpa: 55.09,
    target: 58,
    trend: -0.041,
    risk: "healthy" as RiskLevel,
    synthetic: true,
  },
  {
    id: "DEMO-A03",
    name: "演示账户-A03",
    task: "老客召回测试",
    owner: "演示成员-甲",
    spend: 19472.8,
    conversions: 280,
    cpa: 69.55,
    target: 62,
    trend: 0.087,
    risk: "warning" as RiskLevel,
    synthetic: true,
  },
  {
    id: "DEMO-A04",
    name: "演示账户-A04",
    task: "素材方向验证",
    owner: "演示成员-丙",
    spend: 17620.42,
    conversions: 321,
    cpa: 54.89,
    target: 60,
    trend: -0.022,
    risk: "healthy" as RiskLevel,
    synthetic: true,
  },
  {
    id: "DEMO-A05",
    name: "演示账户-A05",
    task: "区域增量探索",
    owner: "演示成员-乙",
    spend: 14350.0,
    conversions: 202,
    cpa: 71.04,
    target: 64,
    trend: 0.064,
    risk: "warning" as RiskLevel,
    synthetic: true,
  },
  {
    id: "DEMO-A06",
    name: "演示账户-A06",
    task: "稳定跑量维护",
    owner: "演示成员-丙",
    spend: 13420.0,
    conversions: 247,
    cpa: 54.33,
    target: 58,
    trend: -0.018,
    risk: "healthy" as RiskLevel,
    synthetic: true,
  },
];

export const trendData = [
  { time: "08:00", spend: 12.6, cpa: 64.8, target: 58 },
  { time: "09:00", spend: 24.8, cpa: 63.2, target: 58 },
  { time: "10:00", spend: 38.1, cpa: 60.7, target: 58 },
  { time: "11:00", spend: 52.9, cpa: 59.4, target: 58 },
  { time: "12:00", spend: 66.7, cpa: 61.1, target: 58 },
  { time: "13:00", spend: 79.3, cpa: 60.2, target: 58 },
  { time: "14:00", spend: 93.8, cpa: 62.8, target: 58 },
  { time: "15:00", spend: 107.4, cpa: 61.9, target: 58 },
  { time: "16:00", spend: 118.2, cpa: 61.2, target: 58 },
  { time: "17:00", spend: 128.6, cpa: 61.85, target: 58 },
];

export const actionQueue = [
  {
    id: "Q-01",
    level: "critical" as RiskLevel,
    title: "演示账户-A01 连续 90 分钟超成本",
    detail: "真实 CPA ¥71.24，高于考核价 22.8%",
    action: "查看诊断",
    time: "4 分钟前",
  },
  {
    id: "Q-02",
    level: "warning" as RiskLevel,
    title: "老客召回测试消耗增速异常",
    detail: "近 30 分钟消耗 +38%，转化未同步增长",
    action: "核对时段",
    time: "12 分钟前",
  },
  {
    id: "Q-03",
    level: "warning" as RiskLevel,
    title: "区域增量探索数据延迟",
    detail: "媒体数据已更新，后端真实转化延迟 18 分钟",
    action: "检查数据",
    time: "18 分钟前",
  },
];

export const teamRanking = [
  { name: "演示成员-乙", completion: 0.912, cpa: 56.4, tasks: 4 },
  { name: "演示成员-丙", completion: 0.864, cpa: 58.9, tasks: 5 },
  { name: "演示成员-甲", completion: 0.782, cpa: 65.2, tasks: 6 },
];

const roleCopy = {
  optimizer: {
    eyebrow: "MY OPERATIONS · 08/20",
    title: "先处理 3 个异常账户",
    description: "把影响跑量和成本的事情排在最前面，确认后再执行。",
    primaryLabel: "今日需要处理",
  },
  manager: {
    eyebrow: "KA OVERVIEW · AUGUST",
    title: "目标完成 82.4%，风险集中在两项任务",
    description: "先看目标差距和团队负载，再决定资源向哪里倾斜。",
    primaryLabel: "需要负责人拍板",
  },
  hybrid: {
    eyebrow: "OPERATING PULSE · LIVE",
    title: "经营态势稳定，5 项工作需要推进",
    description: "同屏保留经营结论和个人行动队列，适合综合演示。",
    primaryLabel: "经营与行动",
  },
};

export const roleViews = {
  optimizer: { ...roleCopy.optimizer, totals: dashboardTotals },
  manager: { ...roleCopy.manager, totals: dashboardTotals },
  hybrid: { ...roleCopy.hybrid, totals: dashboardTotals },
} satisfies Record<
  RoleMode,
  {
    eyebrow: string;
    title: string;
    description: string;
    primaryLabel: string;
    totals: typeof dashboardTotals;
  }
>;
