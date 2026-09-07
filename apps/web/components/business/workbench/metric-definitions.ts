// 六 KPI 的口径说明（展示文案，公式来自 packages/contract/metrics.md；前端只解释、不计算）。
export type MetricDefinition = {
  /** footer 第一行：一句副注 */
  caption: string
  /** footer 第二行：短公式 */
  short: string
  /** tooltip：完整公式 */
  formula: string
  /** tooltip：数据来源 */
  source: string
}

export const metricDefinitions: Record<string, MetricDefinition> = {
  spend: { caption: "账面消耗 · 当日实时", short: "account_cost 累计", formula: "当日实时累计的账面消耗；历史日以离线结算口径为权威", source: "奇航 account_realtime" },
  cpa: { caption: "考核价对比接入后显示达标态", short: "消耗 ÷ 真实转化", formula: "真实 CPA = 消耗 ÷ 真实转化；分母为 0 且消耗 > 0 显 ∞，无意义显 −", source: "domain 计算，前端不重算" },
  compliance: { caption: "达标 = 真实 CPA ≤ 考核价", short: "达标账户 ÷ 有真实转化账户", formula: "达标率 = 达标账户数 ÷ 有真实转化的账户数；分母为 0 显 −", source: "domain 计算，考核价取当日生效版本" },
  cost_space: { caption: "正值 = 仍有降价空间", short: "考核价 × 真实转化 − 现金消耗", formula: "成本空间 = 考核价 × 真实转化 − 现金消耗；现金消耗 = (账面消耗 − 赔付) ÷ 渠道系数", source: "domain 计算，系数版本化" },
  bi_volume: { caption: "真实转化，与 FBI 同源", short: "account_real_conversion", formula: "BI 量级 = 后端真实转化数（account_real_conversion）", source: "奇航 account_realtime" },
  risk: { caption: "规则命中、需要今天处理", short: "异常账户行数", formula: "待处理 = 异常查询返回的账户行数；严重度见队列", source: "account.anomalies" },
}

export function metricDefinition(key: string): MetricDefinition | undefined {
  return metricDefinitions[key]
}
