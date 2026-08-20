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

### P-KB-001 资料研究与知识资产角色注册 + 首批白盒/黑盒资料审查｜research/knowledge（Codex）

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
