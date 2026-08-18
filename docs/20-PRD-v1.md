# KA 投放工作台 · 产品需求文档（PRD v1.0）

> 日期：2026-08-18　作者：arch（Claude）　审：老板 / Codex
> 依据：17-功能全景 v2.1（84+ 功能点）、19-实证定案（14 项全通）、18-日报规范、16-值守设计、15-八路审查、台账 #1-114 全部拍板。
> **本文是开发的唯一需求依据。** 与 17 号冲突处以本文为准；本文未覆盖的细节回溯 17 号。

---

# 第一部分：产品定义

## 1.1 一句话

面向 KA 部门的投放经营工作台：自动拉数替代手工透视，**以"考核达标"为北极星**自动诊断异常并给建议，人确认后经 agent 执行，效果自动回收——让优化师早上 5 分钟完成过去 2 小时的巡检。

## 1.2 用户与角色

| 角色 | 一句话诉求 | 默认视图 |
|---|---|---|
| 优化师 | 今天该动哪个户、为什么、动完有没有用 | 工作台（今日队列） |
| 运营 | 任务能不能达成、Gap 为什么、催谁 | 任务大盘 |
| 渠道负责人 | 钱和人往哪放、有什么风险 | 经营视图（阶段二） |
| 更高层 | 值不值得继续投、AI 提效真不真 | 月度推送文档（非页面） |

**Demo 期（第一批）：老板本人 + 2-5 位同事，全员同一数据范围；正式版按库内 ACL 分级。**

## 1.3 北极星指标与命根子口径

**北极星 = 考核达标率**。一切功能围绕"谁超考核、为什么、谁来处理"。

核心口径（计算层唯一实现，前端不算数）：

```
真实 CPA        = account_cost / account_real_conversion        （已确认=FBI 的 BI 数，同源）
达标判定        = 真实 CPA ≤ assessment_cost（考核价，版本化）
现金消耗        = (账面消耗 − 赔付) / 渠道折算系数                （系数=返点折算，渠道级可配+版本化，绝不硬编码）
现金成本        = 现金消耗 / bi_volume
成本空间        = assessment_cost × real_conversion − 现金消耗    （业务赔付缺值的正形式）
GAP            = account_conversion / account_real_conversion − 1 （回传 vs 真实）
环比约定        = 绝对值指标 (今−昨)/昨；比率指标百分点差；昨0今>0="NEW"；分母0=null 显"−"
```

## 1.4 明确不做

不做投放平台本身｜不做素材生产（内嵌 AIGC 平台）｜不替人做最终决策｜一期不做跨渠道（架构留适配层）｜不做大促战役视图（老板拍板砍）｜不做个人排名与绩效监控（红线）｜不自建账号体系（走 BUC）。

---

# 第二部分：信息架构与页面概览

## 2.1 一级导航（7 项定稿）

```
┌────────────────────────────────────────────────────────────┐
│ [Logo] 工作台  投放任务  数据分析  账户资源  商品素材  报告  钉钉中心 │ [Agent🔍] [用户] │
└────────────────────────────────────────────────────────────┘
```

| # | 导航 | 回答什么 | 二级结构（顶部收敛 tab，不进侧栏） |
|---|---|---|---|
| 1 | **工作台**（默认首页） | 今天我干啥 | 今日队列｜我的待办｜早报 |
| 2 | **投放任务** | 任务跑得咋样 | 任务列表 → 任务详情（页签：总览/数据/账户/素材/时间线/复盘） |
| 3 | **数据分析** | 数据到底咋样 | 大盘｜维度透视｜盯盘｜Gap 对账｜自助报表｜策略分析 |
| 4 | **账户资源** | 户咋样 | 账户池｜基建管理｜开户测试 |
| 5 | **商品素材** | 素材和品咋样 | 素材池｜商品测品｜AIGC 下单（iframe 内嵌） |
| 6 | **报告** | 要交的东西 | 日报｜周报复盘｜结算对账 |
| 7 | **钉钉中心** | 推送管理 | 连接配置｜推送规则｜发送记录 |

不进导航：**Agent** = 全局右侧抽屉（快捷键 `⌘K` 唤起，每页可用）；**设置** = 右上角用户菜单（个人阈值/AK 绑定/通知偏好）；**治理后台** = 管理员可见（连接健康/模板版本/系数配置）。

