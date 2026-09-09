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

## 基础字段（来源：启航 get_data，字段名照抄接口）

| 字段 | 来源 resource | 含义 |
|---|---|---|
| account_cost | account_realtime | 账面消耗（当日实时） |
| cost_api / cash / income / rebate | account_offline | 离线结算口径（T+1 权威） |
| account_exposure / account_click | account_realtime | 曝光/点击 |
| account_conversion | account_realtime | OCPX 回传转化（账面口径） |
| account_real_conversion | account_realtime | 真实转化（=FBI BI 数，老板已核同源；上游定义 = ka-data bi_defs 四类 ODPS 表，见 docs/evidence/2026-09-09-BI口径定义-ka-data取数管线.md） |
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
账面CPA real_cpa    = cost / real_conversion                （分母0且cost>0→显示∞标记；**只展示，不用于考核**）
达标 on_target      = cash_cpa <= assessment_price(生效版本)  （**考核价是现金口径**：BI 后端、扣返点后真钱——老板 2026-09-05 纠正）
现金消耗 cash_cost   = (账面消耗 − compensation) ⊕ coefficient       ⊕ = channel_coefficients.op（multiply|divide），系数与方向按资料原样存
                      首批：KUAISHOU ×0.7812 ｜ TENCENT ÷1.045 ｜ TOUTIAO ÷1.09 ｜ BAIDU ÷1.51（ka-src-0010 / ka-src-0003 §3.1）；按渠道+生效日期版本化，绝不硬编码
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

## 窗口化口径（2026-09-05 老板定：结算按月、消耗按天、看什么窗口由日期组件选）

**窗口 W = 查询的日期范围 `[date_from, date_to]`**（页面上的日期组件），不是固定的"月"。预设：今天 / 昨天 / 近 7 天 / 本月至今 / 上月 / 任务期 / 自定义。默认：工作台=今天；结算视角=本月至今。

**先聚合再相除**（不是日比率求平均）：
```
cash_cpa(W)     = Σ_W cash_cost / Σ_W real_conversion       （考核用）
real_cpa(W)     = Σ_W cost / Σ_W real_conversion            （账面，只展示）
on_target(W)    = Σ_W cash_cost(d) <= Σ_W assessment_price(d) × real_conversion(d)   （考核价按生效版本逐日取，价改期内各日各用各的；等价 cash_cpa(W) <= 转化加权考核价；v1.7.2 定稿）
展示价 price(W)  = 窗口内唯一价+唯一版本时给值；多版本 → null + priceVersions=N（不影响 on_target）
compare(W)      = dod：两端各平移 1 天；wow：各平移 7 天（等长平移）；today 无同时段快照 → deltas 全 undefined
onTargetRate(W) = 达标账户数 / 可判定账户数（onTarget 非 null）；delta 百分点差（v1.7.4）
团队源 price(d)  = dwd_account_daily.cash_assessment(d)（无版本；唯一值给值/effectiveDate=null，多值 → priceVersions=不同值个数）
conversion_missing = 现金与考核价可得但真实转化缺 → onTarget/costStatus null（v1.7.4 新 reason）
cost_space(W)   = Σ_W assessment_price(d) × real_conversion(d) − Σ_W cash_cost(d)   （>0 = 窗口内还没超线的钱）
achievement(W)  = Σ_W real_conversion / target_volume（任务）
budget_usage(d) = 当日任务消耗 / 当日生效 daily_budget_cap    （无卡 → availability=missing，不显 0）
```
外推类（与 pacing 同源，7 日均速剔零量日；R-010a1 实现）：
```
窗口末外推 CPA        = (Σ_W cash_cost + 日均现金消耗 × 剩余天) / (Σ_W real_conv + 日均转化 × 剩余天)
剩余天可承受日 CPA    = (assessment_price × (Σ_W real_conv + 日均转化 × 剩余天) − Σ_W cash_cost) / (日均转化 × 剩余天)
```
**考核口径全部是现金**（老板 2026-09-05：考核价、达标、成本空间都是 BI 后端扣返点后的真钱）：`on_target/cost_space/cost_status/外推` 一律用 `cash_cost`；账面 `cost` 只做展示（账面消耗、账面 CPA 两张卡并排放，让优化师看得到差）。折算系数四渠道见上表，`op` 列记乘/除，domain 按 `op` 施加，不存倒数。资料另注：BAIDU/TENCENT 赔付≈消耗 → 现金贡献≈0。

**容忍带（老板：今天超一点明天拉回来是常态）**：颜色按**窗口累计**判，不按单日——单日超线但 W 累计仍达标 → 黄「单日超线，累计仍达标」；W 累计超 → 红；都在线内 → 绿。容忍百分比在个人视图可设，默认 0。产品只算只标色，**不判该关该开**。

## 缺数期规则抑制（12.8，2026-09-05 arch 冻结；coverage 三态的另一半）

规则引擎只在证据完整时说话，缺数时**既不触发也不消触**：

1. **评估前置**：规则 `condition_tree` 引用的每个指标，在评估窗口内对该账户 `availability=available` 才评估。任一指标 `missing|error` → 该账户本轮记 `undeterminable`（进 `meta.coverage.undeterminable`），不产生工作项、不递增 `occurrence_count`、已有 open 工作项不自动 done/expired。
2. **源过期（缺数期）**：`system/health` 判定某源 `data_as_of` 早于规则 `data_freshness_max_hours`（默认 实时源 6h / 离线源 30h）→ 依赖该源的规则本轮整体跳过，涉及账户记 `pending`（进 `coverage.pending`）。**恢复后只评估当前窗口，不回溯补发缺数期内的触发**（不 flood）；缺数期内已存在的工作项 SLA 暂停计时。
3. **冷启动**：`lifecycle_stage=cold_start`（前 3 天）沿用 PRD 宽松阈值（成本容忍 ±50%、转化<10 不判超）；这是阈值放宽，不是抑制，账户仍计 `checked`。
4. **首次 full 未完成**：workspace 首次 `etl_full` 未 done → 全部账户型规则不评估，`coverage` 全为 pending，队列 `dataState=stale`（与 work-items 契约一致）。
5. **可解释**：`POST /rules/:id/explain` 的真值表每个叶子带 `availability`；未触发原因枚举加 `METRIC_MISSING | SOURCE_STALE | COLD_START_RELAXED | INITIAL_FULL_PENDING`。
6. **策略可配但默认抑制**：`alert_rules.availability_policy`：`suppress`（默认，上述行为）| `evaluate_available_only`（只对指标齐全的账户评估，缺的仍记 undeterminable，永不把缺数当 0）。**禁止**任何"缺数按 0/上次值代入"的策略。

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

## 规则条件树语义（v1.7.5，2026-09-06 定稿；回应 Codex P-098）

- 结构：同节点多组 AND；`all`=AND、`any`=OR、`not`=NOT(OR(...))；嵌套深度 ≤8、叶子 ≤128；空组/无叶子拒绝。
- 缺数：任一引用指标（含阈值引用）missing/error → 整条 undeterminable，any/not 不得短路掩盖；不触发、不消触、不计数；SLA 按持久化区间暂停。
- 窗口：`window_hours` 只是叶子取数窗（日级指标须为 24 的倍数）；`consecutive_days:N` = 连续 N 个业务日各自成立；无小时源不冒充滚动窗。
- 动态阈值：`assessment_price` = 同窗逐日转化加权现金考核价；账面 `cost` 不作规则指标。
- 执行：受限 AST 解释；不 eval、不生成 SQL、不由 LLM 判真值。
