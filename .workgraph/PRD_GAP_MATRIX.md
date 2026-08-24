# KA 投放经营平台 · PRD 功能真实差距矩阵

> 口径：`current` = 真实代码与验收证据已存在；`partial` = 有底座或页面，但未形成可用闭环；`gap` = 尚无产品实现。Mock 只能用于本机演示，不计作 runtime verified。

| 验收组 | 当前状态 | Live 证据 | 下一可执行批次 |
|---|---|---|---|
| 1 工作台 | partial | 工作台、三数据视角、KPI/趋势/异常容器已存在；真实 summary/trend/anomaly row Contract 尚未统一，早报、待办、T+1 仍是空/Mock | 先完成 canonical rows 与真实工作项读取，再接早报/T+1 |
| 2 投放任务 | partial | `/tasks` 仅页面壳；后端已有 task/domain/repository 基础，无任务详情 Web API 与六 Tab 页面 | 实现任务列表/详情只读 API，补 `/tasks/[id]` 总览、数据、账户、时间线 |
| 3 数据分析 | partial | `/data`、KA/platform/reconcile 三态和 Query Registry 已有；真实前后端尚未合流，对账 delta 未实现，透视/自助报表/归因树缺失 | 先贯通六个 canonical Query；再补 pivot 与保存视图 |
| 4 账户资源 | partial | `/accounts`、`/accounts/[id]` 路由已有；账户小传、结构树、余额、操作史、基建管理仍缺 | 先做账户详情只读闭环；写操作继续只预览 |
| 5 自动化 | partial | `/automation` 仍是壳；后端已有 workflow graph/runtime/trigger 等内核，但没有 Web API、画布、运行中心 | 先做模板/定义/版本/运行记录只读 API 与页面，随后画布草稿/模拟运行 |
| 6 商品素材 | partial | `/materials` 是壳；后端有素材转写、拆解、相似、实验、brief 等 Domain 资产，无产品 API/页面 | 先接素材池与拆解结果只读页；AIGC/外部下单后置 |
| 7 报告 | partial | `/reports` 是壳；后端有报告计划、数据集、日报/结算 Domain 资产，无生成/查看/导出闭环 | 实现日报只读样例、生成状态、来源戳与知识归档入口 |
| 8 知识库 | partial | `/knowledge` 是壳；10 条资料全部 review_pending/not_ready；无编辑器、搜索、权限与发布服务 | 只接可公开元数据与未发布状态；正式内容等业务/安全/owner 门 |
| 9 集成与通知 | partial | `/integrations` 是壳；DingTalk Gateway 基础测试存在，无绑定、订阅、卡片、值守、消息记录页面 | 先做接入状态和消息记录只读页；外发/卡片动作保留确认门 |
| 10 Agent 体系 | partial | 后端有 provider、context、diagnosis、memory/knowledge access 等内核；无统一 Web 抽屉与页面上下文 API | 先做只读问数/诊断证据 API，禁止 Agent 绕过 Capability Registry |
| 11 执行链路 | partial | ChangeSet、幂等、TTL、UNKNOWN、T+1 等内核存在；HTTP confirm、Runtime/Multica composition 未接 | 本机仅展示 preview/dry-run/risk；真实写单独 gate |
| 12 数据层 | partial | ETL/canonical/质量/语义查询基础较多；KA/Platform lineage、联合键、跨媒体 scope 仍有 P0/P1 | 修联合键、tuple scope、lineage、真实本地集成 |
| 13 规则引擎 | partial | 规则与告警 Domain/DB 能力存在；缺运行 composition、为什么没触发、规则编辑 UI | 先做规则命中只读证据与调试器；自动执行后置 |
| 14 平台与设置 | gap | 无 BUC/正式 SSO、授权档案、凭证绑定、治理后台页面 | 本机使用显式假身份；内网部署前接正式 auth/scope/secrets |
| 15 视觉与体验 | partial | 主框架和核心数据页可看；老板仍会在前端任务细调视觉，部分页面只是统一 placeholder | 合并前读取前端任务最新指令；本地 1440/1366/390 逐页验收 |

## 本机可演示闭环顺序

1. **D0 Contract 合流**：BFF → Auth Scope → Data API → KA/Platform 三态；真实错误、血缘、截断可见。
2. **D1 巡检闭环**：工作台异常 → 账户详情 → 工作项/诊断证据 → ChangeSet 只读预览；不执行写。
3. **D2 经营对象闭环**：任务详情、账户结构/时间线、日报查看。
4. **D3 自动化可视化**：模板、定义/版本、运行记录、模拟运行；画布先做草稿与校验。
5. **D4 扩展域可看**：素材池/拆解、知识元数据、接入状态/消息记录。
6. **老板细调 Gate**：页面与功能由老板逐页调整。
7. **内网只读 Gate**：正式认证、Secrets、账户 Scope、回滚方案确认后部署。
8. **真实写 Gate**：Runtime/Multica、确认 Hash、执行审计、UNKNOWN 对账、T+1 验收全部通过后另行批准。