## 2.2 页面总清单（P0=首发必须，P1=第二批，P2=第三批）

| 页面 | 路由 | 级 | 一句话 |
|---|---|---|---|
| 工作台 | `/` | P0 | 今日队列+概览卡+早报 |
| 任务列表 | `/tasks` | P0 | 任务卡片流，达标状态+pacing |
| 任务详情 | `/tasks/[id]` | P0 | 六页签承重页 |
| 数据大盘 | `/data` | P0 | summary 全指标+7 日趋势 |
| 维度透视 | `/data/pivot` | P0 | 8 维度切换的透视表（替代 Excel） |
| 盯盘 | `/data/live` | P1 | 小时级重点户监控 |
| Gap 对账 | `/data/gap` | P1 | 回传 vs 真实定位 |
| 自助报表 | `/data/reports` | P1 | 设计器+个人视图 |
| 策略分析 | `/data/strategy` | P1 | 版位×出价×任务多维切数 |
| 账户池 | `/accounts` | P0 | 全户状态总览 |
| 账户详情 | `/accounts/[id]` | P0 | 账户小传+趋势+操作史+计划层 |
| 基建管理 | `/accounts/infra` | P1 | OS 对话托管+矩阵批量搭建 |
| 开户测试跟踪 | `/accounts/testing` | P2 | 测试户生命周期 |
| 素材池 | `/materials` | P2 | 素材表现（先占位 demo） |
| AIGC 下单 | `/materials/order` | P2 | iframe 内嵌 material-order-platform |
| 日报 | `/reports/daily` | P0 | 12 模块 HTML 日报+一键发钉钉 |
| 周报/复盘 | `/reports/review` | P1 | 任务复盘+Deep Research |
| 结算对账 | `/reports/settlement` | P1 | 月中试算+差异转工作项 |
| 钉钉中心 | `/dingtalk` | P1 | 连接/推送/记录 |
| 设置 | `/settings` | P0 | 阈值/AK/userId 绑定/通知 |
| 治理后台 | `/admin` | P1 | 连接健康/系数/模板 |

## 2.3 核心页面详细设计

### 2.3.1 工作台 `/`（产品心脏）

```
┌──────────────────────────────────────────────────────────────┐
│ 早上好，XX ｜ 数据截至 09:15 ✓ 新鲜        [手动刷新] [报告日期]│
├──────────────────────────────────────────────────────────────┤
│ ┌─消耗────┐┌─真实CPA──┐┌─达标率──┐┌─成本空间─┐┌─BI量级─┐┌待处理┐│
│ │¥52.3万  ││¥28.4     ││ 82%     ││+¥1.2万   ││18,420  ││ 7   ││
│ │+8.2%↑   ││考核¥30 ✓ ││-3pp↓    ││          ││-2.1%↓ ││2条P0 ││
│ └─────────┘└──────────┘└─────────┘└──────────┘└────────┘└─────┘│
├──────────────────────────────────────────────────────────────┤
│ ▍今日待处理（7）        [全部|P0|P1|机会] [按任务▾] [严重度排序▾]│
│ ┌──────────────────────────────────────────────────────────┐ │
│ │ 🔴 P0 超成本起量 ｜ XX任务-账户A (8905****)                │ │
│ │    真实CPA ¥41.2，超考核(¥30) 37%，今日已耗 ¥8,200         │ │
│ │    ⓘ 归因：CTR 从 2.1%→1.4%（主力素材第9天）               │ │
│ │    💡 建议：降价至 ¥26（−13%）｜历史同型操作 3 次 2 次见效   │ │
│ │    [查看证据] [跳快手后台] [生成变更集] [忽略▾] [静音3天]     │ │
│ ├──────────────────────────────────────────────────────────┤ │
│ │ 🟡 P1 消耗断崖 ｜ …                                        │ │
│ │ 🟢 机会 优质可扩量 ｜ …建议复制 [发起复制流程]               │ │
│ └──────────────────────────────────────────────────────────┘ │
│ ✓ 其余 43 个账户在阈值内，无需关注（数据 09:15 校验）           │
├──────────────────────────────────────────────────────────────┤
│ ▍昨日动作回收（T+1）                                          │
│ ✅ 账户B 降价 −10%：成本 ¥34→¥28，量级 −8%（可接受）          │
│ ❌ 账户C 换素材：CTR 未回升，建议进一步排查定向                 │
├──────────────────────────────────────────────────────────────┤
│ ▍我的待办（3）  上级派发2 · 自建1        ▍AI 早报 [展开] [发群]│
└──────────────────────────────────────────────────────────────┘
```

