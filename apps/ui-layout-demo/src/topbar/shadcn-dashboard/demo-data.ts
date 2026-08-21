import type { DashboardView } from "./team-switcher";

export const viewLabels: Record<DashboardView, string> = {
  optimizer: "快手优化师",
  ka: "KA 负责人",
  executive: "综合首页",
};

export const kpis: Record<
  DashboardView,
  Array<{ label: string; value: string; change: string }>
> = {
  optimizer: [
    { label: "今日消耗", value: "¥128,430", change: "较昨日 +8.4%" },
    { label: "真实 CPA", value: "¥36.20", change: "低于考核价 ¥2.80" },
    { label: "达标率", value: "87.6%", change: "较昨日 +3.2 个百分点" },
    { label: "待处理", value: "6", change: "其中 P0 事项 1 条" },
  ],
  ka: [
    { label: "今日消耗", value: "¥486,920", change: "较昨日 +5.2%" },
    { label: "真实 CPA", value: "¥39.80", change: "低于考核价 ¥1.20" },
    { label: "达标率", value: "91.3%", change: "4 个项目组中 3 个达标" },
    { label: "待处理", value: "18", change: "跨账户高优事项 4 条" },
  ],
  executive: [
    { label: "今日消耗", value: "¥1,284,300", change: "本月累计 ¥2,682 万" },
    { label: "真实 CPA", value: "¥35.70", change: "环比改善 4.8%" },
    { label: "达标率", value: "93.8%", change: "7 个业务组中 6 个达标" },
    { label: "待处理", value: "27", change: "需负责人拍板 3 条" },
  ],
};

export const chartData = [
  { date: "2026-08-08", spend: 92, realCpa: 41.8 },
  { date: "2026-08-09", spend: 96, realCpa: 40.6 },
  { date: "2026-08-10", spend: 101, realCpa: 39.9 },
  { date: "2026-08-11", spend: 98, realCpa: 40.2 },
  { date: "2026-08-12", spend: 108, realCpa: 38.7 },
  { date: "2026-08-13", spend: 112, realCpa: 37.9 },
  { date: "2026-08-14", spend: 106, realCpa: 38.4 },
  { date: "2026-08-15", spend: 116, realCpa: 37.1 },
  { date: "2026-08-16", spend: 121, realCpa: 36.8 },
  { date: "2026-08-17", spend: 118, realCpa: 37.3 },
  { date: "2026-08-18", spend: 124, realCpa: 36.6 },
  { date: "2026-08-19", spend: 128, realCpa: 36.2 },
  { date: "2026-08-20", spend: 126, realCpa: 36.5 },
  { date: "2026-08-21", spend: 128, realCpa: 36.2 },
];

export const recentTasks = [
  {
    name: "AAC 拉新",
    account: "CVR 业务 · AAC 新装归因",
    status: "CPA ¥36.20",
    initials: "A",
  },
  {
    name: "闲鱼唤端召回",
    account: "唤端链路 · wake_uv",
    status: "成本达标",
    initials: "唤",
  },
  {
    name: "闲鱼潜客转化",
    account: "潜客链路 · aac_ptt_uv",
    status: "待复核",
    initials: "潜",
  },
  {
    name: "新建广告存活检查",
    account: "新计划 24h · 0 消耗",
    status: "P0 待处理",
    initials: "0",
  },
  {
    name: "主力广告依赖排查",
    account: "结构风险 · 消耗集中度过高",
    status: "需调整",
    initials: "风",
  },
];
