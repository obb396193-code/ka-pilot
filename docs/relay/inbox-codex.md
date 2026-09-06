# Codex 信箱

> 规则见 `docs/relay/README.md`。派活方往下追加条目，Codex 处理完更新状态列。

### R-001 ✅已完成（复核意见已合并进 PRD v1.2，台账 #123-126）

- 派活方：arch（Claude）
- 日期：2026-08-18
- 背景：PRD 已迭代至 **v1.1**（`docs/20-PRD-v1.md`）：含二轮查漏（数据运维域/时间终端域/追溯补入 §3.13-3.15）。功能全集底稿=`docs/21-功能全量铺开清单.md`（19 域约 170 点）。老板已定流程：**你复核通过 → 定导航 → 原型图 → 契约 → 开工**。
- 要求（按顺序做完四件事）：
  1. **复核 PRD v1.1 全文**：对照你的 v0.4 找遗漏/矛盾/不可行；重点审 §3.1 库表 schema（新增 §3.13 的运维要求会改 schema：降采样分区/备份/重算链）、§4.4 批次依赖（B1 现在含 backfill 90 天+语义层契约，量变大了是否要拆）、§4.1 全 FaaS 拓扑。
  2. **审一级导航**：PRD §2.1 的 7 项+更多菜单方案，对照 170 点全集看是否还成立（新增的数据运维/搜索/移动端会不会改变布局）。给出你的导航终版建议。
  3. **审库表 schema 增补**：§3.13/3.15 要求的新表（duty_roster 值班表/etl_runs 任务运行/business_calendar 业务日历/backfill_jobs）和既有表改动（metrics 表分区与降采样、changesets 加 what-if 字段），给出你的 schema 终版意见。
  4. 结论写 `docs/plans/codex-PRD复核意见.md`：分【同意】【异议+理由】【补充】【schema 意见】【导航意见】五节。
- 边界：只读+写复核意见文件，不改 PRD 本体（改动 arch 合并）；不动 apps/ 代码。
- 状态：已完成（产出：`docs/plans/codex-PRD复核意见.md`；结论：有条件不通过，待 arch 修订 PRD 后复核）

### R-002 ✅已完成（v3 首批 11 页 + 网页画册）

- 派活方：arch（Claude）
- 日期：2026-08-18
- 背景：老板要求用 image 生成能力出前端原型图，拍板视觉后开工。
- 要求：
  1. 读 `docs/plans/原型图生成指令.md`（arch 出稿的逐页提示词，含 D-CON 设计规范全量约束）。
  2. 用你的图片生成能力**按提示词逐页生成**，一页一图，存 `docs/prototypes/v3/`，命名 `p01-工作台.png` 起。
  3. 生成后自查：中文文字是否清晰、数字是否 tabular 风格、配色是否符合 D-CON（主橙 #ff6a2c/四级灰阶/红负绿正）、布局与提示词的 ASCII 线框是否一致。不合格的页重生成。
  4. 完成后在本条目下回执：页数/路径/自查结论。
- 边界：只写 docs/prototypes/v3/ 和回执；原型图仅供拍板，不是像素稿。
- 状态：已完成。使用内置 image generation 按 `docs/plans/原型图生成指令.md` 逐页生成 11 张，保存于 `docs/prototypes/v3/`；网页画册为 `docs/prototypes/v3/index.html`。自查：适用页面均为九项导航且第九项为「集成与通知」；D-CON 灰白底+克制橙、红负绿正符合；11 页布局与指定场景一致；中文标题、关键指标和主要按钮整体清晰。图像为视觉讨论用概念稿，个别次要表格行文不作为像素级文案依据。


### R-003 ✅已完成（六 P0 已由 arch 定向清理为 v1.3）

- 派活方：arch（Claude）
- 日期：2026-08-18
- 背景：你的 R-001 复核意见 + 老板全部终裁已合并进 PRD v1.2（`docs/20-PRD-v1.md`）。本轮验证合并质量，通过即冻结 PRD 进契约阶段。
- v1.2 相对你上次复核的变化（重点核对这些）：
  1. 老板六终裁：工作流画布做（模板+自由编排）／钉钉群查数做／网关独立部署／公共资产五段全套（表全字段 UI 两态起步）／素材拆片做（复用 CR）／卡片 L0-L3 四档全做
  2. 你的六项修正全部采纳：部署拆三单元（Web-API/Worker-Scheduler/DingTalk-Gateway + job/outbox 表 + DB lease）／B1 拆 B1a/b/c／Schema 契约硬要求（含你列的 30+ 缺失表）／LLM Provider 抽象+现状如实／充值提审改"自愿快捷方式非门槛"／补 6 缺失件（加关账户/选品/相似查找/群建工作项/运行监控页/能力目录）
  3. 老板新终裁：**每用户三凭证自持**（奇航 userId+Multica mul_ PAT+IdeaLab AK，secret ref；谁操作用谁的凭证；无 PAT 降级只读+深链；服务级后台任务 demo 用老板 PAT→正式化 mcn_）
  4. **一级导航老板定稿 9 项**：工作台/投放任务/数据分析/账户资源/自动化/商品素材/报告/知识库/钉钉中心 + 头像菜单(设置+治理后台)；工作台加警报监控区；数据分析加完整数据总表；值守与警报配置放钉钉中心；协作=工作台 tab
  5. 商品素材域改"数据可得性优先"（能拿到数据做深，拿不到保持占位）
- 要求：
  1. 逐项核对上述 5 组变化是否在 PRD v1.2 中正确落地、无自相矛盾（重点：每用户 PAT 模型与 Worker 后台任务的凭证归属是否写清；三部署单元与钉钉中心页面的关系；画布与模板商店的数据模型一致性）
  2. 按 126 条基线重新给覆盖统计（用你的"能否直接指导开发"口径）
  3. 结论写 `docs/plans/codex-PRD-v1.2复核意见.md`：【通过/有条件通过/不通过】+剩余问题清单（如全部解决则明示"可冻结进契约"）
  4. **通过后直接开始 R-002 原型图生成**（指令已更新至 11 页，导航 9 项已定稿）
- 边界：只读 PRD+写复核意见；不改 PRD 本体。
- 状态：已完成二轮复核（结论：**有条件通过，暂不可冻结、暂不启动 R-002**；产出：`docs/plans/codex-PRD-v1.2复核意见.md`。待 arch 清理六个 P0 合并矛盾并回派 diff 复核）


### R-004 ✅已完成（发现六处残留，已由 arch 修为 v1.4）

- 派活方：arch（Claude）
- 日期：2026-08-18
- 背景：你的 R-003 六个 P0 + 导航/页面清单问题已定向清理（零新功能），PRD 现为 v1.3。
- 清理清单（逐条 diff 核对）：P0-1 旧示意 Schema 标注废弃+硬要求为准｜P0-2 三单元全文一致（ETL 调度改 job/outbox+DB lease、monorepo 改 apps/web+worker+dingtalk-gateway+packages/db+domain、SQLite 降为仅本地开发、三单元共享须网络库）｜P0-3 后台任务凭证归属闭环（credential_owner 固化/重试用原凭证/blocked_auth/服务任务仅只读/Secret 服务非 config vars）｜P0-4 工作流单一数据模型（模板=definition 发布态，删 workflow_templates 表）｜P0-5 卡片四档/资产五段/充值协作文案统一｜P0-6 Provider Capability Matrix 替换旧通路行｜导航九项全文统一（标题/布局规范/页面清单补 9 页新路由）｜B7 验收更新
- 要求：diff 核对以上各项；结论写 `docs/plans/codex-PRD-v1.3复核意见.md`（【可冻结/仍有问题+清单】）；**可冻结 → 直接开始 R-002 原型图（11 页）**。
- 状态：已完成 diff 终验（结论：**仍有问题，不可冻结，R-002 暂不启动**；产出：`docs/plans/codex-PRD-v1.3复核意见.md`。P0-1/P0-4/P0-6/B7 已通过；P0-2/P0-3/P0-5/导航仍有旧行残留，待 arch 按六处精确修改后再次回派）


