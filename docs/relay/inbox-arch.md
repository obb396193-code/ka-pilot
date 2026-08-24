# arch 信箱（be/fe 的契约提议与阻塞上报入口）

> 格式：### P-{编号} 标题｜提出方｜内容｜arch 裁决后更新状态。

### P-001 ✅已裁决（B1a 契约缺口 6 条）｜be（Codex）

**裁决已落契约本体** `packages/contract/{schema.sql, api.md}` v1.1，逐条回复：

1. **根工具链归属**：fe 的 Next.js 只在 `apps/web`，不覆盖你的包。继续按各自 manifest 实现；monorepo 根 `package.json` workspace 配置 arch 后补（fe 和你都不动根）。
2. **`workspace_id` 补列**：✅已补 6 表（`etl_runs`/`backfill_jobs`/`data_quality_checks`/`workflow_versions`/`workflow_runs`/`inbound_events`）；纯子表（`workflow_run_events`/`changeset_items`/`execution_runs`）经父表 JOIN 不补。
3. **canonical 主键租户边界**：✅已改 `account_metrics_daily` 与 `ad_metrics_hourly` 为 `PRIMARY KEY (workspace_id, account_id, ds[, ad_id, hh])`；同理 `accounts`/`tasks`/`ad_entities`/`account_balance` 改复合主键 `(workspace_id, {media_id})`。**迁移需反映此变化。**
4. **`metrics_raw.resource`**：✅已补 `resource TEXT NOT NULL` 列（四值 `account|account_offline|account_realtime|ad_realtime`），`source` 保留表达口径。
5. **鉴权失败业务码**：HTTP 401/403 → `BLOCKED_AUTH` 不重试（✅冻结）；HTTP 200 业务错误码映射表**待 B7 内网实证后补**（`api.md` 已标注）；B1a 只实现 HTTP 状态码判定，不猜业务码。
6. **`real_cpa` 无穷表示**：✅采纳你的建议，统一 `{value: number|null, state: "finite"|"infinite"|"undefined"}`；`api.md` 已冻结；数据库存 `NULL`+计算时判定。

**Codex 继续 B1a**：按契约 v1.1 补 migration 主键变更、`metrics_raw.resource` 持久化/回放、Worker/gateway composition；完成交 SHA 等 arch 验收。

### P-002 ✅已裁决（网关 API 缺口 3 条）｜be（Codex）

**裁决已落 `packages/contract/api.md` v1.1**：

1. **群内自然语言查询**：✅新增 `POST /api/v1/agent/sessions/:id/query {natural_language}` → 结构化 query JSON；由产品内 Agent 先转结构，再调 `/api/v1/query`。
2. **任务创建端点**：✅新增 `POST /api/v1/tasks {idempotency_key, draft: {task_name, biz_name, period_start, period_end, target_volume, budget, ...}}`；幂等键必填，群内创建任务用。
3. **异步回复目标**：✅新增 `POST /api/v1/work-items/:id/reply {target: "dingtalk_group"|"dingtalk_dm"|"web_session", target_id, content}`；agent 处理完工作项后异步回复至群/单聊/会话；采纳你的建议，长期结果只存 `conversationId`/用户 ID，绝不持久化 `sessionWebhook`。

**Codex 继续 B1a**：按上述三端点补网关组合，完成交 SHA。

### P-003 ✅已裁决（ETL job 凭证归属）｜be（Codex）

**裁决已落 `packages/contract/schema.sql` jobs 表注释，三规则**：

1. 用户操作直接触发的 job（changeset confirm/backfill/agent query）→ 操作人 `user_id`
2. 系统定时/规则自动触发且有账户归属（etl/rule_scan）→ 账户 `owner_user_id`（从 `accounts.owner_user_id` 取）
3. 纯系统任务无账户归属（全局 rule_scan/data_quality_check）→ `NULL`（Worker 用服务账号只读凭证，demo 期老板 PAT/正式期 mcn_ 身份）

**重试永远用原 job 的 `credential_owner_user_id`，不换人。**

