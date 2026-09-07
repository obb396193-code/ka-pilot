# fixtures 索引（fixture 即契约；2026-09-06 arch）

> 每个文件 = 一个端点/查询的权威样例。前端 mock 层直接读；后端 parity 测试直接比。`meta._note` 是给人看的说明，不是契约字段。`meta._example=true` 的文件对应 P2 示例态页面。

## account-list
- `account-list/empty.json`
- `account-list/errors.json`
- `account-list/partial.json`
- `account-list/ready.json`
- `account-list/stale.json`

## accounts
- `accounts/detail.json` — v1.5 4.2 小传；fund 七字段三态；cutoff 四态 ok|warning|critical|unknown
- `accounts/detail-account-2.json` — 小传：窗口超线 red + cutoff critical
- `accounts/detail-account-5.json` — 小传：当日缺数全 −（cash_missing / cutoff unknown）
- `accounts/list-v151.json` — v1.5.1 扩展项：poolStatus/product/cutoff/dailyBudgetCap/capacityLoad/lastAction/nextSuggestion；nextSuggestion 无则 null 不生成
- `accounts/open-flow.json`
- `accounts/overlay.json`
- `accounts/pipeline.json` — 九态固定顺序；点卡即 poolStatus 筛选；count 缺=missing
- `accounts/replicate.json`
- `accounts/replication-compare.json` — 母子 7 日并排（示例只有 5 日）；v3 trend 行
- `accounts/structure.json` — junk=垃圾计划标记，勾选→批量关停变更集
- `accounts/structure-account-2.json` — 结构树：含 junk 单元
- `accounts/trend-account-1.json` — account.trend/v3 单账户
- `accounts/tests.json` — 结论 verdictNote 由人填；系统只算窗口指标
- `accounts/timeline.json` — v1.5 4.3 十种 kind
- `accounts/timeline-account-2.json` — 时间线：alert/recharge/changeset
- `accounts/transfer.json`

## admin
- `admin/calendar.json`
- `admin/flags.json` — write_enabled=false 时 confirm 403 WRITE_DISABLED；灰度=老板一人 true
- `admin/grants.json`
- `admin/members.json` — 停用=membership 失活+撤 session，行不删

## agent
- `agent/run-events.json`
- `agent/runs.json`
- `agent/session.json` — 新建默认空上下文；chips 可增删
- `agent/sse-frames.json` — v1.3 七帧之外加 suggestion 帧（v1.5.1 ⑤）
- `agent/suggestion.json`

## alerts
- `alerts/escalations.json`
- `alerts/policies.json`
- `alerts/roster.json`
- `alerts/stream.json`

## assets
- `assets/list.json` — UI 起步只露 draft/shared 两态

## capabilities
- `capabilities/list.json` — write 类 invoke 只出变更集草稿；disabled 灰

## changesets
- `changesets/detail.json` — v1.3 P-006：typed value；dry-run 是 confirm 硬前置；FROM_VALUE_CHANGED 409 DTO 见 errors
- `changesets/group-preview.json` — v1.5.1 变更集组：一次预览一次确认，执行仍逐账户

## collab
- `collab/approvals.json` — 充值协作不入审批；提审是自愿动作
- `collab/dispatches.json` — disagreed 是合法结局

## data-query
- `data-query/dimension-unsupported.json`
- `data-query/dimension-v3.json` — 8 维之一：资源位（团队空间有源）
- `data-query/dimension-v3-task.json` — 8 维：任务
- `data-query/dimension-v3-biz.json` — 8 维：业务（product.name 聚合）
- `data-query/dimension-v3-account.json` — 8 维：账户（含一行缺数 missing/gray）
- `data-query/dimension-v3-agent_type.json` — 8 维：代理/自投（agency_name）
- `data-query/dimension-v3-deduction_range.json` — 8 维：扣量桶 [0,10)|[10,30)|[30,+)
- `data-query/gap.json`
- `data-query/gap-task.json` — Gap 按任务
- `data-query/gap-biz.json` — Gap 按业务（备用户 missing）
- `data-query/hourly.json` — 缺小时 missing 不补 0；delta 相邻缺一边也 missing
- `data-query/pivot2.json` — 策略分析视图：预设 版位×任务；不做最优推荐
- `data-query/pivot2-biz-resource_position.json` — 策略分析预设 业务×版位（4 格 1 undeterminable）
- `data-query/pivot2-unsupported.json` — 预设 出价工具×任务 → DIMENSION_UNSUPPORTED（bid_tool 派生枚举待映射表）
- `data-query/ready-lineage.json`
- `data-query/reconcile-pending.json`
- `data-query/stable-error.json`
- `data-query/summary-window-v3-cash-missing.json`
- `data-query/summary-window-v3-green.json`
- `data-query/summary-window-v3-yellow.json`
- `data-query/table-v3.json` — 账户日行：账面/现金两组并排；dataAnomaly 行着色
- `data-query/trend-v3.json`
- `data-query/unknown-lineage.json`