### R-005 ✅已完成（5/6 通过，余 2 处"充值提审"已修为 v1.5）

- 派活方：arch（Claude）
- 日期：2026-08-18
- v1.4 修复清单（每处均已 grep 验证清零）：①ASCII 导航+编号表九项（含协作 tab/警报区/值守配置归位）②补 `/dingtalk/cards` 卡片管理路由；Run 页 `/admin/runs`→`/automation/agent-runs`（普通用户看自己的 Run）③§6 安全条款改"应用级密钥进 config vars/每用户三凭证走 Secret 服务只存 reference" ④充值移出提审示例，独立标注"申请充值协作非审批不阻断"（REQ-046）⑤§3.13 备份行改三应用网络 PG+恢复演练，删 SQLite dump ⑥单应用拓扑段删除（4.1.1 改纯外部依赖清单）+monorepo 三应用完整结构+4.3 分工改 apps 归属
- 要求：只 diff 这六处；结论写 `docs/plans/codex-PRD-v1.4复核意见.md`：【可冻结】或残留清单。**可冻结 → 立即开始 R-002 原型图（11 页）**。
- 状态：已完成最终 diff（产出：`docs/plans/codex-PRD-v1.4复核意见.md`）。六项中 5 项通过；充值语义仍残留 `断量充值提审流`、`“充值提审”入口` 两处旧词，因此暂不可冻结，R-002 继续阻塞。另按老板追加要求完成 126 条总对账与导航复核，导航待老板在“当前九项”与“八个业务一级+集成入口”之间拍板。


### R-006 ✅已完成（diff 全通过；名称分歧已由老板终裁）

- 派活方：arch（Claude）
- 日期：2026-08-18
- v1.5 修复：L361 工作流模板"断量充值提审流"→"断量充值协作流"；L474 REQ-046 段入口统一命名「申请充值协作」。grep "充值提审" 已清零。
- **导航老板终裁：维持九项（钉钉中心留一级），不采纳八项+右上角方案——此项关闭不再议。** 你 R-005 提的"自动化二级加操作工具箱（承接查数/改价/基建/关户原子能力）"合理，已一并落入 v1.5（见下）。
- 要求：diff 两处修复+工具箱补充 → 结论写 `docs/plans/codex-PRD-v1.5复核意见.md`【可冻结/残留】。**可冻结 → 不再等待，直接开始 R-002 十一页原型图生成**（指令 `docs/plans/原型图生成指令.md`，导航九项）。
- 状态：已完成指定 diff（产出：`docs/plans/codex-PRD-v1.5复核意见.md`）。两处充值文案与“操作工具箱”均通过，`充值提审` 已清零；但老板最新原话可能是“第九个一级入口保留并改名集成与通知”，与当前文档直接写死“钉钉中心且议题关闭”存在解释分歧。为避免 11 张原型导航返工，待老板明确 A“钉钉中心”或 B“集成与通知”后再冻结并启动 R-002。


### 【冻结通知 + R-002 立即开始】

- 2026-08-18 老板终裁：第九项一级导航=**「集成与通知」**（保留一级与业务域并列，不收头像菜单；一期钉钉仍是唯一重点渠道，命名为全渠道留位）。二级六项：接入管理/群助手/推送订阅/卡片中心/值守告警/消息记录。
- **PRD v1.6 已冻结进契约阶段**（导航改名+二级六项已落文档，路由 /dingtalk→/integrations）。
- **R-002 立即开始，不再有任何前置**：按 `docs/plans/原型图生成指令.md`（通用前缀里第九项名已改「集成与通知」）生成 11 页原型图+v3 画册。完成回执本信箱。


### R-007 后端 B1a 开工：契约存储层（与 R-002 生图并行）

- 派活方：arch　日期：2026-08-18
- 前置阅读（顺序）：`packages/contract/schema.sql` + `metrics.md` + `api.md`（唯一事实源）→ `docs/23-开发协作规范.md`（纪律）→ PRD v1.6 §3.1/§4。
- 交付物（目录边界：apps/worker、apps/web/app/api、packages/db、packages/domain）：
  1. `packages/db`：按 schema.sql 出迁移（node-pg-migrate 或 drizzle，你选并在状态文件记录理由）；迁移可重放；分区表按月建
  2. `packages/domain`：metrics.md 全部派生指标纯函数实现 + 单测（含环比 NEW/null 边界、双口径合并、零耗日剔除）——**这是"agent 不算数"的唯一计算实现**
  3. `apps/worker` 骨架：jobs 表轮询消费器（DB lease，SELECT FOR UPDATE SKIP LOCKED）+ etl_full/etl_incr 两个 job handler（调奇航 get_data，userId 从 payload 取）+ etl_runs 留痕 + 失败重试进 outbound 告警
  4. qihang client：GET get_data 封装（account/account_offline/account_realtime/ad_realtime 四 resource；502/503/504 重试 3 次指数退避；鉴权失败不重试直接 blocked_auth）
  5. metrics_raw 落库 → canonical 合并 job（字段级合并规则见 metrics.md）
- 工程纪律：`[be]` 前缀路径限定 commit；在自己分支 `be/b1a`；建 `docs/plans/B1a-状态.md`（从 CR 状态文件模板样式）逐条更新；完成给 SHA 等 arch 验收
- 本地环境：PG 用 docker 本地起；**不碰 SQLite**；奇航接口本地不通就写 client 单测（mock HTTP 层），真实连通在内网联调
- 契约缺口：写 inbox-arch.md 提议，不自己发明字段
- **✅ P-001~P-003 已裁决**（2026-08-19）：契约 v1.1 已冻结（SHA 4696fdf），9 条问题全部已落契约本体；inbox-arch.md 已更新逐条回复。**继续 B1a**：按契约 v1.1 补 migration 主键变更（复合主键含 workspace_id）、`metrics_raw.resource` 持久化/回放、Worker/gateway composition 对接三新端点（`POST /agent/sessions/:id/query` + `POST /tasks` + `POST /work-items/:id/reply`）；完成交最终 SHA 等 arch 逐条验收。
- 状态：已完成（最终 SHA `f98952f8cf1daae126e22c431052d688644237c9`；回执见 `inbox-arch.md` P-004）

### R-002 补充：生图与 R-007 并行不互斥，先完成生图批次再开 B1a 亦可（自行排程，两者本周内都要有产出）


---

### R-008 后端 B1b：回灌+口径计算+对平（2026-08-19 扩充批次）

- 派活方：arch　日期：2026-08-19
- **前置：R-007 B1a 完成**（migration + domain 纯函数 + jobs 骨架 + qihang client + metrics_raw→canonical 合并）
- 交付物（apps/worker, packages/domain, apps/web/app/api）：
  1. **90 天历史回灌**：backfill_jobs 表驱动；job handler `backfill_historical`（date_from/date_to 拆分每日 etl_full job 入队）；cursor_date 断点续传；失败单日重试不阻塞全量；backfill 完成触发首次 canonical 全量聚合
  2. **口径计算完整实现**：packages/domain 现有纯函数接入 Worker 聚合管线；account_metrics_daily 表按日聚合写入（调用 `computeMetrics()` 含 real_cpa/cash_cost/cash_cpa/cost_space/gap/环比）；assessment_price_history + channel_coefficients JOIN 取快照值；零耗日剔除均值（`excludeZeroSpendDays()`）；field_sources JSONB 记录每字段来源（offline/realtime/gap_filled）
  3. **数据对平自检**：data_quality_checks 表；每日 ETL 完成后自动触发三类检查：①总量对账（sum(account_metrics_daily.cost) vs sum(metrics_raw.cost) 容差 0.1%）②异常值检测（real_cpa > 5×assessment_price 标 data_anomaly=true）③缺失日检测（连续 2 日无数据→outbound 告警）；不通过写 data_quality_checks.passed=false + delta JSONB
  4. **Worker 调度完善**：jobs 表 priority 字段生效（backfill=1/etl_incr=5/rule_scan=3）；lease_until 超时回收（startup 时扫 leased 超 10min 改 queued）；max_attempts 耗尽→status=failed + outbound 钉钉告警；blocked_auth 单独处理（不重试，outbound 通知绑定凭证）
  5. **etl_runs 留痕完整**：scope JSONB 记录（user_id/date_range/resource）；step_failed 字段（fetch/parse/merge/aggregate 哪步挂了）；rows_ingested 统计；finished_at - started_at 耗时
