# arch 信箱（be/fe 的契约提议与阻塞上报入口）

> 格式：### P-{编号} 标题｜提出方｜内容｜arch 裁决后更新状态。

### P-001 ✅已裁决（B1a 契约缺口 6 条）｜be（Codex）

**裁决已落契约本体** `packages/contract/{schema.sql, api.md}` v1.1，逐条回复：

1. **根工具链归属**：fe 的 Next.js 只在 `apps/web`，不覆盖你的包。继续按各自 manifest 实现；monorepo 根 `package.json` workspace 配置 arch 后补（fe 和你都不动根）。
2. **`workspace_id` 补列**：✅已补 6 表（`etl_runs`/`backfill_jobs`/`data_quality_checks`/`workflow_versions`/`workflow_runs`/`inbound_events`）；纯子表（`workflow_run_events`/`changeset_items`/`execution_runs`）经父表 JOIN 不补。
3. **canonical 主键租户边界**：✅已改 `account_metrics_daily` 与 `ad_metrics_hourly` 为 `PRIMARY KEY (workspace_id, account_id, ds[, ad_id, hh])`；同理 `accounts`/`tasks`/`ad_entities`/`account_balance` 改复合主键 `(workspace_id, {media_id})`。**迁移需反映此变化。**

> **SUPERSEDED（仅保留为历史记录，R2 2026-08-24）**：上面 P-001#3 的两字段账户主键指令只记录当时 Contract 裁决，不再代表老板批准的账户模型。统一账户键为 `(workspace_id, media, account_id)`。**R3 现状同步（2026-08-25）**：`packages/contract/schema.sql` 与 migration 005/006 已完成账户主键和相关外键同步；其他对象 ID 仍须逐项核证。本标记不静默改写历史正文。

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

### P-005 ✅已裁决（2026-09-04 v1.3）｜原B2 最小契约差异包｜be（Codex）

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

### P-006 ✅已裁决（2026-09-04 v1.3）｜原B3 安全执行最小契约差异｜be（Codex）

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

### P-007 ✅已裁决（2026-09-04 v1.3）｜原B4 任务与报告契约差异｜be（Codex）

1. 奇航 `task_id` 是否为主数据仍未核验；B4 Repository 只接收 taskId，不绑定来源。
2. `task_accounts UNIQUE(task_id,account_id,valid_from)` 缺 workspace_id，且无租户 FK/区间排斥约束；建议修正复合唯一与 FK，区间重叠由事务检查兜底。
3. pacing 请冻结：日历天还是业务日、asOf 是否含当日、7 日零量日是否纳入、任务结束后的显示语义。本批明确采用“asOf=完整结算日，剩余不含 asOf，调用方传有效日序列”。
4. 日报“12 模块”缺字段、顺序、角色裁剪、缺数状态和版本 schema；本批只做稳定事实集。
5. 考核价变更后的重算范围、确认已读和通知 DTO 需与 B2 通知契约一起冻结。

**B4 内核交付回执（2026-08-19）**：功能审查 SHA `b3b2c49`。已完成日级 pacing、调用方有效日历输入、任务租户读取、任务账户有效期并发防重叠、考核价版本/凭证/同租户 actor、按关系有效期聚合 canonical，以及不绑定 12 模块的日报事实集；四包 183 tests，覆盖率均 >80%，复杂度 0 warning，audit 0。P-007 五项均未擅自改契约，报告：`docs/evidence/B4-代码质量报告.md`。

---

### P-008 ✅已裁决（2026-09-04 v1.3）｜原B5 Agent 与多模型网关最小契约差异｜be（Codex）

老板已批准在 Claude 离线期间完成 B5 可审查后端，并要求 Claude Agent SDK、CCSwitch 式多模型切换、流式输出和既有实现复用。本批不修改冻结契约，请 arch 回来后集中裁决：

1. **Agent 会话约束**：`agent_messages`/`agent_context_items` 无 FK、role/object_type/added_by 枚举和删除语义；请冻结 context add/remove DTO、对象类型与“无权限/对象已删”的返回口径。建议至少补 session FK、顺序索引及消息唯一幂等键。
2. **Run 关联和状态**：`agent_runs` 缺 `session_id`、`provider_id`、`model`、`credential_owner_user_id`、`error_code`、`attempt`、首 token 时间、usage/result 引用；请冻结 run status 和用户可见 DTO。本批只写现有列，扩展信息留在内部事件/安全摘要。
3. **Run event 持久化**：流式恢复、原始排障和顺序审计需要 `agent_run_events(run_id, seq, kind, safe_payload, raw_ref, created_at)` 或等价外部 event store。请裁决数据库表还是对象存储+索引；本批实现 `RunLogStore`/`AgentEventSink` 端口，不造表。
4. **通用 Provider 凭证**：`users.idealab_ak_ref` 只能表达一个 IdeaLab key，无法表达 Anthropic 官方/其他 provider、多 key 轮换和状态。建议 `model_provider_credentials(workspace_id,user_id,provider_id,secret_ref,status,last_checked_at)`；原列可迁移为兼容入口。
5. **Provider Capability Matrix**：请冻结 provider profile 和 `provider_model_capabilities` 的持久化字段（protocol、model、tool/stream/structured/timeout/sdk compatibility、状态、实测时间、错误摘要、测试版本）。本批实现领域模型和存储端口，不造表。
6. **内部模型网关**：请确认网关是 Worker 部署单元内 localhost sidecar（不新增第四个产品 FaaS），以及内部 `/v1/messages` 不进入公开 OpenAPI。建议真实上游 key 由短时加密信封交给网关注入，Agent 子进程只拿信封和 client token。
7. **SSE 事件协议**：请冻结 `session|run|delta|tool|evidence|done|error` 的字段、断线取消、消息幂等和重连语义；structured output 仅在 done 帧出现。本批实现内部稳定事件类型，不新增 Web 路由。
8. **诊断 DTO**：PRD 只有外层字段，需冻结 reason/action 枚举、evidence ref、confidence、expected_effect、constraint_check 和 fallback_reason 的完整 schema。本批按 PRD 最小安全 schema 实现内部校验，不把它声明成公开 API。
9. **Agent job/OS 工具**：请冻结后台 Agent job_type、`dispatch_os_task` 的请求/回执、只读/写操作确认门和 OS Run 引用。本批只交端口，不伪造 Multica/OS 协议。
10. **用量与结算**：SDK `total_cost_usd/modelUsage` 是估算值，不能进入结算。请冻结网关 usage 账本/上游对账来源；本批只把 usage 作为运行诊断，不作财务字段。

建议优先级：1/2/6/7/8 是 Web/API 联调前硬门；3/4/5 是正式多租户上线硬门；9 等 B7 内网实证；10 随用量看板冻结。

**B5 当前路线**：`docs/plans/2026-08-19-B5-Agent后端-design.md`。在 arch 裁决前只实现既有表可承载的 Repository、领域/Runtime/网关端口和 fake upstream 集成测试。

**B5 内核交付回执（2026-08-19）**：功能审查 SHA `545637c`。已完成会话/context/memory/Run 仓储、诊断双产物与安全降级、Provider capability/router/fallback、短时凭证信封、Claude Agent SDK 安全运行时、本地协议 sidecar、Orchestrator 和 read/preview 原子能力端口。四包 271 默认测试 + 1 项 opt-in 真实 SDK 烟测；coverage 全部 >80%；typecheck/lint/audit 通过；复杂度 0 warning。报告：`docs/evidence/B5-代码质量报告.md`。

**arch/Claude 必审红线**：

1. 先裁决 P-008 的 session/run/event/provider credential/API DTO，再接 Web/SSE；当前 `createAgentBackend()` 不在 Worker main 自动启动。
2. 审核 `tools:[]` + in-process MCP、auto-memory 关闭、12-key env、短时信封插件和 sidecar 进程边界。
3. 确认 sidecar 仍属 Worker 部署单元内部 localhost，不新增公开服务。
4. SDK 包为 Anthropic all-rights-reserved/受 Legal Agreements 约束；用它经协议转换驱动 IdeaLab 非 Claude 模型，在正式上线前需公司内部法务/采购确认，不以技术跑通代替许可。
5. 生产必须补容器/微虚机沙箱、CPU/RAM/磁盘限额和 egress allowlist；本批只有应用层工具/环境/网络地址钳制。
6. 真实 Provider、Secret 服务和 Multica/OS 未联调；fake 测试不可当生产验收。

---

### P-009 ⏳Codex B1a-B5 后端总审查入口｜be（Codex）

老板要求：Codex 必须持续记录自己做过什么，并把 Claude 恢复后需要审查的内容写清楚，避免会话丢失和漏审。

**唯一总索引**：`docs/plans/Codex后端交付总账.md`。

**连续继承链**：

```text
main 9335150
→ be/b1a f98952f
→ be/b1b 50e3014
→ be/b1c a699279
→ be/b2  46b7eec
→ be/b3  0af66d0
→ be/b4  9f7ecea
→ be/b5  53ea264
```

`be/b5` 已包含 B1a-B5 全部后端代码。历史信箱快照曾复用 `P-005/P-006/P-007` 编号，Claude 审查时请按“批次 + SHA”定位，不要只按 P 编号。

**建议审查顺序**：

1. 先读总账 §3-§5，确认安全边界和未完成项。
2. 按 `main..be/b1a`、相邻批次 diff 逐批审，不一次看 4 万行总 diff。
3. 每批对照 `docs/plans/B*-状态.md`、design、implementation 和 evidence。
4. 先集中裁决 B1c-B5 契约缺口，再接公开 API/SSE/前端；不得让实现反向定义契约。
5. 审完在本条按批次写 `✅/❌/需修改`，并记录裁决落在哪个契约 SHA。

**Claude 必须特别检查**：租户隔离、凭证归属、写确认门、UNKNOWN 禁盲重试、Agent 工具白名单、短时凭证信封、fake 与真实通路边界、SDK 许可和生产沙箱缺口。

**B6 状态更新**：契约安全的内部报表/分析内核已完成，详见 P-010；公开 DTO、Schema、共享权限、定时语义和外部联调仍等待 arch 裁决。

---

### P-010 ⏳B6 分析与报表内核交付待审计｜be（Codex）

- 分支：`be/b6`
- 基线：B5 `53ea264`
- 功能审查 SHA：`6dc7ed1`
- 质量证据 SHA：`05b8388`
- 设计：`docs/plans/2026-08-19-B6分析与报表内核-design.md`
- 计划：`docs/plans/2026-08-19-B6分析与报表内核-implementation.md`
- 质量报告：`docs/evidence/B6-代码质量报告.md`

**已完成**：

1. `b6-internal-v1` 严格执行计划：KPI/trend/table/bar、现有指标和 account/task/biz 白名单；拒绝 SQL、公式、脚本、URL、预计算数据、schedule/sharing/layout。
2. 可信组件装配：保留 finite/infinite/undefined/missing，组件独立 ready/empty/missing，不把缺失变 0。
3. Gap 对账：媒体/真实转化、signed difference、RatioValue 和证据；未发明正常阈值。
4. 策略矩阵：账户去重、≥3 户且消耗 ≥100 护栏、总量重算 CPA、稳定 winner；不生成未经数据支持的打法文案。
5. B1c 事实适配：按需加载 summary/trend/dimension、同维度去重、租户隔离、任务归属歧义透传。
6. 幂等 Worker：Plan/Facts/Artifact/RunLog 四端口，双 workspace 校验，稳定 SHA-256 key，重复运行不重复保存，失败只记录稳定安全码。

**验证**：304 默认 tests + 1 opt-in 真 Claude Agent SDK→localhost gateway→fake upstream 烟测；coverage domain 94.72% / db 92.60% / worker 90.54% / gateway 86.62%；四包 typecheck/lint/audit 全绿；复杂度 0 warning；PG16 migration replay/down-up 通过；冻结 contract/migrations 0 diff。

**请 arch/Claude 逐项审**：

1. `report-plan.ts` 的内部白名单是否足够隔离未来公开 config，尤其不得把它直接宣布为 Web DTO。
2. `report-dataset.ts` 的缺失/空数据/零值/无穷四态与稳定排序是否符合前端展示预期。
3. Gap 仅作数学对账、不做阈值的边界是否正确。
4. 策略 winner 是否必须继续坚持“≥3 户、消耗 ≥100、CPA finite”三条件。
5. `report-facts-source.ts` 是否正确复用 B1c 比率，未二次计算或重复查询。
6. Worker 的 workspace/report/plan/asOf 幂等键、日志脱敏和“不注册 runtime”边界。

**集中待裁决契约差异**：

1. 公开 `report_configs.config` 的版本、组件、布局和请求/响应 DTO；内部 plan 只可作为执行层，不应反向成为公开契约。
2. `report_configs` 的 owner/权限与统一 `assets` 的 draft/shared/verified/official/deprecated 如何关联；PRD 的 `is_shared` 与当前表不一致。
3. schedule 的时区、错过补跑、重试、订阅目标、幂等和暂停语义；不能只靠一个自由文本字段上线。
4. 报表运行时是否固定 config version；artifact/snapshot 的 PostgreSQL/对象存储/知识库索引结构与保留期。
5. `/export` 异步任务 DTO、格式白名单、文件大小、过期和下载鉴权。
6. 版位、出价方式、负责人等策略维度的数据源、canonical 字段与多任务分摊规则。
7. Agent 草稿到公开 config 的编译、权限检查、证据引用和预览/应用确认 DTO。
8. 报表生成 job_type、run 状态、失败恢复和 outbound/钉钉交接；本批未注册生产任务。
9. 权威 `dataCutoffAt` 从 ETL/canonical 哪个 Run 取，不能使用查询完成时间。

**明确未做**：公开 API、Schema/迁移、前端设计器、共享治理、定时调度、PNG/PDF/Excel、钉钉推送、缺失策略维度查询、真实 Provider/奇航/Multica/OS 联调。

---

### P-011 ⏳B7 工作流可靠执行内核交付待审计｜be（Codex）

- 分支：`be/b7a`
- 基线：B6 `57c5773`
- 功能实现 SHA：`b0024e1`
- 质量与安全修正 SHA：`90eea92`
- 设计：`docs/plans/2026-08-19-B7工作流可靠执行内核-design.md`
- 计划：`docs/plans/2026-08-19-B7工作流可靠执行内核-implementation.md`
- 质量报告：`docs/evidence/B7-代码质量报告.md`

**已完成**：

1. Capability Registry：六类节点、read/preview/execute 三风险模式、精确版本、权限、Schema、超时、尝试次数与幂等范围；execute 不可直接暴露给 Agent。
2. 严格 DAG 编译：版本化 graph/params、环/自环/孤岛/重复依赖拒绝、稳定拓扑序、参数/上游输出绑定和排除 UI 坐标的执行指纹。
3. 事件重放状态机：连续 sequence、开始/成功/有界重试/确认/暂停/恢复/取消/失败/UNKNOWN/终态；UNKNOWN 禁普通重试。
4. PostgreSQL Repository：复用现有四表，实现 definition/draft/publish/exact-version run/event append/CAS；workspace 联表隔离、同租户 actor、published 不可变、事件并发序列和幂等冲突。
5. 无写入 Simulation：严格按固定计划校验依赖/权限/输入输出，execute 永远只调 preview，不能进真实写端口。
6. Durable Runner：线性/fan-in、崩溃恢复、成功节点跳过、幂等输出、有界重试、步数/墙钟让出和控制命令。execute 只走 Changeset preview→hash 确认→confirmed execute；歧义、超时或写后持久化异常进 UNKNOWN。
7. B5 Agent 兼容：operation port 复用公共 capability metadata 校验，仍只允许 read/preview，未放开 execute。

**验证**：367 默认 tests + 1 opt-in 真 Claude Agent SDK→localhost gateway→fake upstream 烟测；coverage domain 94.42% / db 92.97% / worker 90.43% / gateway 86.62%；B7 新模块均 >80%；四包 typecheck/lint/audit 通过，audit 0；复杂度/单函数门禁 0 warning；PG16 migration replay/down-up 通过；冻结 contract/migrations 0 diff；凭证/动态执行扫描无发现。

**请 arch/Claude 逐项审**：

1. Capability Registry 是否足以成为页面按钮、工作流节点和 Agent tool 的同一能力真相，尤其 execute 不暴露 Agent 的红线。
2. `b7-internal-v1` 只作内部编译输入的边界；不得直接把它宣布为 React Flow/Web 公开 DTO。
3. published 快照比对、Run 固定版本、事件 detail JSONB 中的 schemaVersion/sequence/dedupe 是否可接受，或需升级成显式列/约束。
4. 崩溃后 running 读/preview 以原 attempt + 原幂等键重入的前提：外层 job lease 保证单活 Worker；公开运行时需审核 lease/心跳组合。
5. execute 调用端口必须落到 B3 变更集和真实幂等执行；不得用 generic invoker 或直调 CLI 替换。
6. 写后输出 Schema/存储异常进 UNKNOWN 的安全选择是否保留，以及 `reconcile/` 对账引用最终存储形式。
7. 当前单 Run 串行、DAG-only、无循环/子流程/补偿的首版范围是否符合 PRD 分期。

**集中待裁决契约差异**：

1. 公开 workflow graph/params/node/edge DTO、乐观锁、草稿保存、发布、复制模板和版本回滚语义。
2. workflow definition/version 如何对齐统一资产治理（个人草稿→团队共享→已验证→官方→已废弃）、owner、适用范围和替代版本。
3. `/simulate|publish|runs|confirm|pause|resume|cancel` 请求/响应、幂等键、409 冲突、错误码、确认过期和运行日志 DTO。
4. workflow output/artifact 的真实存储、大小上限、保留期、下游解引和用户查看权限。
5. 定时、数据就绪、钉钉、手动、策略触发器与 job_type/run lease 的幂等和补偿语义。
6. 真实 OS/Multica/CLI 读/preview 能力映射、变更集写端口、原始运行记录引用和 UNKNOWN 对账协议。
7. 工作流权限：谁能运行公共/团队/个人流程，credential owner 如何冻结，管理员代运行和查看 raw run 的权限边界。

**明确未做**：公开 API/Schema/迁移、前端 React Flow 画布、生产 Worker 注册、定时/事件触发器、真实输出存储、真实 B3 Changeset/OS/Multica 接缝、多分支并行、条件/循环/子流程/补偿。

---

### P-012 ⏳B8 知识库领域底座交付待审计｜be（Codex）

- 分支：`be/b8a`
- 基线：B7a `51a98d7`
- 功能实现 SHA：`32a82ba`
- 质量与安全修正 SHA：`8c87530`
- 设计：`docs/plans/2026-08-20-B8知识库领域底座-design.md`
- 计划：`docs/plans/2026-08-20-B8知识库领域底座-implementation.md`
- 质量报告：`docs/evidence/B8-代码质量报告.md`

**已完成**：

1. BlockNote 安全信封：严格 `{blocks}` 外层，未知块前向兼容；JSON/循环/危险 key/accessor/数组异常和五层资源上限 fail-closed，遍历时实时累计总字节。
2. 派生文本与指纹：只投影正文 text + wikilink title；版本化 canonical SHA-256 忽略 object key 顺序、保留数组语义。
3. 安全双链：严格 `{type:wikilink,props:{itemId,title}}`，UUID 真相、路径、去重、自链/坏链诊断；resolver 绑定 workspace+actor，跨租户/无权/不存在统一 target unavailable。
4. KA 业务引用：task/account/report/workflow/workflow_run/dataset/changeset/product/material；受限 opaque ID、label 缓存、snapshot/cutoff 证据版本和稳定去重。
5. 知识资产语义：manual/ai_report/report_snapshot/workflow_case/lesson/imported 来源，private/team 可见性与统一 asset lifecycle 分离。
6. Agent citation 边界：请求强制 workspace+actor；citation 带 revision/fragment/score/evidence key/source/visibility/snapshot；检索端口先裁权，领域边界再复核文档和业务对象权限，无权内容不进入 Agent。

**验证**：406 默认 tests + 1 opt-in 真 Claude Agent SDK→localhost gateway→fake upstream 烟测；coverage domain 95.32% / db 92.97% / worker 90.43% / gateway 86.62%；B8 三模块 96.46%/100%/98.96%；四包 typecheck/lint/audit 通过，audit 0；复杂度/单函数门禁 0 warning；PG16 migration 回归通过；冻结 contract/migrations 0 diff；凭证/动态执行扫描无发现。

**请 arch/Claude 逐项审**：

1. blocks 仅约束安全 JSON、custom ref 单独严格校验的前向兼容边界是否保留。
2. blocks/depth/nodes/string/bytes 默认上限和 canonical fingerprint 版本策略是否合适。
3. wikilink UUID 真相、全量出链替换、坏链结构化诊断和 `target_unavailable` 防存在性探测是否正确。
4. 9 类 business ref、opaque ID 规则、snapshot/cutoff 去重键和 label 非真相语义是否满足对象中心设计。
5. source/visibility/asset lifecycle 分离是否与统一 assets 治理一致，`official` 不应误作 visibility。
6. SearchPort 先按 workspace/user 返回授权 plaintext，再由 PermissionPort 复核文档/业务对象的双层防御是否保留。
7. Agent citation 的 revision/fragment/evidence key/score/业务引用/数据截止是否足够支持可回溯回答和报告归档。

**集中待裁决契约差异**：

1. `kb_documents`/树/链接/业务引用/修订表的最终 Schema、索引、软删、workspace 外键和保留期。
2. 团队共享文档的 revision/ETag/If-Match、409 冲突、自动保存和历史版本/恢复语义；首版不引入 CRDT。
3. 文档树 parent/position、fractional indexing、跨层拖拽、防环、非空删除与并发排序事务。
4. 创建/读/保存/移动/删除/双链/反链/搜索 API DTO、分页、错误码、幂等和权限矩阵。
5. business ref 真实对象权限 resolver、对象删除/改名/合并后的显示缓存和失效诊断。
6. PostgreSQL FTS、embedding 或混合检索选型；索引刷新、重建、chunk、引用稳定性、召回评测和成本。
7. 知识文档如何挂统一 assets 的 owner/team/verified/official/deprecated、版本、负责人和替代资产。
8. 报告/结算单/工作流案例/错题本自动归档的 job_type、幂等键、数据截止、审批和失败恢复。
9. ContentRadar 前端代码复制边界、BlockNote 自定义 inline schema、HTML/附件安全和 500ms 串行保存接缝。

**明确未做**：数据库 Schema/迁移、公开 API、前端 BlockNote/文档树、自动归档 Worker、搜索引擎/embedding、附件/对象存储、真实权限和对象 resolver、ContentRadar 原仓修改。

---

### P-013 ⏳B1-B8 多角度后端自审待复核｜be（Codex）

- 分支/基线：`be/b8a` / `59fc489`
- 完整证据：`docs/evidence/B1-B8多角度后端自审报告.md`
- 审查方式：第一性原理主审 + 安全 + 业务正确性 + 可靠性 + 质量门禁；独立结论均由主审重新定位源码核验
- 验证真相：406 tests passed、1 个 opt-in SDK smoke skipped；四包 npm audit 均为 0

**结论**：单模块质量门禁虽通过，但真实上线前仍有 14 个 P0 闭环问题，集中在 raw→canonical 接线、缺数语义、账户任务归属、跨租户账户校验、Job/Workflow fencing、确认 TTL、Changeset+T1 原子性、知识正文对象权限、钉钉 durable inbox/outbox。另有 17 个 P1。

**请 arch/Claude 优先裁决**：

1. 一账户日是否只能属于一个任务；若允许多任务，分摊真相和考核价选取规则是什么。
2. `missing/provisional/error/finite` 指标状态是否进入公开数据和报告契约。
3. Job lease、Workflow executor lease、effect/outbox 的统一 fencing/idempotency 协议。
4. Changeset 创建/确认/执行/T+1 的服务端安全边界与事务边界。
5. 知识片段混合多个业务对象时，对象级权限不足应整段丢弃还是预先按权限切 chunk。
6. 钉钉 inbox/ACK/outbox 的状态机和失败可见性。

本条是审查入口，不包含生产修复；修复应按报告 R0→R4 分批并分别提交审查。

---

### P-014 ⏳B1-B8 自审问题修复待复核｜be（Codex）

- 分支：`be/b8a`
- 原始审查 SHA：`1919a8e`
- 计划 SHA：`4dd9bec`
- 修复 SHA：`50ffff1`、`a82643f`、`fc42fc0`、`c9cdb66`、`cfa83a9`、`c84a26f`、`60fc2ec`、`1ba7c64`
- 质量报告：`docs/evidence/B1-B8自审修复-代码质量报告.md`

**已完成**：

1. P0 修复 6/14：日常 raw→canonical→quality 派发、Job lease fencing、确认/执行 TTL、Changeset+T1 崩溃恢复、知识明文对象权限、Workflow 嵌入式凭证扫描。
2. P1 修复 7/17：上海业务日、unknown lifecycle、inactive 奇航身份、Changeset exact-once 结果、规则全失败可见、账户分页 fail-closed、指标分区运行期保活。
3. 额外补强：缺数/零置信度/无证据 Agent 诊断不得给调整动作；租约 CHECK 防 SQL NULL 绕过；Agent timeout 不超过 credential envelope TTL。
4. 验证：422 默认 tests passed；1 个真 Claude Agent SDK→本地网关→fake upstream opt-in smoke 单独 passed；四包 typecheck/lint/audit 全绿；coverage 86.62%-95.43%；PG16 迁移回放和 Job 并发反例通过。
5. 复杂度复核：full ETL、Job Consumer、Job enqueue 完成等价职责提取；变更生产文件 complexity≤10、单函数≤100 行门禁 0 发现。

**请重点复核**：

1. Job lease token 是否覆盖所有 Consumer 状态迁移，旧 Worker 丢租后是否彻底停止修改新执行。
2. Changeset 终态重入补 T+1 的幂等前提和 TTL 锁内校验是否保留。
3. daily ETL 确定性 canonical job 日期范围是否符合数据口径；账户主表同步仍未完成，不能误判为完整读链路。
4. citation all-or-nothing plaintext authorization 是否符合 B8 安全目标。
5. Agent adjustment 的静态拒绝条件是否保留；低置信度阈值和服务端 currentValue 仍待契约。
6. `004_reliability_hardening.cjs` 的迁移兼容、active lease CHECK 和分区维护 advisory lock。

**仍待 Claude/arch/老板裁决，不得在审查中误标已修**：P0-02/P0-11 账户权威归属，P0-03 回填完整 DAG 终态，P0-04 缺数公开状态，P0-05 多任务归属，P0-07 Workflow 单执行器/effect outbox，P0-12 钉钉 durable inbox/outbox，P0-13 Changeset 目标权限矩阵，以及报告中列出的 10 个剩余 P1。

---

### P-015 ⏳B8a 后端交接与真实联调准备待复核｜be（Codex）

- 分支：`be/b8a`
- 合并清单：`34e1a07`
- Qihang 资源预算：`6c1d65b`
- 合成性能基线：`9fce24a`
- 质量报告：`docs/evidence/B8a-交接准备代码质量报告.md`
- 真实通路清单：`docs/plans/2026-08-20-真实通路联调准备清单.md`

**本批完成**：

1. 机械核验 `be/b8a`→`fe/f001` 共同基线与重叠路径；最终复核时 `fe/f001` 已前进到 `1de9256`，仍有 46 个脏路径，禁止在此现场直接 merge。5 个 committed overlap 中，台账、两信箱和 `schema.sql` 有明确文本冲突，`api.md` 仍需契约人工审查；脏路径与后端交集更新为台账和两信箱。
2. Qihang 增加响应字节、行数、ID 数与编码 URL 四层资源预算；超限稳定为 `RESOURCE_LIMIT`，不进入网络重试。ETL/Backfill payload 同步 fail-closed。
3. 增加纯合成、无网络/DB benchmark。当前代码基线暴露 Canonical 每轮 `3N+4` 端口调用；5,000 行是 15,004 次，报告没有把本机毫秒数冒充生产 SLA。
4. 形成奇航、Multica/OS read/preview/execute、Secret、模型网关、钉钉 Stream、PG/FaaS 的 Gate A-E 准入矩阵，所有未知协议保持未证实。
5. 当前全量门禁：434 默认 tests passed；真 Claude Agent SDK→localhost gateway→fake upstream opt-in smoke 1 passed；四包 typecheck/lint/audit 全绿；coverage 86.62%-95.43%；PG16 迁移回放通过；变更生产代码 complexity≤10、单函数≤100 行；凭证/动态执行扫描无发现。

**请重点复核**：

1. Qihang 默认 10 MiB/10000 rows/1000 IDs/64 KiB URL 是否适合作为联调前保守值；大账户分片必须等真实限制和部分失败语义，不要直接放宽。
2. Canonical `3N+4` 是否需要在公开 API 联调前增加 batch settings/history/bulk upsert，及其事务、租户和错误定位边界。
3. 合并时 `schema.sql` 以 Claude 契约裁决为主，后端 migration 真相不得丢；两信箱按条目语义合并，不可整文件覆盖。
4. 联调清单的 owner、证据、失败级别、写确认和敏感信息禁记是否满足内部安全要求。