## exports
- `exports/done.json` — url 临时签名 10 分钟；过期 410
- `exports/queued.json`

## infra
- `infra/requests.json` — B 主 A 兜底：未取得回执不显'配置成功'

## integrations
- `integrations/card-callbacks.json`
- `integrations/cards.json`
- `integrations/connections.json`
- `integrations/identity-mappings.json`
- `integrations/messages.json` — dead 保留行；retry：出站 failed 重排队，入站 dead admin 重置
- `integrations/subscriptions.json` — quiet_hours 只压 P1/P2

## intel
- `intel/materials.json` — 示例态：解锁条件=AppGrowing 接入方式实证

## kb
- `kb/document.json` — 对齐 CR knowledge_items.content_json/content_text + document_links；team 空间 readOnly=true
- `kb/search.json`
- `kb/tree.json`

## materials
- `materials/analysis.json` — timingPrecision=whole_video → 前端不显句级时间戳
- `materials/backtest.json` — 样本不足不出结论
- `materials/brief.json`
- `materials/detail.json`
- `materials/experiments.json`
- `materials/lineage.json`
- `materials/list.json` — P2 示例态：右上「示例」角标，解锁条件=视频源探针通过 + R-015
- `materials/products.json` — 主数据=ka-data dim_product/人工；快手无商品 API
- `materials/similar.json`

## me
- `me/views.json`
- `me/watchlist.json`

## reports
- `reports/ai-impact.json` — 人时=估算；byUser 只本人与 lead 可见，不进导出
- `reports/config-v1.json`
- `reports/daily-brief-pending.json`
- `reports/daily-brief.json` — 数据未就绪时 status=pending_data，不生成假早报
- `reports/daily-v1.json` — 12 模块；unsupported 模块显空态不显 0
- `reports/library.json`
- `reports/monthly-exec.json`
- `reports/render.json`
- `reports/task-review-v1.json` — why/next 标“待人确认”；生成即归档知识库
- `reports/weekly-v1.json`

## rules
- `rules/explain.json` — 12.8：任一叶子 missing → 不触发不消触，账户计入 undeterminable
- `rules/list.json` — 未触发原因枚举：CONDITION_FALSE|METRIC_MISSING|SOURCE_STALE|COLD_START_RELAXED|INITIAL_FULL_PENDING|MUTED|DEDUPED|INSUFFICIENT_SAMPLE
- `rules/bindings-fixture-task-ready.json` — 任务绑定的规则/工作流/SOP（v1.7.3 `GET /tasks/:id/bindings`）

## session-http
- `session-http/errors.json`
- `session-http/logout.json`
- `session-http/personal.json`
- `session-http/team.json`

## settings
- `settings/change-log.json`
- `settings/channel-coefficients.json` — team 空间 editable=false，POST 返回 403 FORBIDDEN；生效日期为占位，老板给真值后替换
- `settings/credentials.json` — 只显绑定状态，不显值
- `settings/decision-policy.json`

## settlements
- `settlements/frozen.json` — 冻结后快照不随数据变；差异转工作项按 line
- `settlements/preview-blocked.json` — blocked：不许冻结；示例 issue 为演示（task_name 缺）
- `settlements/preview-ready.json`
- `settlements/template.json` — 新版本=新行，旧结算单绑旧版本