- 测试要求：Worker 单测覆盖（jobs 轮询/lease 竞争/重试指数退避/blocked_auth 分支）；domain 纯函数已有 56 tests 继续保持；**本地 docker PG 跑通 90 天 mock 回灌**（造 10 账户×90 天 metrics_raw，验证 canonical 聚合正确+对平通过）
- 工程纪律：[be] 前缀 be/b1b 分支；状态文件 docs/plans/B1b-状态.md；完成交 SHA + 本地回灌日志截图（显示 90 天进度+对平结果）
- 状态：已完成（最终 SHA `50e301454af44e60028fc9f904abb159031df2bd`；修正方案见 `inbox-arch.md` P-005，最终回执与证据见 P-006）


---

### R-009 后端：契约 v1.2 落地 + P0 收口 + 数据源绑空间（2026-09-04 arch 接回首批）

- 派活方：arch（Claude）　日期：2026-09-04
- **先读**：`docs/relay/inbox-arch.md`「2026-09-04 arch 接回裁决」全文 → `packages/contract/schema.sql` 头部 v1.2 注释 + 各表 P0-xx 注释 → `metrics.md`「缺数三态」「一账户一任务」→ `api.md` DATA-ROUTE-001 v1.2 修订块。
- **基线**：`main@v0.2-unaudited-baseline`（=integration-control d121273）。**从 main 拉 `be/r009`**，不再用 integration-control；root 审查会话已退役，契约只认 arch。
- 交付物：
  1. **migration 011**（008-010 已被 B23 占用；Task6 工作树里未提交的草稿 `011_team_data_sync.cjs` 作废，团队数据接入改用 013 见 R-011）：`CREATE EXTENSION btree_gist`；`task_accounts` EXCLUDE gist 区间排斥；`workflow_runs.executor_token/executor_lease_until`；新表 `workflow_effects`；`inbound_events` +`lease_until/attempts/max_attempts/last_error/processed_at`；`changesets` 两个复合 FK→users；`changeset_items` +`workspace_id/media/account_id`+FK；`backfill_jobs.status` 五态 +`failed_stage/finished_at`。真实 PG up/down/up 重放。
  2. **P0-04 缺数三态**：`semantic-query-metrics.ts`、`report-facts-source.ts` 及所有 `COALESCE(sum(...),0)` 改为 `{value, availability}`；聚合含 missing 即 missing；补"某日无行/字段缺/权限内无数据"三类反例，断言 UI 侧拿到 `null + missing` 不是 0。
  3. **P0-05**：task_accounts 写入端捕获排斥冲突→409 `TASK_ACCOUNT_OVERLAP`；任务聚合删多任务分摊分支；考核价查询去 `LIMIT 1` 任取。
  4. **P0-07**：Runner 推进前 `SELECT ... FOR UPDATE` 校验 executor_token；写节点先 INSERT `workflow_effects`，UNIQUE 冲突直接读回结果不重放；补两 Worker 并发 advance 同 run 的真实 PG 反例。
  5. **P0-12**：`dingtalk-adapter` 改为 INSERT inbound_events 成功后才 ACK；`message-handler` 走 lease 领取，失败 attempts+1 留错，超 max 进 dead；补"ACK 前崩溃""claim 后失败"两反例。
  6. **P0-13**：changeset 创建/确认/执行前校验 initiator 与 credential_owner 为同 workspace active user；items 写入账户三键；补跨 workspace 伪造 ID 反例。
  7. **P0-03**：backfill 协调器按 raw→canonical→quality 三阶段推进 status，任一失败置 failed+failed_stage。
  8. **数据源绑空间**：`query-service` 按 `approvedAuthContext.workspaceKind` 固定 source（personal→platform，team→ka_data），普通业务 BFF 与 `/api/v1/data/query` **不再接受 `dataView`**（收到即 400）；reconcile 仅 entitlement allowlist；Task6 团队数据接入按此调整。
  9. **Session BFF**：`codex/fe-task5-session-bff` 两笔——`c3ed7b3`（4 个 auth BFF 路由 + session-bff 库，303 行测试）+ **`c5df265`（data/tasks/work-items/changesets 四条 route 与 bff/task-list-bff/read-model-bff/contracts 全部改 Cookie Session，366+/397−，工作树已 clean）**——exact-SHA 审后合入 be/r009，跑全门禁；旧 `codex/fe-functional-bff-v2@110f221` 基于 x-ka 旧鉴权，不合。
  10. **补 root 指出的集成测试缺口**：`business-read-session-pg.integration.test.ts` 用真 Repository 覆盖 personal/team 的 query/tasks/work-items/detail、team changeset 403、伪造 x-ka-*、旧 token、跨 workspace、同 accountId 跨 media、logout 后全 401。
- 纪律：`[be]` 前缀路径限定 commit；不动 `packages/contract/`（缺口写 inbox-arch）；不动 `apps/web` 非 api 部分；状态文件 `docs/plans/R009-状态.md`；完成交 SHA + 四包测试数 + 真实 PG 证据。
- 状态：进行中（`be/r009`；Session BFF 已收口；migration 011 代码 `351d039` 已完成真实 PG up/down/up 与 DB 全量 177/177；hh 0..24 边界代码 `7aea1dc` 已通过 Worker 623 tests + 2 opt-in skipped；均等待 arch exact-SHA 审查；R-009#13 四项定位见 `docs/plans/R009-状态.md`）


---

### R-010 后端：契约 v1.3 落地 + B2-B5 内核接成 HTTP/BFF（2026-09-04；与 R-009 串行，R-009 先）

- 派活方：arch　日期：2026-09-04
- **先读**：`docs/relay/inbox-arch.md`「2026-09-04 arch 裁决：root 攒的 B2-B5 契约差异包」（29 问裁决）→ `packages/contract/schema.sql` 末尾「v1.3 新增」→ `api.md` 末尾「v1.3 DTO 与状态机」→ `docs/plans/2026-09-04-契约对齐与缺口地图.md`（哪些是"内核有 HTTP 没接"）。
- 基线：R-009 完成后的 `be/r009` 头 → 拉 `be/r010`。
- 交付物：
  1. **migration 012**（v1.3 全部：alert_rules 条件树、work_items 去重三列+partial unique、account_mutes、ad_entities.created_at、changeset_items JSONB typed value、changesets 双 hash、agent_messages/context FK+seq+client_message_id、agent_runs 九列、agent_run_events、model_provider_credentials、provider_model_capabilities）；真实 PG up/down/up。
  2. **工作项 HTTP**：`GET /work-items/:id`、`POST .../ignore|process|reject|escalate|dispatch|reply`、`POST /accounts/:media/:id/mute`、`POST /rules/:id/explain`——按 api.md v1.3 状态机与详情 DTO；去重/复发/P0 突破静音落 Repository。
  3. **变更集 HTTP 全流程**：`POST /changesets`、`/dry-run`（写 dry_run_hash）、`/confirm`（hash 校验 + 409 DTO + 幂等）、`/rollback`、`/retry`、`GET /:id`；typed value；execution_run DTO。
  4. **任务 HTTP**：`GET /tasks/:id`（含 pacing v1.3 语义）、`POST /tasks`（幂等）、`PATCH /tasks/:id`、`POST /tasks/:id/assessment-price`（重算+通知 DTO）、`GET /tasks/:id/timeline|accounts`。
  5. **账户 HTTP**：`GET /accounts/:id`（小传+余额+倒计时）、`/structure`、`/timeline`、`POST .../star|tags|transfer`。
  6. **语义查询 HTTP**：`POST /api/v1/query`（summary/dimension/trend/table/health）接 B1c 内核；dimension 只开 account/task/biz，其余返回 `DIMENSION_UNSUPPORTED`。
  7. **日报 HTTP**：`GET /reports/daily?date=&role=`；把 `docs/18-KA日报规范借鉴.md` 12 模块字段抄进 api.md 附录并按 `daily-report/v1` 返回。
  8. **Agent HTTP/SSE**：`POST /agent/sessions`、`POST .../messages`（SSE 七帧）、`POST/DELETE .../context`、`GET /agent/runs`、`GET /runs/:id/events?after_seq=`、`POST /runs/:id/cancel`；诊断按 `diagnosis/v1`。
  9. **系统 HTTP**：`GET /system/health`、`GET /system/etl-runs`、`POST .../rerun`（admin）、`GET /search?q=`（非 LLM）。
  10. **Next BFF**：以上全部对应 `/api/internal/*` 路由，转发 Session cookie + requestId，不接受 `dataView`。
  11. **Capability Registry**：把 ka-src-0007 评估列出的快手 MAPI 核心能力（campaign update/status、unit budget、creative update/status/review、四层实时 report）录入 `provider_model_capabilities` 同构的 capability 表（B7 Registry），状态 `documented_unverified`；修 kuaishou-cli 2 处 HTTP 方法冲突。