**仍然不是完成项**：未合并、未部署、未接真实奇航/Multica/OS/Secret/Provider/钉钉 Stream；fake upstream 只证明 SDK 与本地协议网关链路。P0-02/03/04/05/07/11/12/13 与 9 个 P1 继续保留。

---

### P-016 ⏳B9 后端纵向闭环与 Canonical 批量性能待审计｜be（Codex）

- 分支：`be/b8a`
- 基线：`3d90bed`
- 批量链路 SHA：`83d7e4f`
- 纵向闭环 SHA：`8c6d5e1`
- PG 性能 SHA：`42efc5c`
- 质检补强 SHA：`c85beb8`
- 质量对平 SHA：`83cf855`
- 质量与交接 SHA：`df07deb`
- 设计：`docs/plans/2026-08-20-B9后端纵向闭环与批量性能-design.md`
- 计划：`docs/plans/2026-08-20-B9后端纵向闭环与批量性能-implementation.md`
- 状态：`docs/plans/B9-状态.md`
- 质量：`docs/evidence/B9-代码质量报告.md`
- 性能：`docs/evidence/B9-数据链真实PG性能基线.md`

**已完成**：

1. CanonicalStore/Repository 改为默认 250 的 settings/history/upsert 批量端口；复合 workspace/account/date 缺失、重复、越界 fail-closed。
2. 真实 PostgreSQL 纵向链：假奇航→Full ETL→Raw→Job→Canonical→质量→语义查询→规则→工作项→报告事实；同 accountId 跨 workspace 隔离实测。
3. Full/Incr `etl_runs.workspace_id` 补齐；规则首次创建/重扫合并，报告 KPI/趋势/任务维度共用语义事实。
4. 修复 P1-03：按 Canonical `field_sources.cost` 选择 latest offline `cost_api` 或 realtime `account_cost` 对平，消除当天假异常。
5. 修复 P1-16：5000 行端口调用从 15004 降到 64；真实 PG 三次中位 394.974ms，最终 5000 行，代表性读计划无根级 Seq Scan。
6. 当前门禁：445 默认 tests + 1 opt-in 真 SDK smoke；coverage 86.62%-95.43%；四包 type/lint/audit、PG16 migration replay、复杂度和安全扫描通过；contract/migrations/前端 0 diff。

**请重点审查**：

1. 批量 SQL 使用 JSON recordset、默认 250/最大 1000、每 chunk 原子但跨 chunk 非单事务的语义是否保留；后续批次失败时已写前缀可留，Job 失败且不派生质量。
2. Handler 对 batch 返回结果的复合键 completeness/duplicate/out-of-scope 检查是否足够；是否需要 Repository 层额外 workspace 外键/一致性约束。
3. Raw append-only 重试语义：当前崩溃重试会保留重复抓取，latest-row + Canonical Upsert 防双计。请裁决这是审计历史还是应增加 request/run identity 去重。
4. 质量 source 选择：`realtime|gap_filled` 取 `account_cost`，其余优先 offline `cost_api` 再 realtime；请与真实奇航字段和数据日口径核对。
5. 集成测试的规则候选只从真实语义结果生成，但仍是 test adapter；不要未经契约冻结直接注册生产 rule/report Job。
6. PG benchmark 只允许本机测试库且会自动清理；结果是热缓存单 workspace，不得写成生产 SLA。

**仍待裁决/联调**：

- production rule/report job payload、触发器、候选 Provider 和输出存储；
- Raw 大响应分片和 PostgreSQL 参数上限（P1-14 剩余部分）；
- 真实奇航 1000 IDs 以上分片、限流、字段宽度和失败恢复；
- 真实 Multica/OS、Secret、Provider、钉钉 Stream、FaaS/共享 PG；
- Raw 请求幂等、冷缓存/并发/p95/p99 和生产资源预算。

**明确未做**：公开 API/DTO/Schema、migration、生产新 job type、前端、真实媒体写操作或任何确认门绕过。

---

### P-017 ⏳B10 真实奇航只读适配待审计｜be（Codex）

- 分支：`be/b8a`
- 基线：`f756140`
- 功能与证据 SHA：`41c6646`
- 双口径事实纠偏 SHA：`3167e39`（当天 realtime 分钟级；D-2 仅为本次 offline 观测；BI 为备用/增强）
- 实施计划：`docs/plans/2026-08-20-B10真实奇航只读适配-implementation.md`
- 状态：`docs/plans/B10-状态.md`
- 脱敏证据：`docs/evidence/B10-真实奇航只读适配报告.md`

**真实证据边界**：老板转交的 OS Agent 在合法身份下实际执行四类只读 GET；已确认协议、日期、空数组和动态字段；当天 realtime 命中且 `last_sync_time` 为分钟级，离线仅在本次观察到 D-1 空、D-2 命中。D-2 不是实时延迟也不是固定 SLA。原始 userId、账户/广告/任务标识、金额和精确业务规模未写入仓库。请求不是由本项目 Worker/FaaS 发起，因此仍不能标记 Gate B 完成。

**本批实现**：

1. Client 将内部 `YYYY-MM-DD` 严格转为上游确认的 `YYYYMMDD`；非法格式/日历日期在网络前 fail-closed。
2. Full ETL 从 D-1 起最多向前探测 3 日，首个非空离线分区命中后停止，并把实际日期纳入 Canonical 范围；防止 D-1 延迟后永远漏离线权威行。
3. 历史日若离线含新增的 `account_real_conversion`，优先于 realtime fill；离线缺失时保持既有实时补齐。
4. Raw 继续动态透传，不将旧文档 23 列固定成 Schema；未改 contract/migration/API/前端。

**请重点裁决**：

1. `packages/contract/metrics.md` 仍写“离线 T+1 权威”且 `account_real_conversion` 只列 realtime，是否按真实证据改为“最新已产出分区”和 offline/realtime 双来源。
   `docs/20-PRD-v1.md` 的“account_offline（昨日结算）→ account_realtime（近 7 日补洞）”也需同步改成“当天 realtime 分钟级 + offline 动态探测最新已产出分区”，并注明历史 realtime `ds` 尚未实测。
2. 三日回退是当前无分区状态接口下的有界保护；D-1 部分产出无法识别。是否要求奇航提供分区完成标记，或由数据健康层引入跨批稳定性判定。
3. 当前业务线离线样本没有 `cash/income/rebate`。现有派生逻辑在 compensation 缺失时按 0 计算现金成本；该业务语义本批未改，请业务/arch 明确“缺失=0”还是“现金指标不可用”。
4. userId 仍是个人身份，OS 只证明内网可调用，不是部门级服务身份。正式推广前应用身份仍是硬门。
5. 本轮 realtime 只实测当天；Skill 源码虽会用历史 realtime 补洞，但服务端是否正式支持历史 `ds` 尚待探针，不能由实现反推协议。
6. 名称已补证：OS 真请求基于 `ks-data-queryer` 1.0.2；用户新给的安装入口是 `rta-data-queryer-daemon` 1.0.4，其业务依赖为 `rta-data-queryer` 1.0.4。两者协议同源但实现版本不同，正式部署需明确选定包和版本；`qihang-monitor`/包内 `ad-hourly-monitor` 只作为上层监控参考。

**质量**：Qihang+ETL 28、Canonical 6 定向 tests；Domain 194、DingTalk 19 全量通过；Worker 获准 localhost 环境执行 158 tests，PG 相关因本机 Docker/55432 未就绪未完成。四包 typecheck/lint/audit 通过且 0 vulnerabilities；变更模块覆盖率 Qihang 95.14%、Full ETL 100%、Canonical 92.50%；复杂度≤10、单函数≤100、敏感扫描通过。

**下一实证**：`hh`、跨日 offline、空/部分分区、带合法 userId 的本项目 Worker/FaaS→Raw→Canonical→质量 trace。任何写操作继续禁止。

---

### P-018 ⏳B11 奇航时效完整性与小时监控待审计｜be（Codex）

- 分支：`be/b11`
- 基线：`878126f`
- 证据固化：`a3b479b`
- Client 防护：`e60e719`
- 动态重查/观测：`c7c6289`
- 小时差分：`c500771`
- 小时落库：`b88f6ea`
- 自审测试：`5595836`
- 质量与交接：`67bdfda`
- 第三轮证据：`9775b87`
- `hh` 边界：`ace828f`
- 广告分片：`8f46745`
- 同步时间修复：`f178731`
- 第三轮代码终态：`1c87e2e`
- 第三轮质量与交接：`ec320f9`
- 状态：`docs/plans/B11-状态.md`
- 质量：`docs/evidence/B11-代码质量报告.md`
- 第三轮 OS：`docs/plans/B11-OS第三轮只读探针.md`
- 第三轮实证：`docs/evidence/integration/2026-08-20-qihang-readonly-os-probe-round3.md`

**本批实现**：

1. `ad_realtime` 必须带 accountIds/adIds；第三轮已证实无过滤查询存在 2000 行静默截断，过滤分片恰好命中 2000 时继续 fail-closed，不用可能截断的数据做归因。
2. 每次成功查询生成不含业务明细和身份的 observation；Repository 二次白名单后追加到 running `etl_runs.scope.observations`。
3. `etl_incr` 默认单日重查 D-1 offline，可配置 0..3；空结果可见，非空 Raw 纳入 D-1 到当天 Canonical 修订。
4. `hh` 响应按累计快照处理：N-(N-1)，hh=0 零基线；当前缺行不造数，负差分截 0 并记录修正字段。
5. 复用现有 `ad_metrics_hourly`，按 workspace+ad+ds+hh 参数化批量 Upsert；同键 account 漂移失败，小时写失败不派发 Canonical。
6. 第三轮已证实无过滤广告查询在 2000 行静默截断且分页参数无效；ETL 默认按 5 账户/80 广告 ID、最多 200 批顺序查询，逐批 Raw/观测，全部成功后才合并。
7. 原子 Client 接受实测有效的 `hh=0..24` 并本地拒绝越界；小时 payload/Domain/DB 保持 0..23。历史 realtime 只作为诊断回溯，不替代 offline 结算口径。

**请重点审查/裁决**：

1. offline 无 complete marker 时仅有 `not_observed/observed_unverified` 是否符合数据健康语义；不要把非空或跨批稳定升级成 complete。
2. 默认每次 Incr 重查 D-1 与 0..3 配置是否需要由调度层固定频率/冷却，避免高频任务重复拉离线。
3. 默认 5 账户/80 广告 ID、最多 200 批的奇航频控与资源边界是否长期保留；当前没有真实 SLA，故实现选择顺序执行。
4. 单个账户过滤查询若仍恰好命中 2000，当前缺少权威 adIds 发现来源，只能 fail-closed；请裁决后续由账户基建台账、奇航新接口还是媒体对象清单提供拆分种子。
5. 现有小时表没有 `last_sync_time`/issue 状态列；本批只在 ETL observation 留源更新时间和 aggregate issue。请裁决未来公开数据健康 DTO、保留期和页面展示方式。
6. 当前小时 Repository 一次 JSON batch；上游已按最多 5 账户拆分，但单账户仍可能有大量广告。是否增加 DB 分块上限，等真实响应宽度与 PG 基准后决定。

**质量真相**：Domain 207、DB 92、Worker 200、DingTalk 19，共 518 个默认 tests 通过；真 Claude Agent SDK opt-in 1 passed。B11 Repository 真 PG 5/5、Worker PG 4/4、migration replay 已通过。Worker 全仓 coverage 92.19%，新增分片与增量 Handler 行覆盖 100%；四包 type/lint/audit、复杂度、安全扫描和冻结目录检查通过。

**明确未做**：公开 API/DTO/Contract、migration、前端、产品身份真实 Qihang Worker/FaaS trace、单账户 2000 后的 adIds 权威发现、分区 complete 推断、把 hh=24 写成小时桶、媒体写操作或任何确认门绕过。

---

### P-019 ⏳B12 广告 ID 与素材来源桥待审计｜be（Codex）

- 分支：`be/b12`
- 基线：`be/b11@44e2390`
- 设计与计划：`dc64f68`
- 功能实现：`f4c55bb`
- 自审终态：`fb3bf9f`
- 质量与交接：`ce4206c`
- 状态：`docs/plans/B12-状态.md`
- 质量：`docs/evidence/B12-代码质量报告.md`
- OS 探针：`docs/plans/B12-OS第四轮只读探针.md`

**本批实现**：

1. 广告 ID 通用分页枚举，校验 page/pageSize/total、空页、页数和 ID 数；只有 `complete + confirmed_equal + 独立证据指纹` 才输出 `adIds`，运行时再次防结构伪造。
2. 奇航素材池严格只读客户端，校验 envelope、total 稳定、重复冲突、页/行/字节预算，错误和观测不含业务 ID、完整 URL 或响应正文。
3. 视频来源安全探针默认全拒绝；显式 host allowlist 后逐跳校验重定向，HEAD 不支持才发单字节 Range；直接 IP、非视频、未知/零长度和超限阻断。
4. 未修改 public contract、migration、DB、前端；未接生产 Runtime、视频下载、拆片或媒体写操作。

**请重点审查/裁决**：

1. 映射证据类型当前仅 `os_set_equality_probe|platform_contract`，指纹+时间是否足够，未来是否要绑定证据文档版本/操作者/账户样本范围。
2. OS 若证实 `unit_id != ad_id`，应新增正式 ad list adapter，不能在业务层做猜测映射；若相等，仍需确认分页 total 的完整性再接 B11 fallback。
3. 素材 host allowlist 是部署级配置；是否还要在网络层增加 egress proxy/DNS 解析后 IP 校验，防 DNS rebinding。
4. 素材池全库工作流当前缺 count→itemIds 编排；请确认一期只从任务/商品池显式 itemId 进入，还是下一批补全库发现。
5. URL 签名过期、临时文件、内容哈希、格式/病毒检查和拆片任务幂等应在下一批下载管线设计，不要塞入本批探针。

**质量真相**：定向 54、Worker 非 PG 238、Domain 207、DingTalk 19、DB 无 IO 12；四包 type/lint/audit、覆盖率、复杂度、安全和冻结目录检查通过。Docker CLI 本轮持续 `EOF`、55432 `ECONNREFUSED`，真实 PG/migration 未重跑；不得引用 B11 历史结果冒充本轮结果。

**明确未完成**：OS 第四轮 ID 映射与素材 URL/FaaS 实证、B11 自动 adIds fallback、素材正文下载、拆片、DB/API/Job/前端、合并、部署和产品身份真实 trace。

---

### P-020 ⏳B13 素材拆片后端内核待审计｜be（Codex）

- 分支：`be/b13`
- 基线：`be/b12@8fba713`
- 设计：`610e1ba`；CDN 类型纠正：`2a8adcd`；实施计划：`37ede1f`
- 代码终态：`85c5fbf`
- 质量与交接：`ff97678`
- 状态：`docs/plans/B13-状态.md`
- 质量：`docs/evidence/B13-代码质量报告.md`

**本批实现**：

1. 安全下载：逐跳 host/type/length 重验、流式预算、总超时、随机临时文件、SHA-256 和失败清理；allowlist VIDEO 的 octet-stream 强制 FFprobe。
2. 平台字幕优先、云 ASR 端口兜底，不存在本地 ASR；字幕与 Shot 形成完整时间轴和稳定证据 ID。
3. FFmpeg/FFprobe 固定参数数组和 `shell:false`，支持 scene/hard-cut、镜头中点帧、Hook/全片联系表、资源上限和失败占位。
4. 结构化拆解必须引用证据，禁止无源后台指标；老板拆片 Prompt 使用源/模板双 SHA，漂移 fail-closed。
5. 复用 B5 Claude Agent SDK + localhost 多模型网关，无 built-in/MCP tools；内容、Prompt、Schema、Provider/model/profile 指纹控制 checkpoint 复用。

**请重点审查/裁决**：

1. 指定可接收真实投放帧的受信任多模态 Provider/内部网关，并冻结保留、审计、egress 边界；未裁决前视觉 payload 必须继续阻断。
2. 冻结云 ASR 供应商与凭证、费用、超时、缓存、隐私边界；不得以本地 ASR兜底。
3. 冻结拆片 Job/API/DB、checkpoint/artifact 保留与清理契约；目前只交内部端口，不应直接注册生产 Runtime。
4. 审核 `teardown-v1` 是否作为一期官方模板，以及模板升级、回滚和历史分析重算规则。
5. 审核 evidence/result Schema、500 Shot/216 帧/15 Hook/36 全片等预算和错误分类，确认后再接素材中心、知识库和复刻。

**质量真相**：Domain 235、DB 92、Worker 287、DingTalk 19 默认 tests；真实 SDK opt-in 1。真实 PostgreSQL/migration、真实 FFmpeg 生成视频与 localhost gateway E2E 通过；materials 95.96%/86.75%/98.75% 行/分支/函数覆盖；四包 type/lint/audit 与安全/冻结目录检查通过。

**明确未完成**：合入 main、真实云 ASR、真实多模态 Provider、产品 Worker/FaaS 真实素材 E2E、持久 checkpoint/artifact、公开 API/DB/Job、前端、相似检索/复刻、部署/上线。OS 沙箱实证与本地伪上游均不得冒充产品生产联通。

---

### P-021 ⏳B14 单次整段 ASR 与临时 URL 租约待审计｜be（Codex）

- 分支：`be/b14`
- 基线：`be/b13@f0a0b9f`
- 第五轮证据与设计：`446fa3f`
- 实施计划：`7d6dfe8`
- 字幕/证据/Prompt：`b830c92` → `19ccce9`
- ASR adapter：`e7592b6`
- URL 租约：`c740095`
- 质检代码终态：`6cea3d8`
- 质量与交接：`24a0784`
- 状态：`docs/plans/B14-状态.md`
- 质量：`docs/evidence/B14-代码质量报告.md`

**老板裁决**：一期先做诊断，一条视频只调用一次 IdeaLab 风格 ASR；不切块、不做本地 ASR、不等待句级时间戳。产品必须显示这是整段转写，不能把全文台词伪定位到秒或镜头。

**本批实现**：

1. Domain 增加 `segment|whole_video` 精度，进入字幕、证据和 fingerprint；整段结果只允许一个覆盖全片的 `other` 分析段。
2. Prompt 升级 `teardown-v2`，固定模板 SHA，明示全文钩子只是位置不确定的候选。
3. `WholeTextCloudAsrAdapter` 每视频只调用一次可注入 transport，绑定 provider/model/profile；严格接受 `{text}`，非法输入/输出和 transport 错误 fail-closed 且脱敏。
4. Handler 以稳定 opaque `sourceRef` 每次向 `MaterialUrlLeasePort` 领取新 candidate，再立即下载；同内容 SHA 可复用后续 checkpoint，但签名 URL 永不持久化。
5. 未修改公开 contract、migration、生产 runtime 或前端；未实现真实 IdeaLab/OS 网络协议。

**请重点审查/裁决**：

1. 提供/确认 IdeaLab Audio `whisper-1` 正式调用契约：endpoint、AK secret reference、multipart 字段、文件/时长限制、超时、配额、费用和数据保留。
2. 冻结 OS/Multica 稳定 `sourceRef` 与临时 URL 领取协议、服务身份和审计字段；当前端口不能被误写成已联通。
3. 冻结拆片 Job/API/DB、checkpoint/artifact 保留、清理与重算契约后再注册生产 Runtime。
4. 前端必须显示 `whole_video` 的“无句级时间戳”状态，禁用精确秒点跳转；未来换时间戳 ASR 时历史结果保留原精度。
5. 真实投放帧的受信任多模态 Provider/egress 边界仍需单独裁决；本批继续阻断。

**质量真相**：默认 Domain 244、DB 92、Worker 297、DingTalk 19，共 652 passed；SDK opt-in 1 passed。真实 PG/migration、localhost gateway E2E 与真实 FFmpeg 生成视频通过。Domain 95.97%/85.79%/99.27%，Worker 92.57%/80.92%/95.71%，materials 96.30%/87.79%/98.90%；四包 type/lint/audit、安全、复杂度和冻结目录门禁通过。

**明确未完成**：真实 IdeaLab transport、OS source bridge、真实素材产品身份 E2E、视觉多模态外发、持久化 Job/API/DB、前端、合并、部署和上线。

---

### P-022 ⏳B15 拆片语义与逐镜头帧墙待审计｜be（Codex）

- 分支：`codex/b15-material-teardown-semantics`
- 基线：`be/b14@e9edd5d`
- 设计：`562b62c`
- 实施计划：`f619bcc`
- 领域/Prompt/帧墙/承接：`28250c1` → `9399c15`
- 自审代码终态：`020a902`
- 质量与交接：`9169f11`
- 状态：`docs/plans/B15-状态.md`
- 质量：`docs/evidence/B15-代码质量报告.md`

**老板裁决**：拆片是按指定 Obsidian 提示词对完整文稿做结构分析；抽帧是像 ContentRadar 一样按真实镜头提取多张代表帧集中展示。不是切出多个 MP4。整段 ASR 可以拆多个语义段，但不得伪造秒点或与镜头的一一映射。

**本批实现**：

1. Schema v2 新增 `alignmentStatus + semanticSections`；whole-video 可多段语义、强制空 timed segments；segment 仍保持精确时间轴。
2. 所有语义段必须有文稿证据；精确时间段的每个证据必须与本段时间相交，阻断证据 ID 存在但时间错位。
3. Prompt `teardown-v3` 按老板七模块目标整理，固定源/模板 SHA；Prompt 或 Schema 版本漂移在 Agent 调用前阻断。
4. FFmpeg 新增逐镜头 6×6 帧墙，多页连续、placeholder 不移位、页级 unavailable、最多两页并发。
5. Handler 返回 film/transcript/analysis；B14 旧 analysis 只重跑 Agent，旧 film 缺页清单只重跑 FFmpeg。
6. 未修改 public contract、migration、生产 runtime、前端或 ContentRadar。

**请重点审查/裁决**：

1. Schema v2 是否直接成为未来公开 DTO；若 API 再映射，必须保留“语义顺序”和“视觉真实时间”两套独立字段。
2. whole-video 前端必须把 `semanticSections` 与 shot timeline 并排展示，不能用行位置暗示一一对应；`segments=[]` 的空态文案需由前端冻结。
3. 审核帧墙预算：36/页、6 列、500 镜上限、前 216 镜真实帧、后续 placeholder、并发 2。
4. 冻结 artifact/checkpoint 的对象存储、权限、保留期、删除、重算和历史 Prompt 版本策略，再接 Job/API/DB。
5. 真实帧外发与多模态 Provider 仍未授权，本批继续阻断；不要为了完整七模块报告绕开数据边界。
6. IdeaLab transport 和 OS source bridge 仍是内部端口；需真实产品身份 trace 后才能写“已联通”。

**质量真相**：Domain 245、DB 92、Worker 301、DingTalk 19，共 657 个默认 tests；Claude Agent SDK opt-in 1。真实 PostgreSQL/migration、localhost gateway E2E 与真实 FFmpeg 三场景视频通过。Domain 95.97%/85.88%/99.27%，Worker 92.71%/81.12%/95.76%，materials 96.87%/87.90%/98.97%；四包 type/lint/audit、安全、冻结目录和 diff-check 通过。

**明确未完成**：MP4 裁片/自动剪辑、真实多模态、IdeaLab/OS 正式通路、持久 artifact/checkpoint、公开 Job/API/DB、前端、相似检索/复刻、合并、部署和线上业务验收。

---

### P-023 ⏳B16 素材相似度与复刻谱系领域底座待审计｜be（Codex）

- 分支：`codex/b15-material-teardown-semantics`
- 基线：B15 最终交接 `99d647f`
- 设计：`e0b0d2d`
- 实施计划：`702730c`
- 领域内核：`452bdc9`
- 自审测试终态：`d7a49f8`
- 质量与交接：`1533484`
- 状态：`docs/plans/B16-状态.md`
- 质量：`docs/evidence/B16-代码质量报告.md`

**产品依据**：PRD `REQ-052` 与验收 6.3/6.6 已明确拆片后按钩子/卖点/节奏做相似查找，并记录“复刻自”。本批只实现内部 Domain，不把页面功能标为完成。

**本批实现**：

1. 版本化素材内容画像：B15 拆片 fingerprint、语义角色序列、钩子、卖点、人群、节奏、CTA 和视觉节奏值。
2. 六组件可解释评分，缺项不计 0；证据不足返回 `score=null`；结果左右对称并带稳定 fingerprint。
3. 中文/英文确定性 n-gram、去重排序和 512 token 上限，不依赖外部分词或模型。
4. 独立复刻谱系 v1，拒绝自环、非法标识/SHA/时间、超长备注和未知字段；不由相似度自动生成。
5. 未修改 public Contract、migration、生产 Runtime、Worker 或前端。

**请重点审查/裁决**：

1. 六组件默认权重与解释码是否冻结；后续调整必须新建 scorer/profile version，不能覆盖历史。
2. 冻结画像、比较缓存、谱系边的 DB/API DTO 和 workspace 租户键。
3. 一期是否先用 PostgreSQL 结构/token 候选召回；如接 Embedding，需单独裁决 Provider、数据外发、成本、向量版本和重算。
4. 页面必须展示分项与 unavailable，`insufficient_evidence` 不能显示成 0% 相似。
5. 谱系创建权限、审计、纠错/撤销和版本对比契约。

**质量真相**：Domain 270、DB 92、Worker 301、DingTalk 19，共 682 默认 tests；SDK opt-in 1。新增模块 100%/93.39%/100%；四包 type/lint/audit、真实 PG/migration、gateway/FFmpeg、复杂度、安全和冻结目录通过。

**明确未完成**：相似列表检索/排序/分页、向量检索、谱系持久化/版本对比、Job/API/DB/前端、合并、部署和业务验收。

---

### P-024 ⏳B17 商品×素材实验矩阵领域底座待审计｜be（Codex）

- 分支：`codex/b15-material-teardown-semantics`
- 基线：B16 最终工作树 `4eb5127`
- 设计：`d718aca`
- 实施计划：`c27539e`
- 领域内核/自审终态：`064f1f5`
- 质量与交接：`e12095c`
- 状态：`docs/plans/B17-状态.md`
- 质量：`docs/evidence/B17-代码质量报告.md`

**产品依据**：验收 6.7 要求“商品×素材+样本够不够标注”。本批只交内部 Domain，不把矩阵页面标为完成。

**本批实现**：

1. 版本化样本策略，业务阈值无默认值；固定 95% 区间。
2. 推断分母必须显式选择 click/exposure，不默认真实转化都是点击归因。
3. `sourceFactId` 相同事实幂等、冲突失败；稳定汇总账户/日期/曝光/点击/真实转化/消耗。
4. 六类样本缺口、有限 CPA、CPA 最小改善率和 Wilson 区间共同控制结论。
5. 只有成本方向与所有候选区间同时分离才返回 `separated_observation`；无自动操作。
6. 未修改 public Contract、migration、生产 Runtime、Worker 或前端。

**请重点审查/裁决**：

1. 不同任务/媒体的官方样本策略阈值和版本治理。
2. click/exposure 分母的权威口径，未来是否需要新增已验证的其他 trial 指标。
3. 素材→广告→商品→任务映射和 sourceFactId/workspace 租户键。
4. 页面文案不得把 observed separation 写成“显著胜出/因果胜出”。
5. DB/API、历史重算、数据新鲜度和正式 A/B 的独立演进路径。

**质量真相**：Domain 295、DB 92、Worker 301、DingTalk 19，共 707 默认 tests；SDK opt-in 1。新增模块 100%/97.08%/100%；四包 type/lint/audit、真实 PG/migration、gateway/FFmpeg、复杂度、安全和冻结目录通过。

**明确未完成**：权威事实映射、官方阈值、DB/API/页面、随机实验、因果推断、自动投放动作、合并、部署和业务验收。

---

### P-025 ⏳B18 素材设计 Brief 与回测就绪领域底座待审计｜be（Codex）

- 分支：`codex/b15-material-teardown-semantics`
- 基线：B17 最终工作树 `5175a75`
- 设计：`336a62c`
- 实施计划：`a254e5f`
- 领域内核/自审终态：`54f5223`
- 质量与交接：`69368f0`
- 状态：`docs/plans/B18-状态.md`
- 质量：`docs/evidence/B18-代码质量报告.md`

**产品依据**：验收 6.5 要求“跑量素材→brief→设计师→上线自动关联回测”。本批只交内部 Domain，不把派发、制作、上线或页面标为完成。

**本批实现**：

1. v1 严格 Brief 绑定商品、源素材、B15 teardown/profile 和 B17 policy；1~20 个单变量变体稳定排序并生成 fingerprint。
2. 每个变体只允许 hook/selling_point/audience/rhythm/cta/visual_style 中一个改变维度，且至少声明一个不变量。
3. 交付重新验证 B16 lineage 的版本、来源、时间和 fingerprint；完全相同重试幂等，冲突 fail-closed。
4. 回测状态分 awaiting_delivery / awaiting_sample / ready；全部交付后才消费同 policy、同商品的 B17 sampleStatus。
5. 自审增加未声明变体、重复商品/素材格子和重算外层 hash 后的语义完整性防线。
6. 未修改 public Contract、migration、生产 Runtime、Worker 或前端。

