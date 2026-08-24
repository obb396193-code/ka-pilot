import type { MetricAuthorityMatrix, QueryData, QueryId, QueryRequest } from "./contracts.ts"
import type { DataResponse, LineageBundle, MetricValue, SourceLineage } from "./data-view.ts"

const DEMO_AS_OF = "2026-08-24T09:30:00+08:00"

const sourceLineages: Record<"ka_data" | "platform", SourceLineage> = {
  ka_data: {
    source: "ka_data",
    sourceLabel: "KA Data 运营权威版 · 脱敏 Mock",
    dataAsOf: DEMO_AS_OF,
    datasetVersion: "ka-demo-20260824-r3",
    queryTemplateVersion: "account-table-v1-mock",
    timezone: "Asia/Shanghai",
    dayCut: "00:00",
    coverage: "20/20 个脱敏账户",
    truncated: false,
    partial: false,
    stale: false,
    warnings: ["当前为严格 mock，待内网 KA Data Contract 联调"],
  },
  platform: {
    source: "platform",
    sourceLabel: "自建平台版 · 当日实时诊断/执行检查 · 脱敏 Mock",
    dataAsOf: DEMO_AS_OF,
    datasetVersion: "platform-demo-20260824-r7",
    queryTemplateVersion: "account-table-v1-mock",
    timezone: "Asia/Shanghai",
    dayCut: "00:00",
    coverage: "18/20 个脱敏账户",
    truncated: false,
    partial: true,
    stale: false,
    warnings: ["2 个账户该来源缺失；缺失值不会按 0 展示"],
  },
}

function lineageByView(dataView: QueryRequest["dataView"]): LineageBundle {
  if (dataView === "reconcile") {
    return {
      mode: "reconcile",
      kaData: { ...sourceLineages.ka_data, truncated: true, warnings: [...sourceLineages.ka_data.warnings, "Mock 对账仅展示前 20 行"] },
      platform: { ...sourceLineages.platform, truncated: true, warnings: [...sourceLineages.platform.warnings, "Mock 差异值由服务端候选口径提供"] },
      comparability: { comparable: false, reason: "平台侧仅覆盖 18/20 个脱敏账户" },
    }
  }
  return { mode: "single", source: sourceLineages[dataView] }
}

const value = (raw: number, displayValue: string): MetricValue => ({ value: raw, displayValue, availability: "available" })
const missing = (availability: Exclude<MetricValue["availability"], "available"> = "missing"): MetricValue => ({ value: null, displayValue: availability === "missing" ? "该来源缺失" : "−", availability })
const missingSource = () => ({ spend: missing(), conversions: missing(), cpa: missing() })

const authorityByMetric: MetricAuthorityMatrix = {
  spend: { defaultSource: "platform", status: "realtime", reason: "当日实时消耗由后端矩阵指定 platform" },
  conversions: { defaultSource: "platform", status: "realtime", reason: "当日实时转化由后端矩阵指定 platform" },
  cpa: { defaultSource: "platform", status: "realtime", reason: "当日实时 CPA 由后端矩阵指定 platform" },
  assessmentCpa: { defaultSource: "source_versioned", status: "versioned", reason: "考核价按来源与生效版本展示，禁止跨源混算" },
}

const metrics = [
  { key: "spend", label: "今日消耗", value: "¥ 842,600", delta: "+8.2%", tone: "neutral" as const },
  { key: "cpa", label: "真实 CPA", value: "¥ 36.80", delta: "考核价 ¥ 38.00", tone: "positive" as const },
  { key: "compliance", label: "达标率", value: "76.4%", delta: "环比 +2.1pp", tone: "positive" as const },
  { key: "cost_space", label: "成本空间", value: "¥ 27,400", delta: "服务端口径", tone: "neutral" as const },
  { key: "bi_volume", label: "BI 量级", value: "18,620", delta: "环比 -3.8%", tone: "warning" as const },
  { key: "risk", label: "待处理", value: "7", delta: "其中 P0 2 项", tone: "critical" as const },
]