- 拆批（**2026-09-05 修订**，按"用户闭环"切，不按模块切）：
  - **R-010a1「每天能看」**：#6 语义查询（summary/trend/table/dimension/health，`meta` 补 `workspaceKind`）+ #9 `GET /system/health`/`etl-runs` + #5 `GET /accounts/:id` 小传/余额 + BFF。**验收句**：合入后老板能在数据总表/大盘/账户池用真实奇航数据看全字段、下钻账户、导出 Excel。
  - **R-010a2「每天能处理」**：#2 工作项动作 + `meta.coverage` 三态（api.md 9-5 冻结）+ #3 变更集全流程 + #4 任务详情/写 + #5 其余。**验收句**：老板能在工作台看到有证据的队列、处理或跳后台、T+1 看到回收。
  - **R-010b**：#7 日报、#8 Agent SSE、#9 rerun/search、#11 Registry。
  - 每批 SHA + 四包测试数 + 真实 PG 证据 + HTTP 负向用例（401/403/409/410）。**不能写出验收句的项标"基础建设"，不计入可用功能。**
- 纪律同 R-009；契约缺口写 inbox-arch，不自造 DTO。
- 状态：待处理（等 R-009）

#### R-009 追加（2026-09-04 arch 六簇审计新发现）

11. ~~Task4 P1-1 登录 credential oracle~~ **撤回**（arch 2026-09-04 复核：`session-http.ts` `login()` 两条失败路径均走 `loginFailure()` 统一 401，测试 `session-http-service.test.ts:140-170` 已断言一致；我 grep 到的 401/403 分叉是已登录后的 `view()`，属正确行为。root Task4 复验结论成立）。
12. **hh 上限不一致**：`apps/worker/src/etl/payload.ts:37` `max(23)` → `max(24)`（奇航实证 hh=24 有效=全天，与 `qihang/client.ts:156` 一致）。
13. 交付时在状态文件逐条定位以下 4 项代码行给 arch 复核：B4 pacing 零量日剔除、B13 下载 allowlist 默认拒绝、B23-C2 首次 full ready 门、B10 离线分区有界回退。


---

### R-011 后端：Task6 团队数据接入（按 v1.2「team→ka_data」重做；2026-09-04）

- 派活方：arch　日期：2026-09-04　顺序：R-009 → R-010a → **R-011** → R-010b
- **现场**：`/private/tmp/ka-personal-team-task6-20260904`（`codex/personal-team-task6-ingestion@4e67315`）。其中 `f009e19`（个人 Session 候选查询 `LIMIT 2` 稳定排序）可独立审后合入；`feec2ec/6d02cfe/4e67315`（source-neutral 团队接入计划/Domain contract/staging 设计）与未提交的 `011_team_data_sync.cjs` 草稿**按旧"奇航主源、KA Data 备用"设计写的，与 v1.2 冲突，作废重做**——但 root 停工前补的六条设计要求**全部保留**：
  1. 团队同步不逐页直接覆盖当前 canonical；
  2. run-scoped staging / versioned rows；
  3. 全部页 + coverage + lineage 验证通过后才原子 publish；
  4. 失败/中断保留上一个 completed snapshot；
  5. unknown lineage 可表达但不得宣称 ready；
  6. 团队失败不影响个人 workspace。
- 交付物：
  1. **契约提案先行**（写 inbox-arch，arch 冻结后再动代码）：team workspace 的数据表——是复用 `account_metrics_daily` 加 `source='ka_data'` + `snapshot_run_id` 列，还是独立 `team_account_metrics_daily`？staging 表形状、publish 事务、snapshot 保留策略、lineage 字段。**arch 倾向**：复用 canonical 表 + `snapshot_run_id` + `published_at`，personal 行 `snapshot_run_id IS NULL`，查询按 workspaceKind 过滤；但由你给出两案利弊。
  2. **migration 013**（编号让开 011/012）。
  3. `ka_data` → staging → 校验 → publish 的 Worker job 链（`team_sync_run`/`team_sync_page`/`team_sync_publish`），确定性 job id，失败保留上一 snapshot。
  4. 团队 readiness：不依赖个人 grants/credential owner（root P2 指出的 partial/stale 永久降级问题一并修）。
  5. 真实 PG 反例：中途失败保 snapshot、并发两 run 只发布一个、团队失败不动个人行、unknown lineage 不 ready。
- 联调硬门（不在本批）：ka-data 服务 owner/ACL/只读性核实、**同日同户对平（奇航 vs ka-data）**交 OS agent。
- 状态：待处理


---

### R-012 后端：契约 v1.4 落地（2026-09-04；顺序 R-009 → R-010a → R-011 → **R-012** → R-010b）

- 派活方：arch　日期：2026-09-04
- **先读**：`inbox-arch.md`「契约 v1.4」表 → `schema.sql` 末尾「v1.4 新增」→ `api.md` 末尾「v1.4 端点与 DTO」。
- 交付物：
  1. **先提案再动手（两周内）**：素材域 7 表、结算 3 表的**列定义 + DTO**——从你已做的 B12-B19 domain 类型反推，写 inbox-arch 提案（表名/主键/端点名已冻不改），arch 审后补进契约再实现。
  2. **migration 014**：v1.4 其余全部（escalations/policies、dispatches/approvals/auto_pass、accounts 六列、ad_entities 两列、kb 四表 + FTS 索引、card 三表）；seed 三行 escalation_policies；真实 PG up/down/up。
  3. **HTTP**：警报流 + ack/pause + roster + policies；派发/回执/提审/批驳/免审；任务 `GET /:id` overview、`/metrics`、`/funnel`、`/timeline`、accounts capacity、materials/review 501；账户 import/close 向导/confirm/open-flow；kb 全部 + 两个归档 job；卡片 templates/instances/callback（L0-L3 分流 + hash + identity_mappings 实名）；subscriptions/mine。
  4. **8 维**：dimension 枚举全开；agent_type/is_ubp/deduction_range 三维接通；resource_position/bid_tool 在 OS 确认字段前返回 `DIMENSION_UNSUPPORTED`。
  5. **BFF**：以上全部 `/api/internal/*`。
  6. 反例：升级链倒计时暂停/恢复、派发 T+1 自动关闭、免审计数、关户向导有未关工作项拒绝、卡片 hash 不匹配 409、卡片重复 idempotency_key、kb 双链重建、team 空间 kb 只读。
- 纪律同前；素材/结算提案期间不实现其 HTTP。
- 状态：待处理（等 R-011）

#### R-009 第一批 ✅通过（P-038）→ 继续第二批（2026-09-05）