设计要点（全部来自拍板与审查结论）：
- **四件套卡片**：户/为什么/建议/入口，缺一不可
- **"其余 N 户在阈值内"必须显示**——告诉用户可以不看什么与告诉他看什么同等重要
- **忽略 = 一键 + 可选原因 chip**（3 秒点选绝不打字）+ 户级静音 3 天；忽略原因喂规则调优，永不做统计追责
- T+1 回收与队列同屏——闭环的多巴胺
- 数据健康横幅：不新鲜时整页顶部黄条"数据截至 XX:XX，正在补拉"，且执行入口置灰
- 深链跳快手后台：写链路操作与后台手动操作**并列提供**，用户在哪动手都行（带外变更检测兜底同步）
- 建议分两层：demo 期只报事实异常；"建议改到 X"待回测命中率数据积累后开放，届时带历史命中率标注

### 2.3.2 任务详情 `/tasks/[id]`（承重页）

页签：**总览**（目标进度+pacing 预测+达标状态+异常摘要）｜**数据**（该任务维度的全指标+趋势+漏斗：唤端→潜客→BI）｜**账户**（挂载账户列表+各自达标状态+容量）｜**素材**（关联素材表现，P2）｜**时间线**（所有操作/变更集/口径变更/派发记录，倒序流）｜**复盘**（周期结束自动生成，Deep Research 入口）。

总览页签核心组件——**pacing 卡**：
```
目标 50万 ｜ 已完成 31.2万 (62%) ｜ 时间进度 71%
按 7 日均速外推 → 月底预计 44.8万 (90%) ⚠️ 预计缺口 5.2万
需日均 1.71万（当前 1.48万）
[动作分叉] 加预算能补（账户B/C 有余量）｜降目标至 45万｜从任务 Y 挪量
```
考核价字段带版本历史（值+生效日期+改动人），改动自动重算达标率+通知任务下全员确认已读。

### 2.3.3 维度透视 `/data/pivot`（替代 Excel 的那张表）

- 8 维度 tab 切换：任务｜业务｜账户｜代理/自投（两级展开）｜资源位｜出价工具｜UBP｜扣量区间
- 每行 = 全量指标 + 环比列（紧跟指标、小一号字、红↑绿↓）
- 异常行整行着色（CRITICAL 浅红 / WARNING 浅黄）
- 列配置可存为个人视图；一键导出 Excel（模板化格式非裸 dump）
- 表头固定、虚拟滚动、点击列头排序
- 行可勾选 → 浮出「分析这 N 个」（唤起 Agent，带选中上下文）

### 2.3.4 账户详情 `/accounts/[id]`

- 顶部：账户小传（谁开的/关联任务/生命周期阶段/余额+**断量倒计时**/考核价/达标状态）
- 中部：**趋势图+操作史上图**——消耗/CPA/CTR 曲线上标注每次操作点（"8-12 降价 5%"），hover 看操作详情与 T+1 结果。这是调价决策的核心依据
- 计划层：campaign→unit 树形表（消耗/转化/出价/时段），垃圾计划标记+勾选批量生成关停变更集
- 底部：操作历史（含带外变更：非产品发起的自动标注"后台手动"）

### 2.3.5 基建管理 `/accounts/infra`（P1）

- 左：待基建账户队列（来源：开户完成/手动加入）
- 中：**矩阵批量搭建表单**（主路径）：素材×定向×出价组合展开预览 → Prompt Compiler 生成结构化指令 → 参数摘要+最终提示词+预计创建对象 → 确认 → 发送主对话
- 右：执行状态流（草稿→已发送→执行中→成功/部分成功/失败/未知）；部分成功必须逐对象清单+失败项重试
- 兜底：Multica 不可用时生成可复制提示词，标"未发送/待人工回填"

