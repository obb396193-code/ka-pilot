# 指标字典 v1.0（计算层唯一依据——packages/domain 按此实现，前端与 agent 永不自算）

## 双数据权威与可比性（2026-08-24 冻结）

权威按业务用途和时效决定，不能由前端或某个 Adapter 临时改优先级：

| 场景/指标组 | 默认权威来源 | Contract `authority.useCase` |
|---|---|---|
| 跨媒体经营、大盘、部门汇总 | KA Data | `cross_media_operations` |
| 历史运营分析、历史趋势 | KA Data | `historical_analysis` |
| 商品、素材、广告组、BI 分析 | KA Data | `product_material_adgroup_bi` |
| 当日实时消耗、转化、CPA | platform | `realtime_delivery` |
| 小时 pacing、时段趋势 | platform | `hourly_pacing` |
| 异常诊断、账户/广告下钻 | platform | `diagnostics` |
| 执行前检查、媒体对象状态 | platform | `pre_execution_check` |
| 动作效果回收、T+1/T+7 | platform | `effect_measurement` |
| 考核价、返点、赔付、现金成本 | 两边各自版本化 | `source_versioned_financials` |

- `ka_data` 和 `platform` 单模式只显示本来源值；主动查看非默认来源时用 `authority.role=comparison_reference` 明示，不自动切换或混算。
- `reconcile` 只并列双方原值和 lineage。双方完整、非 stale、口径版本可比时才允许后端计算 delta/deltaRate；否则二者 availability 不能是 `available`。
- 任一侧 `partial/truncated` 时禁止全量总计和差异结论；0 与 missing 必须分别表达。
- 账户双源同源键固定为 `(workspace_id, media, account_id)`，保留字符串类型与前导零；同一键单侧无行记 `source_missing`。任务、商品、素材、广告组不可套用该结论。

## 基础字段（来源：奇航 get_data，字段名照抄接口）

| 字段 | 来源 resource | 含义 |
|---|---|---|
| account_cost | account_realtime | 账面消耗（当日实时） |
| cost_api / cash / income / rebate | account_offline | 离线结算口径（T+1 权威） |
| account_exposure / account_click | account_realtime | 曝光/点击 |
| account_conversion | account_realtime | OCPX 回传转化（账面口径） |
| account_real_conversion | account_realtime | 真实转化（=FBI BI 数，老板已核同源） |
| account_cpa | account_realtime | 真实转化成本（有真实转化才返回） |
| account_budget / account_budget_usage_rate | account_realtime | 预算/使用率 |
| account_deduction_rate | account_realtime | 扣量比例 |
| account_main_ad_cost / _proportion | account_realtime | 主力广告消耗/占比 |
| assessment_cost | account_realtime | 考核价（快照；权威版本在 assessment_price_history） |
| ad_*_h 系列 | ad_realtime | 广告级小时累计（hh 参数） |
| wake_uv / aac_ptt_uv / newaac_uv_attrib_install | account_offline | 唤端/潜客/归因新装（漏斗） |
| balance / recharge_balance / contract_rebate / direct_rebate | 经 agent fund | 余额与返点（框返/直返分列） |

## 派生指标（公式冻结）

```
ctr                = click / exposure                      （分母0→null）
cvr                = conversion / click
真实CPA real_cpa    = cost / real_conversion                （分母0且cost>0→显示∞标记）
达标 on_target      = real_cpa <= assessment_price(生效版本)
现金消耗 cash_cost   = (账面消耗 − compensation) / channel_coefficient
                      channel_coefficient=渠道返点折算系数，channel_coefficients 表版本化，绝不硬编码
现金成本 cash_cpa    = cash_cost / bi_volume(=real_conversion)
成本空间 cost_space  = assessment_price × real_conversion − cash_cost
GAP                = conversion / real_conversion − 1
扣量前GAP           = attribution_volume / real_conversion − 1（字段可得时）
潜客率              = aac_ptt_uv / wake_uv
BI转化率            = real_conversion / aac_ptt_uv
消耗速度 velocity    = 近1h消耗 / 1h
预估日消耗           = 当日累计消耗 / 已过时间占比
断量倒计时           = balance / velocity（小时）
```

## 缺数三态（P0-04 裁决，老板 2026-09-04：缺数不写 0，显 "−"）

所有指标值在 API 与 canonical 查询层统一为 `{value: number|null, availability: "available"|"missing"|"error"}`：

- `available`：来源明确返回了该字段（**包括真实的 0**）——只有这种 0 才允许显示 0
- `missing`：ETL 未到、该日无来源行、字段不存在、权限内无数据 → `value=null`，UI 显 `−`
- `error`：来源失败/被截断/口径不可比 → `value=null`，UI 显 `−` 并带健康条提示
- **SQL 层禁止 `COALESCE(sum(x), 0)`**；聚合遇任一成员 `missing/error` 时结果为 `missing`，不得静默降为 0
- 比率/CPA 继续用 `RatioValue.state`（finite/infinite/undefined）表达分母为 0，与本节正交

## 一账户一任务（P0-05 裁决，老板 2026-09-04）

同一 `(workspace_id, media, account_id)` 在同一业务日只能归属一个任务；`task_accounts` 用区间排斥约束兜底，写入重叠区间 → HTTP 409 `TASK_ACCOUNT_OVERLAP`。任务维度聚合因此无需分摊逻辑；考核价取该日唯一归属任务的生效版本。

## 环比约定（全指标）

- 绝对值指标：`(今−昨)/昨`；**比率指标：百分点差值（今−昨）**
- 昨=0 且今>0 → 字面量 `"NEW"`；昨=0 今=0 → 0；分母为 0 → `null`（前端显 "—"）
- 周同比：同公式，对比对象=上周同日（环比列双口径切换）
- 均值计算剔除零消耗日；单日消耗>历史均值 5 倍标 `data_anomaly=true` 不剔除

## 双口径合并规则（canonical 表生成）

- 历史日：离线口径为权威（消耗类字段）；**转化类字段离线缺失→用实时口径补**，字段级合并非行级替换
- 当日：仅实时口径
- 每字段记录来源（`field_sources` JSONB）；离线补洞行标 `gap_filled_by_realtime`

## 数据日与时区

- 日切：03:00 全量前，"报告日"=前日并在 UI 明示
- 日内环比统一口径="昨日同时段"