- **先 `git merge main` 进 be/r009**（main 已含契约 v1.3/v1.4 + api.md 漂移修正 `d070c1d` + 本次合流），再开工。
- 第二批范围 = R-009 剩余全部：#2 P0-04 三态（按 api.md 新 BE-001：`MetricValue` + row schema **v2** + fixtures 升级）、#3 P0-05 409、#4 P0-07 fencing+effects、#5 P0-12 durable inbox、#6 P0-13 校验、#7 P0-03 五态（**顺手加 status CHECK**）、#8 数据源绑空间（普通请求**拒绝** `dataView`→400；reconcile 走 `POST /api/v1/admin/data/reconcile` entitlement）、#10 双空间集成反例。
- 附带修 P-038 P2-1：删 `bff.ts:106` 假 token 兜底。
- 交付方式不变：状态文件逐条 + SHA + 四包测试数 + 真 PG 证据；P-039 起编号。

---

### R-013 后端：首次部署 seed 脚本（2026-09-05；小活，插在 R-009 第二批之后、R-010a 之前）

- 派活方：arch　日期：2026-09-05
- 背景：arch 核实空库登录路径——`createSessionForIdentity` 要求 `auth_identities` 行存在且 active、且恰好一个 active 的 personal membership（`workspaces.kind='personal'` + `workspace_users` actor），**代码里没有任何创建路径**（只有 benchmark 脚本 insert workspaces）。首次内网部署必卡登录。OS 消息见 `docs/plans/发给内网agent-2026-09-05-部署准备与联调门.md` 三.3。
- 交付物：
  1. `packages/db` 新增 `npm run seed:bootstrap -- <json>`：输入 JSON = `{identities:[{id, display_name}], workspaces:[{id?, kind, name}], memberships:[{identity_id, workspace_id, user_id?, role}], grants:[{workspace_id, media, account_id, user_id}]}`；**幂等**（重复跑不重复插、不改已有行），单事务，不接受任何密码/token 字段（出现即拒绝）。
  2. 个人空间账户授权：一期裁决 = **credential owner 拿到 ETL 拉回的该 workspace 全部账户**（老板 userId 名下本来只看得到自己的户）。seed 支持 `grants: "all_accounts_in_workspace"` 快捷值，在 ETL 首跑后再执行一次即补齐。
  3. 团队空间：seed 一个 `kind='team'` workspace + 该 identity 的 readonly membership（R-011 接 ka_data 前就要能切进去看空态）。
  4. 示例 JSON 放 `packages/contract/fixtures/seed/bootstrap.example.json`（UUID 全是 `00000000-0000-4000-8000-0000000000xx` 形态，不含真实身份）；runbook `docs/runbooks/2026-09-04-DataAPI内网部署与环境变量.md` 加"§2.5 首次 seed"一节（migrate 之后、start:data-api 之前）。
  5. 反例：identity 重复 → 幂等不报错；一个 identity 两个 personal membership → 拒绝；grants 引用不存在的 workspace → 整批回滚；JSON 含 `password|token|secret` 键 → 拒绝启动。
- 边界：不动 auth 逻辑本身；不动 migration；不给默认账号（没有 seed JSON 就什么都不做）。
- 验收：真 PG 空库 → migrate → seed → `POST /api/v1/auth/login`（internal_test）200 → `GET /session` 显示 personal 空间 → switch 到 team 200 readonly。
- 状态：待处理（R-009 第二批交付后做，P-04x 编号继续）

**R-013 修订（2026-09-05，Codex 审查会话指出的死循环，arch 核实属实）**：`workspace-sync-service.ts` `planJob` 在授权账户为空时返回 `ACCOUNT_SCOPE_MISSING` 不发首次全量——所以"ETL 首跑后再补授权"走不通。改为：
- **删除** `grants: "all_accounts_in_workspace"` 快捷值；grants 必须显式列账户。
- 新增 **只读发现命令** `npm run discover:accounts -- --media KUAISHOU`（apps/worker）：用 `WORKER_SERVICE_QIHANG_USER_ID` 调奇航 `resource=account`（这本来就是授权的来源，不需要 grants），把 `{media, account_id, account_name, task_id, biz_name}` 列表打到 stdout（JSON），**不写库、不发任何 job**。老板看过清单 → 填进 seed JSON 的 grants → 跑 seed → 正常 tick 触发 etl_full。
- 反例加两条：grants 为空时 seed 成功但 sync tick 返回 `ACCOUNT_SCOPE_MISSING`（说明门还在）；discover 命令在无 `QIHANG` 配置时 fail closed 不伪造空清单。
- 这不是放宽安全边界，是把"首次账户发现→人确认→显式授权→同步"这条真实首次路径补齐；以后 4.5「加/关账户闭环」复用 discover。


---

#### P-039 ✅通过（1 条改动）→ 继续 R-009 第二批，不等审（arch 2026-09-05）

- `e69ea1e`/`5dfbbad` 逐行通过，结论表在 `inbox-arch.md` P-039（main）。
- **唯一改动要求**：`011_r009_backfill_state.cjs` 撞号。把 CHECK 两条 + 旧 done 重验 UPDATE **折进 `011_contract_v1_2_p0.cjs`**，删追加文件，迁移总数回 11，计数测试改回。理由：契约约定一版一文件（011=v1.2、012=v1.3、013=Task6、014=v1.4），同号靠文件名排序是隐式约定。011 未部署到任何环境，本地 `down`+`up` 即可。**批次末做，不打断当前 P0-05。**
- 继续顺序：#3 P0-05 → #4 P0-07 → #5 P0-12 → #6 P0-13 → #2 P0-04 三态/v2 → #8 绑源 → 集成反例。每子交付照 P-039 格式回执（P-041 起；P-040 已被产品审查占用）。
- **#8 绑源按今天重写的 DATA-ROUTE-001**（api.md 已替换旧文）：team + `KA_DATA_ENABLED=false` → `503 SOURCE_UNAVAILABLE`，不回退 platform 伪装团队数据；lineage 加 `workspaceKind`。
- 今天契约/派活另有三处与你相关，做到时再读：①R-013 修订（`discover:accounts` 只读发现，删 all_accounts 快捷值）②R-010 拆 a1「每天能看」/a2「每天能处理」，每批要写验收句 ③work-items `meta.coverage` 三态（api.md 9-5 冻结，R-010a2 实现）。
- 合流节奏：批次末一次 `--no-ff`；fe 账户池页若先要 #8，arch 提前合一次。


#### 契约 v1.4.1 追加（2026-09-05，老板定"成本与量"口径）→ 影响 R-010a1 / R-012

- 读 `metrics.md`「窗口化口径」+ `schema.sql` 末尾 v1.4.1 + `api.md` 末尾 v1.4.1。
- **R-010a1**：`summary/trend/table/dimension` 接受 `date_from/date_to`；窗口内指标先聚合再相除（不是日比率平均）；`lineage.window`；`cost_status` 三色 + reason 由后端按容忍带算。外推两式与 pacing 同源。
- **R-012**：`task_budget_history` 进 migration 014；`POST /tasks/:id/daily-budget-cap`；overview `daily_budget_cap` + `budget_usage_rate`；timeline kind；summary `budget_usage_rate`。无卡任务 → missing 不显 0。
- 不影响 R-009 二批。

- **口径纠正（2026-09-05 晚，老板）**：考核价/达标/成本空间全是**现金口径**（BI、扣返点后真钱）；`on_target` 改用 `cash_cpa`，账面 `real_cpa` 只展示（metrics.md 已改）。**R-013 seed 加 `channel_coefficients`**：首行快手 现金≈账面×0.7812（÷1.28），方向按 domain `cash_cost` 现有实现存值；老板确认后填生效日期。R-010a1 的 summary 同时返回账面/现金两组。
- **更正上一条**：折算系数不存倒数。契约 v1.4.1 补 `channel_coefficients.op ('multiply'|'divide')`（schema.sql 末尾）；**R-010a1 的 migration 012 加这一列**，domain `cash_cost` 按 `op` 施加（现在写死 `/`，改成按 op）；**R-013 seed 的 channel_coefficients 四行**（KUAISHOU ×0.7812 / TENCENT ÷1.045 / TOUTIAO ÷1.09 / BAIDU ÷1.51）依赖 012，部署顺序 migrate 全部 → seed 即可。

#### P-041 ✅通过 → 继续（arch 2026-09-05）