### 2.3.6 日报 `/reports/daily`（P0，18 号规范版式）

Executive Summary（6 卡片+异常事项自然语言列表按严重度）→ 大盘 → 8 维度模块（每模块：汇总卡→异常高亮表→TOP10 图→异常摘要）→ 扣量分析 → 健康度（P1，需计划级数据）→ 消耗分层。[一键发钉钉]（渲染 PNG 摘要+链接）｜[导出 PDF]。分角色版本：优化师版（自己的户）/运营版（任务达成）/负责人版（rollup+例外，P1）。

---

# 第三部分：功能规格（按模块）

## 3.1 数据层（S）

**ETL 管线**（node-cron，常驻 FaaS 进程内）：
- 每日 03:00 全量：对每个注册用户的 userId 并发拉 `account`（列表+归属）→ `account_offline`（昨日结算）→ `account_realtime`（近 7 日补洞）→ 落库
- 日间每 30 分钟增量：`account_realtime`（当日）+ 重点户 `ad_realtime`（hh 小时级）
- 每小时经 agent 同步：账户结构（campaign/unit/creative 三层）+ 余额（fund）——低频走 webhook→agent→RESULT_JSON→读回
- 工程规则：字段级合并不做行级替换（离线无转化字段）；保留 `_data_source`；剔除零消耗日再算均值；单日消耗>历史均值 5 倍标"数据异常"不删除；ETL 失败重试 3 次+钉钉告警+前端数据健康降级
- **带外变更检测**：每轮对比 bid/budget/status 快照，非产品发起的变更 → 自动标记相关工作项"已在后台处理" + 写入操作时间线（type=external）

**库表（PostgreSQL，B 级功能不提前建表）**：
```
users(id, buc_id, name, qihang_user_id, idealab_ak_ref, role, created_at)
accounts(account_id PK, account_name, task_id, biz_name, media, owner_user_id, lifecycle_stage, is_starred, tags[])
account_metrics_daily(account_id, ds, source[realtime|offline|gap_filled], cost, exposure, click,
  conversion, real_conversion, cpa, budget, budget_usage_rate, deduction_rate,
  main_ad_cost_proportion, assessment_cost_snapshot, …, PRIMARY KEY(account_id, ds, source))
ad_metrics_hourly(ad_id, account_id, ds, hh, cost, conversion, real_conversion, bid, budget, …)
account_structure(account_id, campaign_id, unit_id, creative_id, level, name, status, bid, day_budget,
  schedule_time, synced_at)   -- 经 agent 同步
account_balance(account_id, balance, recharge_balance, contract_rebate, direct_rebate, synced_at)
tasks(task_id PK[奇航], task_name, biz_name, period_start/end, target_volume, owner_user_id, status)
assessment_price_history(task_id, price, effective_date, changed_by, created_at)
channel_coefficients(media, coefficient, effective_date, changed_by)   -- 返点折算系数
work_items(id, type[diagnosis|dispatch|self|agent_question], account_id, task_id, rule_id, severity,
  title, evidence_snapshot JSONB, suggestion JSONB, status[open|processing|done|ignored|expired|external_handled],
  ignore_reason, assignee, creator, sla_due, created_at, resolved_at)
changesets(id, work_item_id, target_level, target_id, field, from_value, to_value, status[draft|confirmed|
  sent|executing|success|partial|failed|unknown|expired|rolled_back], initiator, executor_identity,
  multica_issue_id, ttl_expire_at, dry_run_result JSONB, executed_at, t1_result JSONB)
alert_rules(id, owner[system|user_id], rule_type, metric, operator, threshold, duration, severity,
  scope, enabled, muted_until, fork_from)
audit_log(id, user_id, action, object_type, object_id, detail JSONB, created_at)
agent_memory(id, scope[user|task|account], scope_id, content, expire_at, created_by)
metric_snapshots(work_item_id, metrics JSONB, snapshot_at)   -- 证据快照
```

## 3.2 规则引擎（S）

