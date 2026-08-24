import type { QueryData, QueryId, QueryRequest } from "./contracts"
import type { DataResponse, SourceLineage } from "./data-view"

const DEMO_AS_OF = "2026-08-24T09:30:00+08:00"

const lineageByView: Record<QueryRequest["dataView"], SourceLineage> = {
  ka_data: {
    source: "ka_data",
    sourceLabel: "KA Data 权威版 · 脱敏演示",
    dataAsOf: DEMO_AS_OF,
    datasetVersion: "ka-demo-20260824-r3",
    coverage: "20/20 个脱敏账户",
    truncated: false,
    partial: false,
    stale: false,
    warnings: ["当前为严格 mock，待内网 KA Data Contract 联调"],
  },
  platform: {
    source: "platform",
    sourceLabel: "自建平台版 · 脱敏演示",
    dataAsOf: DEMO_AS_OF,
    datasetVersion: "platform-demo-20260824-r7",
    coverage: "18/20 个脱敏账户",
    truncated: false,
    partial: true,
    stale: false,
    warnings: ["2 个账户待补数据源；缺失值不会按 0 展示"],
  },
  reconcile: {
    source: "reconcile",
    sourceLabel: "双源对账 · 脱敏演示",
    dataAsOf: DEMO_AS_OF,
    datasetVersion: "reconcile-demo-20260824-r2",
    coverage: "18/20 个账户完成双源匹配",
    truncated: true,
    partial: true,
    stale: false,
    warnings: ["仅展示差异最大的前 20 行", "差异值由服务端口径层提供，前端不计算"],
  },
}

const metrics = [
  { key: "spend", label: "今日消耗", value: "¥ 842,600", delta: "+8.2%", tone: "neutral" as const },
  { key: "cpa", label: "综合 CPA", value: "¥ 36.80", delta: "低于考核价 4.2%", tone: "positive" as const },
  { key: "risk", label: "高风险账户", value: "3", delta: "较昨日 +1", tone: "critical" as const },
  { key: "coverage", label: "数据覆盖", value: "18 / 20", delta: "2 个待补源", tone: "warning" as const },
]

const rows = [
  {
    accountId: "demo-account-07",
    accountName: "演示账户 · 华东 07",
    owner: "优化师 A",
    spend: { value: "¥ 126,800", availability: "available" as const },
    conversions: { value: "2,940", availability: "available" as const },
    cpa: { value: "¥ 43.13", availability: "available" as const },
    assessmentCpa: { value: "¥ 38.00", availability: "available" as const },
    difference: { value: "+¥ 5.13", availability: "available" as const },
    differenceRate: { value: "+13.5%", availability: "available" as const },
    status: "critical" as const,
  },
  {
    accountId: "demo-account-12",
    accountName: "演示账户 · 华南 12",
    owner: "优化师 B",
    spend: { value: "¥ 98,200", availability: "available" as const },
    conversions: { value: "2,735", availability: "available" as const },
    cpa: { value: "¥ 35.90", availability: "available" as const },
    assessmentCpa: { value: "¥ 38.00", availability: "available" as const },
    difference: { value: "-¥ 2.10", availability: "available" as const },
    differenceRate: { value: "-5.5%", availability: "available" as const },
    status: "healthy" as const,
  },
  {
    accountId: "demo-account-18",
    accountName: "演示账户 · 华北 18",
    owner: "优化师 C",
    spend: { value: null, availability: "unavailable" as const },
    conversions: { value: null, availability: "unavailable" as const },
    cpa: { value: null, availability: "unavailable" as const },
    assessmentCpa: { value: "¥ 40.00", availability: "available" as const },
    difference: { value: null, availability: "not-applicable" as const },
    differenceRate: { value: null, availability: "not-applicable" as const },
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
        cta: "查看诊断证据",
      },
      {
        id: "finding-coverage-002",
        accountId: "demo-account-18",
        accountName: "演示账户 · 华北 18",
        title: "平台数据源延迟",
        severity: "warning",
        evidence: "最近成功批次停留在 08:30，当前不按 0 参与判断",
        cta: "查看数据状态",
      },
    ],
    accountCoverage: "18 / 20",
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

function stateLineage(request: QueryRequest): SourceLineage {
  const base = lineageByView[request.dataView]
  const state = request.state ?? "success"
  return {
    ...base,
    partial: state === "partial" || base.partial,
    stale: state === "stale",
    warnings:
      state === "stale"
        ? [...base.warnings, "数据已超过当前演示 SLA，请勿据此确认变更"]
        : base.warnings,
  }
}

export function getMockResponse<T extends QueryId>(
  request: QueryRequest<T>,
): DataResponse<QueryData<T>> {
  const state = request.state ?? "success"
  const baseData = dataByQuery[request.queryId] as QueryData<T>
  const data =
    state === "empty" && request.queryId === "analysis"
      ? ({ ...(baseData as QueryData<"analysis">), rows: [] } as QueryData<T>)
      : baseData

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
