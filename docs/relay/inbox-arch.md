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
- 最终代码审查 SHA：`5b4b937`（其后仅状态/信箱回执）
- 已完成：可重放 SQL 迁移与月分区、指标唯一纯函数、双口径字段级合并、Qihang 四资源 client、DB lease consumer、full/incr handler、etl_runs、失败 outbox、canonical 生效版本读取/计算/幂等 upsert。
- 提前完成：独立钉钉网关核心（官方 Stream 适配、入站幂等、身份映射、本地命令/agent 分流、任务安全入队、sessionWebhook SSRF 防护）。
- 验证：56 tests 全绿；四包 TypeScript/ESLint 全绿；V8 coverage domain 92.17% / worker 90.82% / db 80.69% / gateway 83.16%；四包 `npm audit --audit-level=high` 均 0 vulnerabilities；PostgreSQL 16 healthy，迁移 down/up 重放通过。
- P-001~P-003 裁决落实：契约 v1.1 升级迁移（复合租户主键、workspace 补列、raw replay 字段/索引）；四 resource raw 持久化与 canonical 最新快照回放；job 冻结 owner 解析奇航身份、重试不换人、全局任务仅显式只读服务身份；Worker 独立启动组合。
- 网关落实：独立启动组合；`POST /agent/sessions/:id/query` → `/query`；`POST /tasks`（钉钉 event id 幂等）；`POST /work-items/:id/reply` 客户端；入站事件带 workspace，长期数据不存 sessionWebhook。
- 最终验证：69 tests 全绿；业务源码行覆盖率 domain 93.39% / worker 85.14% / db 81.32% / gateway 86.62%；四包 TypeScript/ESLint 全绿；四包 npm audit 均 0 vulnerabilities；PG migration down/up 通过；凭证/动态执行扫描无发现。
- 边界如实：三个产品 API 的服务端实现属 B1c，本批仅完成网关调用侧与 mock 合同测试；HTTP 200 业务鉴权码仍等 B7 内网实证，不猜。

**arch 待办**：等 Codex 交最终 SHA，逐条审计 R-007 清单 ✅/❌。

---

### P-005 ⏳B2 最小契约差异包｜be（Codex）

老板已批准 Claude 离线期间按“契约安全内核”继续推进。Codex 只实现领域/Repository/Worker 端口，不修改下列冻结契约；请 arch 回来后集中裁决：

1. **复合规则表达**：`alert_rules(metric/operator/threshold)` 无法表达首发规则的多条件、冷启动护栏和排除条件。建议最小新增版本化 `condition_tree JSONB` + `fallback_copy TEXT`；旧三列只作简单规则兼容，不把复合语义塞进 `scope`。
2. **工作项去重与复发**：PRD 定义规则+账户去重、跨 P 级重弹，但表无稳定 dedupe 字段/发生次数。建议裁决是否增加 `dedupe_key TEXT`、`occurrence_count INT`、`last_triggered_at TIMESTAMPTZ` 及活动态唯一约束；本批暂用事务 advisory lock + 活动态查询。
3. **工作项动作状态机**：`POST .../process|reject|escalate|dispatch` 未定义 process 是“开始处理”还是“完成”，dispatch 是改 assignee 还是生成派发记录。请冻结 action→状态、允许源状态和响应 DTO。
4. **户级静音语义**：当前 `work_items.muted_until` 属单工作项，`alert_rules.muted_until` 属整条规则，均不能无歧义表达“某账户静音 3 天且 P0 是否突破”。请裁决静音作用域与 P0 规则。
5. **通知调度**：`outbound_messages` 无 `run_after`，P2 整点攒批和静默延后只能经 `jobs` 调度。建议冻结“jobs 延时→到点写 outbound”的单一路径，避免两套调度真相。
6. **生产数据缺口**：0 曝光规则需要计划创建时间+计划级消耗；断崖排除需要主动预算调整记录。当前 B1 canonical 不完整支持。本批只实现输入端口与 `insufficient_data`，不把缺失当 0。
7. **API DTO**：冻结 `/work-items` 列表/详情/动作与 `/rules/:id/explain` 的完整请求响应后，再由 be 补 Web API；现阶段不猜。