- 执行时机：ETL 每轮落库后触发扫描
- **首发 3 条零误报规则**：①超成本起量（真实 CPA>考核×1.2 且今日消耗>3000）②0 曝光（新计划 24h 零消耗单独分类）③消耗断崖（日环比 −30%+，剔除预算主动调整）
- 候补池（灰度逐条开）：欠成本｜高消耗零转化｜Gap 异常｜预算将尽>80%｜断量倒计时<2h｜结构风险（主力广告占比过高）｜回传异常｜新建广告存活｜衰退（3-sigma 消耗基线+EWMA 成本）｜素材疲劳｜凌晨流量质量
- 规则=数据库行非代码：metric/operator/threshold/duration/severity/scope，支持热更新
- **个人 fork**：新用户继承系统默认包；fork 后只能加严不能放松任务级红线
- **生命周期联动**：账户 lifecycle_stage=cold_start（前 3 天）自动套宽松阈值（成本容忍 ±50%、转化<10 不判超）
- 告警疲劳治理：同任务同类合并、P2 攒整点、忽略率>90% 的规则提示调阈
- **"为什么没触发"**：规则编辑页内嵌调试器（选账户+日期→逐条件真值表），不进任何报告

## 3.3 诊断与建议（Agent，A）

双产物模式（Devix 判例）：
- 触发：规则命中生成 work_item 后异步调用 LLM
- 输入 prompt（三层：角色定义→场景模板→动态注入）：账户信息+异常指标+近 7 日时序+对比数据（环比/同类）+最近操作记录+agent_memory（用户口径偏好/临时规矩）
- 输出 JSON：`{primary_issue, possible_reasons[]（枚举字典：CTR降/CVR降/竞争加剧/定向窄/素材疲劳/预算撞线/数据延迟假象）, confidence, evidence[], suggestions[{action, params, expected_effect(统计算), constraint_check}]}`
- **安全约束**：建议出价调幅≤20%、预算调幅≤50%（prompt 内+出口校验双保险）
- **降级**：LLM 失败/超时/格式错 → 展示规则预设话术（每条规则带一句兜底解释）
- 历史经验覆盖：同型异常历史处理失败率高时，建议自动升级为"排查"而非照搬动作

## 3.4 执行链路（A，写链路已实证）

```
用户点[生成变更集] → 服务端取当前值(from)生成 changeset(TTL 30min)
 → dry-run 预览（经 webhook→agent→kuaishou-cli --dry-run→RESULT_JSON 读回）
 → 用户确认（确认前自动复核 from 值，变了打回）
 → POST webhook{changeset JSON} → agent 执行 CLI → RESULT_JSON 回执
 → 轮询读回（mul_ PAT + multica issue comment list）→ 更新状态
 → T+1 定时回收效果 → 写 t1_result → 工作台展示
```
- 幂等：changeset id 作为幂等键写进指令，agent 侧执行前查重
- 同账户写操作冲突锁（DB advisory lock）
- UNKNOWN 态先对账（再派一次只读查询核实际状态）禁止盲重发
- **Demo 期写权限只对老板开放**；他人只读+建议+深链跳后台
- 批量操作：L3 级（>N 个对象或影响>¥X）必须 Web 端逐对象明细确认；dry-run 预览突出"将被应用默认值的对象"
- 可逆变更集：反向 changeset 一键生成（明示消耗不可逆）

## 3.5 值守与推送（A，16 号设计）

- P0（裸奔超成本/断量倒计时<2h）：立即推送+突破静默；30 分钟未确认升级（值班→上级，钉钉 DING）；升级前倒计时可见，标"处理中"可暂停
- P1：正常推送；次日催办卡片；48h 升级运营
- P2：攒整点/并入早报
- 早报 08:30：渲染 PNG（复用 Chromium 管线）+ 文字摘要发群；个人版可选私聊
- 卡片：L0 只读直跑（查数/刷新）；L3 跳 Web；L1/L2 押后
- 通知偏好：静默时段（仅 P1/P2 生效）、按任务订阅、户级静音

## 3.6 Agent 体系（A）

