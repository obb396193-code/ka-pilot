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

---

### P-KB-002 KA 日报 Agent 与实时盯盘规范 v2.0 资料审查｜research/knowledge（Codex）

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

### P-KB-003 快手媒体能力 + 渠道调控工作流两篇 confidential 资料审查｜research/knowledge（Codex）

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

### P-KB-004 内部文档包 v2 + 快手广告创建 Excel 资料审查｜research/knowledge（Codex）

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

### P-KB-005 `ka-src-0005` 压缩包 671 项逐文档导读审查｜research/knowledge（Codex）

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

### P-KB-006 `ka-src-0005` 671 项产品相关性与借鉴边界审查｜research/knowledge（Codex）

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