- `010e4bb`/`5228b44` 逐行通过（结论表 inbox-arch P-041）。约束名与 011 已核对一致。
- 继续：P0-07 → P0-12 → P0-04 三态/v2 → #8 绑源 → 集成反例 → 批末折 011。回执 P-042 起。
- 合流时 be/r009 会再 merge 一次 main：main 已含 v1.4.1（窗口化口径、`task_budget_history`、`channel_coefficients.op`、settings/change-log 端点）——**这些属 R-010a1/R-012，本批不做**，只需 merge 不冲突。
- Web 依赖告警不归你，已转 fe。

#### R-012 追加（2026-09-05）：口径设置端点

- `GET/POST /api/v1/settings/channel-coefficients`、`GET .../:media/history`、`GET /api/v1/settings/change-log`（三版本表 UNION）——DTO 见 api.md v1.4.1「口径设置与变更记录」。系数回溯改口径走与考核价改价同一重算链，响应 `recomputed_days`。

#### P-042 / P-043 ✅通过 → 继续（arch 2026-09-05）

- `a044e54`（P0-07）、`c6603d3`（P0-12）逐行通过，结论表 inbox-arch。两条 P2 不阻塞：claimExecutor 可加 run 终态过滤；withExecutor 的 loadAuthorized 合一。
- dead 定义已按你的实现冻进 schema.sql 注释（processed=false ∧ attempts≥max ∧ last_error=ATTEMPTS_EXHAUSTED），以后别加 status 列。
- `GATEWAY_INBOX_KEY_HEX` 生成命令请补进 runbook 网关节（和 R-013 的 §2.5 一起）。
- 继续：P0-04 三态/v2 → #8 绑源 → 双空间反例 → 折 011 → merge main（main 已到 v1.4.1，含 `op` 列/settings 端点，本批不实现只要不冲突）→ 整批回执 P-044。

#### R-011 追加铁律（2026-09-05，来自 ka-data owner「给开发」文档 ka-src-0011，OS 已实跑）

- adapter 请求/响应契约与现有 `ka-data-client.ts` 一致，不改；`backend` 固定 `sqlite`（毫秒级、口径已对齐），holo/odps 不进产品路径。
- 团队空间 SQL 模板六条：①转化/账户查询必带 `media=` 过滤（fact_conv 存全媒体，不加差 12 倍）②现金直接 `SUM(cash_yuan)`，**不再施加 `channel_coefficients`**（源已按系数算好，否则双算）③`cash_yuan` 可能 null → 三态 missing，不 COALESCE 0 ④`dwd_adgroup_daily` 与 `dwd_account_daily/fact_conv_daily` 的 account_id 是两套 namespace，**禁止 JOIN**；ad 级与账户级分别查 ⑤赔付 JOIN 必带 media ⑥`truncated/limit_clamped` → partial 三态，按 ds/账户分批。
- 团队空间达标直接用 `dwd_account_daily.cash_assessment`（现金考核，已按 sub_biz×media 富化），不走本库 `assessment_price_history`；考核 SSOT 在 ka-knowledge `assessment_catalog.json`（我们只读，能否拉取待 OS）。
- 团队空间 8 维：`resource_position/bid_tool/plan_tier/operator_name/channel_type/deduction_rate` 在 `dwd_adgroup_daily`，可直接开资源位/出价工具两维（个人空间仍 `DIMENSION_UNSUPPORTED` 等 OS）。
- `KA_DATA_BASE_URL` 是沙箱会话地址会变：连不上 → `503 SOURCE_UNAVAILABLE` + 健康页提示「团队数据源地址需更新」，不重试成 platform。


### R-013b 后端：FaaS 部署打包与 worker 单轮（2026-09-05；与 R-013 同批交付）

- 派活方：arch　背景：OS 回收 `docs/evidence/integration/2026-09-05-os-部署准备与四项核证回收.md`——a1 faas 构建期 `npm install`（内网 registry、node 20、zip ≤2GB）、无 Procfile、常驻进程会被回收 → 拓扑方案 B。
- 交付物：
  1. 仓库根级 `package.json` + `scripts/install-all.sh`：按 domain → db → worker/web 顺序 `npm ci`；在干净克隆验证 `file:` 依赖可解析（OS 未实测）。
  2. `deploy/faas/` 三份骨架：`web/`（bootstrap: `exec next start -p $PORT`）、`data-api/`（bootstrap: `exec npm run start:data-api`，`DATA_API_HOST=0.0.0.0`）、`worker-once/`（定时函数入口）。每份含 `f.yml` 示例与 env 清单（值留空）。
  3. **`npm run worker:once`**：一次 tick（入队）+ 消费 jobs 到空或达 `WORKER_ONCE_MAX_MS`（默认 10 分钟）→ 退出码 0；中途被杀依赖现有 lease 重领；日志只打 job id/type/状态不打 payload。
  4. seed JSON 示例把 identityId 占位换成 OS 回传的 `5e5ea046-e7eb-4fed-a07a-fb7631bc498e`（个人空间 + 团队空间 + membership；grants 待老板 discover 后填）。
  5. runbook §0 已写拓扑；你补 §2.5 seed、§2.6 worker:once 触发方式、§7 打包步骤。
- 边界：不改业务代码；不改 data-api 监听逻辑（用现有 `DATA_API_HOST`）。
- 状态：待处理（R-009 二批后，与 R-013 同批）

#### R-012 追加（2026-09-05 OS 8 维实证）
- `bid_tool` 派生映射提案：从 ka-src-0007 MAPI 文档取 unit `bid_type`/`ocpx_action_type`/`unit_type` 枚举含义，提一张 → `bid_tool` 枚举（如 手动出价/自动出价/OCPX 一阶/二阶/最大转化…）写 inbox-arch，arch 冻后实现；未冻前 `DIMENSION_UNSUPPORTED`。
- `agent_type` 从 ka-data `custom_tags["代投/自投"]` 落 accounts（"无匹配"→NULL）；`ubp` 维度永久 UNSUPPORTED（无源），不造。
- MAPI 业务码含义表同样从 ka-src-0007 提案（api.md「媒体写业务码与 UNKNOWN」）。


### R-014 后端：契约 v1.5 落地（2026-09-05；排 R-012 后）

- 派活方：arch　**先读** `api.md` 末尾「v1.5 端点与 DTO」+ `schema.sql` 末尾「v1.5 新增」+ 缺口地图 13 行（1.8/3.5/3.6/3.8/3.10/4.2/4.3/4.10/5.7/7.4/9.1/9.6/10.11/11.7）。
- 交付物：
  1. **migration 015**：external_changes / account_transfers / user_watchlists / saved_views / exports / capabilities / decision_policies / report_runs + report_configs 三列；真实 PG up/down/up。
  2. HTTP + BFF：小传（fund 七字段三态、cutoff 四态）、timeline 10 kinds + overlay、transfer/transfer-all（grants 迁移 + 409 TRANSFER_BLOCKED_BY_CHANGESET）、`account.hourly`/`account.gap` 两个 queryId 进 Registry、me/views + watchlist、export 任务化（PNG 走网关 Chromium）、integrations connections/check/identity-mappings/messages/retry、capabilities list/invoke（写只出变更集草稿）、decision DTO + policy、daily-brief + `daily_brief_generate` job（数据未就绪 pending_data）、reports/render 按 report-config/v1。
  3. 带外变更检测：结构同步每轮比对 bid/budget/status/schedule → external_changes + 关联工作项标注。
  4. 反例：转户目标非 active 403、有 running 变更集 409、导出过期 URL 410、capability disabled 409、hourly 缺小时 missing 不补 0、daily-brief 在 etl_full 未 done 时 pending_data、gap 阈值随 ruleSetVersion。
- 验收句：优化师能在账户详情看小传/倒计时/操作史打点、把户交接给同事、设盯盘名单看小时数、存自己的列视图并定时推群、一键出 PNG；管理员能看接入健康与消息收发记录并重试。
- 状态：待处理（等 R-012）


#### A-001 逐行审计 B3/B23 结论 → 落到你手上的（arch 2026-09-05）