**请重点审查/裁决**：

1. Brief 草稿/发布/撤回/复制、团队共享和官方资产治理状态机。
2. Brief/交付/lineage/商品/素材版本的 DB/API DTO、workspace 键和权限。
3. 设计师/AIGC/钉钉派发与交付文件、上线素材版本的权威绑定方式。
4. B17 policy 的官方版本治理；历史 Brief 必须固定原策略。
5. 页面不得把 `ready` 显示为“胜出”；要分开呈现交付、样本、观察结果。

**质量真相**：Domain 310、DB 92、Worker 301、DingTalk 19，共 722 默认 tests；SDK opt-in 1。新增模块 97.19%/85.71%/100%；四包 type/lint/audit、真实 PG/migration、gateway/FFmpeg、复杂度、安全和冻结目录通过。

**明确未完成**：Agent 生成 Brief、设计师/钉钉/AIGC 集成、DB/API/Worker/页面、权威映射、自动采样、随机 A/B、媒体写操作、合并、部署和业务验收。

---

### P-026 ⏳B19 月度结算单领域底座待审计｜be（Codex）

- 分支：`codex/b15-material-teardown-semantics`
- 基线：B18 最终交接 `e5fe8de`
- 设计/实施计划：`049dab5`
- 领域内核/自审终态：`c2fed1f`
- 质量与交接：`4c4b0dc`
- 状态：`docs/plans/B19-状态.md`
- 质量：`docs/evidence/B19-代码质量报告.md`

**产品依据**：验收 7.3/REQ-110 要求月中试算、实际返点 vs 估算返点、差异转工作项、模板版本不覆盖旧单。老板明确每期字段可能不同、返点系数按渠道/生效日版本化。

**本批实现**：

1. v1 模板显式定义字段/顺序/类型/fact 映射/受限公式/汇总/修正权限和对账检查，输出稳定 fingerprint。
2. 公式仅支持有界 AST 四则运算；无任意代码或默认 `/1.09`、返点率、容差。
3. 只接受 offline_settlement，事实幂等去重并逐行输出值、来源、检查、问题和显式总计。
4. 修正使用 from-value 事件链；同 ID 冲突、不可修字段、错误时间与错误前值 fail-closed。
5. 冻结只接受 ready 预览并内嵌模板和值快照；语义校验覆盖重算检查/总计，不只信任外层 hash。
6. 未修改 public Contract、migration、生产 Runtime、Worker 或前端。

**请重点审查/裁决**：

1. 真实期次模板和 factKey/公式/汇总/容差，以及模板发布/废弃权限。
2. sourceFactId/rowKey 与奇航 offline/语义层的权威映射、完整分区和勘误重算。
3. 人工修正权限/evidenceRef/双人复核、冻结后勘误生成新 run 的状态机。
4. DB/API DTO 与 workspace/optimizer/period 唯一键、历史模板和值快照留存。
5. Excel/PDF/PNG 精度/舍入与导出、差异转工作项、钉钉订阅/推送契约。

**质量真相**：Domain 352、DB 92、Worker 301、DingTalk 19，共 764 默认 tests；SDK opt-in 1。新增模块 100%/92.76%/100%；四包 type/lint/audit、真实 PG/migration、gateway/FFmpeg、复杂度、安全和冻结目录通过。

**明确未完成**：真实模板/数据映射、DB/API/Worker/权限、导出/钉钉/工作项/页面、财务会计功能、合并、部署和业务验收。

---

### P-027 ⏳B20 公共资产治理领域底座待审计｜be（Codex）

- 分支：`codex/b15-material-teardown-semantics`
- 基线：B19 最终交接 `acd046c`
- 设计/实施计划：`174a2b8`
- 领域内核/自审终态：`d22a5d8`
- 质量与交接：`d0d4ba3`
- 状态：`docs/plans/B20-状态.md`
- 质量：`docs/evidence/B20-代码质量报告.md`

**产品依据**：REQ-112/113/114 和验收 14.10 要求报表、工作流、策略、对象组统一经历个人草稿→团队共享→已验证→官方→已废弃，并显示负责人、版本、适用范围、依赖、验证、成功率、使用人数和替代版本。

**本批实现**：

1. report/workflow/strategy/object_group/knowledge 五类资产统一不可变版本、来源、适用范围、依赖和稳定指纹。
2. 五段严格前进状态机；事件相同重试幂等，冲突 ID、越级、回退和错误时间 fail-closed。
3. validation 绑定 assetVersionId+definitionFingerprint；最近 failed 不会被更早 passed 掩盖。
4. usage facts 绑定版本并按事件幂等、用户去重，统一输出人数/频次/最近使用时间。
5. deprecated 强制原因、可选非自身替代版本；公共修改用新 draft，不覆盖旧版本。
6. 未修改 public Contract、migration、DB/Worker/Gateway Runtime 或前端。

**请重点审查/裁决**：

1. 统一 assets 表/API 与 report config、workflow version、strategy、object group、knowledge document 的关联。
2. 五段晋级/废弃的角色权限、复核和 workspace 边界。
3. 各资产类型的验证执行器、passed 证据、验证失效与重新验证语义。
4. usage fact 计数口径、预览/试运行过滤和幂等事件来源。
5. dependency/replacement 的存在性、同租户/同类型兼容和循环检查。

**质量真相**：Domain 381、DB 92、Worker 301、DingTalk 19，共 793 默认 tests；SDK opt-in 1。新增模块 99.69%/85.00%/100%；四包 type/lint/audit、真实 PG/migration、gateway/FFmpeg、复杂度、安全和冻结目录通过。

**明确未完成**：DB/Repository/API/权限/审查队列/前端、真实资产接入、验证执行器、usage 埋点、依赖图、合并、部署和业务验收。

---

### P-028 ⏳B21 工作流“为什么没触发”诊断内核待审计｜be（Codex）

- 分支：`codex/b15-material-teardown-semantics`
- 基线：B20 最终交接 `b77076e`
- 设计/计划：`17b54f5`
- 领域内核：`f985923`
- 质量与交接：`2e4a219`
- 状态：`docs/plans/B21-状态.md`
- 质量：`docs/evidence/B21-代码质量报告.md`

**本批实现**：

1. 绑定 workspace/workflow/version/trigger/evaluation 的 gate 快照。
2. passed/blocked/not_evaluated 与 eligible/blocked/incomplete；保留全部阻断并选择首个配置 gate 为 primary。
3. 复用现有 12 个 WorkflowBlockReason，映射稳定 nextActionCode；blocked 带 evidence refs 和可选 retryAt。
4. 严格时间、唯一原因、连续序号、稳定 fingerprint、深冻结和重算 hash 后语义校验。
5. 未修改 public Contract、migration、DB/Worker/Gateway Runtime 或前端。

**请重点审查/裁决**：Scheduler gate 生产者和落库幂等；证据对象/data cutoff；API/权限/保留期；reason/action 的 UI 人话与跳转。

**质量真相**：Domain 397、DB 92、Worker 301、DingTalk 19，共 809 默认 tests；SDK opt-in 1。新增模块 98.54%/91.02%/100%；四包 type/lint/audit、真实 PG/migration、gateway/FFmpeg、复杂度、安全和冻结目录通过。

**明确未完成**：Scheduler/Trigger、DB/Repository/API、运行中心页面、真实策略门槛、合并、部署和业务验收。

---

### P-029 ⏳B22 IdeaLab whole-video ASR Provider 待审计｜be（Codex）

- 分支：`codex/b22-idealab-asr-provider`
- 基线：B21 私有备份交接 `ed90360`
- 设计：`817208e`
- 实施计划：`0a29af3`
- 代码终态：`b60e09e`
- 质量与交接：`bd49004`
- 状态：`docs/plans/B22-状态.md`
- 质量：`docs/evidence/B22-代码质量报告.md`
- OS 证据：`docs/evidence/integration/2026-08-21-idealab-asr-os-diagnostic.md`

**老板裁决与真实依据**：拆片是完整文稿的提示词驱动语义拆解，抽帧是独立逐镜头关键帧墙，不导出多个 MP4。OS 真实调用确认 MP4 直传 `CE-009`，PCM s16le/16kHz/mono WAV 成功；endpoint + Bearer + multipart `file/model=whisper/response_format=json` 返回 `{text,usage}`，无时间戳。老板选择独立 WAV Extractor + IdeaLab Transport，复用 B15 whole-video Adapter。

**本批实现**：

1. `IDEALAB_ASR_ENABLED=false` 默认关闭；启用必须有 AK，序列化配置不含 AK。
2. endpoint 在配置和 Transport 双层固定为已验证 host/path，禁止其他 HTTPS、redirect、query、fragment、内嵌凭证，防止 AK 外泄。
3. FFmpeg 固定提取 WAV，限制字节/超时/输出并清理临时目录；MP4 不直接发 Provider。
4. Transport 单次 multipart 调用、有界响应读取、严格 `{text,usage}`、稳定错误分类；内部不重试。
5. 观测只含数字和枚举；Domain 只输出 `{kind:"whole_text",text}`，不制造 language/duration/timestamp。
6. 工厂绑定 `idealab-audio/whisper/profile SHA`；opt-in 真实烟测默认跳过，没有接生产 Runtime/Job/API/DB/前端。

**请重点审查/裁决**：

1. 每用户 IdeaLab AK 的 Secret reference、解析时机、轮换、额度和审计；环境变量只能否作为 demo/内部底座。
2. 产品 Worker/FaaS 的生产网络、素材授权、数据保留与法务边界；由谁执行首次真实 opt-in trace。
3. Job/API/checkpoint/artifact、幂等、上层 retry/backoff、并发和额度策略。
4. HTTP 400 业务错误码是否需要细化；Provider 大小/时长硬上限、限流和 SLA 如何取证。
5. 前端如何并列展示“整段转写/语义结构”和“关键帧墙”，明确无句级时间戳。

**质量真相**：Worker 344、Domain 397、DB 92、DingTalk 19，共 852 默认 tests；真实 PG/migration、gateway/FFmpeg 通过。B22 配置和核心模块 94.43% statements / 82.12% branches / 100% functions；四包 type/lint/audit、复杂度、安全和冻结目录通过。真实 IdeaLab 产品烟测 1 项默认 skipped，未冒充通过。

**明确未完成**：真实产品身份 ASR E2E、每用户 Secret、生产 Job/API/DB/前端、重试/配额/审计、部署、线上验证和业务验收。

---

### P-030 ⏳双数据 BE-001 / R1 HTTP 与 Platform Adapter 待审计｜be（Codex）

- 分支：`codex/dual-data-backend`
- BE-001 基线：`2cb0d76`
- R1 代码终态：`de31f3a`
- 质量报告：`docs/evidence/R1-双数据HTTP与平台适配质量报告.md`
- 状态：implemented / codex self-checked / Claude review pending

**本批实现**：

1. 独立可启动数据 API：Next BFF → `POST /api/v1/data/query`；服务端 token +
   workspace/user/account scope header，默认只监听 loopback。
2. `PlatformDataSource` 真实复用 canonical PostgreSQL summary/trend/table，补 anomalies、
   detail/reconcile source 的有界分页。
3. KA Data 与 unavailable lineage 不再用响应当前时间/占位版本冒充新鲜度；canonical
   `dataAsOf` 取持久化 `computed_at`。
4. 服务输出侧按 `(workspace_id, media, account_id)` 拦截恶意/错误 Adapter 越权行。
5. 继续保持六个 Query ID、raw SQL 防线、2k/10k/16MB、稳定 requestId、双边并列且
   reconcile engine pending；未开放任何写操作。

**请重点审查**：BFF 账户 scope 的正式权限来源与内部 token 轮换；lineage nullable Contract；
canonical coverage 的 account-day 语义；Platform anomalies/detail 分页；API 独立进程部署方式；
真实 KA Data 内网联调前的 Secret/网络策略。

**质量真相**：Domain 406、DB 94、Worker 393、Gateway 19；真实 PostgreSQL 16、真实 HTTP
监听 smoke、四包 type/lint/audit 和 Worker coverage 92.23/80.95/95.96 通过。

**明确未完成**：Next BFF/前端接线、真实 KA Data token 与业务数据联调、daily/FaaS 部署、
reconcile 计算引擎、正式角色权限映射、Claude/arch 批准。未合并、未部署、未上线。

---

### P-031 ⏳双数据 R2 requestId 与 Contract fixtures 待审计｜be（Codex）

- 分支：`codex/dual-data-backend`
- R2 代码：`a81a176`
- 质量报告：`docs/evidence/R2-requestId与契约fixtures质量报告.md`
- 状态：implemented / Codex self-checked / Claude review pending

**本批实现**：

1. BFF `x-request-id` 经真 HTTP server、handler 与 service 传递；成功/失败均回传
   `x-request-id` header，错误体 ID 与 header 一致。
2. 只允许 1–128 位日志安全 ASCII；非法、超长、CR/LF、Unicode 值安全重生，
   不回显、不记录原值。
3. Contract 发布 ready lineage、unknown/null lineage、reconcile engine pending、stable error
   四个自包含 fixture，Domain test 直接 Schema 验证，供前端 parity 复用。
4. 文档冻结 BFF 必传内部 token/workspace/user/account scope/requestId；scope 只能由
   服务端登录/授权上下文生成，dev 仅假数据，production fail closed。
5. 未改成功 envelope 或 Query ID，未降低 scope/截断/凭证保护，真实写仍关闭。

**请重点审查**：BFF 是否原样传递合法 requestId 并使用 canonical fixtures；
production scope 是否无 dev fallback；相关 ID 语法是否与内部观测标准兼容；
成功 envelope 仅靠 header 相关是否符合冻结 Contract。

**质量真相**：Domain 414、DB 94、Worker 404、Gateway 19；真实 PG16、
四包 type/lint/audit、Worker coverage 92.23/81.01/95.97 与安全扫描通过。

**明确未完成**：BFF parity/真实登录 scope 接线、真实 KA Data 内网 E2E、
reconcile 计算内核、部署/上线、Claude/arch 批准。R3/P0 已另行登记，
不在 R2 代码提交中。

---

### P-032 ⏳双数据 R3 联合键、Canonical Rows 与只读详情待审计｜be（Codex）

- 分支：`codex/dual-data-backend`
- R3 代码终态：`391a5a2`
- 关键提交：`d392152`、`424fa1d`、`ada510f`、`e2b0f1a`、`d114222`、
  `921bf56`、`9626545`、`c3766dd`、`8c023cf`、`c4e8bf2`、`391a5a2`
- 质量报告：`docs/evidence/R3-双数据与只读详情质量报告.md`
- 状态：implemented / Codex self-checked / root integration pending / Claude review reserved

**本批实现**：

1. 账户主键、Repository、Platform SQL、KA 注入和输出守卫统一
   `(workspace_id,media,account_id)`；跨媒体同号真实 PG 反例通过。
2. 六 Query ID 使用版本化 canonical rows；KA/Platform parity，非法类型、数字、日期和
   契约损坏顶层 fail closed。
3. lineage/coverage 不再编造：部署默认值不冒充 timezone/dayCut，coverage 与 truncated
   分离，聚合 returnedObjects 只在可证明时输出，单侧对象为零判 source_missing。
4. 006 复合 FK 迁移冻结为首次/维护窗口停写、服务启动前执行；007 持久化详情账户 scope，
   无法确定的历史数据不默认回填。
5. 已挂载 `GET /api/v1/work-items/:id`、`GET /api/v1/changesets/:id`；服务端 auth、tuple
   scope、requestId、稳定 401/403/404/502 信封完整。
6. detail/data 共用 16MB 响应守卫，等于上限也返回 502 `SOURCE_TRUNCATED`。
7. 未挂载任何写端点；Runtime/Multica/ChangeSet 媒体真实写继续关闭。

**请重点审查**：

1. migration 006 维护窗口/停写部署条件和 007 历史歧义数据治理是否可接受。
2. 六 Query canonical row v1 与前端 fixtures parity；aggregate coverage/returnedObjects 语义。
3. 正式 BFF 登录上下文如何生成 tuple scope，生产是否保持 fail closed。
4. 两个详情 DTO 是否满足页面最小读取需要且没有暴露 credential owner/token/上游 body。
5. 16MB exact-boundary 的 BFF 与后端一致性。

**质量真相**：Domain 418、DB 97、Worker 444 +2 opt-in skipped；三包
typecheck/lint/audit 通过，Worker coverage 92.28/81.48/96.29；真实 PG migration/repository、
007 up/down/up、跨媒体同号、orphan/missing-media 反例通过。

**明确未完成**：reconcile delta、BFF/前端合流、正式登录 scope、真实 KA Data 内网 E2E、
部署/上线和 Claude/arch 批准。所有真实写继续关闭。
---

### P-KB-001 ✅已审（2026-09-04）｜资料研究与知识资产角色注册 + 首批白盒/黑盒资料审查｜research/knowledge（Codex）

- 派活方：资料研究与知识资产 Agent（Codex）
- 日期：2026-08-20
- 状态：待处理

#### 1. 角色注册

我是新建的 **KA 投放经营平台“资料研究与知识资产 Agent”**。职责是把内部/外部资料建设成“项目共享资料库→审查→产品知识库发布”的同源资产，不是维护私人笔记。

修改边界：

- 可改：`private/knowledge-sources/`（Git 私有）、`docs/knowledge/`、资料校验脚本、自己的状态/设计/计划、向工作台账和审查信箱追加留痕；
- 不可改：冻结 PRD、Contract、前端、后端生产代码；不替 arch 融合结论；不改其他角色边界；
- 本次已在 `docs/relay/README.md` 追加角色注册**提议**，审查通过前不生效。

#### 2. 分支、基线与提交

- 分支：`codex/shared-source-library`
- 独立 worktree：`/private/tmp/codex-shared-source-library.j1l066`
- 基线：`ce1af69`（`fe/f001` 已提交 HEAD，不含 Claude 当前工作区未提交改动）
- 设计修订 SHA：`d0ee7f7`
- 索引/规范 SHA：`7731070`
- **首批功能 SHA：`f806a03`**
- 未修改 Claude 当前脏工作区中的任何 tracked 文件；正式私有原文通过本地 Git exclude 保险落在项目指定路径，分支 `.gitignore` 已包含永久规则。

#### 3. 交付位置

- 资料总入口：`docs/knowledge/README.md`
- 机器索引：`docs/knowledge/catalog.jsonl`
- 单条 Schema：`docs/knowledge/catalog.schema.json`
- 录入/20 项评估模板：`docs/knowledge/templates/source-card.md`
- Agent 检索指南：`docs/knowledge/agent-retrieval-guide.md`
- 产品知识库发布映射：`docs/knowledge/product-kb-publishing.md`
- 首篇评估：`docs/knowledge/assessments/ka-src-0001.md`
- 校验器：`scripts/validate-knowledge-catalog.mjs`
- 测试：`scripts/validate-knowledge-catalog.test.mjs`
- 状态：`docs/plans/research-kb-状态.md`

首篇资料：

- `document_id`：`ka-src-0001`
- 标题：《AI 投放平台产品能力对比：白盒平台 vs 黑盒平台》
- `storage_ref`：`private/knowledge-sources/ka-src-0001/source.md`
- 正式本机路径：`/Users/aik/Desktop/投放agent/private/knowledge-sources/ka-src-0001/source.md`
- 内容 hash：`560b8cc58f47264ec46e7515b74af30eee05de2dca5a3f3c25a6552996517073`
- 状态：`review_pending` / E3 / `project_internal` / `not_ready`

#### 4. Git 与私有区边界

进入 Git：catalog、Schema、评估卡、README、模板、检索指南、发布映射、校验器/测试、设计/计划/状态、角色提议和本审查单。

只存在私有资料区：`ka-src-0001` 完整内部原文。原文允许保留真实业务信息，但本篇实际未含账户 ID、真实金额、考核价或内部人名；已检查无 Token、Cookie、AK/SK、PAT、Webhook Token、数据库密码。`git ls-files private/knowledge-sources` 无输出。

#### 5. 事实、推断、宣传与未证实边界

已确认事实：

- 原文确实由老板在会话中提供，标注日期 2026-06-29、版本 v0.1；
- 本仓 PRD 明确“不替人做最终决策”、一期快手；
- 当前设计已有矩阵基建、规则/工作流、确认门、有限自治、T+1/T+7 回收与知识库；
- 当前只有测品显著性标注，未找到完整实验对象/分组/流量契约。

合理推断（待你裁决）：当前产品应定义为“可控自治灰盒”；同一平台按角色/自治度呈现，比拆白盒/黑盒两套平台更合适；AI 实验编排值得补证后选择性纳入。

宣传性表达：原文的“说一句话全自动跑完”“无需人工干预”“确保统计有效”“全渠道覆盖”等无实现/效果证据，未当作事实。

未证实：对方平台是否上线；快手是否支持稳定实验分组/流量；成熟策略判定；动态调流的统计方法；全渠道写能力与权限。

#### 6. 建议如何处置

建议补证后融合进下一版 PRD 候选：

- 投放任务下的实验对象；
- 假设、唯一主变量、control/treatment、主指标/护栏/样本/停止规则；
- 批准的实验方案生成基建变更集并复用现有工作流/审计/效果回收；
- approved 实验报告沉淀策略版本与知识库引用。

建议只进入知识库/研究材料：

- 白盒/黑盒的角色叙事；
- 对方未经实证的产品能力描述；
- 当前“可控自治灰盒”判断及其证据边界。

建议驳回：

- 拆成两套独立平台；
- 无边界 AI 全权决策；
- 把中途任意关组/加流直接套普通 A/B 显著性；
- 把全渠道写成一期能力。

#### 7. 请 arch 审查并回写 ✅/❌

1. 角色注册和目录边界是否批准；若不批准，逐条指出需要修改的范围。
2. catalog 字段、生命周期、证据等级、ACL 和同 document_id/hash 发布门是否足够。
3. 私有原文不进 Git、评估进 Git 的分层是否符合项目治理。
4. `ka-src-0001` 的原文留存是否完整，评估是否把事实/推断/宣传/未证实分开。
5. 是否认可“当前产品=可控自治灰盒”的判断。
6. AI 实验编排应：A 融合进下一版 PRD候选 / B 只进知识库继续补证 / C 驳回。
7. 若融合，是否同意放在投放任务对象下而非新增一级导航/第二套平台。
8. 是否要求先补快手官方 MAPI/内部流量与实验能力、统计方案和业务试点证据。
9. 是否允许 `ka-src-0001` 升为 `reviewed/approved`，以及是否允许按 `project_internal` 权限发布到产品知识库。
10. 审查完成后请在本条回写每项 ✅/❌、审查人、时间、结论和产出 SHA/路径；不要直接把未批准内容写入冻结 PRD/Contract。

#### 8. 已完成验证

- `node --test scripts/validate-knowledge-catalog.test.mjs`：10/10 通过；
- `node scripts/validate-knowledge-catalog.mjs`：通过；
- raw hash 与 catalog：一致；
- `git check-ignore`：命中私有区；
- `git ls-files private/knowledge-sources`：无输出；
- `git diff --check`：提交前复核。

---

### P-KB-002 ✅已审（2026-09-04）｜KA 日报 Agent 与实时盯盘规范 v2.0 资料审查｜research/knowledge（Codex）

- 派活方：资料研究与知识资产 Agent（Codex）
- 日期：2026-08-20
- 状态：待处理

#### 1. 角色注册与边界

我是 **KA 投放经营平台“资料研究与知识资产 Agent”**，负责“内部/外部资料→项目共享资料库→分析与审查→批准后发布产品知识库”的同源资产链。角色注册提议仍在本文件 `P-KB-001` 和 `docs/relay/README.md` 等待裁决，本条不假设你认识我，也不扩大边界。

- 可改：Git 忽略的 `private/knowledge-sources/`、`docs/knowledge/`、资料校验脚本、自己的状态/计划；只向台账和本信箱追加留痕。
- 不可改：冻结 PRD/Contract、前端/后端生产代码、其他角色边界；不能替 arch 把研究结论变成正式口径。
- 凭证红线：Token、Cookie、AK/SK、PAT、Webhook Token、数据库密码不得落库；本篇扫描命中 0。

#### 2. 分支、基线与功能提交

- 分支：`codex/shared-source-library`
- 独立 worktree：`/private/tmp/codex-shared-source-library.j1l066`
- 基线：`ce1af69`（`fe/f001` 已提交 HEAD，不含 Claude 当前工作区未提交改动）
- **本篇功能 SHA：`cb040a0`**
- 首批框架/角色相关历史 SHA：`7731070`、`abd24c1`
- 未修改冻结 PRD、Contract、前端、后端生产代码，也未修改 Claude 当前工作区 tracked 文件。

#### 3. 资料与交付位置

- `document_id`：`ka-src-0002`
- 归一化标题：《KA 媒体日报 Agent 与实时盯盘监控规范 v2.0》；原文没有独立标题，这不是原文标题事实。
- 机器索引：`docs/knowledge/catalog.jsonl`
- 独立评估：`docs/knowledge/assessments/ka-src-0002.md`
- 项目共享资料说明：`docs/knowledge/README.md`
- Agent 检索指南：`docs/knowledge/agent-retrieval-guide.md`
- 产品知识库发布映射：`docs/knowledge/product-kb-publishing.md`
- 原始资料 `storage_ref`：`private/knowledge-sources/ka-src-0002/source.txt`
- 正式本机私有路径：`/Users/aik/Desktop/投放agent/private/knowledge-sources/ka-src-0002/source.txt`
- SHA-256：`928c8f95d998fac66a8697c9fab55fc4dad3ab2798559cfd187587bcd67ca19f`
- 状态：E3 / `review_pending` / `pending` / `project_internal` / `not_ready`

#### 4. Git 与私有区边界

进入 Git：catalog 元数据、20 项独立评估、无泄露凭证扫描增强/测试、状态与台账、本审查条目。

只存在私有资料区：完整内部原文。worktree 私有副本与正式项目私有副本 hash 一致；`.gitignore` 命中，`git ls-files private/knowledge-sources/ka-src-0002/source.txt` 无输出。原文含示例用户/账户/金额及 3 个内部钉钉链接，均未复制进 Git 评估正文；没有发现凭证值。

#### 5. 事实、推断与未证实边界

已确认事实：

- 原文标注 v2.0、创建日期 2026-04-13，定义 `dailyReportData`、五类查询、30+ 指标、8 维度、12 次日报调用、15 条盯盘规则和三表/素材 User Story。
- 当前 `packages/contract/api.md` 已吸收五类查询并增加 `table`；`metrics.md` 已吸收主要公式且将原文硬编码 `1.09` 修正为渠道级版本化系数。
- `docs/18-KA日报规范借鉴.md` 明显是同一资料的早期派生分析，不是第二份独立证据。
- 当前冻结 PRD 已包含数据、规则、盯盘、报告、Agent、钉钉和受控执行设计；本分支实际报告页/知识库页仍标“待实现”，数据页为 Mock，未见可运行 `dailyReportData`。

合理推断（待裁决）：本资料是当前语义查询/指标/日报/规则的重要上游需求来源；适合做 Contract 交叉审计和来源链，不适合当系统现状证据；12 次报告查询需要统一 snapshot/run 防止口径漂移。

宣传或目标表达：全渠道、三表已存在、数据/权限 100% 准确、异常/建议 >90%、各项 SLA、一键执行均没有实现或 UAT 证据。

未证实：真实 MCP/底表/FBI-BI 通路、巨量和腾讯适配、Mozi 身份可信链、素材 85 字段、规则精度、钉钉链接内容及复用权限。

#### 6. 识别出的关键冲突

1. 原文“全渠道”与一期快手冲突。
2. “权限只在 MCP、应用无需关心”与 BUC/workspace ACL/resource grant/审计边界冲突。
3. `/1.09` 去税解释与当前“渠道返点折算系数版本化”口径冲突。
4. `channel` 必填/可选、`toutiao/oceanengine`、两套扣量区间互相冲突。
5. 实时刷新 5 分钟/15 分钟、日报 `<30 秒`/不要求、空耗固定金额/目标成本倍数互相冲突。
6. 原文可一键执行与当前 changeset→dry-run→确认→执行安全链冲突。
7. 涨跌红绿规则前后矛盾，且不同指标的“上升”业务语义不同。

#### 7. 建议处置

建议进入下一版 PRD/Contract 变更提案候选（本条不直接修改）：

- 报告统一 `report_run_id/snapshot_id/data_as_of/coverage/source_revisions`；
- 指标粒度 applicability、来源 lineage、数据新鲜度和缺失 state；
- compare 类型、channel/adapter 枚举和扣量区间统一；
- 15 条规则进入历史回放/评测候选，默认首发仍只保留已冻结的 3 条低误报规则。

建议只进入知识库：

- 原始设计和 20 项评估，标 E3、“设计参考、未实现证明”；
- 12 模块日报信息架构、字段/规则候选、素材维度清单；
- 与 `docs/18-KA日报规范借鉴.md` 的同源关系和所有未证实边界。

建议驳回：

- MCP 独占全部权限和口径；
- 硬编码 1.09；
- 普通用户任意 SQL；
- 报告 Agent 直接一键写媒体；
- 将全渠道、100% 准确率或不存在的 MCP 写成产品现状。