**运行时：Claude Agent SDK + IdeaLab 网关（已确认 Claude 可用）**
- base_url → IdeaLab Anthropic 兼容端点；**每用户绑自己的 AK**（设置页，类 BYOK；200 次/日免费额度 demo 够用）；CCSwitch 式多模型：主 Claude，可按任务切 Qwen/DeepSeek（网关侧同一 AK）
- 形态：①页面上下文助手（主）——每页右下角，自动带当前页面/筛选/勾选行；高频问题 chip（"为什么成本涨""和上周比"）②全局抽屉（⌘K）③后台 Agent（早报/异常聚合/失败归因，无 UI）④Agent Inbox 三类事项进统一队列（notify/question/review——question=agent 卡住反问）
- **输出规范**：结论+证据+口径徽章（点击跳官方视图对数）；确定性数字全部来自 API 不由模型算；确定性部分与推断部分视觉区分
- **记忆文件**：agent_memory 表，纠正一次问"要不要记住"；口头规矩挂账户带有效期（"这周保量不保成本"→期间该户超成本告警自动降级并附注）
- 评测基准集：人工确认过的诊断结论入集，改 prompt 自动回归；准确率驱动自治度档位

## 3.7 报告（A）

- 日报：18 号规范 12 模块；生成即存知识库；一键发钉钉
- 结算：月中试算（按当前口径随时算）；账面/现金/返点（contract_rebate/direct_rebate 实际值 vs 折算系数估算值对账）；差异清单一键转工作项；模板版本化（新模板不覆盖旧结算单）
- 复盘：任务周期结束自动生成；Deep Research 模式（异步 5-10 分钟深挖，完成钉钉通知）
- AI 提效：埋点第一天上线（建议采纳率/处理时长/发现时延/避免损失金额），四象限自动统计，报告带"AI 判断错的 N 条"

---

# 第四部分：技术架构

## 4.1 部署拓扑（全 FaaS，实证定案）

```
┌─ FaaS 应用（a1 faas，custom.debian10，常驻 Node 20）─────────────┐
│  Next.js（SSR 前端+API routes）＝一个应用同时扛前后端              │
│  ├─ Web UI（React 19 + Tailwind）                                │
│  ├─ /api/*（业务 API：查询/工作项/变更集/规则/设置）               │
│  ├─ node-cron：ETL 调度｜规则扫描｜T+1 回收｜推送                  │
│  ├─ Agent Runtime：Claude Agent SDK → IdeaLab（用户 AK）          │
│  ├─ 钉钉模块：Stream 长连接 + REST 发送 + Chromium 渲染（复用网关） │
│  └─ Multica 桥：bin/multica + mul_ PAT（建 issue/发 webhook/读回执）│
├─ 外部依赖 ──────────────────────────────────────────────────────┤
│  奇航 get_data（qh.alibaba-inc.com）差异 userId 直连 ✅实证        │
│  private-dataservice（账户归属）appCode ✅实证                    │
│  IdeaLab（LLM）✅实证 ｜ 钉钉开放平台 ✅实证                       │
│  Multica webhook→agent 沙箱→kuaishou-cli（写+结构+余额）✅实证     │
│  PostgreSQL（Normandy RDS，申请中；未批前 demo 用 SQLite 单文件）   │
└─────────────────────────────────────────────────────────────────┘
```

演进：demo=daily 环境+免登录（内网 URL 即门槛）→ 正式=create aone-platform（组织足迹时点）+BUC 登录（scaffold-id 10 流程见 BUC 定案）+publish pre/prod。

## 4.2 代码结构（monorepo）

```
ka-workbench/
├─ apps/web/                    # Next.js 全栈应用
│  ├─ app/                      # App Router 页面（按 2.2 路由表）
│  ├─ components/               # UI 组件库（见前端规范）
│  ├─ server/
│  │  ├─ etl/                   # 拉数管线（qihang client/合并/快照 diff）
│  │  ├─ rules/                 # 规则引擎（评估器/生命周期联动/疲劳治理）
│  │  ├─ metrics/               # ★口径计算层（唯一实现：CPA/现金/成本空间/GAP/环比）
│  │  ├─ agent/                 # SDK 封装/prompt 模板/记忆/评测
│  │  ├─ execute/               # 变更集/幂等/锁/TTL/对账/T+1
│  │  ├─ multica/               # CLI 桥（issue/webhook/轮询）
│  │  ├─ dingtalk/              # 复用网关模块（stream/send/render）
│  │  └─ db/                    # schema + 迁移
│  └─ lib/api/mock.ts           # mock 层（前端先行开发用）
├─ packages/contract/            # ★TS 类型+API 合同+指标字典（唯一事实源）
├─ docs/                         # 本文档体系
└─ refs/                         # 参考件（不入库）
```