- **R-009 #8 绑源必须一起改 BFF**：`apps/web/lib/data/bff.ts` 仍注入 `dataView:"platform"` 且断言 `mode==="platform"`；你的 #8 让后端拒 dataView 后这里会全 400。改：去掉注入；`mode` 按 session 的 `workspaceKind` 断言（personal→platform / team→ka_data）；`contracts.ts` mode 枚举同步；BFF 测试加团队空间用例。**这条不改，二批不合流。**
- **R-010a2 追加**：① domain `transitions.failed` 加 `retry → confirmed`，`POST /changesets/:id/retry` 重走 from 复核 + begin，attempt+1；② confirm/retry 在非法状态 → 409 `INVALID_STATE`（现在是通用 Error→500）；③ 确认 `FollowUpScheduler.scheduleT1` 按 (changeset_id,item_id) 幂等，终态重跑不重复排 T+1；④ unknown 只读 reconcile 一次仍 unknown → 建 `work_items(type=agent_question)` 转人工。
- **R-013b 追加**：① `NODE_ENV=production` 且存在任一 `KA_DATA_DEV_*` → 启动拒绝；② session 清理 job（expired/revoked 超 30 天删）。
- P3 不阻塞：reconcile 的 execution_run 建议 `dry_run=true` 或加 kind。

#### 12.8 缺数期规则抑制已冻（2026-09-05）→ R-010a1 迁移 + R-010a2 引擎
- migration 012 加 `alert_rules.availability_policy/data_freshness_max_hours`；引擎按 metrics.md 六条：指标缺→undeterminable 不触发不消触不递增 occurrence；源过期→pending 整体跳过、恢复不回溯补发、SLA 暂停；首次 full 未 done→全 pending；explain 带 availability + not_triggered_reason。**禁止缺数按 0/上次值代入**——现有 `semantic-query-metrics.ts` 的 `COALESCE(sum,0)`（R-009#2 三态）改完后规则层不得再补 0。


#### P-044 中期审查：8 笔子交付全过；三问答复（arch 2026-09-05 深夜）

- 逐笔结论见 inbox-arch「P-044 中期审查」。三态 SQL（EXPECTED_METRIC_CTE + 任一缺→NULL）、路由内核、admin reconcile、lineage.workspaceKind、inbox 耗尽对齐——都对。
- **答 1 顺序**：按你建议——012 先作为 R-010a1 第一子批落（只迁移）；R-013 seed 拆 `seed:bootstrap`（不依赖 012）+ `seed:coefficients`（依赖 op 列）；再 R-010a1 功能。
- **答 2 `apps/web/lib/data`**：归你。改 contracts/adapters/types/测试做 v2 解包 + BFF 去 dataView + 按 Session workspaceKind 断言 mode；不碰 React/组件/样式。协作规范 §1 已改。
- **答 3 团队 reader**：采纳 `KA_DATA_TEAM_WORKSPACE_ID`（UUID）一 reader ↔ 一 team；未配/不匹配 503 SOURCE_UNAVAILABLE；不接受浏览器参数、不依赖 team grants。runbook 已加。
- **v2/v3 编号**：你的 `bdc5273` = `account.summary/v2`（三态）。我 v1.4.1 的窗口+考核块**改叫 v3**（fixtures 已改名 `summary-window-v3-*`），R-010a1 实现，前端不做双版本兼容。
- 合流前必须：BFF 改完 + lib/data v2 解包 + KA 启用双空间真实 PG 反例 + 折 011 + merge main + **PG 恢复后全量重跑五包**（55432 拒连期间的非 PG 数字不算门禁）。整批回执 P-045。


#### R-014 追加：契约 v1.5.1（2026-09-05 深夜；老板拍 A①-⑤ + B 优先级）

- 读 `schema.sql` 末尾「v1.5.1 新增」+ `api.md` 末尾「v1.5.1 端点与 DTO」+ `docs/decisions/2026-09-05-全量偏差审计.md`。
- 并入 migration 015：accounts 六列（pool_status 九态 + source/overridden/changed_at + product_name/ref）、changeset_groups + changesets.group_id、tasks 四列（stage/stage_source/stage_changed_at/sop_run_id）、workflow_runs.task_id、task_readiness_overrides。
- 实现：① pool_status 推导 job（日切+事件）+ pipeline + list 扩 + pool-status/product PATCH + `changesets/batch` 与组 dry-run/confirm（逐账户调用单链，不改三键/单执行者）+ 官方模板「新任务开户到基建」；② tasks.stage 推导 + readiness 六段（accounts/recharge/infra 系统算，products/materials/strategy 先读 overrides）+ sopProgress（绑定 run 节点→步骤）+ blockers/nextActions 只来自真实对象；③ `workflow-graph/v1` schema 校验（zod）+ validate/simulate/publish + run detail + runs 面板；④ `workbench/lead` 聚合（六卡三态、risks/opportunities 只用已冻公式）；⑤ suggestion 帧 + accept/reject、assets 端点与流转规则。
- 反例：pool_status manual 覆盖后系统不改；batch 中某户有 running 变更集→skipped 不整批失败；stage manual 优先 workflow 优先 system；readiness 缺项列表非空时 ready=false；write 节点未经 human_confirm 直连 execute → validate 失败；lead 视图非 lead/admin 403；assets verified→official 非 admin 403。
- 验收句：优化师在账户池一眼看到九态分布、按产品分组、勾选多户一次预览确认；任务页看到准备→投放走到哪一步、缺什么；负责人在工作台切「团队」看到目标缺口/风险/阻塞/待拍板；前端画布按节点模型能画能校验。


### R-015 后端：契约 v1.6 落地（2026-09-06；排 R-014 后）

- 派活方：arch　**先读** `schema.sql` 末尾「v1.6 新增」+ `api.md` 末尾「v1.6 端点与 DTO」。素材/结算的列与 DTO 由 arch 直接从你 B12-B19 的 domain 类型反推冻结（不再等提案）；**若与 domain 现实现有出入，写 inbox-arch 指出，不自改契约**。
- 交付物：migration 016（素材 8 列 + analyses 5 列 + 谱系表 + 实验策略表 + brief 4 列；结算模板 7 列 + settlements 9 列 + lines 3 列 + corrections 表；workspace_flags；account_tests；account_replications）；HTTP+BFF：素材 list/detail/analyze/analysis/similar/lineage/brief/deliveries/backtest、products、experiments+policy；结算 templates/preview/corrections/freeze/to-work-item；admin members/grants/calendar/flags；`account.pivot2`；account-tests；replicate + replication-compare。
- 反例：素材 sourceStatus≠reachable 时 analyze 409；whole_video 分析不产生句级时间戳；实验样本不足不出 leader；结算 blocked 不许 freeze、冻结后快照不随数据变、校正只对 allowCorrection 字段；`write_enabled=false` 时 confirm 403 WRITE_DISABLED；停用成员后其 session 全部 401；replicate 目标户 pool_status 不合法 409。
- 验收句：优化师能看素材池/商品池示例态变真数据、拆片结果带证据、做一张月度结算单四步走到冻结；admin 能加人/停人/改授权/开灰度；策略页能看版位×任务交叉表；开户测试和优质户复制能发起并回看。
- 状态：待处理（等 R-014）


### R-016 后端：契约 v1.7 落地（2026-09-06；排 R-015 后）

- 派活方：arch　**先读** `schema.sql` 末尾「v1.7 新增」+ `api.md` 末尾「v1.7 端点与 DTO」+ `docs/decisions/2026-09-06-P2大件设计与策略方案对象.md`。
- 交付物：migration 017（strategies/strategy_bindings/strategy_validations、intel_materials、shadow_decisions、ai_impact_config；report_runs.kind 扩）；HTTP+BFF：策略方案 CRUD/copy/bind/validations/compare + suggestion `strategy_variant`；`/tasks/:id/attribution`（只算有公式节点，其余 undeterminable）+ lead gapTree；intel import/link；shadow decisions 记录（工作项建议→24h 内同向变更集/带外=adopted）+ shadow-exam 四门；ai-impact 四象限 + 估时表；weekly-report/v1；task-review Deep Research（Agent 异步 job，生成即归档 kb）；lead/fyi；monthly-exec + 订阅。
- 反例：归因节点无公式不出金额；shadow 无人动作 adopted=false 不猜；ai-impact byUser 不进导出；策略验证样本不足=insufficient_sample；复盘 why/next humanConfirmed=false 默认。
- 状态：待处理（等 R-015）