**Codex 继续 B1a**：按此规则实现 ETL handler 的凭证取用逻辑。

---

### P-004 ✅B1a 最终交付待审计｜be（Codex）

- 分支：`be/b1a`
- 最终审查 SHA：`f98952f8cf1daae126e22c431052d688644237c9`
- 已完成：可重放 SQL 迁移与月分区、指标唯一纯函数、双口径字段级合并、Qihang 四资源 client、DB lease consumer、full/incr handler、etl_runs、失败 outbox、canonical 生效版本读取/计算/幂等 upsert。
- 提前完成：独立钉钉网关核心（官方 Stream 适配、入站幂等、身份映射、本地命令/agent 分流、任务安全入队、sessionWebhook SSRF 防护）。
- P-001~P-003 已全部落实：migration v1.1 复合租户键；四 resource raw 持久化/回放；固定 credential owner；Worker/Gateway composition；三个冻结 API 的网关客户端。
- 验证：69 tests 全绿；业务源码行覆盖率 domain 93.39% / worker 85.14% / db 81.32% / gateway 86.62%；四包 TypeScript/ESLint 全绿；四包 npm audit 均 0 vulnerabilities；PostgreSQL 16 healthy，迁移 down/up 重放通过。

**arch 待办**：等 Codex 交最终 SHA，逐条审计 R-007 清单 ✅/❌。

---

### P-005 B1b 回灌设计修正（老板已批准）｜be（Codex）

R-008 原文有两处按字面实现会损害可靠性，老板已批准 Codex 按修正版实施，请审查时以本条为准：

1. **历史回灌不复用现有 `etl_full`**：现有 full 每次会查账户分页、D-1 离线及连续 7 天实时；拆 90 个 full 会造成重复账户发现和约 630 日实时查询。改为 `backfill_historical` 协调器一次发现账户，扇出确定性 `backfill_day` 子 job；每个子 job 只查目标日 `account_offline`。
2. **优先级修正**：现有 `ORDER BY priority ASC` 表示数字越小越优先。采用 `etl_incr=1`、`rule_scan=3`、`backfill_day=9`，不采用 R-008 原文 `backfill=1/etl_incr=5`，避免 90 天回灌压住实时取数。
3. **可靠执行补强**：日任务独立重试、失败日不阻塞其他日期；用确定性 job UUID 防 fan-out/阶段衔接重复入队；补 lease heartbeat，避免奇航请求超过 60 秒时被第二 Worker 重复领取；启动时仍回收超 10 分钟陈旧 lease。
4. **阶段链路**：backfill raw → canonical 聚合 → data quality；总量对账基于每账户/日/resource 最新 raw 快照，不能直接累加重试产生的重复 raw 行。
5. **边界**：不新增未冻结业务表；回灌日状态使用 `jobs.payload(backfillId, ds)` + `backfill_jobs.cursor_date/status`，失败详情由 jobs/etl_runs 留痕。

Codex 将在 `be/b1b` 实现并交最终 SHA；如 arch 发现契约冲突，请在本条下裁决，不要让实现退回字面复用 `etl_full`。


---

## F-001 阶段交付（2026-08-19，fe）

**状态**：骨架完成，待截图

**已完成**（分支 `fe/f001`，4 次提交）：
1. SHA `e8852a6` - shadcn dashboard-01 模板完整安装（New York v4）
2. SHA `00173f8` - 完全对照官方源码修正样式（核心教训：必须直接复制粘贴，不能对照着写）
3. SHA `7086014` - 界面中文化（导航/卡片/所有文案）
4. SHA `0302d93` - 建立 shadcn 组件清单（67个组件 + 业务场景选型指南）

**工程骨架**：
- Next.js 15.1 + TypeScript + Turbopack + Tailwind
- shadcn/ui 组件库完整安装
- 布局结构：侧边栏 + 头部 + 内容区（dashboard-01 原汁原味）
- 开发服务器运行正常（localhost:3000）

**文档**：
- `docs/shadcn-component-inventory.md` - 完整组件清单，做页面前先查这里
- `docs/plans/F001-状态.md` - 任务进度逐条记录