## 4.3 分工与流程（14 号文档执行）

arch（本会话）：契约包（schema+API 合同+类型+脱敏 mock 数据集）→ 信箱派活 → SHA 逐条验收 → 整合 main。
**Codex：后端**（server/ 全部：ETL/规则/计算/执行/multica/钉钉）。
**Claude cli-front：前端**（app/+components/，按契约用 mock 先行；视觉小样拍板后 commit）。
内网 agent：a1 faas deploy、日志验证（看干净启动序列，不信 healthStatus）、真实数据联调。
提交：`[fe|be|arch]` 前缀、各角色只动自己目录、main 由 arch 整合。**联调放行标准：真 payload 打真端点 E2E。**

## 4.4 开发批次（工程依赖序，非产品分期）

| 批次 | 内容 | 验收 |
|---|---|---|
| **B1 数据脊柱** | 契约包→ETL（get_data 双口径+归属）→库表→计算层→数据大盘+维度透视页 | 老板打开透视页，数字与手工 Excel 对平 |
| **B2 队列闭环** | 规则引擎（3 条）→工作项→工作台页→忽略/静音→钉钉早报+P0 推送 | 老板一天的巡检在工作台完成 |
| **B3 执行闭环** | 结构同步→账户详情（计划层+操作史上图）→变更集+dry-run+确认→写链路→T+1 回收→带外检测 | 一次真实调价从建议到回收全程留痕 |
| **B4 任务与报告** | 任务详情（pacing+考核价版本化）→日报 12 模块→发钉钉 | 自动日报替代手写日报 |
| **B5 Agent** | SDK 接入+页面助手+诊断双产物+记忆 | 勾 3 个户问"为什么涨"得到带证据回答 |
| **B6+** | 盯盘/Gap/自助报表/基建管理/结算/协作派发/负责人视图/素材域… | 按 17 号 v2.1 全景推进 |

每批次：真部署 daily → 老板真数据验收 → 下一批。**B1 开工前置：Codex 复核意见合并 + 契约包出稿。**

---

# 第五部分：前端设计规范

## 5.1 设计基调：D-CON（已验证的 Apple 风格数据系统）

来自钉钉网关生产验证的设计系统，直接继承并扩展为 Web 应用版：

```
主色      #ff6a2c（accent orange，唯一品牌色，用于强调/CTA/选中态）
文字色阶   #1d1d1f → #424245 → #86868b → #c7c7cc（四级）
线条色阶   #d2d2d7 → #e8e8ed → #f2f2f4
语义色    红 #e5484d（负向/超考核）｜绿 #00875f（正向/达标）｜灰（中性）
          ——红绿只表语义，绝不用彩虹色做装饰
背景      #ffffff 主 ｜ #f5f5f7 页面底 ｜ 卡片白+1px #e8e8ed 边+8px 圆角
字体      Inter, SF Pro Display, Noto Sans CJK SC ｜ 等宽 JetBrains Mono
数字      全部 tabular-nums + 右对齐（表格）；金额 ¥+千分位 2 位小数；
          比率 ×100 保留 1-2 位+%；环比带符号 +/−（U+2212）；缺失 "—"
状态      pill/chip 形式独立成列（达标✓绿/超考核红/观察灰/冷启动蓝）
圆角      卡片 12px ｜ chip 999px ｜ 按钮 8px
阴影      极轻（0 1px 3px rgba(0,0,0,.06)），层级靠边框与背景差
```

## 5.2 布局系统

- 顶部导航 56px 固定（7 项+Agent 按钮+用户）；**无侧栏**（视图收敛 tab 原则）
- 内容区 max-width 1440px 居中，页面左右 padding 32px
- 页内二级导航 = 顶部 tab 条（下边框指示，非按钮组）
- 栅格：KPI 卡片行 = auto-fit minmax(180px,1fr)；主内容 8/12 + 侧栏 4/12（工作台的待办/早报区）
- 响应式：桌面优先（≥1280 为主战场），窄屏只加不改（lg 断点值=设计稿值）

## 5.3 核心组件规格