#### 8. 请 arch 审查并回写 ✅/❌

1. 是否确认 `ka-src-0002` 与 `docs/18-KA日报规范借鉴.md` 同源，后者只算派生分析？
2. E3 / `review_pending` / `not_ready` 是否正确；是否允许审查后以 `project_internal` 发布“设计参考”到产品知识库？
3. catalog、hash、ACL、Git/私有分层和原文留存是否合规完整？
4. 是否确认 `dailyReportData` 不存在，不能把本文当接口实证？
5. 是否接受“应用安全不可外包给 MCP”的判断和建议分层？
6. 是否要求下一版 Contract 补统一 report snapshot/run 与指标 applicability？
7. channel、渠道枚举、扣量区间、compare 类型按哪一版裁决？
8. `1.09` 渠道系数修正是否继续作为正式口径，是否需业务责任方补证？
9. 15 条规则哪些进入历史回放；是否维持首发 3 条？
10. 哪些建议进入下一版 PRD/Contract，哪些只进入知识库，哪些明确驳回？
11. 是否需补索正式标题/作者/状态、三表 schema、工具实物、数据样本、UAT 和 3 个规则链接？
12. 审查后请回写审查人、时间、逐项结论、是否允许发布、补证项和产出 SHA/路径；未批准前不要修改冻结 PRD/Contract，也不要进入产品 Agent 默认可信知识。

#### 9. 已完成验证

- `node --test scripts/validate-knowledge-catalog.test.mjs`：12/12 通过；
- `node scripts/validate-knowledge-catalog.mjs`：通过；
- 双份 raw hash 与 catalog：一致；
- 凭证形态扫描：0；
- `git check-ignore`：命中私有路径；
- `git ls-files private/knowledge-sources/ka-src-0002/source.txt`：无输出；
- `git diff --check`：通过。


---

### P-KB-003 ✅已审（2026-09-04）｜快手媒体能力 + 渠道调控工作流两篇 confidential 资料审查｜research/knowledge（Codex）

- 派活方：资料研究与知识资产 Agent（Codex）
- 日期：2026-08-20
- 状态：待处理

#### 1. 角色注册与修改边界

我是 **KA 投放经营平台“资料研究与知识资产 Agent”**，负责把内部/官方/竞品资料建设成“私有原文→共享索引→独立评估→审查→批准后产品知识库发布”的同源资产。角色注册提议仍在 `P-KB-001` 和 `docs/relay/README.md` 待裁决，本条不假设你认识我，也不扩大任何角色权限。

- 可改：Git 忽略的 `private/knowledge-sources/`、`docs/knowledge/`、资料校验脚本、自己的状态/计划；只向台账和 arch 信箱追加。
- 不可改：冻结 PRD/Contract、前后端生产代码、其他角色边界；不替 arch 将研究结论变成正式口径。
- 凭证值绝对禁止。本批两篇扫描均为 0。

#### 2. 分支、基线与功能提交

- 分支：`codex/shared-source-library`
- 独立 worktree：`/private/tmp/codex-shared-source-library.j1l066`
- 基线：`ce1af69`（不含 Claude 当前脏工作区未提交改动）
- **本批功能 SHA：`a52f91b`**
- 资料库框架 SHA：`7731070`
- 未修改冻结 PRD、Contract、前端、后端生产代码；未修改其他角色边界。

#### 3. 两篇资料位置与状态

`ka-src-0003`：

- 归一化标题：《快手磁力引擎与内部 KA 投放能力资料汇编》；原文没有独立标题。
- catalog：`docs/knowledge/catalog.jsonl`
- 评估：`docs/knowledge/assessments/ka-src-0003.md`
- `storage_ref`：`private/knowledge-sources/ka-src-0003/source.txt`
- 正式私有路径：`/Users/aik/Desktop/投放agent/private/knowledge-sources/ka-src-0003/source.txt`
- hash：`96262502d5e7a6cf902e1ba77e2e4f1fb15811aba6ad52381eb0abac220fed5b`
- 状态：E3 / `confidential` / `review_pending` / `not_ready`

`ka-src-0004`：

- 归一化标题：《KA 渠道术语、调控规则与投放工作流资料汇编》；原文没有独立标题。
- catalog：`docs/knowledge/catalog.jsonl`
- 评估：`docs/knowledge/assessments/ka-src-0004.md`
- `storage_ref`：`private/knowledge-sources/ka-src-0004/source.txt`
- 正式私有路径：`/Users/aik/Desktop/投放agent/private/knowledge-sources/ka-src-0004/source.txt`
- hash：`cc3214f1c908bc0dfa0df2415ddabecc8d3dfe525eeed1597af2bbd4ff118aab`
- 状态：E3 / `confidential` / `review_pending` / `not_ready`

两篇 allowed_roles 仅为 `product_owner/research_knowledge/architecture_review/security_review`，未向一般 development 开放。

#### 4. Git 与私有区边界

进入 Git：两条 catalog 元数据、两篇各自 20 项评估、状态/台账、catalog 状态测试、本审查事项。

只在私有区：两篇完整原文。原文含内部业务/事件编号、系统和报表链接、命名规则、商务/回传策略及具体操作阈值；这些未复制到 Git 评估。两份 worktree 私有副本与正式私有区副本 hash 一致，Git ignore 命中且未跟踪。

#### 5. `ka-src-0003` 事实、推断与未证实

已确认事实：原文混合了快手版位/素材规格/媒体产品/定向/学习期/限额，以及内部业务映射、返点赔付、回传工具、命名与素材审核；未提供作者、版本或日期；嵌入多个来源链接但本轮未读取。

合理推断：适合作为 Capability Registry、基建预检、学习期映射和命名解析的候选清单；媒体事实必须拆回官方来源并记录版本/核验时间。

宣传/未证实：媒体规模与画像、版位效果区间、产品增益、当前规格/限额、产品开放范围、学习期阈值、返点/赔付政策和内部事件映射均未独立验证。原文还存在开屏图片/视频规格标签疑似互换、学习期表格残缺。

#### 6. `ka-src-0004` 事实、推断与未证实

已确认事实：原文包含术语、预算/出价/素材/赔付经验、优化师日常工作流、监控调控规则、基建与复制、商品/素材/承接页测试；未提供作者、版本或日期。

合理推断：可补规则候选生命周期、策略卡、优化师工作流和实验业务场景；但固定阈值只能先回放，测试 SOP 还不是统计实验。

宣传/未证实：预算/出价效果的绝对结论、固定调控阈值、复制增益、基建规模、商品/素材/承接页测试结论和内部数据源可接入性均无独立证据。

#### 7. 高风险内容专项边界

两篇原文均涉及可能改变/伪装转化回传真实性、以竞价或赔付门槛为目标调整数据的做法。研究 Agent 的处置是：

- 原文保持 `confidential`；
- 不复述成可执行方案，不进入一般 development 权限；
- 不进入产品内 Agent 默认召回、示例 Prompt、规则模板、Capability Registry 可用节点或自动执行；
- 建议由 security/compliance/业务责任方专项裁决；未批准前默认 `deny/quarantined`。

#### 8. 与当前产品映射

已包含设计：渠道适配层、Capability Registry、账户结构、矩阵基建、策略分析、冷启动生命周期、规则/告警、changeset 安全链、优质户复制、商品素材、效果回收、结算和知识库。

部分包含：媒体产品 eligibility/limits/version、素材规格预检、学习状态映射、业务事件字典、规则候选回放门、策略证据资产、商品/素材实验。

缺失：媒体能力证据版本、官方变更监测、知识用途等级、策略/规则候选完整生命周期、承接页对象与绑定历史、高风险能力 denylist/审计策略。

实际实现仍未达到上述完整闭环；不要把“设计已包含”写成“产品已上线”。

#### 9. 建议处置

建议进入下一版 PRD/Contract 候选（本条不直接改）：

- Capability Registry 增加 source/revision/effective window/eligibility/limits/risk；
- 基建 dry-run 增加素材规格、对象上限和产品资格预检；
- 规则中心增加 candidate→backtested→reviewed→enabled 生命周期；
- 知识资产增加可解释/可建议/可执行/禁止/隔离用途等级；
- 策略卡记录假设、条件、动作、护栏、观察窗、证据和失效条件；
- 承接页/实验对象只作为数据可得性前置的后续候选。

建议只进入知识库：

- 经官方/业务补证后拆出的媒体能力卡、术语卡、素材预检卡和只读策略参考；
- 两篇评估及来源/未证实/风险边界；
- 原文继续 confidential，不直接发布。

建议驳回：

- 高风险回传/赔付做法的产品化或自动化；
- 固定返点、平台规格、效果区间和调控阈值直接硬编码；
- 无确认写操作、大规模自动复制、自动删除历史资产；
- 将经验测试包装成统计有效实验。

#### 10. 请 arch 审查并回写 ✅/❌

1. 两篇 `confidential`、allowed_roles 和 E3 是否正确；是否进一步收紧？
2. 是否确认两篇原文都不允许直接发布到产品知识库或进入默认 Agent 召回？
3. 是否要求 security/compliance 对回传与赔付相关内容专项裁决，并默认 deny？
4. 哪些媒体产品/规格/学习期/限额需要启动官方补证，责任人是谁？
5. Capability Registry 是否补来源/版本/资格/限制/风险字段？
6. 是否批准基建 preflight 与命名解析进入下一版候选？
7. 哪些术语和监控阈值可进入候选回放，谁是业务定义责任方？
8. 是否批准规则候选生命周期、知识用途等级和策略卡进入下一版候选？
9. 商品/素材/承接页测试应与 `ka-src-0001` 的 AI 实验编排合并研究，还是只保留 SOP？
10. 哪些派生知识卡允许将来发布，哪些内容永久只留 confidential raw？
11. 是否需要退回原责任方补标题、作者、版本、日期、有效范围和残缺/冲突表格？
12. 审查完成后请回写审查人、时间、逐项结论、可发布范围、补证清单和产出 SHA；未批准前不要修改冻结 PRD/Contract。

#### 11. 已完成验证

- `node --test scripts/validate-knowledge-catalog.test.mjs`：13/13 通过；
- `node scripts/validate-knowledge-catalog.mjs`：通过；
- 两篇凭证形态扫描：0；
- 两份双副本 hash：一致；
- `git check-ignore`：均命中；
- `git ls-files private/knowledge-sources/ka-src-0003/source.txt private/knowledge-sources/ka-src-0004/source.txt`：无输出；
- 评估内内部链接/长业务编号泄露检查：无命中；
- `git diff --check`：通过。


---

### P-KB-004 ✅已审（2026-09-04）｜内部文档包 v2 + 快手广告创建 Excel 资料审查｜research/knowledge（Codex）

- 派活方：资料研究与知识资产 Agent（Codex）
- 日期：2026-08-20
- 状态：待处理

#### 1. 角色注册与职责边界

我是 **KA 投放经营平台“资料研究与知识资产 Agent”**，负责“内部/外部资料→私有原始资料→共享 catalog/评估→arch/security 审查→批准后发布产品知识库”的同源资产链。角色注册提议仍在 `P-KB-001` 与 `docs/relay/README.md` 待裁决，本条不假设审查 Agent 认识我，也不扩大任何既有角色权限。

- 可改：Git 忽略的 `private/knowledge-sources/`、`docs/knowledge/`、资料校验器、自己的状态/台账；只向本信箱追加审查事项。
- 不可改：冻结 PRD、Contract、前端/后端生产代码和其他角色边界；不替 arch/security 把研究结论变成正式口径或可执行能力。
- 凭证红线：Token、Cookie、AK/SK、PAT、Webhook Token、数据库密码和 signed URL 访问签名不得进入 canonical 或 Git。

#### 2. 分支、基线与功能提交

- 分支：`codex/shared-source-library`
- 独立 worktree：`/private/tmp/codex-shared-source-library.j1l066`
- 基线：`ce1af69`（不含 Claude 当前脏工作区未提交改动）
- **本批功能 SHA：`c10094a`**
- 资料库框架 SHA：`7731070`
- 未修改冻结 PRD、Contract、前端、后端生产代码；未修改其他角色边界。

#### 3. 本批输入和去重

老板在 Claude 当前工作区项目根目录新下载 3 个文件：

1. `ka-platform-docs-v2.zip`；
2. `INDEX.md`；
3. `快手广告创建指令模板.xlsx`。

`INDEX.md` 与压缩包内导读逐字节一致，hash=`87a1445f...2247`，只作为 `ka-src-0005` 的重复附件，不另分配 `document_id`。原下载入口文件未加入本分支 Git；本分支 `.gitignore` 增加了根目录 zip/INDEX 防误提交，Excel 已由 `*.xlsx` 规则忽略。

#### 4. `ka-src-0005` 资料包位置、状态与安全处理

- 标题：《KA 投放经营平台内部文档包 v2》
- catalog：`docs/knowledge/catalog.jsonl`
- 评估：`docs/knowledge/assessments/ka-src-0005.md`
- `storage_ref`：`private/knowledge-sources/ka-src-0005/source-manifest.json`
- canonical 私有目录：`/Users/aik/Desktop/投放agent/private/knowledge-sources/ka-src-0005/`
- manifest hash：`f26a3d88c03f185a0bccc29307a7ebdd706657e1f9655c861cd23e0c92d060da`
- sanitized archive hash：`33bfb76477cb8a170da71a811d470ce16aaad925b65a122552b860192b3a1127`
- 原下载 archive hash：`0d250a5a0f7057c64811f4069a800e224cd19bd9c640924741e1157c2847c3e8`
- 状态：E3 / `confidential` / `review_pending` / `not_ready`
- allowed_roles：`product_owner/research_knowledge/architecture_review/security_review`

原包安全事实：729 entries＝671 文件+58 目录；无路径穿越、符号链接、加密条目或重复路径。原包含 signed URL 中的访问标识/签名形状，不能直接入库。canonical 清除了 128 处 access-key query、128 处 signature query、1 处 AK ID 形状和 3 处 named-secret assignment；清除后 671 文件凭证复扫 0。manifest 记录逐文件 path/hash/size/change flag；同级保留可检索 `extracted/` 和 sanitized archive。

质量事实：22 个零字节文件、42 个小于 100 字节的文件、11 个含 NUL 字节的文件；44 个文件落在 11 组重复内容。导读“约 730 篇”实际把目录和文件 entry 混算，不能作为有效文章数。

#### 5. `ka-src-0006` Excel 位置、状态与核验

- 标题：《快手广告创建指令模板》
- catalog：`docs/knowledge/catalog.jsonl`
- 评估：`docs/knowledge/assessments/ka-src-0006.md`
- `storage_ref`：`private/knowledge-sources/ka-src-0006/source.xlsx`
- canonical 私有路径：`/Users/aik/Desktop/投放agent/private/knowledge-sources/ka-src-0006/source.xlsx`
- hash：`3314226789f0e8f66dcd932f038c386f09f5c14983e8d4c40e7969ae0e662ab9`
- 状态：E3 / `confidential` / `review_pending` / `not_ready`
- allowed_roles：`product_owner/research_knowledge/architecture_review/security_review`

Excel 安全/功能事实：3 个 sheet、3 个表格对象；无 VBA、外链 part、OLE 和凭证形态。含真实内部账户/任务/素材配置和可生成写操作指令的字段；默认 100 组并预置 20 行。关键字段为空时仍会生成指令，没有权限、限额、预算暴露、dry-run、幂等、执行回执或效果回收。

公式事实：原文件无 cached value；Artifact Tool 与隔离 LibreOffice 均对 8 个 lookup 单元格得到 `#NAME?`，Microsoft Excel 目标环境尚未补证；另有下拉值清空时的自引用/循环风险。不能把该文件当作已验证生产工具。

#### 6. 哪些内容进入 Git，哪些只留私有区

进入 Git：

- 两条 catalog 记录；
- 两篇独立 20 项评估；
- 多文件资料包录入/检索/发布规则；
- bundle manifest/子文件/archive 校验逻辑和测试；
- 状态、台账和本审查事项。

只留私有区：

- `ka-src-0005` manifest、sanitized archive 和 671 个 extracted 子文件；
- `ka-src-0006` 完整 Excel 原件；
- 精确内部下载 URL（只在私有 manifest）；
- 包内真实账户/系统/数据库/内部链接和基础设施细节。

Git 评估没有复制包内内部 URL、真实 ID 或高风险参数值。一般 development 不在两篇 allowed_roles。

#### 7. 事实、推断、宣传与未证实边界

已确认事实：

- EVO 子资料明确实验设计、流量规划、联调、发布、分析、人工推全/下线和结果报告阶段；
- 用户增长目录多数是 43 条摘要索引，不是 43 篇完整正文；
- 当前一期取数主通路是奇航 `get_data`，不是 FBI；
- Excel 是“人填策略/参数→工具拼指令”的白盒执行样本；当前产品设计仍是可控自治灰盒。

合理推断（待裁决）：

- EVO 流程可补强 `ka-src-0001` 的 Experiment Copilot，但它恰好说明实验设计不要求实时黑盒调控；
- 资料包应按子文档逐篇提升，不能整包向量化/发布；
- Excel 字段和三层交互可帮助定义 `create_ad` schema、配置套餐和 Prompt Compiler，但自然语言不能成为执行合同。

宣传性表达：导读的“约 730 篇”“全套”“直接套”“摘要足够知道全文”等未当事实。

未证实：包内每篇作者/版本/有效期/许可；EVO 对快手分流能力；FBI/O2/AIStudio 当前接口；43 条摘要全文；Excel 作者/目标 Microsoft Excel/真实 CLI UAT；配置 ID、限额和套餐有效性。

#### 8. 产品处置建议

建议进入下一版 PRD/Contract 候选（本批不直接改）：

- Experiment Copilot 增加设计→流量规划→联调→发布→分析→决策→报告状态，以及安全终止/不可判定；
- 基建 Capability schema 补字段类型、必填、枚举、默认版本、媒体限额、权限和风险等级；
- Prompt Compiler 输出结构化 payload + diff + 人类解释，执行仍走 changeset/dry-run/确认；
- 配置套餐增加 revision/owner/ACL/适用范围/失效状态；
- 知识资产支持 bundle manifest 和子文档提升。

只建议进入资料库/研究路线：

- FBI/O2/AIStudio/项目管理/历史广告白皮书原文；
- 用户增长 43 条摘要；
- Excel 原件和当前公式实现；
- 资料包整体及导读判断。

建议明确驳回：

- 整包直接发布或进入产品 Agent 默认召回；
- 把摘要当正式接口/产品证据；
- 把 FBI 改成一期主数据通路；
- 自然语言字符串直接执行、空字段仍生成、100 组默认、“其他默认”；
- 高风险参数进入 Capability Registry、工作流、模板或 Agent 建议；
- 把实验中途任意调流包装成普通 A/B 结论。

#### 9. 产品知识库发布建议

- `ka-src-0005`：不允许整包发布；最多升为 reviewed 的受控研究包。需要发布的 EVO/FBI/投放子文档必须另分配 document_id、版本、hash、ACL 和审查。
- `ka-src-0006`：不建议原件发布；若有价值，派生一份去 ID、去高风险字段、带正式 schema 的“快手基建参数字典”，作为新资产单独审查。
- 两篇当前均保持 `not_ready`，不得进入产品内 Agent 默认可信知识。

#### 10. 请 arch/security 审查并回写 ✅/❌

1. 两篇 E3/`confidential`/allowed_roles/`not_ready` 是否正确，是否进一步收紧？
2. manifest 作为资料包 `storage_ref`、逐文件 hash、sanitized archive 和 `extracted/` 模式是否批准？
3. bundle validator 是否足以作为多文件资料包门禁？
4. 原下载包含已清除的 signed URL 凭证形状；是否要求工作区责任方把根目录原包移出或销毁？
5. 是否确认重复 `INDEX.md` 不另分配 document_id？
6. 哪些子文档优先提升：EVO A/B、FBI 嵌入、SaaS 广告投放摘要、O2 Next.js、AIStudio API？
7. EVO 是否可进入 Experiment Copilot 下一版候选；固定测量期与实时调控如何裁决？
8. 是否确认 FBI 只做后续备选，不改变一期奇航主通路？
9. Excel 哪些字段可进入 `create_ad` schema，100 组默认/“其他默认”是否明确驳回？
10. 是否对高风险参数维持 deny/quarantine，并由 security/compliance 专项裁决？
11. 是否批准派生“去 ID/去高风险字段的快手基建参数字典”进入下一轮审查？
12. 是否只允许两篇升为 reviewed，明确禁止原件/整包 published？
13. 需要补索哪些作者、版本、当前接口、官方文档、UAT 和授权证据？
14. 审查完成后请回写审查人、时间、逐项结论、可发布范围、补证清单和产出 SHA；未批准前不要修改冻结 PRD/Contract。

#### 11. 已完成验证

- `node --test scripts/validate-knowledge-catalog.test.mjs`：15/15 通过；
- `node scripts/validate-knowledge-catalog.mjs`：通过；
- 671 个子文件 hash、凭证复扫和 sanitized archive hash：通过；
- Excel 宏/外链/OLE/凭证扫描：0；
- `git check-ignore`：两篇 canonical 命中；
- `git ls-files private/knowledge-sources`：无输出；
- Git 评估内内部 URL/真实 ID/高风险参数值泄露扫描：无命中；
- `git diff --check`：提交前复核通过。


---

### P-KB-005 ✅已审（2026-09-04）｜`ka-src-0005` 压缩包 671 项逐文档导读审查｜research/knowledge（Codex）

- 派活方：资料研究与知识资产 Agent（Codex）
- 日期：2026-08-20
- 状态：待处理

#### 1. 角色注册与职责边界

我是 **KA 投放经营平台“资料研究与知识资产 Agent”**，负责“内部/外部资料→私有原始资料→共享 catalog/评估→arch/security 审查→批准后发布产品知识库”的同源资产链。角色注册提议仍在 `P-KB-001` 和 `docs/relay/README.md` 待裁决；本条不假设审查 Agent 认识我，也不改变既有角色权限。

- 可改：Git 忽略的 `private/knowledge-sources/`、`docs/knowledge/`、资料生成/校验脚本、自己的状态/台账；只向本信箱追加事项。
- 不可改：冻结 PRD、Contract、前端/后端生产代码和其他角色边界；不替 arch/security 批准资料或发布知识。
- 凭证红线：Token、Cookie、AK/SK、PAT、Webhook Token、数据库密码和 signed URL 访问签名不得进入原文 canonical、派生导读或 Git。

#### 2. 分支、基线与功能提交

- 分支：`codex/shared-source-library`
- 独立 worktree：`/private/tmp/codex-shared-source-library.j1l066`
- 基线：`ce1af69`
- **本批功能 SHA：`0dd641c`**
- 上一批父资料/Excel 功能 SHA：`c10094a`
- 未修改冻结 PRD、Contract、前端、后端生产代码或其他角色边界。

#### 3. 父资料与私有逐文档产物

- 父 `document_id`：`ka-src-0005`
- catalog：`docs/knowledge/catalog.jsonl`
- 父评估：`docs/knowledge/assessments/ka-src-0005.md`
- 本批 Git 总览：`docs/knowledge/assessments/ka-src-0005-document-guide-overview.md`
- 父 `storage_ref`：`private/knowledge-sources/ka-src-0005/source-manifest.json`
- 父 manifest hash：`f26a3d88c03f185a0bccc29307a7ebdd706657e1f9655c861cd23e0c92d060da`
- 状态：E3 / `confidential` / `review_pending` / `not_ready`
- allowed_roles：`product_owner/research_knowledge/architecture_review/security_review`

本批 private derived 目录：`/Users/aik/Desktop/投放agent/private/knowledge-sources/ka-src-0005/derived/`

| 私有文件 | 内容 | SHA-256 |
|---|---|---|
| `document-guide.md` | 671 项人读导读 | `d97fbbaf6ed94b4082c53f346145d18d8ae1741a76ff24ac8d1afc37e8625971` |
| `document-inventory.jsonl` | 671 条 Agent/脚本索引 | `fb5c37cc5253dc8861f7ee84fa484c496ee37669ca065090dfa5806fb38d3904` |
| `coverage-report.json` | 覆盖、质量、异常、安全统计 | `a5481cb9df7073f00c896909d8d7885539b295591a66b1ccd6f9dce73fbc8a86` |

独立 worktree 私有副本与项目 canonical 私有副本逐字节一致，均命中 `.gitignore`，未被 Git 跟踪。

#### 4. 逐文档介绍的结构与治理状态

每个 manifest 子文件均生成：

- 稳定 `child_asset_id`（父 document_id + relative path 的确定性 hash）；
- 标题、相对路径、来源组、格式、字节数和原文件 SHA-256；
- 一段“讲什么”的抽取式介绍、章节线索和主题标签；
- 内容质量与异常、重复 canonical 指向；
- `storage_ref`；
- `extractive_unreviewed / unreviewed_child / not_ready / confidential`。

`child_asset_id` 只用于包内发现和追溯，不是正式 `document_id`。生成导读没有改变父 manifest、catalog hash、生命周期、审查或发布状态；任何子文件如需正式引用/发布，仍须单篇提升并独立审查。

#### 5. 已确认事实

- manifest 671 个文件全部有介绍：671/671；missing 0、extra 0、child ID 冲突 0。
- 内容质量：402 `substantive`、207 `short`、35 `stub`、27 `empty`。
- 44 个文件属于 11 个逐字节重复组，其中 33 个是排序 canonical 之外的副本。
- 11 个文件含 NUL；读取时清除 NUL，但保留 `contains_nul` 标记。
- 17 个文件曾由父资料凭证清除器修改；导读只从 sanitized canonical 生成。
- 14 个路径带“历史文档/废弃/旧版”等明确时效风险信号。
- 5 个 `.pdf` 的文件头不是 `%PDF`，`file` 识别为 UTF-8 文本，`pdfinfo` 无法解析；本批读取文本，不声称做了 PDF 版面审查。
- 3 个 `.json` 扩展名文件无法按标准 JSON 解析，已按文本导读并标 `invalid_json`。
- 导读介绍的凭证形态复扫为 0。

#### 6. 推断、宣传与未证实边界

合理推断（待审查）：

- 逐文档发现层可以显著降低 Agent 定向检索成本，避免把 671 个文件整包塞入上下文；
- 稳定 child ID 适合作为“候选→单篇提升”的过渡身份，但不能代替正式 document_id；
- 先按质量/异常筛选，再核原文，比仅依赖目录名或包导读更可靠。

没有把打包导读的“约 730 篇”“摘要足够理解全文”等宣传表述当成事实。

未证实：每篇作者/责任团队/正式状态/更新时间/当前有效性/许可；抽取式介绍是否完整覆盖表格和图片含义；5 份课件原始 PDF 版面；3 份伪 JSON 的原始结构；所有历史接口在 2026-08-20 是否仍可用。

#### 7. 哪些进入 Git，哪些只留私有区

进入 Git：

- 可复现生成器 `scripts/build-knowledge-bundle-guide.py`；
- 聚合统计、方法和使用边界总览；
- README、Agent 检索指南、父评估补充、状态和台账；
- 本审查事项。

只留 private：

- 671 项完整标题、相对路径、抽取式介绍和 storage_ref；
- 机器索引和覆盖报告；
- 671 个 sanitized 原文及归档。

Git 没有加入 confidential 逐篇介绍、原文、内部链接、真实业务参数或凭证。

#### 8. 对 PRD、知识库和 Agent 的建议

建议进入后续 PRD/Contract 候选（本批不直接修改）：

- 多文件资料的 child asset 发现与“单篇提升”工作流；
- 知识检索结果显示父包、child ID、质量、异常、审查与发布状态；
- 正式发布前强制将 child 转成独立 document_id/hash/ACL/证据/审查记录。

只建议进入项目资料库/研究工具：

- 671 项抽取式导读和机器索引；
- 空/短/重复/格式异常清单；
- 未逐篇审查的标题、章节线索和主题标签。

建议驳回：

- 将 671 项导读当成逐篇已审查结论；
- 整包发布到产品知识库或进入产品内 Agent 默认可信召回；
- 给 `empty/stub` 文档补造正文；
- 把 `.pdf` 文本导出误称为已完成 PDF 视觉核验；
- 因存在 child ID 就跳过正式 document_id、ACL、补证和审查。

#### 9. 发布建议

- 父 `ka-src-0005` 继续 `not_ready`，不允许整包发布。
- 三份 `derived/` 产物继续 confidential，只供 allowed_roles 本机检索，不直接发布产品知识库。
- 审查通过最多批准“作为项目内部发现索引使用”；不应自动批准任何子文件为正式知识。
- 真正有产品价值的 EVO/FBI/投放/AIStudio 子文档应另建 document_id，核时效、权限、证据后单篇发布。

#### 10. 请 arch/security 审查并回写 ✅/❌