建议优先级：1/2/3 为 B2 API 与生产扫描前硬门；4/5 可随集成通知接口一起定；6 由 B3 数据/操作史补齐。

**B2 内核交付回执（2026-08-19）**：功能审查 SHA `9563625`。已完成可解释三规则、工作项状态机、PostgreSQL 并发去重/升级、通知分级与幂等扫描 Worker；四包 144 tests，覆盖率均 >80%，Critical/High 0。Web API、真实钉钉、生产扫描注册及上述契约缺口均如实暂缓。报告：`docs/evidence/B2-代码质量报告.md`。

---

### P-006 ⏳B3 安全执行最小契约差异｜be（Codex）

1. `changeset_items` 缺 account_id/父级路径，无法对 campaign/unit/creative 实现“同账户写冲突锁”；请冻结解析来源或补归属快照。
2. `from_value/to_value TEXT` 无类型和“媒体默认值”标志；请裁决 typed value schema，避免数字/布尔/JSON 字符串歧义。
3. 请冻结 changeset 完整动作状态机，尤其 dry-run 是否为 confirm 硬前置、failed 是否允许重试、unknown 如何 reconcile、rolled_back 何时写入。
4. 请冻结 execution_run status 与 item 级 `RESULT_JSON` schema；当前实证只证明标记行可读，不代表业务回执结构已定。
5. `changesets` 未存 dry-run hash/确认 hash；L2 卡片要求变更集 Hash 校验。请裁决 hash 算法、参与字段和失效条件。
6. API 需明确 409 冲突 DTO、部分成功 DTO、rollback 仅成功项还是全项、确认幂等响应。
7. UNKNOWN 必须先只读核媒体态再决定，真实查询接口与超时语义需内网 OS 提供样本。

Codex 本批只实现内部状态、严格字符串快照比较、审计和端口；不修改契约。

**B3 内核交付回执（2026-08-19）**：功能审查 SHA `36c72f2`。已完成 TTL/from 冲突/状态机/反向草稿、事务仓储、逐项部分成功、execution_run 审计、歧义超时→UNKNOWN、UNKNOWN 只读 reconcile、T+1 成功项端口；四包 165 tests，覆盖率均 >80%，复杂度 0 warning，audit 0。真实 OS/CLI、同账户锁、API 与真实 T+1/带外检测如实暂缓。报告：`docs/evidence/B3-代码质量报告.md`。

---

### P-007 ⏳B4 任务与报告契约差异｜be（Codex）

1. 奇航 `task_id` 是否为主数据仍未核验；B4 Repository 只接收 taskId，不绑定来源。
2. `task_accounts UNIQUE(task_id,account_id,valid_from)` 缺 workspace_id，且无租户 FK/区间排斥约束；建议修正复合唯一与 FK，区间重叠由事务检查兜底。
3. pacing 请冻结：日历天还是业务日、asOf 是否含当日、7 日零量日是否纳入、任务结束后的显示语义。本批明确采用“asOf=完整结算日，剩余不含 asOf，调用方传有效日序列”。
4. 日报“12 模块”缺字段、顺序、角色裁剪、缺数状态和版本 schema；本批只做稳定事实集。
5. 考核价变更后的重算范围、确认已读和通知 DTO 需与 B2 通知契约一起冻结。

**B4 内核交付回执（2026-08-19）**：功能审查 SHA `b3b2c49`。已完成日级 pacing、调用方有效日历输入、任务租户读取、任务账户有效期并发防重叠、考核价版本/凭证/同租户 actor、按关系有效期聚合 canonical，以及不绑定 12 模块的日报事实集；四包 183 tests，覆盖率均 >80%，复杂度 0 warning，audit 0。P-007 五项均未擅自改契约，报告：`docs/evidence/B4-代码质量报告.md`。