const rows = [
  {
    accountId: "demo-account-07",
    accountName: "演示账户 · 华东 07",
    owner: "优化师 A",
    kaData: { spend: value(126000, "¥ 126,000"), conversions: value(2940, "2,940"), cpa: value(42.86, "¥ 42.86") },
    platform: { spend: value(126800, "¥ 126,800"), conversions: value(2940, "2,940"), cpa: value(43.13, "¥ 43.13") },
    assessmentCpa: value(38, "¥ 38.00"),
    comparison: { comparable: true, reason: null, delta: value(0.27, "+¥ 0.27"), deltaRate: value(0.0063, "+0.63%") },
    authorityByMetric,
    status: "critical" as const,
  },
  {
    accountId: "demo-account-12",
    accountName: "演示账户 · 华南 12",
    owner: "优化师 B",
    kaData: { spend: value(99007, "¥ 99,007"), conversions: value(2735, "2,735"), cpa: value(36.2, "¥ 36.20") },
    platform: { spend: value(98200, "¥ 98,200"), conversions: value(2735, "2,735"), cpa: value(35.9, "¥ 35.90") },
    assessmentCpa: value(38, "¥ 38.00"),
    comparison: { comparable: true, reason: null, delta: value(-0.3, "-¥ 0.30"), deltaRate: value(-0.0083, "-0.83%") },
    authorityByMetric,
    status: "healthy" as const,
  },
  {
    accountId: "demo-account-18",
    accountName: "演示账户 · 华北 18",
    owner: "优化师 C",
    kaData: { spend: value(80274, "¥ 80,274"), conversions: value(2020, "2,020"), cpa: value(39.74, "¥ 39.74") },
    platform: missingSource(),
    assessmentCpa: value(40, "¥ 40.00"),
    comparison: { comparable: false, reason: "platform 该来源缺失", delta: missing(), deltaRate: missing() },
    authorityByMetric,
    status: "unavailable" as const,
  },
]

const dataByQuery: { [K in QueryId]: QueryData<K> } = {
  workbench: {
    greeting: "早上好，KA 经营团队",
    scopeLabel: "2026-08-24 · 脱敏演示数据",
    metrics,
    anomalies: [
      {
        id: "finding-cost-001",
        accountId: "demo-account-07",
        accountName: "演示账户 · 华东 07",
        title: "CPA 连续 3 个时段高于考核价",
        severity: "critical",
        evidence: "服务端规则命中：当前 CPA ¥43.13，考核价 ¥38.00",
        attribution: "素材疲劳与高成本人群占比同步上升",
        suggestedAction: "先收紧异常时段预算，再复核素材与人群",
        cta: "预览调整",
      },
      {
        id: "finding-coverage-002",
        accountId: "demo-account-18",
        accountName: "演示账户 · 华北 18",
        title: "平台数据源延迟",
        severity: "warning",
        evidence: "真实 CPA −；真实转化为 0，最近成功批次停留在 08:30",
        attribution: "平台取数批次延迟，未取得完整分时数据",
        suggestedAction: "保持只读，等待数据恢复后重新诊断",
        cta: "查看数据状态",
      },
    ],
    accountCoverage: "18 / 20",
    healthyAccountMessage: "其余 15 个账户在阈值内，无需逐户查看",
    trend: [
      { label: "8/18", spend: 724000, realCpa: 39.1 },
      { label: "8/19", spend: 768000, realCpa: 38.4 },
      { label: "8/20", spend: 751000, realCpa: null },
      { label: "8/21", spend: 796000, realCpa: 37.9 },
      { label: "8/22", spend: 812000, realCpa: 37.2 },
      { label: "8/23", spend: 826000, realCpa: 36.9 },
      { label: "8/24", spend: 842600, realCpa: 36.8 },
    ],
    yesterdayActions: [
      { id: "recovery-01", title: "演示账户 · 华南 12 降低高价人群出价", result: "positive", evidence: "T+1 真实 CPA 回落 6.4%" },
      { id: "recovery-02", title: "演示账户 · 华北 03 暂停低效素材", result: "negative", evidence: "量级下降 11.2%，需重新评估" },
    ],
    todos: [
      { label: "上级派发", value: "4", kind: "assigned" },
      { label: "自建待办", value: "3", kind: "self_created" },
    ],
    morningBrief: {
      title: "AAC 拉新 · 今日经营早报",
      summary: "整体 CPA 处于考核线内，但 2 个账户需要优先核查；平台数据有 1 个批次延迟。",
      details: ["先处理 P0 成本异常，再核查延迟账户", "昨日 2 个动作中 1 个有效、1 个需回滚评估", "所有数据均为脱敏示例"],
    },
    alerts: [
      { level: "P0", label: "成本异常", value: "2", detail: "连续时段超过考核价" },
      { level: "P1", label: "数据与余额预警", value: "5", detail: "含 2 个部分数据账户" },
    ],
  },
  analysis: {
    mode: "platform",
    rows,
    summary: "3 个脱敏账户示例；差异率和 CPA 均由服务端口径层提供。",
  },
  accountDetail: {
    accountId: "demo-account-07",
    accountName: "演示账户 · 华东 07",
    owner: "优化师 A",
    status: "critical",
    metrics: metrics.slice(0, 3),
    trend: [
      { label: "08:00", cpa: 36.2, assessmentCpa: 38 },
      { label: "09:00", cpa: 39.4, assessmentCpa: 38 },
      { label: "10:00", cpa: 41.8, assessmentCpa: 38 },
      { label: "11:00", cpa: 43.13, assessmentCpa: 38 },
    ],
    currentFindingId: "finding-cost-001",
    currentFindingTitle: "CPA 连续 3 个时段高于考核价",
  },
  findingDetail: {
    findingId: "finding-cost-001",
    accountId: "demo-account-07",
    accountName: "演示账户 · 华东 07",
    title: "CPA 连续 3 个时段高于考核价",
    severity: "critical",
    deterministicConclusion: "确定性规则 D-CPA-003 已命中；该结论由服务端规则计算，前端只展示证据。",
    evidence: [
      { label: "当前 CPA", value: "¥ 43.13", source: "platform.metrics.cpa_display" },
      { label: "考核价", value: "¥ 38.00", source: "account.assessment_cpa_display" },
      { label: "连续时段", value: "3", source: "diagnosis.rule_window" },
    ],
    aiInterpretation: "可能与午前流量结构变化有关；建议先核查素材与人群分布，再决定是否调整。",
    aiConfidence: "中等 · 仅解释，不构成执行指令",
    changeSetId: "changeset-demo-001",
  },
  changeSetPreview: {
    changeSetId: "changeset-demo-001",
    accountId: "demo-account-07",
    accountName: "演示账户 · 华东 07",
    status: "preview_only",
    expiresAt: "2026-08-24T10:00:00+08:00",
    items: [
      { field: "计划预算", from: "¥ 50,000 / 日", to: "¥ 45,000 / 日", reason: "控制异常时段风险敞口" },
      { field: "执行时段", from: "全天", to: "12:00–18:00 暂停扩量", reason: "等待素材与人群复核" },
    ],
    riskChecks: [
      { label: "预览 TTL", passed: true, detail: "30 分钟内有效" },
      { label: "权限与账户范围", passed: true, detail: "仅脱敏演示账户" },
      { label: "媒体写端点", passed: false, detail: "本切片未接真实执行端点" },
    ],
    executionEndpointConfigured: false,
  },
}