1. 是否批准 `child_asset_id` 作为包内稳定发现身份，并确认它不等同 document_id？
2. `extractive_unreviewed / unreviewed_child / not_ready` 三层状态是否足够明确？
3. private `derived/` 目录和三件套格式是否批准为多文件资料包标准？
4. 是否认可 671/671 覆盖与质量/异常分类；分类阈值是否需要调整？
5. 是否允许 allowed_roles 使用逐篇导读发现资料，同时要求引用前核原文？
6. 是否确认父包或 derived 产物都不得进入产品内 Agent 默认可信召回？
7. 是否需要 security 对 17 个曾清除凭证的子文件和派生摘要再做专项抽查？
8. 5 个伪 PDF 是否要求回源补正式 PDF；3 个伪 JSON 是否要求回源补正确格式？
9. 是否批准将 child→document 的提升流程列入后续知识库 PRD 候选？
10. 哪些主题优先单篇提升：EVO、用户增长投放摘要、FBI、AIStudio、O2？
11. 是否允许三份 derived 产物标 `reviewed` 但仍 `not_ready`，还是继续保持 unreviewed？
12. 审查完成后请回写审查人、时间、逐项结论、允许使用范围、补证清单和产出 SHA；未批准前不要修改冻结 PRD/Contract。

#### 11. 已完成验证

- 独立重建后，三份 derived 文件与 canonical 逐字节一致；
- 671/671 路径/hash/ID/介绍/状态检查通过；
- 5 个伪 PDF 和 44 个重复组计数检查通过；
- 导读凭证形态扫描 0；
- `node --test scripts/validate-knowledge-catalog.test.mjs`：15/15 通过；
- `node scripts/validate-knowledge-catalog.mjs`：通过；
- `git check-ignore` 命中 derived，`git ls-files private/knowledge-sources` 无输出；
- `git diff --check`：提交前复核通过。


---

### P-KB-006 ✅已审（2026-09-04）｜`ka-src-0005` 671 项产品相关性与借鉴边界审查｜research/knowledge（Codex）

- 派活方：资料研究与知识资产 Agent（Codex）
- 日期：2026-08-20
- 状态：待处理

#### 1. 角色与边界

我是 **KA 投放经营平台“资料研究与知识资产 Agent”**。本批只判断 OS Agent 从内网拉取的资料是否对当前产品有用，不因来源真实或已下载就默认采纳。

- 可改：ignored 私有资料区、`docs/knowledge/`、资料生成/校验脚本、自己的状态/台账和本信箱追加项。
- 不可改：冻结 PRD、Contract、前后端生产代码和其他角色边界；不替 arch 把研究判断变成正式产品口径。
- 本批没有新增产品功能、没有改变一期范围、没有发布任何知识。

#### 2. 分支与功能提交

- 分支：`codex/shared-source-library`
- worktree：`/private/tmp/codex-shared-source-library.j1l066`
- 基线：`ce1af69`
- **本批功能 SHA：`77b89ed`**
- 父资料：`ka-src-0005`，manifest hash 仍为 `f26a3d88c03f185a0bccc29307a7ebdd706657e1f9655c861cd23e0c92d060da`
- 父资料仍为 E3 / `confidential` / `review_pending` / `not_ready`。

#### 3. 当前私有产物与 hash

canonical：`/Users/aik/Desktop/投放agent/private/knowledge-sources/ka-src-0005/derived/`

| 文件 | 用途 | SHA-256 |
|---|---|---|
| `product-relevance-guide.md` | 671 项按产品相关性分组的人读清单 | `e6d39d0cf6b78e3e443bd49897d12f2773a9a4fd129ebfbd45b04b025c0bfaa1` |
| `document-inventory.jsonl` | 含相关性/动作/用途/阶段/模块/边界的机器索引 | `ce379e58886c241fdcb4376e55886e2d004c71448f16fb9f0b3ffeebdc4c3435` |
| `document-guide.md` | 同步显示每篇“讲什么+对产品是否有用” | `f79bb54758ea04ec8ebcc3d1b3b9663da26ef9acfea3d346ad0c5ab12acbcb13` |
| `coverage-report.json` | 覆盖、质量、异常、相关性和安全报告 | `7e92dcab3ba815e239457a299cc7355d6383a7637b2aca57a3777ff34c6708ca` |

本批给 derived 增加产品相关性字段，故以上 hash 取代 `P-KB-005` 的旧派生文件 hash；父 manifest 和 671 份 sanitized 原文没有变化。

#### 4. 相关性定义

- `direct_candidate`：直接对应 KA 产品问题，可进入单篇补证/审查候选，但不自动采用。
- `conditional_candidate`：只在当前版本、接口、权限和适配性补证后按需使用。
- `background_only`：只作工程/行业/项目背景，不形成产品需求。
- `not_relevant`：排除出产品设计、路线图、默认 Agent 知识和发布队列。
- `cannot_assess`：正文缺失/过短，不能凭标题猜价值。

每项另有 `recommended_action/use_scope/roadmap_phase/modules/reason/takeaway/adoption_boundary/priority`。`engineering_reference` 明确不等于产品功能。

#### 5. 已确认结果

| 分类 | 文件数 | 占比 | 处置 |
|---|---:|---:|---|
| direct | 8 | 1.2% | 单篇补证候选 |
| conditional | 173 | 25.8% | 发生具体问题时按需检索 |
| background | 405 | 60.4% | 不形成需求 |
| not relevant | 23 | 3.4% | 排除 |
| cannot assess | 62 | 9.2% | 补原文前不使用 |

**663/671（98.8%）不是直接产品候选。**

8 个 direct 实际集中为：

- 同一批 43 条用户增长/投放搜索摘要的 JSON 与 Markdown 两种表现：只作全文发现入口；
- 6 份 EVO 实验治理资料：可参考实验生命周期、分流、联调、质量检查、推全/下线和结果沉淀。

173 个 conditional 构成：AIStudio 97、O2/Aone 74、FBI 2，全部标为工程参考而非产品需求。

#### 6. 推断与未证实

研究判断（待 arch 审查）：

- 只有 direct 候选值得启动单篇提升；其余不应进入产品默认召回。
- EVO 模式可补后续 Experiment Copilot，但不进入一期，也不能证明快手具备同等随机分流或实时调流能力。
- AIStudio/O2/FBI 只在实现或排障时按需查，不能反向定义产品。

未证实：43 条摘要全文、EVO 对快手对象适配、AIStudio/O2/FBI 当前接口/版本/权限，以及所有子文档责任方和许可。没有把 OS Agent 的打包推荐或“内网资料”身份当作权威性证明。

#### 7. Git 与 private 边界

进入 Git：相关性方法、聚合统计、检索/发布门、父评估补充、生成器、状态台账和本审查单。

只留 private：671 项标题、路径、逐篇介绍、逐项相关性理由/边界、原文和机器索引。Git 没有复制 confidential 逐篇清单或内部链接。

#### 8. 产品处置建议

一期：**不因本包新增任何业务功能**。

后续可补证：

- EVO 实验治理模式，合并到既有 Experiment Copilot 研究，不另造平台；
- 用户增长投放摘要对应的原始全文；
- AIStudio 知识库/LLM API、O2 FaaS/Next.js、FBI 嵌入仅在真实实现问题出现时核验。

只作背景：项目管理、历史国际广告架构/结算/稳定性、通用平台说明。

明确驳回：整包借鉴、按目录名新增功能、把工程文档当产品需求、把摘要当正式证据、把历史接口/价格/SDK 写入当前口径、把 background/not relevant/cannot assess 放进产品 Agent 默认召回。

#### 9. 发布建议

- 父包、完整 derived 清单和所有子文件继续 `not_ready`；不允许整包发布。
- direct 只允许进入单篇补证队列；必须另分配 document_id/hash/ACL/证据/审查。
- conditional 必须有具体使用问题和当前实证后再申请提升。
- background/not relevant/cannot assess 默认永久排除出产品知识库可信范围，除非获得新原文或新证据后重新评估。

#### 10. 请 arch/security 审查并回写 ✅/❌

1. 是否批准五级相关性和 action/scope/phase/boundary 字段作为 bundle 标准？
2. 是否认可 8 direct、173 conditional、405 background、23 not relevant、62 cannot assess 的分类？
3. 是否确认 663/671 不进入直接产品候选？
4. 是否批准 direct 仅进入单篇补证队列，不能自动融合 PRD？
5. 是否确认一期不因本包新增功能？
6. 是否确认 AIStudio/O2/FBI 只作 on-demand engineering reference？
7. 哪些 direct 项需要优先补全文/当前接口/快手适配证据？
8. 是否将 background/not relevant/cannot assess 从产品 Agent 默认召回永久排除？
9. 是否允许 private relevance guide 仅供 allowed_roles 使用，但不发布产品知识库？
10. 是否需要 security 对相关性导读再抽查凭证/内部敏感信息？
11. 是否批准 P1/P2 优先级，还是要求 arch 重新排序？
12. 审查完成后请回写审查人、时间、逐项结论、补证/排除清单和产出 SHA；未批准前不要修改冻结 PRD/Contract。

#### 11. 验证

- 671/671 均有相关性、动作、用途、阶段、模块、理由、可提取点、边界和优先级；
- 8 direct 全量人工复核，173 conditional 做分组规则与代表样本复核，并反查潜在漏判标题；
- 四份 private derived 在独立 worktree 与 canonical hash 一致；
- 确定性重建四文件逐字节一致；
- 介绍和相关性字段凭证形态均为 0；
- 15/15 知识目录测试、catalog validator、`git diff --check` 通过；
- `git ls-files private/knowledge-sources` 无输出。

---

### P-KB-007 ✅已审（2026-09-04）｜快手磁力引擎 MAPI 官方文档首批证据审查｜research/knowledge（Codex）

- 派活方：资料研究与知识资产 Agent（Codex）
- 日期：2026-08-20
- 状态：待处理

#### 1. 角色注册与修改边界

我是 **KA 投放经营平台“资料研究与知识资产 Agent”**，负责把内部/外部资料建设为“项目共享资料库 → 分析审查 → 批准后发布产品知识库”的同源资产。本角色注册提议仍见 `docs/relay/README.md` 与 `P-KB-001`；本条不假设审查人认识我，也不扩大其他角色边界。

- 可改：ignored 的 `private/knowledge-sources/`、`docs/knowledge/`、资料校验测试、自己的状态/台账和本审查信箱追加项。
- 不可改：冻结 PRD、Contract、前端/后端生产代码、其他角色边界；不替 arch 把研究结论变成正式口径。
- 本批全程公开只读：未登录、未获取 token、未调用任何媒体业务接口、未执行广告写操作。

#### 2. 分支、基线与提交

- 分支：`codex/shared-source-library`
- 独立 worktree：`/private/tmp/codex-shared-source-library.j1l066`
- 基线：`ce1af69`
- **功能提交 SHA：`f8ffed6`**
- 未修改 Claude 当前工作区 tracked 文件；没有修改冻结 PRD/Contract 或生产代码。

#### 3. 资料与交付位置

- `document_id`：`ka-src-0007`
- 标题：《快手磁力引擎开放平台 MAPI 官方文档首批证据》
- 官方入口：https://developers.e.kuaishou.com/docs?docType=DSP&documentId=&menuId=3033
- 抓取日期：2026-08-20
- 范围：聚合入口 + 31 个具体 `documentId` 页面；覆盖注册/scope/token、授权账户、账户资金、计划/组/创意、实时报表、素材、审核、频控与创建限制。
- 机器索引：`docs/knowledge/catalog.jsonl`
- 独立评估：`docs/knowledge/assessments/ka-src-0007.md`
- 检索规则：`docs/knowledge/agent-retrieval-guide.md`
- 原始证据 `storage_ref`：`private/knowledge-sources/ka-src-0007/source.md`
- 正式本机路径：`/Users/aik/Desktop/投放agent/private/knowledge-sources/ka-src-0007/source.md`
- SHA-256：`11b5f260296bc13612b23dcf13fa1f72b1cfd4fd2b38021e321712a42851bf5d`
- 状态：E1 / `public` / `review_pending` / `pending` / `not_ready`

#### 4. Git、private 与凭证边界

进入 Git：catalog 元数据、20 项评估、动态官方 API 取证/检索规则、测试、状态台账和本审查单。

只在 ignored private：无凭证官方结构化快照。快照没有保存官方 curl 样例中的 Access-Token、Cookie、secret 等值；只保留字段名、接口路径、版本、更新时间和无凭证事实。worktree 与正式项目私有副本 hash 一致，`git ls-files private/knowledge-sources` 无输出。

#### 5. 已确认事实、合理推断与未证实

已确认事实：

- MAPI 官方公开目录存在 `report_service/account_service/ad_query/ad_manage` 等 scope；access token 官方说明 1 天、refresh token 30 天。
- 官方页面提供计划/组/创意创建、查询、状态、预算和出价接口；删除状态可能级联删除下级对象。
- 实时报表覆盖账户/计划/组/创意，素材接口覆盖图片/视频，创意审核可返回拒绝/限流原因。
- 创建计划页存在 `auto_build/auto_adjust/auto_manage`；`auto_build` 页面明确标为白名单能力。
- 官方文档自身存在冲突：v2 老路径 vs `gw/dsp` 新路径、计划总数 1000 vs 500、广告主资质页头 POST vs 同页样例 GET。
- 官方站内搜索“实验”返回“未查询到接口”。

合理推断（待审查）：

- MAPI 应成为快手 provider 的官方能力上限证据，CLI 是执行壳；优先补 Capability Registry、结构同步和执行回查。
- 一期不应因此替换奇航 `get_data` 主读取链路；MAPI 报表先作结构/口径校验或缺维度补充。
- 媒体原生自动基建/调控/智投与我方矩阵基建、自治度、Agent 决策不是同一能力，应单独治理。
- 当前公开 MAPI 证据不足以支持严格 AI A/B 实验；实验模式默认冻结媒体原生自动化更安全。

未证实：

- 本公司 AppID/账户实际 scope、白名单和接口可用性；
- 当前 `kuaishou-cli` 对本批接口的封装覆盖、host/版本与运行状态；
- MAPI 与奇航在字段、时效、结算口径上的一致性；
- 冲突页面的生产真实路径、方法和上限；
- 是否存在非公开/白名单实验分流能力；
- 媒体自动调控是否跨实验组共享学习或污染对照。

#### 6. 对现有产品的建议

建议融合进下一版 PRD/Contract **候选**，不在本批直接修改：

- Capability Registry 增加 `official_document_id/doc_version/doc_updated_at/scope/whitelist/risk/limit/verification_state`；
- 运行时能力区分 `documented → authorized → wrapped → verified`，并支持 `official_conflict`；
- 执行 preflight 纳入 QPM、日期范围、批量上限、金额单位和级联删除；
- 实验对象声明是否冻结媒体原生自动化。

建议进入知识库/研发证据：

- 31 个官方页面的接口索引、版本、更新时间、scope 和限制；
- 目标接口页与汇总页冲突及补证清单；
- `auto_build/auto_adjust/auto_manage` 的能力边界；
- `documented/authorized/wrapped/verified` 引用纪律。

建议驳回：

- 因公开页面存在就宣称公司账户已可用；
- 用 MAPI 报表直接替换奇航主链路；
- 一次性封装全量 MAPI；
- 产品服务直存媒体 token/secret；
- 无确认自动删除、关停、调预算/出价；
- 把媒体 `auto_manage` 当作我方黑盒 AI 闭环已实现；
- 把多计划/组构造直接称为严格 A/B 实验。

#### 7. 发布建议

当前**不允许发布到产品知识库**：虽为 E1/public，仍有官方冲突、账户权限和运行时未验证项，catalog 继续 `review_pending/not_ready`。

若审查批准，建议只发布无凭证结构化摘要和官方链接，继承 `public` 可见性；不发布完整网页镜像或官方请求样例。产品内 Agent 默认可信使用时仍必须查询运行时 Capability Registry，不能只依赖知识库文档。

#### 8. 请 arch 审查并回写 ✅/❌

1. 是否批准 `ka-src-0007` 为 E1 官方证据，并允许升为 `reviewed`；冲突项是否继续 `unverified`？
2. 是否认可 `documented/authorized/wrapped/verified` 四态和 `official_conflict`？
3. 是否同意“先 capability manifest + CLI 覆盖审计 + 只读探针，不替换奇航主链路”？
4. 是否要求执行/架构 Agent 单独提交当前 `kuaishou-cli` 与本批接口的覆盖矩阵？
5. 谁负责裁定路径、计划上限和请求方法三类官方冲突：测试账户探针、媒体接口人还是两者都要？
6. 是否批准先做 campaign/unit/creative 只读结构同步和媒体态回查？
7. `auto_build/auto_adjust/auto_manage` 是否只进入 P2 研究并默认关闭？
8. 实验模式是否强制冻结媒体原生自动化；动态实验是否需要统计专项审查？
9. 是否允许审查通过后把结构化摘要按 `public` 发布产品知识库，还是先限制 `project_internal`？
10. 是否建立快手官方文档定期复抓/hash diff 任务；建议频率由 arch 决定。
11. 是否还需补抓素材报表、异步报表、SPI、账户智投或高级创意后再审？
12. 审查完成后请回写审查人、时间、逐项结论、可融合项、仅知识项、驳回项、补证清单和产出 SHA；未批准前不要修改冻结 PRD/Contract。

#### 9. 验证

- 私有快照与 catalog hash 一致；正式项目/独立 worktree 双份 hash 一致；
- 凭证形态扫描通过，未保存 token/cookie/secret 值；
- `node --test scripts/validate-knowledge-catalog.test.mjs`：16/16 通过；
- `node scripts/validate-knowledge-catalog.mjs`：通过；
- `git diff --check`：通过；
- `git ls-files private/knowledge-sources`：无输出。

### P-KB-008 ✅已审（2026-09-04）｜快手 MAPI 全量语料、CLI 覆盖与产品相关性增量审查｜research/knowledge（Codex）

- 派活方：资料研究与知识资产 Agent（Codex）
- 日期：2026-08-20
- 状态：待处理
- 关系：本条替代 `P-KB-007` 的“31 页首批证据”范围描述；`document_id` 仍为 `ka-src-0007`，不是第二份正文。

#### 1. 角色注册与修改边界

我是 **KA 投放经营平台“资料研究与知识资产 Agent”**，负责把内部/外部资料建设为“项目共享资料库 → 分析审查 → 批准后发布产品知识库”的同源资产。本角色注册提议见 `docs/relay/README.md` 与 `P-KB-001`；本条不假设审查人认识我，也不改变其他角色边界。

- 可改：ignored 的 `private/knowledge-sources/`、`docs/knowledge/`、资料抓取/矩阵生成/校验脚本、自己的状态/台账和审查信箱追加项。
- 不可改：冻结 PRD、Contract、前端/后端生产代码、媒体生产账户、其他角色边界；不替 arch 把研究候选直接变成产品承诺。
- 本批只访问快手官方公开文档与本机 CLI 源码：未登录、未获取 token、未调用广告账户业务接口、未执行任何媒体写操作。

#### 2. 分支、基线与提交

- 分支：`codex/shared-source-library`
- 独立 worktree：`/private/tmp/codex-shared-source-library.j1l066`
- 基线：`ce1af69`
- **本轮功能提交 SHA：`2faa8ea`**
- 上一轮首批证据提交：`f8ffed6`；本轮用同一 `ka-src-0007` revision/hash 更新，不手工维护第二份来源正文。
- 未修改 Claude 当前工作区 tracked 文件；未修改冻结 PRD/Contract 或生产代码。

#### 3. 资料目录、索引与原始 storage_ref

- `document_id`：`ka-src-0007`
- 当前标题：《快手磁力引擎 DSP/MAPI 官方文档全量快照与 CLI 覆盖》
- 当前版本：`dsp-current-and-legacy-2026-08-20`
- 官方入口：https://developers.e.kuaishou.com/docs?docType=DSP
- catalog：`docs/knowledge/catalog.jsonl`
- 独立评估：`docs/knowledge/assessments/ka-src-0007.md`
- 381 条机器能力矩阵：`docs/knowledge/datasets/ka-src-0007-capability-coverage.jsonl`
- 聚合统计：`docs/knowledge/datasets/ka-src-0007-capability-summary.json`
- Agent 检索说明：`docs/knowledge/agent-retrieval-guide.md`
- 抓取器：`scripts/crawl-kuaishou-mapi-docs.mjs`
- 覆盖矩阵生成器：`scripts/build-kuaishou-mapi-coverage.mjs`
- `storage_ref`：`private/knowledge-sources/ka-src-0007/source-manifest.json`
- worktree private：`/private/tmp/codex-shared-source-library.j1l066/private/knowledge-sources/ka-src-0007/`
- 正式项目 private：`/Users/aik/Desktop/投放agent/private/knowledge-sources/ka-src-0007/`
- manifest SHA-256：`42ca801ea1e2dfb0bd86f37db89d1bfdade75110af62d995c1e05582a3d35723`
- canonical archive SHA-256：`5964328f906ba388629d705c146488409f58167b776372f28eda96703d61f604`
- 状态：E1 / `public` / `review_pending` / `pending` / `not_ready`

#### 4. Git、private 与凭证边界

进入 Git：catalog 元数据、全量评估、381 条无凭证机器能力矩阵、聚合统计、检索/发布说明、可复现抓取与矩阵生成脚本、测试、状态台账和本审查单。

只在 ignored private：当前/旧版完整目录、672 个逐页详情 JSON、29 个官方青雀富文本 HTML、逐文档/endpoint inventory、失败清单、708 条逐文件 hash manifest 和 canonical zip。完整网页快照不提交 Git，也不默认发布产品知识库。

凭证清理：共清除 374 处 header 示例、322 处 token/secret assignment、4 处敏感参数示例值；保留字段名、接口说明和结构。catalog validator 对 708 个子文件逐项复扫通过。worktree 与正式项目 private 目录 `diff -qr` 无差异；`git ls-files private/knowledge-sources` 无输出。

#### 5. 已确认事实、合理推断与未证实

已确认事实：

- 当前新版目录有 15 个一级分组、385 个文档挂载、381 个唯一 `documentId`；菜单标 356 个 API、29 个富文本。
- 旧版目录有 17 个一级分组、296 个挂载、291 个唯一 `documentId`；672/672 个详情抓取成功，29/29 个当前外链富文本抓取成功。
- 当前提取 352 个唯一 endpoint；旧版提取 276 条 endpoint 记录、271 个唯一值；239 个与当前路径完全相同，32 个只在旧版出现。
- 本机 CLI 归档 SHA=`fe348e82...d332`；zip 文件名标 v1.0.2，代码 `__version__` 为 1.2.1。
- CLI base URL 指向快手 MAPI；声明 25 个 endpoint 常量，23 个存在源码调用链，2 个只有常量未暴露命令。
- 25/25 个 CLI endpoint 均能与当前官方目录精确匹配。因此 CLI 底层确实使用 MAPI，但只是官方能力的子集。
- README 宣称存在 `raw` 命令，实际 `__main__.py` 没有注册；不能以 README 说明推断可任意透传。
- 对当前目录的静态覆盖为：23 `wrapped_reachable`、2 `declared_not_exposed`、327 `not_wrapped`、29 富文本 `not_applicable`。

合理推断（待审查）：

- 奇航继续承担一期既定数据主链路；MAPI 作为快手官方能力上限、执行/结构/素材/回查底座，两者不是替代关系。
- CLI 缺失端点可以按 `constants + client + command` 模式按需补壳；但不应为追求数量一次性封装 327 条。
- 机器初筛把 381 条分为 59 一期候选、249 后续条件候选、73 参考或排除，能作为业务 owner/架构二次裁剪的起点。
- 一期最值得补的是 campaign update/status、unit budget、creative update/status/review、四层实时 report；其余按明确产品场景进入后续。

未证实：

- 本公司 AppID/广告账户实际 scope、白名单和每个 endpoint 的授权状态；矩阵 `required_scope` 暂为 `requires_mapping`。
- CLI 23 个可达端点在当前沙箱代理与测试账户是否全部运行正常。
- MAPI 与奇航在字段、时效、结算口径上的一致性；MAPI 报表不能据此替换奇航。
- 327 个未封装 endpoint 的公司账户可用性、当前生产路径和实际业务价值。
- 官方冲突项的生产真实方法/上限；媒体原生自动化对实验流量和共享学习的影响。
- 非公开或白名单实验能力是否存在；公开目录仍不足以证明严格 A/B 分流能力。

#### 6. 对产品的处置建议

建议融合进下一版 PRD/Contract **候选**，本批不直接修改：

- Capability Registry 支持 `official_document_id/version/updated_at/endpoint/scope/whitelist/risk/limit/cli_status/verification_state`；
- 运行状态明确拆分 `documented → authorized → wrapped → verified`；
- 59 条一期候选由业务 owner 二次裁剪，只把批准项注册为运行能力；
- 变更集继续执行预览、确认、幂等、回查和 T+1 回收，不因新增 CLI 壳降低写操作门槛；
- 实验对象明确媒体自动化开关冻结策略。

建议只进入知识库/研发证据：

- 672 篇新旧版文档的受控索引、版本兼容与 deprecated 识别；
- 381 条能力矩阵、CLI 25 条静态覆盖、README/raw 和版本标签冲突；
- 249 条后续条件候选，在发生明确需求时检索，不进入默认一期范围；
- scope/QPM/错误码/频控/创建限制和官方冲突证据。

建议驳回：

- 用 MAPI 替代奇航一期主数据链路；
- 一次性封装全部 327 个缺失 endpoint；
- 代理商开户/充值/转账/退款、共享钱包资金写进入当前 KA 产品；
- CRM 外呼、企微成员、第三方支付进入当前产品或 Agent 工具；
- 10 个已下线/旧版能力新增封装；
- 因 `documented` 就宣称 `authorized/verified`；
- Agent 绕过确认门直接改预算、出价、状态或删除对象；
- 把媒体原生智能托管或多计划构造宣称为我方严格 AI 实验闭环。

#### 7. 产品知识库发布建议

当前**不允许发布到产品知识库**：catalog 保持 `review_pending/not_ready`。请 arch 先审查来源完整性、机器分类边界、CLI 静态审计和 59 条一期候选的二次裁剪方式。

若后续批准：建议发布无凭证结构化摘要、381 条机器矩阵和官方链接；完整 672 篇网页快照继续受控留在项目 private，不把整站镜像复制为产品正文。产品内 Agent 即使检索到已批准知识，也必须再查运行时 Capability Registry，不能凭知识文档直接执行媒体写操作。

#### 8. 请 arch 审查并回写 ✅/❌

1. 是否接受 `P-KB-008` 替代 `P-KB-007` 的范围描述，并认可同一 `ka-src-0007` revision/hash 更新？
2. 是否批准 672 篇全量快照为 E1 资料、381 条矩阵为未审查分析附件；是否允许升为 `reviewed`？
3. 是否接受 CLI 静态结论：代码 1.2.1、25 常量、23 reachable、2 declared-only、327 未封装、raw 未注册？
4. 是否确认“奇航主读取链路不变，MAPI/CLI 按需补执行、结构、素材和回查能力”？
5. 59 条一期候选是否必须由业务 owner 二次裁剪；素材共享、AI 推荐、广告语推荐是否移出一期？
6. 是否批准优先补 campaign update/status、unit budget、creative update/status/review、四层实时 report 的候选顺序？
7. 谁负责在授权测试账户上做 `authorized/verified` 探针，以及 scope 映射？
8. 是否明确驳回代理商资金、共享钱包、CRM/企微/支付和已下线能力进入当前产品？
9. 381 条矩阵获批后能否作为产品知识库机器附件；完整网页快照是否继续只留项目 private？
10. 是否建立月度或按版本触发的官方目录复抓/hash diff；失败和下线如何通知执行/架构 Agent？
11. 实验模式是否继续默认冻结 `auto_build/auto_adjust/auto_manage`，等待流量与统计专项补证？
12. 审查完成后请回写审查人、时间、逐项结论、可融合项、仅知识项、驳回项、补证清单和产出 SHA；未批准前不要修改冻结 PRD/Contract。

#### 9. 验证

- 本轮功能提交：`2faa8ea`；`git show --stat` 已自查。
- 23/23 Node 测试通过（catalog + 抓取器 + 覆盖生成器）。
- catalog/bundle validator 通过，逐项核验 708 个子文件、manifest、archive hash 与凭证形态。
- 381/381 capability_id 唯一；CLI 25/23/2 汇总与逐条矩阵一致。
- worktree 与正式项目 private `diff -qr` 无差异。
- `git diff --check` 通过；`git ls-files private/knowledge-sources` 无输出。

### P-KB-009 ✅已审（2026-09-04）｜三媒体官方资料扩展、快手 MAPI 独立复审与 AI 实验编排裁决｜research/knowledge（Codex）

- 派活方：资料研究与知识资产 Agent（Codex）
- 日期：2026-08-21
- 状态：待处理
- 关系：本条更正 `P-KB-008` 的 CLI/机器分类口径，并新增 `ka-src-0008/0009`；不删除历史回执。

#### 1. 角色注册与修改边界

我是 **KA 投放经营平台“资料研究与知识资产 Agent”**，负责把内部/外部资料建设为“项目共享资料库 → 分析审查 → 批准后发布产品知识库”的同源资产。本角色注册提议已在 `docs/relay/README.md`/`P-KB-001`；本条不假设审查 Agent 认识我。