## shadow
- `shadow/decisions.json`
- `shadow/exam.json` — 四门全过才提示可升档；人点确认才升

## strategies
- `strategies/compare.json`
- `strategies/detail.json`
- `strategies/list.json` — 不返回置信度；只有样本数与验证计数
- `strategies/task-binding.json` — actual 来自 structure 同步；未同步=null

## system
- `system/etl-runs.json`
- `system/health.json`
- `system/search.json` — 非 LLM 对象直达

## task-detail
- `task-detail/overview-no-cap.json` — 无考核价/无日预算卡/无目标量：全部 missing/undefined，显 −，不显 0，不判色
- `task-detail/overview-v151.json` — v1.5.1 ②：stage/readiness/sopProgress/blockers/nextActions；八页签
- `task-detail/overview.json`

## task-list
- `task-list/empty.json`
- `task-list/errors.json`
- `task-list/partial.json`
- `task-list/ready.json`
- `task-list/stale.json`

## tasks
- `tasks/accounts.json`
- `tasks/attribution.json` — undeterminable 节点灰显“数据不足”，不显金额
- `tasks/funnel.json` — 离线链缺=missing，不显 0
- `tasks/list-v151.json` — v1.5.1 ②：stage 七态 + readiness 六段
- `tasks/metrics.json`
- `tasks/timeline.json`

## work-item-list
- `work-item-list/coverage-complete.json` — pending=0 且 undeterminable=0 → 前端允许显示「其余 43 户在阈值内（09:15 校验）」，43 = checked(45) − 有工作项账户数(2)
- `work-item-list/coverage-pending.json` — pending>0 → 只能显示「已检查 30 · 待检查 15 · 缺数无法判断 0」，禁止写阈值内
- `work-item-list/coverage-undeterminable.json` — undeterminable>0（缺数三态非 available）→ 显示「已检查 40 · 待检查 0 · 缺数无法判断 5」
- `work-item-list/empty.json`
- `work-item-list/errors.json`
- `work-item-list/partial.json`
- `work-item-list/ready.json`
- `work-item-list/stale.json`

## work-items
- `work-items/actions.json` — 动作枚举与忽略原因 chip；3 秒点选不打字
- `work-items/detail.json` — v1.3 工作项详情 + v1.5 decision；suggestions 只到确认卡

## workbench
- `workbench/fyi.json`
- `workbench/lead-gaptree.json`
- `workbench/lead.json` — v1.5.1 ④；impact 只用 cost_space/pacing 缺口，无则 missing；role≠lead/admin 403

## workflows
- `workflows/definitions.json`
- `workflows/graph-v1.json` — workflow-graph/v1：write 节点必须经 human_confirm 再 execute；十类节点各一
- `workflows/run-detail.json` — 原型 P13 运行详情
- `workflows/runs-running.json`
- `workflows/runs.json`
- `workflows/simulate.json` — 无副作用；write/external 只出预览
- `workflows/validate.json` — 四组全过且 missing_params 空才可发布

## ops（运维输入，非 API DTO）

- `ops/bootstrap-seed.json` — `seed:bootstrap` 输入形状（identities/workspaces/memberships/grants；来自 Codex P-052 提案，arch 落）

## 2026-09-07 第三批（fe TODO）

- `me/workload.json` — v1.7.4 G9 我的负载（计数 + 负载分 not_configured）
- `reports/daily-v1-not-sent.json` — 日报未推送（delivery.not_sent）
- `data-query/summary-window-v3-conversion-missing.json` — conversion_missing 例
- `rules/explain-7.json` / `rules/explain-9.json` — 未触发原因 CONDITION_FALSE / SOURCE_STALE
- `agent/run-events-1802.json` — 失败 run 事件流
- `admin/grants-member-2.json` — 第二位成员授权
- `tasks/attribution-cost.json` — 归因树 cost 模式
- `strategies/detail-3002.json` — 第二个方案（draft）

## 2026-09-07 第四批（fe G10–G13）

- `me/notifications.json` / `me/notifications-empty.json` — v1.7.8 G10 统一通知流（五 kind + 未读数 + cursor）
- `auth/password-changed.json` / `auth/password-error.json` — v1.7.6 改密码成功/失败