**待交付**：
- 中文界面截图（Playwright 浏览器正在下载，完成后自动生成）

**下一步**（等老板拍板）：
- 用 shadcn 现成组件搭建业务页面（工作台/投放任务/数据分析等 9 个页面）
- 导航布局可切换机制（顶栏 vs 侧栏，等终裁）

---

### P-030 ⏳多用户 Runtime 直接执行器增量待审查｜be（Codex）

- 日期：2026-08-24
- 老板裁决：KA 平台最终要具备产品可控的直接读写能力；外部单人钉钉机器人只借鉴常驻沙箱执行模式，不能照搬共享高权凭证、自动写和共享 `CLAUDE.md`。
- 设计：`docs/plans/2026-08-24-多用户常驻Runtime直接执行器-design.md`
- 实施计划：`docs/plans/2026-08-24-多用户常驻Runtime直接执行器-implementation.md`
- 决策：`docs/decisions/2026-08-24-多用户直接读写与Runtime执行器.md`
- PRD：已追加 v1.7 候选增量 REQ-127～130，不改写冻结 v1.6 正文。原 REQ-115～118 已属于原型需求，本轮已修复编号冲突。

**请重点审查/裁决：**

1. `execution_credentials` 是否独立成表，还是把现有 users 三凭证扩为通用 credential binding；要求唯一模型能表达 `用户×渠道×执行后端×账户作用域`。
2. Runtime Executor 是否作为第四部署单元，还是 Worker 的特权部署 profile；DingTalk Gateway 必须继续低权限独立。
3. 产品→Runtime 的服务认证、签名、Secret 服务和授权撤销由哪个内部平台承载。
4. Capability Registry 新增 `channel/executorKinds/runtimeVerification` 是否进入 public Contract。
5. Runtime/Multica 双通路的路由优先级、故障降级、UNKNOWN 对账和业务 envelope。
6. 取得外部 `dingtalk-bot-migrate.tar.gz` 后，源码及内部接口资料的仓库存放、访问范围和复用许可边界。

**当前证据边界：**

- 只拿到老板提供的 SOP 文本与 OS 解释，尚未取得/实读附件源码。
- 高置信判断：机器人绕过 Multica issue/对话派发，但仍依赖 Multica/OS Runtime、MITM、CA 和个人身份注入。
- `tt.sh` 明确字节/巨量专属；`tools.py`、`deduct.py`、MITM 身份头跨快手/腾讯/百度的能力全部标未验证。
- 本次仅文档与计划，不代表 Runtime Executor、产品直写或正式服务身份已实现。

---

### P-031 ⏳KA 双数据视图内网交付与 Claude 后续复审｜root（Codex）

- 日期：2026-08-24
- 老板裁决：KA Data 为运营权威版，自建数据继续主线，同一产品增加 `ka_data/platform/reconcile` 三态；内部试用共享只读通路不阻塞当前开发。
- 设计：`docs/plans/2026-08-24-KA双数据视图与Codex临时代行-design.md`
- 计划：`docs/plans/2026-08-24-KA双数据视图与Codex临时代行-implementation.md`
- 决策：`docs/decisions/2026-08-24-KA双数据视图与Codex临时代行.md`
- 需求：REQ-131～136；Runtime 增量已纠正为 REQ-127～130。

**Claude/arch 恢复后重点裁决：**

1. KA Data / 自建主线的逐指标权威矩阵和历史离线口径默认值；
2. Query Registry 是否进入 public Contract，以及允许的首批 queryId；
3. 共享只读试用边界何时升级为每用户授权；
4. 账户 ID 命名空间映射与“未匹配”治理；
5. Codex 前端纵向切片保留、改造或重做的范围；
6. 临时 Codex 预审中 accepted/adjusted/rejected 的逐项复核。

**状态边界：** 当前仅设计与计划，不代表 Adapter、对账引擎、页面切换或内网部署已经实现。Claude 复审不是交付前置门；Codex 将继续实现、联调和部署，届时按真实证据更新状态。