#### P-047 三项初始化边界裁决（arch 2026-09-06）

1. **grants 三键 FK 先要 accounts 行**：✅ 采纳——seed 对显式 grants 里的账户只插 `accounts(workspace_id, media, account_id)` 三键，`account_name/status` 留 NULL，`pool_status` 默认 `available`，不覆盖已有经营字段；首次 full 后由 ETL 富化。不从上游自动授权。
2. **identity 只有 id/display_name**：✅ 采纳——新行 `provider='internal_test'`, `provider_subject=id`；已有行不改 provider/subject（BUC 接入时按 subject 映射）。
3. **workspace.id / user_id 可选**：✅ 采纳——workspace 按 (kind,name) 受控唯一解析、歧义拒绝；user_id 按 membership 唯一复用否则生成；示例 JSON 全显式 UUID。
- P-046（012 迁移）/P-048（discover）/P-049（系数 seed）：arch 待 PG 恢复后逐笔审（Docker 在本机挂了，我正在重启；恢复后你也能跑真 PG）。P-049 发现的 `metrics.ts` 写死除法 → 按你说的 R-010a1 内补 `op`，独立 P-050，✅。
- **R-009 二批合流**：代码面我看齐了（BFF 去 dataView/按 Session 断言 mode、折 011、v2 解包、team reader 绑定）。PG 恢复后我在自己的工作树独立跑 DB/Worker/Gateway 真 PG 套件，通过即 `--no-ff` 合 main（P-045 整批回执你可以先写，PG 数字由我补）。

### R-FE-IMG-001 登录页品牌图（Codex 生图；fe F-006-Q5 转派；2026-09-06）

- 老板定：登录页 = 品牌视觉图 + 表单；图由 Codex 生成。参考 `docs/frontend/ui-assets/decisions/login-references-2026-09-05.md`。
- 要 2 张（各出 2–3 版供老板挑）：① 全幅背景 2400×1350（16:9），JPG/WebP ≤600KB → `apps/web/public/brand/login-hero-16x9.jpg`；② 分屏左栏 1200×1600（3:4），≤400KB → `apps/web/public/brand/login-hero-3x4.jpg`。
- 画面：黑白为主的品牌视觉；一枚玻璃质感的环或丝带穿过几个哑光立方体，一抹 D-CON 橙 `#ff6a2c` 点缀；柔光、浅景深、大量留白；16:9 版右侧 40% 留空放登录卡，3:4 版下方 35% 留空压文案。**不要**文字/logo/蓝紫渐变/赛博风/人物。构图参考巨量引擎登录页，材质参考磁力金牛的丝带，配色换成黑白橙。
- 交付：文件落到上述路径（路径限定提交到 `be/r010` 或单独分支均可），在 inbox-arch 回一行 SHA/路径；fe 收到后替换占位。不阻塞后端批次，空档做。

#### P-046/P-048/P-049 代码级通过（arch 2026-09-06）；Docker 已修好可跑 PG
- 三笔逐行通过（结论表 inbox-arch）。**本机 Docker 已重启、db-postgres-1 已 up、55432 可连**——你那边现在能跑真 PG 了；请把 P-046 的 012 真 PG（up/down/up + 十例）跑一遍补回执。
- R-009 二批：arch 正在自己的隔离工作树（共用你的 node_modules，只读）用独立库 `ka_arch_r009` 复跑五包；过了就合 main。你继续 R-013 bootstrap（P-047 三缝隙已裁）→ P-050 op → R-013b。

#### R-009 二批已合流 main `232aca5`；P-050/P-051 ✅；请 be/r010 `git merge main`（arch 2026-09-06）
- P-045 整批 ✅（数字/范围/越界说明见 inbox-arch）。三个 contract fixture 升 v2 这次收下；**以后 `packages/contract/` 任何改动先写信箱由 arch 落**。
- P-050 `739658f` ✅、P-051 `a77b224` ✅ 代码级。PG 现在通了（55432），请在 be/r010 补：012 up/down/up 十例、P-050 生效方向/未来版本/跨媒体/跨 workspace 四例、benchmark PG；回执只补数字。
- be/r010 先 `git merge main`（main 现 = 二批合流 + fixtures 152 + v1.7.1 契约），冲突只会在 docs/relay（保留双方）。
- 顺序不变：R-013 bootstrap（P-047 三裁已给）→ R-010a1 v3 公开窗口 → R-013b（FaaS 模板：老板去要 OS 的无凭证 f.yml 最小模板，到了转你；安装脚本先做）→ R-011。R-FE-IMG-001 空档做。

#### P-052/P-054/P-055 ✅、P-053 三裁已冻 v1.7.2、be/r010 已合 main `7666d31`（arch 2026-09-06）
- 四笔全过（结论表 inbox-arch）。arch 复跑 be/r010：domain 607 / db 331 / worker 798+2 / gateway 36 / web 111 全绿；首轮 worker 1 失败是你的 `ka_*_test` 库名守卫拒了我的库名，按设计。
- **P-053 三问全裁在 api.md「v1.7.2 追加」+ metrics.md 窗口化**：① price 多版本 → `null`+`priceVersions:N`，达标按 Σcash ≤ Σprice(d)×conv(d)；② compare 两端等长平移，today 无同时段快照 deltas 全 undefined；③ authority 必填（17 个 fixture 已补）、preset 缺省 custom、共用 Registry。costStatus 映射按你 2790fc1 的 superRefine 冻结。
- 再 `git merge main`（含 v1.7.2/1.7.3、fixtures 159、`ops/bootstrap-seed.json`）。然后：**R-010a1 v3 公开路由接线**（summary/trend/dimension/pivot2 v3 行 + compare + priceVersions）→ R-013b 单轮 Worker（scoped lease + 硬截止，f.yml 等 OS）→ R-011。`GET /tasks/:id/bindings` 记进 R-014。
- 纪律两条：① `docs/plans/工作台账.md` 只有 arch 写，你的条目放 `docs/plans/R010-状态.md`（这次的 be-P0xx 行保留不删）；② runbook 只准加你自己命令的操作节并在回执里点名，其余节不动。
- P2 备忘：015 落地后 bootstrap 占位账户行 `pool_status` 系统推导「待开户」，不留 NULL。

#### P-057/059/060/062/063 ✅、P-058/P-061 已裁（契约 v1.7.4）、be/r010 已合 main `f9bb6ef`（arch 2026-09-06）
- 五笔全过（inbox-arch 有逐条）。arch 复跑 domain 617 / db 362 / worker 891+2 / gateway 36 / web 111 全绿。
- **P-058**：① 加 reason `conversion_missing`→(null,null)，`cash_missing` 只指现金缺；② onTargetRate = 达标 / 可判定账户，delta 百分点差；③ 014 前 budgetUsageRate undefined + warning `BUDGET_SOURCE_NOT_READY`，不前移迁移、不代替。
- **P-061**：团队 price(d)=`cash_assessment(d)`；`price.effectiveDate` 允许 null（仅团队源）+ `priceSource:"history"|"ka_daily"`；唯一值给值，多值 → `priceVersions=不同值个数` + `ASSESSMENT_VERSION_UNKNOWN`；conv→realConversion 冻结。
- 再 `git merge main`。接着 **R-010a1 收口**：两 Adapter 切 v3 行 + compare + priceVersions/priceSource + Registry/HTTP/BFF（非视觉）+ `date_from/date_to` 公开；R-013b 剩 f.yml（等 OS）与 session 30 天清理（小，可顺手）。v3 切换时 fixtures 我已全部 v3，前端不做双版本。
- 顺带记 R-010b：`GET /workflows/runs` items 加 `taskId`；R-014 新增 `GET /me/workload`、search 五类、watchlist task 型、日报 delivery、`GET /tasks/:id/bindings`；R-015：materials `ratios.cvr`。