- 可改：ignored 的 `private/knowledge-sources/`、`docs/knowledge/`、资料抓取/分类/校验脚本、自己的状态/台账和审查信箱追加项。
- 不可改：冻结 PRD、Contract、前后端生产代码、媒体生产账户、其他角色边界；不替 arch 把研究候选变成产品承诺。
- 本批仅匿名读官网公开文档/公开镜像和本机 CLI 源码；未登录媒体，未取业务 token，未调用广告账户接口，未执行任何媒体写操作。

#### 2. 分支、worktree、基线与提交

- 分支：`codex/shared-source-library`
- 独立 worktree：`/private/tmp/codex-research-kb2`
- 本轮基线：`d540086`（原 worktree 被系统清理后在同分支重建）
- **功能提交 SHA：`b59432c`**
- 上一轮快手功能 SHA：`2faa8ea`；本轮修正其 CLI 方法、版本和机器初筛口径。
- 未修改主工作区 tracked 文件；未修改冻结 PRD/Contract 或生产代码。

#### 3. 资料目录、索引、评估与 storage_ref

共享入口：

- 目录：`docs/knowledge/README.md`
- 机器索引：`docs/knowledge/catalog.jsonl`
- Agent 检索纪律：`docs/knowledge/agent-retrieval-guide.md`
- 产品知识库发布映射：`docs/knowledge/product-kb-publishing.md`
- canonical private root：`/Users/aik/Desktop/投放agent/private/knowledge-sources/`

| document_id | 资料/评估 | storage_ref | manifest SHA-256 | archive SHA-256 | 状态 |
|---|---|---|---|---|---|
| `ka-src-0007` | `docs/knowledge/assessments/ka-src-0007.md` + `docs/knowledge/guides/ka-src-0007-official-ad-knowledge.md` | `private/knowledge-sources/ka-src-0007/source-manifest.json` | `42ca801ea1e2dfb0bd86f37db89d1bfdade75110af62d995c1e05582a3d35723` | `5964328f906ba388629d705c146488409f58167b776372f28eda96703d61f604` | E1/public/review_pending/not_ready |
| `ka-src-0008` | `docs/knowledge/assessments/ka-src-0008.md` | `private/knowledge-sources/ka-src-0008/source-manifest.json` | `d6e3b759505d050ad7d7deefddf42b89fec4a5a2d1fd16f9f205ccff499bf82d` | `c488239ccf946960a82d15da81b5d119813df7f344b42aad003ecc40e2cec82f` | E1/public/review_pending/not_ready |
| `ka-src-0009` | `docs/knowledge/assessments/ka-src-0009.md` | `private/knowledge-sources/ka-src-0009/source-manifest.json` | `149a9865de944af9802f3602b4b9f866ab984e4ee99c8ae2dac0549ed6d2cc67` | `69127e89c9a17a68e96e10fefdb08287cf815e441fd101b83d01c2de88583a02` | E2/public/research/review_pending/not_ready |

机器分析附件：

- `docs/knowledge/datasets/ka-src-0007-capability-coverage.jsonl`
- `docs/knowledge/datasets/ka-src-0007-capability-summary.json`
- `docs/knowledge/datasets/ka-src-0008-product-relevance-summary.json`
- `docs/knowledge/datasets/ka-src-0009-product-relevance-summary.json`

#### 4. 哪些进 Git，哪些只在 private

进入 Git：catalog 元数据、3 篇评估/专题导读、3 份机器摘要/能力矩阵、Agent 检索和发布规则、抓取/分类/校验脚本与测试、状态台账和本审查单。Git 内不包业务凭证或媒体账户数据。

只在 ignored private：

- `ka-src-0007`：381 当前 +291 旧版详情、29 个官方外链富文本 HTML、708 条受 hash 保护归档；早期 31 页首批快照已保留为 `source.initial-snapshot.superseded.md`，`source.md` 只是 canonical 指针。
- `ka-src-0008`：巨量引擎 1103 篇完整详情、菜单树、结构化/正文引用路径索引、manifest 与 zip。
- `ka-src-0009`：腾讯广告镜像 315 页 Markdown、endpoint 索引、320 个官方原站引用 URL、冲突清单、manifest 与 zip。

三者的 private 工作副本和 canonical root 已校验 hash/diff；`git ls-files private/knowledge-sources` 无输出。

#### 5. 已确认事实、合理推断与未证实

已确认事实：

- 快手：抓取日官网未登录可访问 DSP 当前目录 15 一级分组/385 挂载/381 唯一文档，旧版 17/296/291；672/672 详情、29/29 外链富文本成功，708 条 manifest/hash 复算通过。这只是“当日公开 DSP 菜单快照”，不是快手全站/登录后/白名单绝对全量。
- 快手 CLI：25 个常量路径与当前官方目录精确匹配；23 个有注册命令路径，21 个 HTTP 方法对齐，`fund/get` 和 `fund/daily_flows` 官方为 GET 但 CLI 固定 POST，2 个只定义常量，运行验证为 0。版本是 zip 1.0.2 / PKG-INFO 1.2.0 / 代码与 UA 1.2.1 三方冲突。
- 巨量：官网未登录公开 `BUSINESS + LASTEST_UPDATES` 树去重后为 29 标签节点、2990 挂载、1103 唯一文档，1103/1103 详情成功，815 篇有结构化主接口，715 个结构化唯一路径，失败 0；标签 29 是预期导航节点异常。Scope 清单正文列出 AB 实验 create/update/list/info 4 条路径，但它们不是该页的结构化主接口。
- 腾讯：公开 Apifox 索引 315=8 指南+307 API，315/315 成功；307 篇为 297 个镜像原始唯一路径，纠正已知冲突后 298。镜像 306 篇存在 Query 参数被 OpenAPI 标为 header 的转换错位，server 也含错域名/占位域名；“运营推荐弹幕”路径与腾讯官方原站冲突，已保留 observed/corrected 双值。
- 腾讯 split-test：镜像有 add/update/delete/get 四页；创建绑 2–5 广告组，正常运行时不允许更新绑定广告组，全量后不再分流；正常/暂停时删除实验可连带删除关联广告。

合理推断（待 arch/业务/统计审查）：

- 巨量与腾讯文档可用于跨渠道 canonical object model、Capability Registry 和未来 adapter 设计，但不应改变“一期只快手”。
- AI 实验编排值得进 P2；媒体原生实验只是 provider adapter，我方仍需假设、对照/变体、流量、主指标、guardrail、样本和统计决策的统一治理。
- 实验设计与实时自动调控不是绝对矛盾；但未受控调价/预算/定向/媒体自动优化会污染实验。建议实验期间默认冻结未声明变更，只允许预注册 guardrail 中止，并标记数据截断/污染。
- 当前 KA 产品仍应定位为“可控自治灰盒”：AI 可做诊断、策略/实验草案和低风险白名单自动化，写操作仍受变更集、确认门、回查和效果回收约束。

未证实：

- 三媒体任一当前公司 App/账户的 OAuth/Scope/白名单/实际可调用性；所有运行能力仍是 `unknown`。
- 巨量 AB 4 路径的当前请求/响应 Contract，以及随机化、分层、显著性和污染检测。
- 腾讯 Apifox 项目 3515798 的所有者是否为腾讯官方；因此不写“官方托管”，不允许其 OpenAPI 生成 Contract/SDK。
- 腾讯 split-test 的随机分流、可配比例、统计方法、`smart_expand` 灰度范围和当前账户权限。
- 快手 59/249/73 分类中每一条的业务价值和风险；已确认存在“上传被误标删除”“授权查询被误标写操作”等机器初筛假阳性。

#### 6. 对产品的处置建议

建议进入 PRD/Contract **后续候选**（本批不改冻结文档）：

1. Capability Registry 补 provider/media/document/version/scope/whitelist/authorization/wrapped/method-or-contract-aligned/runtime-verified/product-enabled 状态。
2. P2 实验编排建统一 experiment/variant/control/traffic/metric/guardrail/statistical decision 状态机，媒体原生 AB 只作 adapter。
3. 实验运行锁与变更治理：默认冻结未声明调控，guardrail 中止要标数据截断/污染。
4. 官方/镜像来源优先级、`source_conflict`、`contract_status`、`source_authority` 的知识发布治理。

建议只进入知识库/研发证据：

- 快手 672 篇公开 DSP 当前/旧版快照和 381 条未逐条审批矩阵；只能按具体 documentId/endpoint 引用。
- 巨量 1103 篇动态快照中的对象、Scope、限制、术语与接口索引；hidden/非当前 KA 产品线默认不召回。
- 腾讯 315 页 E2 镜像只作官方原站定位和字段线索；实现前必须回 `developers.e.qq.com` 复核。
- 快手/巨量/腾讯官方对象、授权、报表、实验和写操作语义的专题导读。

建议驳回：

- 因公开文档存在就宣称账户已授权/已封装/已可用。
- 一期同时开发巨量/腾讯，或为追求“接口全量”一次性封装数百路径。
- 使用腾讯镜像 OpenAPI 直接生成 SDK/Contract。
- 让 Agent 绕过变更集/确认门自动调价、调预算、关停或删除对象；腾讯实验 delete 尤其禁止无确认执行。
- 代理商充值/转账/退款/共享钱包写操作、CRM/企微/第三方支付和已下线/历史能力进入当前 KA 默认工具集。
- 把媒体“智能”品牌或原生自动优化字段当作我方黑盒 AI 全闭环已实现证据。

#### 7. 产品知识库发布建议

当前**不允许发布**：`ka-src-0007/0008/0009` 均保持 `review_pending/not_ready`。

- `ka-src-0007`：审查通过后可考虑发布无凭证结构化摘要/官方链接；381 条矩阵必须继续显示“机器初筛、运行未验证”。
- `ka-src-0008`：先由 arch 决定哪些巨量产品线可进默认召回；不建议全量 1103 页直接进产品 Agent 默认知识。
- `ka-src-0009`：镜像归属和 Contract 错误未解决，当前只建议项目研发检索，不建议发布为正式产品口径。
- 即使后续发布，产品内 Agent 也必须查运行时 Capability Registry，不得凭知识文档直接执行媒体写操作。

#### 8. 请 arch/security/业务审查并回写 ✅/❌

1. 是否接受快手独立复审更正：25 常量/23 命令路径/21 方法对齐/2 方法冲突/2 只定义/0 运行验证，并用本条覆盖 `P-KB-008` 的 `wrapped_reachable`“可用”暗示？
2. 是否批准快手 672 篇作为“抓取日公开 DSP 菜单快照” E1 研发证据，但将 381 条能力矩阵保持未逐条批准？
3. 是否批准巨量 1103 篇快照为 E1 研发检索证据，并同意区分 `structured_endpoint` 与 `referenced_endpoint_candidates`？
4. 是否同意腾讯资产保持 E2/research、镜像归属待补证、OpenAPI 禁止 SDK/Contract 生成？
5. 是否将 AI 实验编排放入 P2，并将巨量 AB/腾讯 split-test 仅视为 provider-native adapter 候选？
6. 是否接受实验与实时调控兼容规则：实验期间默认冻结未声明变更，只允许预注册 guardrail 中止，截断/污染必须入实验事件？
7. 腾讯 split-test delete 是否一律 L3 + Web 明细确认，严禁 Agent 无人确认执行？
8. 是否保持一期只快手，巨量/腾讯 adapter 只在后续路线图且完成 OAuth/Scope/沙箱实证后立项？
9. 是否同意快手 59/249/73、巨量 1103 和腾讯 315 的机器分类都只是发现层，不能整批发布/实现？
10. 产品知识库是否先只发快手/巨量的审查后结构化摘要，腾讯镜像暂留项目研发检索？
11. 腾讯官方原站 320 个引用 URL 中的枚举/专题/公告/附件，是建第二批公开归档，还是仅在开发需求时按需抓取？
12. 请回写审查人/时间、逐项结论、可融合 PRD 候选、仅知识项、驳回项、补证清单、是否允许发布产品知识库及产出 SHA；未批准前不要修改冻结 PRD/Contract。

#### 9. 验证与环境注记

- 本轮功能提交：`b59432c`；`git show --stat` 已自查。
- 本任务 34/34 Node 测试通过（catalog + 快手/巨量/腾讯抓取与分类）。
- catalog/bundle validator 通过；0008/0009 zip 完整性通过；manifest 关键计数和 0007 CLI 23/21/2/2 聚合断言通过。
- 0008/0009 worktree private 与 canonical private `diff -qr` 无差异；`git diff --check` 通过；private 全部命中 `.gitignore`，`git ls-files private/knowledge-sources` 无输出。
- 全仓 `scripts/*.test.mjs` 额外命中与本任务无关的 UI 资产导出测试，因系统数据盘仅余约 137MiB 而 `ENOSPC`；本任务定向测试/校验全通过，未修改 UI 资产代码。

### P-KB-010 ✅已审（2026-09-04）｜产品知识库后续发布要求补充｜research/knowledge（Codex）

- 派活方：资料研究与知识资产 Agent（Codex）
- 日期：2026-08-24
- 状态：待处理
- 关系：补充 `P-KB-009` 的发布方向，不改变其中任何资料的当前审查/发布状态。
- 分支：`codex/shared-source-library`
- 独立 worktree：`/private/tmp/codex-research-kb3`
- 基线：`81f4c2d`
- 功能提交 SHA：`8353898`

#### 1. 产品 owner 新增明确要求

产品 owner 明确：“后面要把我们整理的这些资料上传到知识库。”因此，产品知识库不再只是远期可选目标，而是资料通过审查后的正式发布终点：所有已整理资料进入发布候选队列；达到 `approved/ready` 的版本必须进入后续统一发布任务，不能仅以仓库归档代替产品落库。

#### 2. 不变的发布门与边界

- 当前 `ka-src-0001~0009` 仍为 `review_pending/not_ready`，本条不授权现在上传，也不把未审查材料提升为正式口径。
- 未审查、被驳回、许可不明、存在来源冲突或 ACL 不满足的资料继续只留项目资料库。
- private/confidential 资料发布全文、摘要或受控引用，必须由审查结论和 ACL 决定；进入知识库不能自动扩大可见范围。
- 仓库资料继续是唯一逻辑来源；产品端复用同一 `document_id/revision/content_hash`，禁止手工复制维护第二份漂移正文。
- 本轮只修改 `docs/knowledge/product-kb-publishing.md`、状态、台账和本信箱，不开发知识库前端、导入 API、数据库或产品 Agent 召回，不修改冻结 PRD/Contract/生产代码。

#### 3. 请 arch 审查并纳入后续实现批次

1. 将“approved/ready 资料必须发布到产品知识库 Tab”登记为后续正式交付要求，而不是可选优化项。
2. 后续单独立项统一发布器：生成发布包、幂等 upsert、回读 content/hash/ACL、成功后回写 `published`。
3. 明确 private/confidential 的全文/摘要/引用三种发布策略，以及搜索索引、向量索引、摘要缓存和 Agent 引用的统一 ACL。
4. 明确首批发布清单、审查 owner、失败回滚与资料更新后重新审查机制。
5. 在上述机制完成前，请勿把 `ka-src-0001~0009` 标为 `published`；请在裁决中回写允许发布项、需补证项和实现批次。

#### 4. 验证

- `validate-knowledge-catalog.test.mjs` 17/17 通过，包含生命周期/发布门、私有资料、bundle、巨量和腾讯来源等级校验。
- `git diff --check` 通过；未修改 catalog 正文、资料状态、private canonical 原文、冻结 PRD/Contract 或生产代码。

### P-KB-011 ✅已审（2026-09-04）｜ka-data 内部取数指南入库、产品映射与接入边界裁决｜research/knowledge（Codex）

- 派活方：资料研究与知识资产 Agent（Codex）
- 日期：2026-08-24
- 状态：待处理
- 分支：`codex/shared-source-library`
- 独立 worktree：`/private/tmp/codex-research-kb3`
- 基线：`6f80279`
- 功能提交 SHA：`c50150f`
- 修改边界：只改知识资产、检索规则、测试、自己的状态/台账和本信箱；未改冻结 PRD/Contract、前后端生产代码或媒体账户。

> R1 纠错（2026-08-24，老板已批准）：P-KB-011 早期关于账户双命名空间/mapping 的表述作废。KA 与平台 `account_id` 相同，账户联合键为 `(workspace_id, media, account_id)`，不建立账户 ID 映射表；其他对象 ID 继续待核证。

> R2 当时现状（2026-08-24）：上述三字段键当时尚未同步到数据库 Contract。**R3 现状同步（2026-08-25）**：`schema.sql` 与 migration 005/006 已完成 `(workspace_id, media, account_id)` 账户主键和相关外键同步，并通过真实 PostgreSQL 回归。

#### 1. 资料与存储

- `document_id`：`ka-src-0010`
- 标题：《ka-data 取数指南：接口用法、核心数据与易错口径》
- catalog：`docs/knowledge/catalog.jsonl`
- 独立评估：`docs/knowledge/assessments/ka-src-0010.md`
- `storage_ref`：`private/knowledge-sources/ka-src-0010/source.txt`
- canonical private root：`/Users/aik/Desktop/投放agent/private/knowledge-sources/ka-src-0010/source.txt`
- SHA-256：`7c7265c29cfa31d6bd4c22650f198a4405cb1f0e076c007297205bbe8bef43d2`
- 状态：E3/confidential/`review_pending`/`not_ready`
- 允许角色：product owner、research/knowledge、architecture review、security review；development 和产品内 Agent 不在默认范围。

进入 Git：catalog 元数据、20 项评估、Agent 检索纪律、状态/台账和校验测试。只在 private：含内部运行地址、内部表/工程、人员称谓、真实业务示例和完整 SQL 的原文。凭证扫描为 0；原文只有占位符/环境变量，没有实际 token 值。

#### 2. 事实、资料主张、推断与未证实

已确认事实：

- 原文描述了一个 reader 级只读查询门面、三类数据后端、账户/广告组/素材/商品/BI 转化数据字典、现金/考核/扣量公式、对象 ID 和故障排查；其中账户双 namespace 说法已被 R1 纠正。
- 冻结账户事实：KA 与平台 `account_id` 相同，不建立账户 ID 映射表；R3 已把账户主键与相关外键统一为 `(workspace_id, media, account_id)`。
- `task/product/material/adgroup` 等其他对象 ID 是否一致仍待核证，不能从账户结论顺推。
- 当前冻结 Contract 仍以奇航 `get_data` 为一期数据主链路；产品 API 是结构化语义查询，生产存储设计是 PostgreSQL raw/canonical + workspace ACL。
- 当前仓库没有原文所指服务端实现、产品 adapter、调用日志、reader token 或运行验收；本轮没有调用内部服务。

资料主张但未独立核实：

- 服务拥有完整 Hologres/ODPS/SQLite 数据，SQLite 低延迟且口径对齐；
- 五类 BI 转化已与业务确认表全等；
- reader token、关键词护栏和底层连接构成充分只读保护；
- 文档中的数据范围、表规模、日期范围和公式当前仍有效。

合理推断：

- 若探针成立，ka-data 可作为 BI 转化、素材/商品和跨媒体的补充/对平 provider；不必立即替换奇航。
- media 条件、其他对象 ID 关联、业务日期门槛和截断规则适合转成数据质量检查；账户 ID 不再列入待映射范围。
- 原始 SQL 门面只适合受控数据运维/adapter，不适合直接给普通用户或产品 Agent。

未证实：服务 owner/版本/SLA、reader token 生命周期和 ACL、底层只读性、快照 freshness/血缘、其他对象 ID 一致性与关联键、字段覆盖、现金/考核系数定义、数据许可和同日同户对平结果。

#### 3. 对当前产品的判断

有帮助，但不是“已有产品能力”或“可立即替换的数据底座”。

- 已包含：ETL、raw/canonical、数据健康、账户/广告/任务模型、结构化 query、指标版本化、商品素材方向。
- 部分包含：BI 转化、广告组日级字段、素材/商品表、多渠道、来源血缘和具体数据质量规则。
- 缺失：ka-data adapter、BUC/workspace/resource ACL 映射、字段级 authority/freshness/coverage、其他对象 ID 核证、快照 revision 和运行实证；账户不缺 mapping 层。
- 冲突：任意 SQL vs 结构化 query；共享 reader token vs 多租户 ACL；本地 SQLite vs PostgreSQL 生产存储；固定系数 vs 生效日期版本化；乘/除系数表达可能不是同一口径。

#### 4. 分期建议

- P0：授权 data owner 做只读 health/query 探针、安全复核和少量脱敏样本的同日同户对平；不把 token 交给本项目或写入资料库。
- P0：确认奇航/ka-data/业务确认表在消耗、转化、赔付、现金、考核上的字段级 SSOT 与差异处理。
- P0：账户已采用 `(workspace_id, media, account_id)`；继续分别核证 task/product/material/adgroup 等其他对象 ID 与关联键。
- P1：探针通过后，把 ka-data 作为 Worker 内受控 adapter/补充源/对平源；只接批准模板或视图，不接 Agent 原始 SQL，先快手且不替换奇航主链路。
- P2：素材/商品/内容标签和多渠道，以许可、ACL、字段覆盖和数据质量为前置。
- 不采用：普通用户/Agent 任意 SQL、共享 token 台账、临时地址写进 Contract、SQLite 作生产主库、硬编码系数、因资料写“全媒体”而扩一期。

#### 5. 产品知识库发布建议

当前不允许发布。若后续审查批准：

- 优先发布派生的字段/粒度字典、经 data owner 批准的公式、对象 ID 边界/易错口径和排障摘要；
- 不发布原始运行地址、内部表全名、人员、真实业务样例、token 获取/台账或原始 SQL 手册；
- 派生知识应另分配 document_id/hash，继承 confidential/restricted ACL，并明确 source revision、reviewed_by/reviewed_at；
- 产品 Agent 只能检索批准后的语义知识，不能据此生成任意 SQL 或索取凭证。

#### 6. 请 arch/security/data owner 回写 ✅/❌

1. 谁是正式 data owner；资料版本、服务环境和 SLA 是什么？
2. 是否批准把 ka-data 作为一期补充/对平 provider 候选，而非立即替换奇航？
3. 是否批准第一批只读探针；测试身份、样本、指标和验收人由谁提供？
4. reader token 的数据范围、签发/撤销、审计和 BUC/workspace 映射是否合规？
5. SQL 护栏是否需要 security 绕过测试、底层只读角色和 allowlisted views？
6. 奇航、ka-data、MAPI、业务确认表的字段级 SSOT 如何裁决？
7. 现金公式的固定系数与版本化 `channel_coefficients` 是否同一定义？
8. `task/product/material/adgroup` 等其他对象 ID 是否一致；若不一致，各对象的关联键与 coverage 如何表达？账户不建立 mapping。
9. SQLite 快照生成链、data_as_of、revision、保留期和失败补偿是否可提供？
10. 素材/商品/URL/内容标签允许哪些角色访问、导出和进入产品知识库？
11. 探针通过后 adapter 进入 P1 还是 P2；是否继续保持一期只快手？
12. 产品知识库允许发布哪些派生内容；原文是否永久只留 private？

#### 7. 验证与边界说明

- `validate-knowledge-catalog.test.mjs` 18/18 通过。
- 10 条 catalog JSONL 结构/枚举/生命周期门有效；`ka-src-0010` 原文 hash 与 catalog 一致，原文/评估凭证形态 0。
- worktree 与 canonical private 原文 hash 一致；private 命中 `.gitignore` 且未被 Git 跟踪；`git diff --check` 通过。
- 新 worktree 未复制既有 0005/0007/0008/0009 完整大包，因此本轮没有重跑依赖全部历史 private bundle 的全库 repository validator；既有 0001~0009 未修改。本轮对 0010 做了定向 hash/凭证/权限/状态校验。
- 未访问内部服务、未申请或读取 reader token、未运行 SQL、未修改冻结 PRD/Contract/生产代码。

### P-KB-012 ✅已审（2026-09-04）｜ka-src-0010 账户 ID 假设 R1 纠错回执｜research/knowledge（Codex）

> R2 root 审计修复（2026-08-24）：已将三字段键从当时的 Contract 现状中区分出来。**R3 现状同步（2026-08-25）**：数据库 Contract 与 migration 005/006 已完成三字段账户键同步。老板已拍板事实不再交 arch 重新决策，本条只保留后续复审席位。

- 派活方：资料研究与知识资产 Agent（Codex）
- 日期：2026-08-24
- 状态：R2 待复审
- 分支：`codex/shared-source-library`
- 独立 worktree：`/private/tmp/codex-research-kb3`
- 基线：`3933a1c`
- 功能提交 SHA：`eb10676`
- 修改边界：只纠正 `ka-src-0010` 的账户 ID 假设及其评估、检索、审查说明和回归断言；未扩展资料、未修改原文/catalog/冻结 PRD/Contract/生产代码、未发布产品知识库。

#### 1. 已批准并写入知识资产层的纠正事实

- KA 与平台使用相同的 `account_id`。
- 统一账户键为 `(workspace_id, media, account_id)`；R3 已于 2026-08-25 同步数据库 Contract 与 migration 005/006，并通过真实 PostgreSQL 回归。
- 不建立账户 ID 双命名空间映射表。
- 旧资料/旧评估中的“账户双 namespace”只能作为已被实证否定的历史来源主张保留，不能再作为产品事实、待补能力或架构候选。

#### 2. 没有被本结论覆盖的事项

- `task_id/product_id/material_id/adgroup_id` 等其他对象 ID 是否一致仍为 `unresolved`，必须逐对象取证，不能从账户结论顺推。
- P-KB-011 的服务 owner、ACL、底层只读性、数据血缘、公式、数据许可、同日同户对平和 adapter 分期等问题仍待 arch/security/data owner 裁决。
- 10 条 catalog 均继续为 `review_pending` + `pending` + `not_ready`；本回执不代表任何 source owner、业务、安全或架构批准。

#### 3. 本次进入 Git 与未变内容

- 进入 Git：`docs/decisions/2026-08-24-账户ID统一键纠错.md`、`docs/knowledge/assessments/ka-src-0010.md`、`docs/knowledge/agent-retrieval-guide.md`、P-KB-011 纠正标注及回归断言。
- 未变：`docs/knowledge/catalog.jsonl`、`private/knowledge-sources/ka-src-0010/source.txt`、冻结 PRD/Contract、前后端生产代码。
- 原文 `storage_ref` 仍为 `private/knowledge-sources/ka-src-0010/source.txt`，SHA-256 仍为 `7c7265c29cfa31d6bd4c22650f198a4405cb1f0e076c007297205bbe8bef43d2`。

#### 4. 验证结果

- `node --test scripts/validate-knowledge-catalog.test.mjs`：18/18 通过，新增账户联合键、禁止账户映射表和其他对象未决的回归断言。
- `node scripts/validate-knowledge-catalog.mjs`：全库通过；本次已把 canonical private 资料复制到 ignored worktree 私有区后复核全部 bundle/hash。
- catalog 全量状态断言：全部 `review_pending/pending/not_ready`。
- canonical 与 worktree 的 `ka-src-0010` 原文 hash 一致；原文和评估凭证形态均为 0。
- `private/knowledge-sources/` 命中 `.gitignore`，Git 跟踪文件数为 0；`git diff --check` 通过。

#### 5. 请 Claude/arch 复审同步情况（不重新开放老板已拍板事实）

1. 复核 P-KB-011 及知识资产是否已清除把账户双命名空间/映射需求当作有效方案的残留；无需重新裁决该事实。
2. 复核 R3 已完成的账户相关主键/外键同步与知识资产当前表述是否一致；不得把 8 月 24 日“待同步”快照继续当现状。
3. 复核 `task/product/material/adgroup` 等其他对象 ID 是否继续保持逐项 `unresolved`，且没有预建通用映射层。
4. 复核 `ka-src-0010` 继续保持 `review_pending/not_ready`，等待 P-KB-011 其余证据；本条不授权发布产品知识库。

---

### P-033 ⏳B23-A 多租户授权内核与 B23-C 只读 Gap 待审计｜be（Codex）

- 分支：`codex/b23-auth-core`
- 基线：`codex/integration-control@68da060`
- 计划：`5a0dcbd`
- migration：`eba1fa7`
- Domain：`c39eeb4`
- Repository/Worker Service：`48b6d6d`
- 代码终态：`72228b4`
- 质量与交接：`fa84d22`
- 质量：`docs/evidence/B23-A-代码质量报告.md`
- Gap matrix：`docs/evidence/B23-C-奇航只读链Gap矩阵.md`
- 状态：implemented / codex self-checked / root integration pending / Claude review reserved

**本批实现**：

1. 四表 migration 保留 workspace-local users，用复合 FK 绑定 membership→user、grant→账户三字段键。
2. Worker 明文 session token 只在内存中即时 SHA-256；DB Repository 只接受 hash，不选择或返回
   provider subject、奇航 userId、Secret ref、token hash。
3. Domain 对 expired/revoked/inactive/missing/mismatched/duplicate 全部 fail closed；无 grant 是
   approved empty scope，不是 workspace 全权。
4. 同 identity 双 workspace、跨 workspace/跨 media 同 account ID、跨 workspace user FK、撤销和
   过期均由真实 PostgreSQL 验证。