| 组件 | 规格 |
|---|---|
| **KPI 卡** | 标签(12px #86868b)+主数(28px semibold tabular)+环比 chip(12px 带↑↓)+副注(考核价/达标态)。点击进对应明细 |
| **数据表格** | 表头 sticky、行高 44px、斑马纹无、hover #f5f5f7、异常行整行浅红/浅黄底、环比列小一号紧跟主指标列、虚拟滚动(>100 行)、列宽可拖、勾选列固定左 |
| **工作项卡** | 左严重度色条(4px)+标题行(严重度 chip+规则名+账户)+证据行(数字加粗)+归因行(ⓘ 前缀 #86868b)+建议行(💡)+操作按钮组(主按钮橙、次按钮白底描边) |
| **趋势图** | ECharts；线 2px；操作点=散点标记(悬浮卡显示操作+T+1 结果)；异常区间浅红背景带；网格线 #f2f2f4 横向 only；tooltip 深底白字含口径徽章 |
| **确认弹层** | 变更集表格(对象/字段/从/到)+dry-run 结果+影响预估+倒计时(TTL)+主按钮"确认执行"红色语义 |
| **口径徽章** | 指标旁 12px ⓘ，hover 显示公式与数据源，点击跳官方视图 |
| **数据健康条** | 页面级横幅：绿"数据截至 HH:MM ✓"/黄"补拉中，截至 HH:MM"/红"今日数据未更新，展示为昨日" |
| **空态** | 「示例」角标+降饱和示意图+一句话解锁条件（用户视角语言，绝不造真实感假数据） |
| **Agent 抽屉** | 右侧 420px 滑出；上下文 chip 区（当前页面/勾选对象可删）；高频问题 chip；回答含"确定性数据"（表格样式）与"分析推断"（文字样式）视觉分区 |

## 5.4 图表规范（dataviz 方法论）

- 每图必答一个问题，标题即问题（"成本为什么涨"而非"成本趋势"）
- 折线=趋势；柱状=排名对比（TOP10 横向柱）；饼图仅占比且≤6 类；堆叠柱=分层结构；散点=成本×消耗分布
- 颜色：单系列用主橙；多系列语义色+中性灰阶；达标/超考核永远绿/红
- 所有图表带数据截止时间戳；数据不完整时整图打灰+"数据不完整不出对比"
- 转化漏斗：曝光→点击→回传→真实→(唤端→潜客→BI 离线链路分开画)

## 5.5 文案规范（黑话→人话）

界面不出现：接口/字段/契约/口径同步/agent/webhook/ETL。
写成：「数据攒够后自动出现」「正在从快手同步」「已在后台处理过了」「AI 正在分析」。
错误提示三段式：发生了什么+影响什么+现在能做什么。

## 5.6 交互原则

- 页面加载骨架屏（表格行骨架/卡片骨架），不转圈
- 所有写操作乐观 UI + 失败回滚提示
- 键盘：⌘K Agent、j/k 队列上下、e 忽略、Enter 详情
- 危险操作（批量关停）红色确认+输入数量复核
- 任何列表页 URL 可分享（筛选态进 query string）

---

# 第六部分：非功能与红线

- **性能**：透视查询 <2s（十万行级）；页面首屏 <1.5s；ETL 全量 <10min
- **数据准确**：与快手后台/FBI 对平 100%——这是采纳门第一关，未对平不对第二人开放
- **安全**：凭证只进 config vars（明文风险已知，正式版评估密钥管理）；AK 每用户自持；审计全留痕；写操作 demo 期仅老板
- **红线**（AGENTS.md 继承）：agent 不算数｜个人行为数据零上行｜不做个人排名｜建议不成熟不上线｜数据不新鲜禁写｜B 级不提前建表
- **口径变更管理**：折算系数/考核价全部版本化；口径变更在数据上标注分界线

# 第七部分：开放问题（不阻塞开工）

1. B7：奇航 task 数据准不准（老板抽查中）——影响任务主键策略，B4 前需定
2. IdeaLab 200 次/日额度在 agent 多轮调用下的真实消耗——B5 实测，不够则申请正式配额或 Whale
3. 素材级独立数据源（AIGC 平台接入时确认）
4. 组织架构接口（上级派发的汇报关系，先手工配置成员表）
5. RDS 审批时长（demo 先 SQLite 顶）