function applyState(lineage: SourceLineage, state: QueryRequest["state"]): SourceLineage {
  return {
    ...lineage,
    partial: state === "partial" || lineage.partial,
    stale: state === "stale",
    warnings: state === "stale" ? [...lineage.warnings, "数据已超过当前演示 SLA，请勿据此确认变更"] : lineage.warnings,
  }
}

function stateLineage(request: QueryRequest): LineageBundle {
  const base = lineageByView(request.dataView)
  const state = request.state ?? "success"
  if (base.mode === "single") return { mode: "single", source: applyState(base.source, state) }
  return { ...base, kaData: applyState(base.kaData, state), platform: applyState(base.platform, state) }
}

function rowsForMode(dataView: QueryRequest["dataView"]): QueryData<"analysis">["rows"] {
  return rows.map((row) => {
    if (dataView === "reconcile") return row
    return {
      ...row,
      kaData: dataView === "ka_data" ? row.kaData : missingSource(),
      platform: dataView === "platform" ? row.platform : missingSource(),
      comparison: { comparable: false, reason: "单源视图不生成对账结论", delta: missing(), deltaRate: missing() },
    }
  })
}

export function getMockResponse<T extends QueryId>(
  request: QueryRequest<T>,
): DataResponse<QueryData<T>> {
  const state = request.state ?? "success"
  const baseData = dataByQuery[request.queryId] as QueryData<T>
  const modeAdjustedData =
    request.queryId === "analysis"
      ? ({ ...(baseData as QueryData<"analysis">), mode: request.dataView, rows: rowsForMode(request.dataView) } as QueryData<T>)
      : baseData
  const data =
    state === "empty" && request.queryId === "analysis"
      ? ({ ...(modeAdjustedData as QueryData<"analysis">), rows: [] } as QueryData<T>)
      : modeAdjustedData

  const messages: Partial<Record<typeof state, string>> = {
    loading: "正在读取查询结果…",
    empty: "当前筛选范围没有结果。",
    error: "查询暂时失败，请稍后重试。",
    "no-access": "当前身份没有这个数据范围的读取权限。",
    partial: "部分来源尚未返回，现有结果可查看但不可用于写操作。",
    stale: "当前结果超过时效门，请刷新数据后再判断。",
  }

  return {
    state,
    lineage: stateLineage(request),
    data,
    message: messages[state],
  }
}