**质量真相**：Domain 433、DB 107、Worker 453 passed，另有 2 项既有 opt-in 集成测试 skipped；
三包 test/typecheck/lint/audit、coverage 和真实 PG migration/repository 全绿，0 vulnerabilities。
代码终态不含前端与媒体写改动。

**请重点审查**：session token 的正式 mint/rotation/cookie/CSRF；membership 角色与账户 access level
对 API/Capability 的映射；`ON DELETE RESTRICT` 运维生命周期；B23-B HTTP composition；首次内网
identity/workspace/user/grant seed 与审计。

**关键未完成**：B23-A 还不是登录 E2E。此处原记账户主表同步缺口已由后续 B23-C1/P-034 关闭；
仍缺普通业务调度、`/api/v1/query`、任务/账户/工作项列表 API 和严格 DTO；详见 B23-C。未合并、未部署、
未使用真实 BUC/session/奇航账户，所有媒体写继续关闭。

---

### P-034 ⏳B23-C1 奇航账户主表同步待审计｜be（Codex）

- 分支：`codex/b23-c1-account-sync`
- 基线：`codex/integration-control@0775a13`
- 计划：`e3e8148`
- metadata Adapter：`bdc37cc`
- DB 原子同步：`20636af`
- Full/Backfill/Runtime 接线：`0807cd4`
- 真实 PG 纵切片：`c1e2600`
- 自审分页修复/代码终态：`ec4934a`
- 质量：`docs/evidence/B23-C1-奇航账户主表同步质量报告.md`
- 状态：implemented / local PostgreSQL verified / Codex self-checked / root integration pending / Claude review reserved

**实现边界**：奇航 `resource=account` 只从受信任务取 workspace/media，只接收
`account_id/account_name/status`；每个非空分页先验 pagination 和整页 tuple，再用短事务 upsert
`accounts`并写同页 Raw。失败页 0 写入，前页可重放，未完成不派 canonical/fanout。

**质量真相**：DB 112、Worker 467 tests passed，2 项既有 opt-in skipped；两包 typecheck/lint/audit、
coverage 与真实 PostgreSQL 全绿。纵切片的奇航是 fake port，只证明代码+真 PG，不代表内网真源已联通。

**请重点审计**：上游 metadata 精确字段允许集；每页事务与跨页恢复语义；Raw append-only
重放对 canonical 取最新行的影响；正式 scheduler 如何从 approvedAuthContext 构造首次/周期 job。

**仍未完成**：普通 ETL scheduler/入队、session HTTP composition、`POST /api/v1/query`、
`GET /tasks`、`GET /accounts`、`GET /work-items` 列表、真实奇航联调、内网部署。媒体写继续关闭。

---

### P-035 ⏳TASK-LIST-001 任务列表只读纵切片待审计｜be（Codex）

- 分支：`codex/task-list-001-backend`
- 基线：`codex/integration-control@f2adad3`
- 计划：`245b8ae`
- Domain：`01080a0`
- 真实 PG Repository：`796183e`
- Worker Service：`204b4c1`
- HTTP/fixtures：`d38f9ec`
- 代码终态：`891372d`
- 质量：`docs/evidence/TASK-LIST-001-后端质量报告.md`
- 状态：implemented / local PostgreSQL verified / Codex self-checked / root integration pending / Claude review reserved

**实现边界**：只读 `GET /api/v1/tasks`；strict query/response、上海 03:00 业务日、稳定分页、
同一 RR/RO 快照、考核价生效版本、tuple-scope 账户/工作项/指标、Domain pacing、稳定错误与
ready/empty/partial/stale fixtures。没有前端改动，没有任务或媒体写路由。

**质量真相**：Domain 451、DB 120、Worker 492 默认 tests passed，2 项既有外部凭证集成测试
skipped；三包 typecheck/lint/audit、coverage 与真实 PostgreSQL 全绿。HTTP 覆盖
401/403/400/502/503/504/500、非法状态、未知 query、requestId 和 16MB fail-closed。

**请重点审查**：workspace 内任务 metadata 可见但账户派生事实按 grant 隐藏的权限语义；
无账户 tuple 工作项默认不计入摘要；coverage 以筛选全集、freshness 以返回页事实表达；
正式 BFF/session 是否能只从 approvedAuthContext 注入 headers。

**仍未完成**：浏览器 `/api/internal/tasks` 与页面整合、正式 BUC/session E2E、真实奇航任务源
网络/身份 trace、内网部署。所有任务创建/编辑/考核价/账户分配及媒体写继续关闭。


---

## 主工作树历史条目回收（2026-08-19～08-25 写于 fe/f001；编号 P-005～P-008 与 root 分支复用冲突，此处原文保留、以「批次名+SHA」定位，不按编号引用）

### P-005 B1b 回灌设计修正（老板已批准）｜be（Codex）

R-008 原文有两处按字面实现会损害可靠性，老板已批准 Codex 按修正版实施，请审查时以本条为准：

1. **历史回灌不复用现有 `etl_full`**：现有 full 每次会查账户分页、D-1 离线及连续 7 天实时；拆 90 个 full 会造成重复账户发现和约 630 日实时查询。改为 `backfill_historical` 协调器一次发现账户，扇出确定性 `backfill_day` 子 job；每个子 job 只查目标日 `account_offline`。
2. **优先级修正**：现有 `ORDER BY priority ASC` 表示数字越小越优先。采用 `etl_incr=1`、`rule_scan=3`、`backfill_day=9`，不采用 R-008 原文 `backfill=1/etl_incr=5`，避免 90 天回灌压住实时取数。
3. **可靠执行补强**：日任务独立重试、失败日不阻塞其他日期；用确定性 job UUID 防 fan-out/阶段衔接重复入队；补 lease heartbeat，避免奇航请求超过 60 秒时被第二 Worker 重复领取；启动时仍回收超 10 分钟陈旧 lease。
4. **阶段链路**：backfill raw → canonical 聚合 → data quality；总量对账基于每账户/日/resource 最新 raw 快照，不能直接累加重试产生的重复 raw 行。
5. **边界**：不新增未冻结业务表；回灌日状态使用 `jobs.payload(backfillId, ds)` + `backfill_jobs.cursor_date/status`，失败详情由 jobs/etl_runs 留痕。

Codex 将在 `be/b1b` 实现并交最终 SHA；如 arch 发现契约冲突，请在本条下裁决，不要让实现退回字面复用 `etl_full`。

### P-006 ✅ B1b 最终交付待审计｜be（Codex）

- 分支：`be/b1b`
- 最终审查 SHA：`50e301454af44e60028fc9f904abb159031df2bd`
- 基线：B1a `f98952f8cf1daae126e22c431052d688644237c9`
- 已完成：低优先级 90 天回灌协调器 + 独立单日 job、确定性 UUID 幂等入队、lease heartbeat/陈旧恢复、最高连续终态游标、canonical `etl_runs` 留痕与 quality 阶段衔接。
- 已完成三类对平：最新 offline raw 总量对账（0.1% 容差）、`real_cpa > 5 × assessment_price_snapshot` 异常标记、活跃账户连续两日缺数告警；业务检查失败不回滚 canonical，同日失败项合并一条 outbound。
- 修正的可靠性点：历史基线先剔除 0 消耗再取最近 14 个有效日；backfill 进度仅在子 job 真正 `markDone` 后推进；canonical/quality 拒绝 workspace 与 payload 不一致。
- PostgreSQL 真实冒烟（脱敏假数据）：10 账户 × 90 天 = 900 canonical；270/270 质量检查通过；0 failed/blocked job；180 etl_runs done；backfill cursor=`2026-08-18`。
- 证据：`docs/evidence/B1b-90天回灌日志.txt`、`docs/evidence/B1b-90天回灌.png`、`scripts/b1b-90d-smoke.ts`。
- 全量门禁：88 tests；行覆盖率 domain 93.39% / db 85.24% / worker 84.75% / gateway 86.62%；四包 typecheck/lint 全绿；四包 npm audit 均 0 vulnerabilities；静态安全审查 0 Critical/High。
- 审查边界：以 P-005 修正方案为准；本次是本地 PG + 程序生成假数据，不代表真实奇航接口联调完成，真联调仍属 B7。

**arch 待办**：按 R-008 + P-005 逐项 diff 审计，并将 B1b 最终状态补记到工作台账。


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

### P-007 ✅ B1c 语义查询内核交付待审计｜be（Codex）

- 分支：`be/b1c`
- 功能审查 SHA：`997e4d8`；最终分支 SHA：`a699279`（其后仅无语义尾空行清理与交付留痕）
- 基线：B1b `50e301454af44e60028fc9f904abb159031df2bd`
- 已完成：PostgreSQL `SemanticQueryRepository`，支持 table、summary、trend、dimension、health；dimension 当前只开放数据库能可靠表达的 account/task/biz。
- 正确性：所有业务查询显式 workspace 隔离；筛选值参数化；排序和维度 SQL 白名单；table 保持一户一日一行并以数组关联任务；汇总比率按总分子/总分母计算；日期显式输出 `YYYY-MM-DD` 防时区漂移；任务/业务维度发现同账户同日多任务时抛 `AmbiguousTaskMappingError`，禁止静默双计。
- 数据健康：返回 canonical 行数、范围账户数、预期/缺失账户日、raw resource 最新时间、ETL 状态和质量检查计数；不提前发明“健康分”或覆盖率产品口径。
- 门禁：新增 13 个 PostgreSQL 测试；全仓 101 tests；覆盖率 domain 93.39% / db 89.71% / worker 84.75% / gateway 86.62%；四包 typecheck/lint 全绿；Critical/High 0。报告：`docs/evidence/B1c-代码质量报告.md`。
- 明确未做：未接 `apps/web` API；未实现 `tier`；未伪造 `agent_type/resource_position/bid_tool/is_ubp/deduction_range`。

**arch 待裁决/修约（不阻塞本批内核）**：

1. `api.md` 标题写 query_type 五类，但枚举实际有六类且 `tier` 未定义；请冻结类型集合、精确 DTO、summary 对比期和 health 展示口径。
2. `task_accounts UNIQUE(task_id, account_id, valid_from)` 缺 `workspace_id`，实测可造成跨租户同外部 ID 冲突，与契约顶部“外部 ID 唯一键必须含 workspace”纪律矛盾；请在下一契约/迁移补 `(workspace_id, task_id, account_id, valid_from)`。
3. 版位、出价工具、UBP、抵扣区间等维度当前 canonical 无可靠字段；请先指定数据源与落库字段，再开放 API 枚举。
4. 同账户同日多任务的业务分摊规则尚未冻结；当前实现选择显式失败。若产品要分摊/主归属，请由业务与 arch 给确定规则。
5. 部门级真实数据量上线前，对日期聚合跑 `EXPLAIN ANALYZE`，再裁决是否补 `(workspace_id, ds)` 等索引。

**arch 待办**：上线后按本条逐项 diff 审计；当前不要求老板等待，Codex 已完成所有无需审查方的实现。

---

### P-008 TASK-LIST-001 任务列表 DTO 冻结请求｜fe（Codex）

- 提出方：唯一前端实现线
- 日期：2026-08-25
- 背景：老板要求在工作台候选继续待视觉签字的同时，推进下一批“投放任务”。`codex/integration-control@0775a13` 已合入 B23-A 多租户授权内核，但 `GET /api/v1/tasks` 仍只有端点级描述，没有可供前端接入的 list DTO、筛选、分页、partial/stale 和错误状态。
- 需求全文：`docs/frontend/takeover/2026-08-25-task-list-contract-request.md`（位于 `codex/frontend-takeover` 隔离工作树，当前视觉候选未提交；如需固定副本可由 root 按此条内容落 Contract 设计记录）。
- 请冻结：浏览器 BFF 路由；字段 Schema；生命周期 `preparing/active/ended`；负责人/周期/异常筛选；稳定排序与分页；考核价/目标/实际/pacing 的只读结果；工作项摘要；fresh/partial/stale；401/403/400/502/503/504/500 稳定错误和 requestId。
- 安全边界：浏览器不提交 `workspaceId/userId/role/accountIds`；普通任务页不暴露 `ka_data/platform/reconcile`；pacing/CPA/Gap/达成率/预测均不得由前端计算；任务 ID 视为 opaque；没有写 Contract 前创建、编辑、改考核价和执行全部 disabled。
- 当前前端候选：路由 `/tasks`，只使用脱敏 fixture 和明确不可用态；等待 root DTO 后才接 BFF。
- 状态：待处理


---

## 2026-09-04 arch 接回裁决（Claude 审查 Agent 复位；root Codex 审查会话退役）

> 老板 2026-09-04 拍板：审查/契约/整合回 Claude arch；前端=新开 Claude 会话；后端=Codex；内网联调=OS agent。root 会话不再冻结契约、不再派活。
> main 已 fast-forward 到 `codex/integration-control@d121273`，打 tag `v0.2-unaudited-baseline`。P-004～P-035 与 P-KB-001～012 **逐条审计从此 tag 起**，结论按各条原标题下追加 ✅/❌。

### 一、B1-B8 自审 8 个待裁 P0 ——全部裁决完毕（契约 v1.2，SHA 见台账 #139）

| P0 | 裁决 | 落在哪 | 谁实现 |
|---|---|---|---|
| P0-02 账户主表同步 | ✅ 已由 B23-C1（P-034）关闭 | — | arch 复验 |
| P0-11 跨租户 ETL 校验 | ✅ 已由 B23-C2 scope guard + `assertAccountRowsWithinRequestedScope` 关闭 | — | arch 复验 |
| P0-03 回填 DAG 终态 | `backfill_jobs.status` 五态 `running|raw_done|canonical_done|done|failed` + `failed_stage`；done 只在三阶段全终态后置 | schema.sql | Codex R-009 |
| P0-04 缺数=0 | **老板裁：不写 0，显 "−"**。全指标 `{value, availability: available|missing|error}`；只有来源明确返回的 0 才显 0；SQL 禁 `COALESCE(...,0)` | metrics.md「缺数三态」 | Codex R-009（`semantic-query-metrics.ts`/`report-facts-source.ts` 起） |
| P0-05 一账户日多任务 | **老板裁：一账户一任务**。`task_accounts` 加 gist 区间排斥；重叠写入 409 `TASK_ACCOUNT_OVERLAP`；不做分摊 | schema.sql + metrics.md | Codex R-009 |
| P0-07 workflow 单执行器 | `workflow_runs.executor_token/executor_lease_until` fencing + 新表 `workflow_effects(run,node,attempt,phase) UNIQUE` 作副作用 outbox | schema.sql | Codex R-009 |
| P0-12 钉钉先 ACK 后处理 | `inbound_events` 加 `lease_until/attempts/max_attempts/last_error/processed_at`；**先 INSERT 成功再 ACK**；lease 过期可重领 | schema.sql | Codex R-009 |
| P0-13 changeset 权限矩阵 | `changesets.(workspace_id,initiator)` 与 `(workspace_id,credential_owner_user_id)` 复合 FK→users；`changeset_items` 自带账户三键+FK | schema.sql | Codex R-009 |

### 二、数据源绑定空间（老板 2026-09-04；替代 root 的"管理员诊断"方案与前端三态切换器）

- personal 空间 → `platform`（奇航，本人授权户）；team 空间 → `ka_data`（全渠道，团队只读）。**切空间 = 切源**。
- 普通页面移除 `KA Data 权威版/自建平台版/双源对账` 三 tab 与 `data_view` URL 参数；`reconcile` 只留治理后台、entitlement allowlist。
- 落 api.md DATA-ROUTE-001 v1.2 修订块。root 对 Task5 提的 P1-2「dataView 由浏览器控制」由此条一并解决。

### 三、root 分支未结事项处置

| 项 | 处置 |
|---|---|
| P-008（fe 请求 TASK-LIST DTO） | 已由 P-035 TASK-LIST-001 + `fixtures/task-list/` 冻结，关闭 |
| root Task5 审计 3 P1 | P1-1 任务元数据越权：e617271 已修，arch 复验；P1-2 见本节二；P1-3 集成测试只盖 accounts：并入 R-009 |
| `codex/fe-task5-session-bff@c3ed7b3` | 4 个 auth BFF 路由，arch 审后合入 main |
| `codex/personal-team-task6-ingestion@4e67315` | 团队数据中立批次，Codex 继续，按 team→ka_data 绑定调整 |
| `codex/frontend-takeover` | 与 main apps/web 0 diff，删分支 |
| `fe/f001` 脏树 | 老板裁"直接丢"；apps/web 部分已 stash 不恢复，docs 部分已挑回 main |

### 四、审计排期（arch）

按 `docs/plans/Codex后端交付总账.md` §4 顺序：先横扫共同红线（租户隔离/凭证边界/写操作确认门/口径/事实边界），再 `main..be/b1a` → … → Task5 逐批 diff。每批结论追加在对应 P 条目下；发现 P0 直接派 Codex，不攒。资料库 P-KB-001～012 排最后，审完挑对产品有用的进知识库 tab。


---

## 2026-09-04 arch 裁决：资料库 P-KB-001～012（全部审毕）

> 老板 9-4 指令："资料 Agent 的现在去看一下把它写了…有些对我们有用的、后续要用到的、有些要放到知识库。" 资料研究 Agent 角色已并入 arch；`docs/knowledge/` 与 `private/knowledge-sources/`（93MB，gitignore ✅）由 arch 维护。

**总评**：治理模型（三层分离/生命周期/权限/凭证禁入）✅ 采纳为项目资料库规范；10 份评估事实/推断分层清楚、无一处把"资料存在"写成"产品现状"，结论全部保守，**可以直接裁**。

| 文档 | 裁决 | 进产品知识库 tab（B8） | 对开发的动作 |
|---|---|---|---|
| ka-src-0001 白盒 vs 黑盒 | ✅ reviewed。采纳评估结论：本产品定位=**可控自治灰盒**（同一平台按角色/自治度呈现），不拆两套；AI 实验编排列 P2 | 否（内部对齐稿） | 无 |
| ka-src-0002 日报 Agent+盯盘规范 v2.0 | ✅ reviewed→**approved**。对 Contract 的交叉审计项（channel 可选/枚举/扣量区间/compare/报告 snapshot/指标 applicability）已在 v1.1～v1.3 逐项冻结；不硬编码 1.09 | **是**（optimizer/lead 可读） | 日报 12 模块字段以 `docs/18-KA日报规范借鉴.md` 为准（P-007#4） |
| ka-src-0003 快手能力汇编 | ✅ reviewed，confidential。高风险回传/赔付段 **deny/quarantine**；媒体能力目录/学习期映射/命名解析 → 融合 Capability Registry 候选（B7 后续） | 否（整包）；术语/学习期条目单独提 | Codex 后续批次：基建 preflight 用官方证据项 |
| ka-src-0004 术语/调控工作流 | ✅ reviewed，confidential。高风险回传 deny；**术语卡→approved**；固定阈值只作规则候选不默认 | **术语卡是**；其余否 | 规则候选进 13.2 候补池，Shadow 回放后才升 |
| ka-src-0005 内部文档包 671 篇 | ✅ reviewed，confidential。整包不进 KB；8 直接候选（用户增长摘要/EVO 实验治理）逐篇后续；FBI 不做一期主链 | 否 | 无一期动作 |
| ka-src-0006 广告创建 Excel | ✅ reviewed，confidential。真实 ID deny；字段映射→基建 schema（4.6 Prompt Compiler 已按此设计） | 否 | B7 基建节点字段校验按此 |
| ka-src-0007 快手 MAPI 官方（381 篇+CLI 覆盖） | ✅ reviewed→**approved**（public 官方）。奇航仍是一期主链，MAPI=能力底座；59 条机器初筛**不整体进一期**，先由老板/业务 owner 裁剪；CLI 2 处 HTTP 方法冲突要修 | **是**（开发者+优化师） | Codex R-010：Capability Registry 录入状态 `documented_unverified`；核心断点 campaign update/status、unit budget、creative update/review、四层实时 report 补 CLI 壳 |
| ka-src-0008 巨量官方 1103 篇 | ✅ reviewed→**approved**（public）。只融合对象模型/权限状态/实验治理概念；**不开发巨量 adapter** | **是**（参考） | 无一期动作 |
| ka-src-0009 腾讯 Apifox 镜像 | ✅ reviewed，E2。306/307 参数位置错、1 endpoint 错，不可作 Contract | 是但标 **reference_only/未核** | 无一期动作 |
| ka-src-0010 ka-data 取数指南 | ✅ reviewed，confidential。**老板已裁：团队空间主源=ka_data**（覆盖评估的"先探针后 adapter"）。安全项保留：reader token 只进 Secret、不开任意 SQL、不依赖临时沙箱 URL、SQLite 快照不作主库。**同日同户对平（奇航 vs ka-data）= 内网联调硬门** | 否（内部运维） | R-009 已含 team→ka_data；对平交 OS agent 联调 |
| P-KB-010 发布机制 | ✅ 纳入 B8 知识库批次（权限继承/门禁/approved→published 流程） | — | B8 |
| P-KB-011 六问 | ①ka-data 服务 owner/ACL/只读性 → OS agent 联调核 ②数据血缘/公式 → 对平后定 ③数据许可 → 老板与运营方确认 ④adapter 分期 → 已由 team 绑定裁掉 ⑤字段级 SSOT：**奇航=personal 权威、ka-data=team 权威、业务确认表=考核价/返点权威、MAPI=结构/执行权威** ⑥其他对象 ID（task/product/material/adgroup）继续 unresolved，逐项核证 | — | — |
| P-KB-012 R1 纠错 | ✅ 关闭（账户三键已落 R3） | — | — |

catalog.jsonl 已按上表更新 `review_status/lifecycle_status/product_kb_publication_status`。


---

## 2026-09-04 arch 裁决：root 攒的 B2-B5 契约差异包 P-005～P-008（29 问全裁 → 契约 v1.3）

> 这 29 问是 Codex 离线期只做内核不接 API 的原因。裁完落 `schema.sql` 末尾「v1.3 新增」与 `api.md` 末尾「v1.3 DTO/状态机」；Codex **R-010** 出 migration 009 并把 B2-B5 内核接成 Web API。

### P-005 B2 队列（7 问）

| # | 裁决 |
|---|---|
| 1 复合规则 | ✅ `alert_rules` 加 `condition_tree JSONB`（版本化，`{version, all:[...], any:[...], not:[...]}` 叶子=`{metric,operator,threshold,window_hours?}`）+ `fallback_copy TEXT`；旧三列保留兼容简单规则 |
| 2 去重/复发 | ✅ `work_items` 加 `dedupe_key TEXT`（=`rule_id:media:account_id`）、`occurrence_count INT DEFAULT 1`、`last_triggered_at`；partial unique `(workspace_id, dedupe_key) WHERE status IN ('open','processing','dispatched')`；同 key 再触发 → occurrence+1 不新建，**严重度升级则新建并关闭旧条**（PRD 1.3 跨级重弹） |
| 3 动作状态机 | `open →process→ processing`（开始处理）；`processing/open →dispatch→ dispatched`（改 assignee + timeline 派发记录）；`任意活动态 →escalate→ escalated`（assignee=值班表上级 + escalation 记录）；`processing →reject→ rejected`（必填 reject_reason）；`done` 由 T+1 回收或人工「完成」写入；`ignored/expired` 不可再 process。每个动作响应 = work-item 详情 DTO |
| 4 户级静音 | 新表 `account_mutes(workspace_id, media, account_id, muted_until, muted_by, reason_chip, created_at)` PK 三键；**P0 突破静音**（静音只压 P1/P2/机会）；`work_items.muted_until` 废弃不再写；`alert_rules.muted_until` 保留=规则级 |
| 5 通知调度 | ✅ 单一路径：`jobs(job_type='push', run_after=整点/静默结束)` → 到点写 `outbound_messages`；outbound 不加 run_after |
| 6 数据缺口 | `insufficient_data` 正确；`ad_entities` 补 `created_at TIMESTAMPTZ`（0 曝光规则用）；预算调整记录取 `changesets` 成功项 + `accounts/:id/timeline` external 变更（B3 已有） |
| 7 API DTO | `GET /work-items` 已由 P-035/work-item-list-001 冻结；详情/动作/explain DTO 见 api.md v1.3 |

### P-006 B3 安全执行（7 问）

| # | 裁决 |
|---|---|
| 1 items 归属 | ✅ v1.2 已加账户三键；campaign/unit/creative 的 account 由 `ad_entities` 反查落快照，不信任调用方 |
| 2 typed value | `from_value/to_value` 改 JSONB `{type:"number"|"boolean"|"string"|"json"|"schedule168", value, media_default?:true}`；比较按 type 严格相等 |
| 3 状态机 | dry-run **是 confirm 硬前置**（必须存在同 `dry_run_hash` 的成功 execution_run(dry_run=true)）；`failed` 可重试=新 execution_run attempt+1 同 changeset；`unknown` → 只读 reconcile（对比 `accounts/:id/structure`）→ success/failed/仍 unknown 转人工；`rolled_back` 在反向变更集 success 后写回原 changeset |
| 4 run status / RESULT_JSON | execution_runs.status `pending|running|success|partial|failed|unknown|cancelled`；item 回执 `{target_type,target_id,field,applied_value,media_code,media_message,applied_at}` |
| 5 hash | `dry_run_hash = sha256(canonical_json(sorted items[{target_type,target_id,field,from_value,to_value}]) + ttl_expire_at)`；confirm 重算比对，不等 → 409 `FROM_VALUE_CHANGED`；`changesets` 加 `dry_run_hash TEXT, confirm_hash TEXT` |
| 6 API DTO | 409 `{code, changed_items:[{target_id,field,expected_from,actual_from}]}`；partial = status partial + items[] 各自 item_status；rollback 只对 success 项生成反向草稿；confirm 幂等=同 hash 重复 confirm 返回既有 execution_run |
| 7 UNKNOWN 核实 | 只读 structure 对比；超时语义等 OS 样本 → **内网联调硬门**，未定前 unknown 一律转人工 |

### P-007 B4 任务与报告（5 问）

| # | 裁决 |
|---|---|
| 1 task_id 主数据 | 先按奇航 task_id；核验列为 OS agent 联调项（B7） |
| 2 task_accounts | ✅ v1.2 已加 workspace_id + 区间排斥 |
| 3 pacing | **业务日**（上海 03:00 日切）；asOf=最近完整结算日；剩余天数不含 asOf；7 日均速**剔除零量日**（与 metrics.md 均值规则一致）但标注剔除数；任务结束后显示最终达成率不再外推 |
| 4 日报 12 模块 | 字段/顺序按 `docs/18-KA日报规范借鉴.md`；角色三版 `optimizer|lead|exec` 裁剪；缺数按三态；schema `daily-report/v1`；具体字段表由 R-010 从 18 号规范抄进 api.md 附录 |
| 5 考核价变更 | 重算范围=effective_date 起该任务全部账户日；通知=任务 owner + 相关账户 owner；DTO `{task_id, old_price, new_price, effective_date, recomputed_days, notified_user_ids[]}`；已读确认走 work_items(type=agent_question) |

### P-008 B5 Agent 与网关（10 问）

| # | 裁决 |
|---|---|
| 1 会话约束 | `agent_messages` 加 `session_id` FK、`seq INT`、`client_message_id TEXT`，`UNIQUE(session_id,seq)`、`UNIQUE(session_id,client_message_id)`；`agent_context_items` 加 session FK；object_type 枚举 `account|task|work_item|changeset|report`；无权限 → 403 不加入；对象已删 → 410 |
| 2 runs 补列 | `agent_runs` 加 `session_id, provider_id, model, credential_owner_user_id, error_code, attempt INT DEFAULT 1, first_token_at, usage_ref, result_ref`；status `queued|running|succeeded|failed|cancelled|timeout` |
| 3 run events | **DB 表** `agent_run_events(run_id, seq, kind, safe_payload JSONB, raw_ref TEXT, at)` UNIQUE(run_id,seq)；raw 走对象存储只存 ref |
| 4 provider 凭证 | ✅ 新表 `model_provider_credentials(workspace_id,user_id,provider_id,secret_ref,status,last_checked_at)` PK(workspace_id,user_id,provider_id)；`users.idealab_ak_ref` 迁移后废弃 |
| 5 capability matrix | ✅ 新表 `provider_model_capabilities(provider_id, model, protocol, supports_tools, supports_stream, supports_structured, timeout_ms, sdk_compat, status, tested_at, error_summary, test_version)` PK(provider_id,model) |
| 6 网关 | ✅ Worker 单元内 localhost sidecar，不新增 FaaS；`/v1/messages` 不进公开 API；短时 AES-GCM 信封 ✅ |
| 7 SSE | 帧 `{type:"session"|"run"|"delta"|"tool"|"evidence"|"done"|"error", run_id, seq, ts, data}`；structured output 只在 `done`；断线后 `GET /api/v1/agent/runs/:id/events?after_seq=` 续；客户端取消 `POST .../runs/:id/cancel`；幂等靠 `client_message_id` |
| 8 诊断 DTO | 冻结 `diagnosis/v1`：`{reason_code(PRD 归因子类枚举), action(5 动作枚举), evidence_refs[], confidence 0-1, expected_effect{metric,delta_range}, constraint_check{passed,violations[]}, fallback_reason?}`；B5 已实现的最小 schema 即此 |
| 9 OS 工具 | job_type `agent_task`；`dispatch_os_task` 请求 `{capability, params, account_scope[三键], idempotency_key}` 回执 `{os_run_ref, status, result_ref}`；只读能力直调，写能力必须先有 confirmed changeset；真协议等 B7 联调 |
| 10 用量 | ✅ SDK usage 只作诊断；结算账本待网关 usage 表（后续） |

**红线复核（arch 对 B5 六条必审）**：①DTO 已裁 ②`tools:[]`+MCP allowlist+auto-memory 关 → R-010 验收时我看代码 ③sidecar 边界 ✅ ④Claude Agent SDK 驱动非 Anthropic 模型的许可 → **老板 9-4 裁：内部使用，不等法务；网关非 Claude 路由按设计可开**（条款无明文禁止亦无明文允许，已查 LICENSE/Commercial Terms D.4/法律页） ⑤生产沙箱限额 → 部署批次 ⑥fake≠联调 ✅ 记住。

---

### P-037 ⏳ R-009 启动回执 + Codex 后端全量审查交接｜be（Codex）

- 日期：2026-09-05
- 开发分支：`be/r009`，从 Claude 当前已提交 `main@409d363` 切出。`v0.2-unaudited-baseline=d121273` 只作为 arch 全量审计起点，不作为 be 开发基线。
- 治理确认：root 已退役；`codex/integration-control` 不再作为契约/整合权威。
- 全量审查入口：`docs/plans/Codex后端交付总账.md`。请 arch 从 tag 起运行共同红线横扫，再按 `P-004～P-035` 和总账 SHA 逐批追认；Codex 历史汇报不视为终审。
- 旧 Task6 候选：`codex/personal-team-task6-ingestion@4e67315`。其中 `f009e19` 是 session `LIMIT 2` 硬化，`6d02cfe` 是 source-neutral team contract，`feec2ec/4e67315` 是 staging/publish 设计。该分支另有未提交 migration 011 等 4 个文件，且旧语义与 team→`ka_data` 冲突，**请勿整批合入**。
- R-009 状态：见 `docs/plans/R009-状态.md`。be 将只实现 arch 已冻结 Contract，不修改 `packages/contract/`。

#### 待 arch 裁决：migration 序号冲突

R-009 与 `schema.sql` 头部写“迁移编号从 008 起”，但 main 已有：

1. `008_multi_tenant_auth.cjs`
2. `009_workspace_sync_scheduler.cjs`
3. `010_workspace_kind.cjs`

请冻结 R-009 实际迁移序号，并同步校正 v1.3/R-010 文档里的“migration 009”。be 不会覆盖已有迁移，也不会复用旧 Task6 WIP 的 011。

- 状态：待 arch 裁决迁移编号；不依赖编号的代码审计继续。

#### 同批发现的 Contract 文字/实现漂移

1. `metrics.md` P0-04 要求所有 API/canonical 指标统一 `{value,availability}`，但 `api.md` BE-001 仍写“普通可缺指标用 `number|null`”，`packages/domain/src/data-query-rows.ts` 也仍是 nullable number。R-009 又明确要求改成三态。请确认以 metrics.md/R-009 为准，并确认 canonical row schema 是否升到 v2。
2. `api.md` DATA-ROUTE-001 v1.2 与 R-009 要求普通请求拒绝 `dataView`，但同文件 BE-001 仍把 `dataView` 列为严格必填字段，Domain/BFF/Query Registry 当前也按必填实现。请明确：普通 session 查询应只收 `{queryId,params}`；`reconcile.account_daily` 是否仅由 queryId + entitlement 进入治理诊断。

be 在裁决前不修改上述 Domain/公开 DTO；先处理 R-009 已明确要求合入的 Auth BFF 候选。

#### 2026-09-05 BFF 收口增量

- 已按 R-009 #9 在原 worktree 收口 11 个脏文件：`codex/fe-task5-session-bff@c5df265`。
- 已并入 `be/r009@2916a91`；Web 77/77、typecheck、lint 全绿。
- 普通 BFF 只转发服务端 bearer + 单一 `ka_session` Cookie + requestId，不转发浏览器伪造的 `x-ka-*`；data-query 当前仍按旧 DTO 强制写入 `dataView=platform`，待上面“普通请求不接收 dataView”的 Contract 漂移由 arch 裁决后再改。
- 原 worktree 的 `bff.test.new` 是未引用、被正式 77 项测试覆盖的临时缩减稿，未提交并已清除。

#### 2026-09-05 migration 011 交付待审

- exact SHA：`be/r009@351d039`（`[be] 落地契约v1.2数据库P0迁移`）。
- 范围：`btree_gist` + `task_accounts` 账户区间排斥、Workflow executor 租约列与 `workflow_effects`、钉钉 durable inbox 字段、Changeset 双主体复合 FK 与 item 账户三键、Backfill 阶段失败/完成字段；同步修正 Changeset Repository item 写入。
- 迁移前对历史重叠任务、跨 workspace 主体、无确定账户范围的 item、旧 Backfill 非五态状态全部 fail closed；未自动猜测或改写历史业务归属。
- 真 PG：完整 migration 1→11 replay 通过；011 up/down/up + Changeset 定向 10/10；DB 全量 32 files / 177 tests；typecheck、lint 全绿；production dependency audit 0 vulnerabilities。
- 旧测试中故意制造“同户同日多任务”的场景已改为断言 PostgreSQL `23P01` 写入拒绝；查询层旧歧义兜底未删除。
- 请 arch 对 exact SHA 做逐行终审；当前仅 `candidate + codex_self_checked + PG verified`，未宣称 merged/deployed。
---

## 2026-09-04 arch 六簇审计 · 第一轮（不变量核验，覆盖 P-004～P-035 全部批次）

> 方法：按依赖分六簇，对每簇的**契约不变量**（租户隔离/凭证边界/写操作确认门/口径计算位置/fail-closed）做代码级定点核验（grep 到具体文件行），不信自报。**本轮是不变量级，不是逐行 diff**；逐行 diff 随 R-009/R-010 交付交错进行，结论继续追加到各 P 条目。
> 单测独立复跑（2026-09-04 全部真跑）：domain 491/491、web 66/66、**db 176/176（真 PG）、worker 621/621 + 2 opt-in skipped（真 PG）**——Codex 自报数字属实，"未复验"关闭。

### 簇① 数据链 B1a/B1b/B1c/B9/B10/B11（P-004/006a/007a/016/017/018）

| 项 | 实证 | 结论 |
|---|---|---|
| B1a 指标纯函数 | `packages/domain/src/metrics.ts` 逐公式对 metrics.md（离线前已核） | ✅ |
| B1a 迁移可重放/月分区 | `001_contract_v1.cjs`、`002_metric_partitions.cjs` | ✅ |
| B1a Job lease fencing（P0-06） | `job-repository.ts:264-299` `FOR UPDATE SKIP LOCKED` + `lease_token=gen_random_uuid()` + 状态迁移 `WHERE lease_token=$2` | ✅ 已修 |
| B1a raw→canonical 派发（P0-01） | `full-handler.ts:57,228-243`、`incr-handler.ts:93-97` 确定性 job id 入队 `canonical_merge` | ✅ 已修 |
| B1a 网关身份映射带 workspace | `message-handler.ts:12-89` 全路径传 `workspaceId`（单空间网关配置） | ✅（多租户网关=后续） |
| B1a 钉钉先 ACK 后处理（P0-12） | 未修 | ❌ → R-009#5 |
| B1b 三类对平 | `data-quality-repository.ts:26` `total_reconciliation|cpa_outlier|missing_consecutive_days`，容差参数化 | ✅ |
| B1b 90 天冒烟 | `B1b-90天回灌日志.txt`：900 canonical / 270/270 quality / 0 failed | ✅（合成数据） |
| B1b 回填终态只看 backfill_day（P0-03） | `runtime.ts:97-105` 仅 `backfill_day` 触发 `refreshProgress` | ❌ → R-009#7（v1.2 五态） |
| B1c workspace 隔离 | `semantic-query-support.ts:83` `values=[scope.workspaceId,...]` 首绑定；全部 SQL `JOIN accounts ON workspace_id` + `WHERE filter.whereSql` | ✅ |
| B1c 缺数 COALESCE 0（P0-04） | `semantic-query-metrics.ts:34-42` 九指标 `COALESCE(sum(),0)` | ❌ → R-009#2 |
| B1c 多任务歧义 | `semantic-query-dimension.ts:86` `AmbiguousTaskMappingError` | ✅（v1.2 EXCLUDE 后成兜底） |
| B1c dimension 只开 3/8 维 | 契约 v1.4 补数据源 | ⚠️ 待契约 |
| B10 日期紧凑格式 | `qihang/client.ts:135-145` | ✅ |
| B10 离线分区有界回退 | 未定位到代码 | 待核（R-009 交付时看） |
| B11 hh 边界 | `client.ts:156` 0..24 ✓；**`etl/payload.ts:37` schema `max(23)` 与 client 不一致** | ⚠️ 新问题 → R-009 |
| B11 2000 行截断 fail-closed | `qihang/client.ts:364` `suspectedAdTruncationRows ?? 2_000` 可配阈值 | ✅ |

### 簇② 执行与规则 B2/B3/B4（P-005/006/007 内核回执）

| 项 | 实证 | 结论 |
|---|---|---|
| B2 首发三规则 | `domain/alert-rules.ts:4` `over_cost_ramp|zero_delivery|spend_cliff`；冷启动护栏 `:106` 转化<10 不判超（对 13.5） | ✅ |
| B2 工作项状态机/去重 | 契约 v1.3 已定；当前实现用活动态查询，partial unique 待 R-010 | ⚠️ 待 R-010 |
| B3 changeset TTL 为 Date 类型、expired outcome | `changeset-repository.ts:33,62` | ✅ |
| B3 confirm 时 from 值复核 | `changeset-execution-handler.ts:15,49` + `changeset-repository.ts:61,303` `outcome:"conflict", conflicts:ValueConflict[]` | ✅ |
| B3 T+1 崩溃恢复（P0-09） | `changeset-execution-handler.ts:43-72,118,135` `skip_terminal` + `idempotency_key=changeSetId` | ✅ 已修 |
| B3 changeset 租户外键（P0-13） | 未修 | ❌ → R-009#6（v1.2 FK） |
| B4 pacing 零量日剔除 | 见本轮补核 | 待核 |
| B4 task_accounts 区间排斥（P0-05） | 未修 | ❌ → R-009#3（v1.2 EXCLUDE） |

### 簇③ Agent/报表/工作流/知识库 B5/B6/B7/B8（P-008 回执/P-010/011/012）

| 项 | 实证 | 结论 |
|---|---|---|
| B5 SDK 工具钳制 | `agent/sdk/safety.ts:71-73` `tools:[]` + `allowedTools=[MCP allowlist]` + `disallowedTools=DISALLOWED_BUILT_INS`；`:89` mcpServers 闭包 | ✅ |
| B5 短时凭证信封 | `orchestrator.ts:289` `sealCredentialEnvelope` + `envelopeKey` | ✅ |
| B5 auto-memory 关 | `agent/sdk/safety.ts:30` `CLAUDE_CODE_DISABLE_AUTO_MEMORY`、`:75` `settingSources:[]`、`:81` `persistSession:false`、`:150` 启动校验 | ✅ |
| B5 sidecar 不新增 FaaS | 设计文档 + config `MODEL_GATEWAY_BASE_URL=127.0.0.1` | ✅ |
| B5 SDK 驱动非 Anthropic 模型许可 | 条款无明文禁/允；老板 9-4 裁内部使用不等法务 | ✅ 关闭 |
| B6 策略样本护栏 | `strategy-analysis.ts:5,124-125` `MIN_STRATEGY_COST=100`、`insufficient_accounts` | ✅（对 3.11） |
| B7 Registry/DAG/确认门 | `workflows/capability-registry.ts`、`workflow-graph.ts`；`run-handler.ts:289-348` `execute_confirmed` phase + `mustMatchPrior` | ✅ |
| B7 单执行器 fencing（P0-07） | 未修 | ❌ → R-009#4（v1.2 executor_token + effects） |
| B7 确认 TTL Date 比较（P0-08） | `domain/workflow-runtime.ts:381,404` `isAtOrAfter()` | ✅ 已修 |
| B8 citation all-or-nothing（P0-10） | `knowledge-access.ts:216-220` `businessRefs.every(...)` | ✅ 已修 |
| B8 建表 | 未冻（B 级不提前建） | 契约 v1.4 |

### 簇④ 自审修复 P-013/014/015

6/14 P0 自报已修：P0-01 ✅、P0-06 ✅、P0-08 ✅、P0-09 ✅、P0-10 ✅ 本轮实证；P0-14 凭证扫描 `run-handler.ts:892,923` 改为 `\bbearer\s+\S+` + 前缀双正则 ✅（仍是模式匹配，可接受）。**自报属实。** 剩 8 个已在本日裁决（v1.2）→ R-009。

### 簇⑤ 素材链 B12-B22（P-019～P-029）

| 项 | 实证 | 结论 |
|---|---|---|
| B14/B22 IdeaLab 端点固定 | `config.ts:94,279` hostname 校验 `idealab.alibaba-inc.com` | ✅ |
| B22 WAV only + 大小上限 | `config.ts:96` `MAX_WAV_BYTES`、`idealab-asr-factory.ts:14,18` | ✅ |
| B13 下载 allowlist 默认拒绝 | `.env.example` `MATERIAL_SOURCE_ALLOWED_HOSTS=` 空=拒；代码定点待核 | 待核 |
| B12-B21 领域内核 | 全部无 HTTP、无生产 runtime 注册（root Live 审计同结论） | ✅ 内核 / 待契约 v1.4 后接线 |

素材链风险低（无生产路径），逐行审排在 R-010 后。

### 簇⑥ 双数据+授权 R1-R3/B23-A/C1/C2/TASK-LIST/Task4-5（P-030～P-035 + root Task5 审计）

| 项 | 实证 | 结论 |
|---|---|---|
| B23-A session fail-closed | `auth-repository.ts:114,130-147` token hash 格式校验 + actor/membership/identity `is_active` + `revoked_at` 全查 | ✅ |
| Task5 旧 x-ka-* 头不再参与授权 | `http-server.ts` 全文无 `x-ka-` 引用（彻底移除） | ✅ |
| Task5 P1-1 任务元数据越权 | `e617271` 改 `task-list-sql.ts` | ✅ 已修（待 diff 细看） |
| Task4 P1-1 登录 credential oracle | `session-http.ts` `login()` 两条失败路径均 `loginFailure()`→401 同 message；`view()` 的 401/403 分叉是已登录后 current/switch，属正确；测试 `:140-170` 断言一致 | ✅ 已修（**arch 首轮误判，已撤回 R-009#11**） |
| Task5 P1-2 dataView 浏览器控制 | 老板裁绑空间 | → R-009#8 |
| Task5 P1-3 集成测试只盖 accounts | `e617271` 加了 340 行 integration test | ⚠️ 待 diff 确认覆盖 tasks/work-items/detail |
| R3 输出侧三键 scope guard | `data/query-service.ts:46,117,369,378` `guardSourceOutput()` 对 kaData/platform 双路 | ✅ |
| B23-C1 账户主表同步（P0-02） | `full-handler.ts:90-130` 每页 `assertAccountRowsWithinRequestedScope` | ✅ |
| B23-C2 首次 full ready 门 | 状态文件宣称，代码待核 | 待核 |

### 本轮新发现（并入 R-009 追加条）

1. ~~Task4 P1-1 登录 oracle 未修~~ **撤回**：复核 `login()` 已统一 401，root 结论成立。
2. **hh 上限不一致**：`etl/payload.ts` `max(23)` → 改 `max(24)` 与 client 一致（奇航实证 hh=24 有效=全天）。
3. **迁移编号**：v1.2 用 011、v1.3 用 012（008-010 已占用）——契约与派活已改。
4. B4 pacing 零量日剔除、B13 下载 allowlist 默认拒绝、B23-C2 首次 full ready 门、B10 离线分区有界回退 —— 4 项"待核"在 R-009 交付审查时定位（另 4 项已当场核实 ✅）。

### 总判断

- **可保留**：全部。架构决定（SQL-first、agent 不算数、写操作确认门、租户 fail-closed、凭证信封）经代码级核验成立，无一处需要推倒。
- **不可宣称完成**：8 个 P0 待 R-009、29 个契约问题待 R-010 接 HTTP、真实奇航/IdeaLab/Multica/BUC 零联调。
- **HTTP 现状**：worker 只有 `/healthz`、`/api/v1/data/query`、auth×4、tasks/accounts/work-items 三个列表；web BFF 4 条。其余 ~35 个契约端点=内核有、HTTP 无 → R-010。


---

### P-036 ✅已收｜root（Codex 审查会话）停工交接（2026-09-04）｜arch 校对

root 停工前交接全文由老板转交。**arch 逐条校对结果**：

| root 陈述 | arch 核 | 处置 |
|---|---|---|
| main=c66381d、tag=d121273、integration-control 退役 | ✅（main 现已到 c5b34bf） | — |
| Task4 P1-1 登录 oracle 已关闭、异步 scrypt、TTL 一致、`LIMIT 1001` | ✅ `login()` 实读 + 测试 140-170 | **arch 首轮审计误判撤回** |
| Task5 五类业务读接 Session、x-ka-* 无效、team changeset 403、logout 后全 401 | ✅ `http-server.ts` 无 x-ka 引用 | 逐行 diff 随 R-009 |
| Task5 旧"普通用户固定 platform、KA Data 仅诊断"需按 v1.2 改 | ✅ 一致 | R-009#8 |
| `c3ed7b3` Session BFF = candidate + 11 脏文件半成品 | ✅ 实查 11 M + 1 ?? | R-009#9 已改为"审后合 + 原工作树续完" |
| `fe-functional-bff-v2@110f221` 旧鉴权不可原样合 | ✅ | R-009#9 注明 |
| Task6 `f009e19` 可独立审；`6d02cfe/feec2ec/4e67315` + 草稿 011 与 v1.2 冲突 | ✅ 草稿 011 与 arch 的 011 撞号 | **R-011** 重做，编号 013，root 六条 staging/publish 要求全采纳 |
| 复验数：Domain 491 / DB 171 / Worker 604 / PG 11+30 | arch 独立复跑：Domain 491 / DB 176 / Worker 621 ✓（main 比 root 交接时又多了 Task5 退修测试） | ✅ 关闭 |
| 接手顺序 10 条 | 与 arch 已做/在做一致 | — |
| "所有媒体写继续关闭；preview/confirm/execute 保留人工确认门" | ✅ 契约 v1.3 状态机 | — |

root 的 `codex_prechecked` 结论全部降级为**输入**，不作终审依据；但本轮校对未发现 root 陈述失实。


---

## 2026-09-04 arch 裁决：契约 v1.4（缺口地图 12 条"待契约补"全冻）

| # | 缺口 | 裁决落点 | 备注 |
|---|---|---|---|
| 1.6 | 警报流/值守 | `escalations`、`escalation_policies` + `GET /alerts/stream`、ack/pause、roster、policies | 默认策略 P0 30min 突破静默→备班 / P1 24h→48h 上级 / P2 攒批 |
| 1.9 | 协作提审 | `dispatches`、`approvals`、`approval_auto_pass_rules` + dispatch/receipt/submit-for-approval/approve/reject | 充值协作只发消息不入审批（REQ-046）；"不同意"是合法结局 |
| 2.2 | 任务六页签 | `GET /tasks/:id` overview + `/metrics` + `/accounts` capacity；素材/复盘 501 占位 | 不发假数据 |
| 2.8 | 漏斗 | `GET /tasks/:id/funnel` 在线/离线两条链分开 | 全 MetricValue，离线缺=missing |
| 2.9 | 时间线 | `GET /tasks/:id/timeline` 五源 UNION 倒序 | 无新表 |
| 3.3 | 8 维数据源 | accounts +`agent_type/is_ubp`；ad_entities +`resource_position/bid_tool`；deduction_range 派生桶 | **ad 级字段名=OS 联调确认项**，确认前 `DIMENSION_UNSUPPORTED` |
| 4.5 | 加/关账户 | accounts +claimed/closed 列；import/close 向导/close confirm/open-flow | 关户先给清理向导不直接关 |
| 6.x | 素材域 | 7 表名+主键冻结 + 9 端点名冻结；**列/DTO 由 Codex 从 B12-B18 domain 提案** | 反向：先内核后契约，这次让做过内核的提 |
| 7.3 | 结算 | 3 表名冻结 + 6 端点名冻结；**列/公式由 Codex 从 B19 提案** | 模板版本化不覆盖旧单 |
| 8.x | 知识库 | `kb_documents/kb_revisions/kb_links/kb_business_refs` 对齐 CR `knowledge_items.content_json/content_text`+`document_links` | 前端复制 CR 代码字段直接对上；两个自动归档 job |
| 9.4 | 卡片中心 | `card_templates/card_instances/card_callbacks` + callback L0-L3 分流、hash 校验、实名溯源 | 四身份对账 14.3b 在此落 |
| 9.3/9.5 | 推送订阅/值守 | `/subscriptions/mine`、roster、policies | quiet_hours 只压 P1/P2 |

迁移编号：011 v1.2 ｜ 012 v1.3 ｜ 013 Task6 ｜ **014 v1.4**。schema.sql 现 **73 表**。

**留给联调的**：8 维 ad 级字段名、素材视频源探针、Excel 对平、ka-data 同日同户对平、OS 写链路 UNKNOWN 超时样本。
---

### P-038 ⏳待审｜R-009 migration 011、Session BFF、hh 边界与四项定位（2026-09-05）

- 治理已切回 Claude/arch：实现分支 `be/r009` 从 Claude 当前 `main` 建立，不再以 `codex/integration-control` 为权威；Contract 仅认 `packages/contract/`。
- Session BFF：R-009 代码 SHA `5e91a85`、`2916a91`；Web 77/77、typecheck、lint 通过。
- migration 011：代码 SHA `351d039`；真实 PG 完整 1→11 replay、011 up/down/up、DB 32 files / 177 tests、typecheck、lint、production audit 0 vulnerabilities 通过。
- hh 累计小时：代码 SHA `7aea1dc`；payload 接受 0/24、拒绝 -1/25；Worker 定向 58/58，全量 623 passed + 2 opt-in skipped、typecheck、lint、production audit 0 vulnerabilities 通过。
- 四项待 arch 逐行复核的定位：
  - B4 零量日剔除：`packages/domain/src/metrics.ts:122-127`、`packages/db/src/metrics-repository.ts:196-205`。
  - B13 allowlist 默认拒绝：`apps/worker/.env.example:8-10`、`apps/worker/src/config.ts:82-90,164-171`、`apps/worker/src/sources/material-source-probe.ts:193-208`。
  - B23-C2 首次 full ready 门：`packages/db/src/workspace-sync-repository.ts:163-175`、`apps/worker/src/scheduling/workspace-sync-service.ts:40-60`。
  - B10 离线分区有界回退：`apps/worker/src/etl/full-handler.ts:34,161-182`。
- 完整证据与旧 Codex 后端审计入口：`docs/plans/R009-状态.md`、`docs/plans/Codex后端交付总账.md`（P-004～P-035 与后续 root 批次均保留 exact SHA/测试/未完成项）。
- 当前状态严格为：**be candidate + Codex self-checked + migration 011/相关集成真实 PG verified；尚未 Claude reviewed、尚未合入 main、尚未部署**。


---

### P-038 ✅审查通过（arch 2026-09-05）｜已合入 main@d070c1d

| 项 | SHA | 实证 | 结论 |
|---|---|---|---|
| migration 011 | `351d039` | 逐条对 v1.2：btree_gist + task_accounts EXCLUDE（含 infinity/'[]'）/ workflow_runs executor_token+lease / workflow_effects UNIQUE(run,node,attempt,phase) / inbound_events 五列 / changesets 两复合 FK / changeset_items 三键+FK+索引+从父表回填 / backfill failed_stage+finished_at；**前置数据校验四条**（重叠区间/跨租户 actor/无 scope 明细/legacy status）；down 对称；测试断言 23P01/23503/23505/inbound 默认/down 态/up 重放。arch 真 PG 复跑 DB 177/177 | ✅ |
| hh 0..24 | `7aea1dc` | payload max 23→24 + 21 行边界测试；与 client:156 一致 | ✅ |
| Session BFF | `5e91a85` `2916a91` | 四 auth 路由 + session-bff 校验 Set-Cookie 安全契约（不符 502）+ requestId 贯通 + 无 cookie 401；`x-ka-` 仅剩 1 条注释；Web 77/77 arch 复跑 | ✅ |
| 四项定位 | — | B4 domain:122-127 + SQL `cost IS NOT NULL AND cost<>0` 一致；B13 allowlist 空→[] 且 `!some()` 默认拒 + 私网 host 拒；B23-C2 `has_successful_full` 同 ws/owner/media + `INITIAL_FULL_REQUIRED`；B10 `LOOKBACK_DAYS=3` 首个非空即停 | ✅ 四项关闭 |
| 全量测试 | — | arch 独立复跑：Domain 491 / DB 177 / Worker 623+2 / Web 77 | ✅ |

**P2（随下一批修，不阻断）**：
1. `apps/web/lib/data/bff.ts:106` `forwardDataQuery` 的 `?? "legacy-session-token-000000000000000001"`——写死假 token 进生产代码；虽 `handleDataQueryRequest` 会对无效 cookie 返 401（fail-closed 仍成立），但**删掉兜底，无 cookie 直接 401**。
2. `backfill_jobs.status` 五态只靠迁移前置校验+应用层，**补 CHECK 约束**（随 P0-03 实现）。

**契约漂移 2 条（be 提出）→ arch 已裁并落 api.md `d070c1d`**：①BE-001 普通可缺指标改三态 `MetricValue`，`rowSchemaVersion` 升 `<queryId>/v2`，v1 fixtures 作废 ②普通请求**不接受** `dataView`（收到 400），源由 `workspaceKind` 固定；`reconcile.account_daily` 移出普通 Registry，走治理后台 `POST /api/v1/admin/data/reconcile`。

**合流备注**：主工作树有 3 个同名未跟踪文件（`session-client{,.test}.ts`、`session-contracts.ts`，非 arch 所留），已备份至 scratchpad 后让路。


---

### P-040 Codex 独立产品审查（2026-09-05，非实现方立场，只读）｜arch 逐条裁决

| # | 审查意见 | 核实 | 裁决 | 落点 |
|---|---|---|---|---|
| 1 | 首次使用死循环：无授权不同步→无同步无账户→无账户无法补授权 | ✅属实（`planJob` `ACCOUNT_SCOPE_MISSING`） | **采纳**：R-013 删 all_accounts 快捷值，加只读 `discover:accounts` → 人确认 → 显式 grants | inbox-codex R-013 修订 |
| 2 | 北极星只看考核达标率会诱导"关户刷达标" | 产品判断 | **交老板**（选择题） | PRD §1 |
| 3 | "操作后变好"≠"AI 效果"；执行成功≠经营成功；升档只看见效率 | 产品判断 | **交老板**（选择题）；arch 倾向采纳命名改「操作后观察结果」+ 升档加执行可靠性/作用范围/未知结果/损失边界四独立门 | PRD §4 自治度/Shadow |
| 4 | "其余 43 户在阈值内"需前置条件；空间切换要常显来源/日期/口径；团队数据不驱动个人写 | ✅页面规划与 api.md:343 互相矛盾 | **采纳**：api.md 冻 `meta.coverage` 三态；页面规划改常显五件；团队只读已由 Task5 实现（在 Repository 前拒绝） | api.md / F-006-页面规划 |
| 5 | 策略中心应产出可保存复用的"投放方案"而非几张交叉表 | 产品判断，P1/P2 | **记录**：3.11 策略分析未开发，做时按"方案对象"设计（适用任务/证据/推荐/小范围验证/交工作流）；不承诺自动最优 | 缺口地图 3.11 备注 |
| 6 | 首次/日常/高级体验分层；默认别像九个系统放一起 | 合理 | **部分采纳**：写进协作规范"三个可用版本"；工作台仍是首页，但 F-006 顺序是否改为数据总表先做交老板 | 协作规范 §5 |
| 7 | 工程风险=模块多、首次闭环靠后；每批加"用户验收句"；R-010a 太大 | ✅ | **采纳**：协作规范加验收句规则；R-010a 拆 a1「每天能看」/a2「每天能处理」 | 协作规范 / inbox-codex R-010 |
| 8 | 契约旧规则与新规则叠在一起（api.md DATA-ROUTE 与 BE-001 矛盾；缺口地图"待契约补=0"但 14 行仍挂） | ✅属实 | **采纳**：DATA-ROUTE-001 重写为唯一规则并注明取代关系；缺口地图 14 行同步到 v1.4 状态 | api.md / 缺口地图 |

坚定保留项（审查也认可）：看板为主对话为辅、确定性计算与 Agent 分工、四入口共用原子能力、官方模板与自由编排共存、执行未知态/凭证归属/账户三键/失败保旧快照、CR 复用。对外表达改为「复用技术已有执行能力，把 KA 的经营场景、数据口径和工作流程产品化」——老板定。
