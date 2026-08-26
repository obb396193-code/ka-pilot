# be-codex（双数据后端与 Contract）信箱

> 所有实现从 `codex/b22-idealab-asr-provider` 建独立分支；不得修改 `fe/f001` 或前端候选分支。完成回执必须包含 SHA、文件清单、测试命令与结果。

### BE-001 双数据 Contract、Query Registry 与安全读取边界

- 派活方：root Codex（项目控制/Contract）
- 日期：2026-08-24
- 背景：现有后端是累计领域内核，双数据公开 Contract、服务端 Query Registry、KA Data Adapter、认证作用域和共享读取凭证出口尚未实现。首次内网版本只读，Claude 后审不阻塞。
- 基线：从 `codex/b22-idealab-asr-provider@a5de536` 建 `codex/dual-data-backend`；不要直接 merge 治理线，所需最新文档以 `codex/integration-control` 为准。
- Codex 任务：既有后端对话 `019ffa23-8a94-7373-b48b-7cfc9cb948f2`
- Worktree：`/Users/aik/.codex/worktrees/fffe/投放agent`
- 必读：`docs/plans/2026-08-24-首次内网只读纵切片集成计划.md` Task 2-3、双数据 design/implementation、`packages/contract/api.md`、`packages/contract/metrics.md`。
- 要求：
  1. 在 Domain 建可执行 Zod Contract，冻结 `DataViewMode`、`MetricValue`、单/双 lineage、稳定错误 envelope；同步 `packages/contract` 文档。
     - 老板已裁决 A：`reconcile` 双边并列，不生成统一主数；KA Data 为运营权威版，当日实时诊断/执行检查仍用 platform。详见 `docs/decisions/2026-08-24-双数据对账主数语义.md`。
     - 逐指标权威矩阵已冻结：跨媒体/历史/商品素材/BI 默认 KA Data；实时/pacing/诊断/下钻/执行检查/效果回收默认 platform；考核价/返点/赔付/现金成本分来源版本化，禁止混算。详见 `docs/decisions/2026-08-24-双数据逐指标权威矩阵.md`。
  2. 新建 `POST /api/v1/data/query`，只接受 `queryId + params + dataView`；禁止 raw SQL、表列名和自由表达式。
  3. Query Registry 首批只开放 `account.summary/trend/table/anomalies/detail` 与 `reconcile.account_daily`，逐项声明参数、视图、日期范围、行数和账户 scope。
  4. workspace/user/account scope 从服务端认证上下文注入；请求体伪造 workspace/account 必须拒绝。
  5. KA Data 共享 reader 仅服务端使用：固定 HTTPS origin/path、禁止 redirect、timeout/body 上限、日志与错误脱敏、Token 不可序列化。
  6. 识别 2,000、10,000 行和 16MB 边界；恰好命中上限也标疑似截断；partial/truncated 不得返回全量总计。
- 验收：Domain/Worker 定向测试先红后绿；全量 test/typecheck/lint 通过；增加凭证扫描；返回 SHA、`git show --stat`、测试原始摘要和未完成项。
- 边界：本批不开放媒体写操作，不实现 Runtime/Multica 执行，不接前端页面，不把 mock/HTTP 单测称为真实 KA Data 联调。
- 状态：待处理

### BE-002 账户同源键验证与对账引擎

- 派活方：root Codex（项目控制/Contract）
- 日期：2026-08-24
- 前置：BE-001 Contract 通过 root Codex 审计。
- 要求：
  1. 老板已确认两侧快手账户 ID 相同；不得建立账户映射表。按 `(workspace_id, media, account_id)` 直接对账，并验证字符串/数字、前导零和类型规范化不会误配。
  2. 对账纯函数并列保留 KA Data/platform 原值、双方 lineage、差值、差异率和 comparability；不产生混合权威值。
  3. 只有一侧存在时双边保留并标 `source_missing`；分母为零返回明确状态；日切/时区/口径不一致时标不可比；任一侧 partial 时阻断全量结论。
  4. 覆盖跨租户、跨媒体、格式歧义、单侧缺失、分母零、截断和来源超时测试。
- 验收：Domain/Worker 全量 test/typecheck/lint 通过；脱敏样本验证两侧 ID 格式一致；回执 SHA 与测试证据。
- 边界：任务、商品、素材、广告组是否同 ID 尚未确认，不得套用账户结论；未通过本任务前不得在内网打开 reconcile。
- 状态：待处理（受 BE-001 阻塞）

### B23-A 多租户数据库与授权内核

- 派活方：root Codex（Contract/验收/整合）
- 日期：2026-08-25
- 分支：`codex/b23-auth-core`，基线 `codex/integration-control@68da060`
- 实施计划：`docs/plans/2026-08-25-B23-A多租户授权内核-implementation.md`
- 边界：只改 packages/domain、packages/db、apps/worker 与后端留痕；禁止修改 apps/web、
  apps/ui-layout-demo 和视觉文件；禁止媒体真实写与 push。
- 目标：四表 migration、token hash→active identity/membership/user/grants→approvedAuthContext，
  真实 PG 隔离/撤销/空授权反例；另交 B23-C 真实文件行号 gap matrix。
- 代码终态：`72228b4`
- 质量与交接：`fa84d22`
- 质量：`docs/evidence/B23-A-代码质量报告.md`
- Gap matrix：`docs/evidence/B23-C-奇航只读链Gap矩阵.md`
- 状态：已实现并完成 Codex 自审；未合并/部署，等待 root 验收。

#### B23-A 回执

- migration `eba1fa7`、Domain `c39eeb4`、Repository/Service `48b6d6d`、基线测试修正
  `2488dc9`、FK 测试隔离 `72228b4`。
- Domain 433、DB 107、Worker 453 passed；三包 typecheck/lint/audit、coverage 与真实 PG
  up/down/up 通过，0 vulnerabilities。
- 未改 `apps/web`、`apps/ui-layout-demo` 或视觉文件；未 push；媒体写继续关闭。
- 正式 session/BFF 接线、普通业务 API 和奇航账户主表同步未完成，详见 B23-C，不得把内核完成
  表述成登录、页面、内网部署或业务 E2E 完成。

### B23-C1 奇航 account metadata → accounts 主表同步

- 派活方：root Codex（Contract/验收/整合）
- 日期：2026-08-25
- 分支：`codex/b23-c1-account-sync`，基线 `codex/integration-control@0775a13`
- 实施计划：`docs/plans/2026-08-25-B23-C1奇航账户主表同步-implementation.md`
- 边界：只解决 Qihang account metadata→accounts→同页 Raw 的 P0；不改普通 API DTO、前端，
  不 push，不开放媒体写。
- 冻结事务：网络请求完成后按 account 分页开短事务，整页校验→upsert accounts→append Raw→
  commit；该页失败 0 写入，前页可信提交可在 Job 重试时幂等重放，未全部完成不派 canonical/fanout。
- 代码提交：`bdc37cc`、`20636af`、`0807cd4`、`c1e2600`、`ec4934a`。
- 质量：DB 112、Worker 467 tests passed，2 opt-in skipped；两包 typecheck/lint/audit、coverage 与真实 PG 全绿。
- 证据：`docs/evidence/B23-C1-奇航账户主表同步质量报告.md`、已更新 B23-C Gap Matrix。
- 未完成：普通 ETL scheduler/入队、session HTTP composition、四个普通只读 API、真实奇航联调与内网部署。
- 状态：已实现并完成 Codex 自审；待 root 合流，Claude/arch 后审位保留。

### TASK-LIST-001 任务列表只读纵切片

- 派活方：root Codex（Contract/验收/整合）
- 日期：2026-08-25
- 分支：`codex/task-list-001-backend`，基线 `codex/integration-control@f2adad3`
- 冻结 Contract：`packages/contract/api.md` TASK-LIST-001
- root 计划：`docs/plans/2026-08-25-TASK-LIST-001任务列表纵切片-implementation.md`
- 后端 TDD 细化：`docs/plans/2026-08-25-TASK-LIST-001后端TDD-implementation.md`
- 边界：仅 Domain/DB/Worker/后端 fixture 与留痕；不改 `apps/web`、`apps/ui-layout-demo`，不 push，不挂任务/媒体写路由。
- 代码提交：`01080a0`、`796183e`、`204b4c1`、`d38f9ec`、`891372d`。
- 质量：Domain 451、DB 120、Worker 492 默认 tests passed，2 个既有 opt-in skipped；三包 typecheck/lint/audit、coverage 与真实 PG 全绿。
- 证据：`docs/evidence/TASK-LIST-001-后端质量报告.md`。
- 未完成：BFF/前端整合、正式 session 登录链、真实奇航任务源 trace、内网部署；任务/媒体写继续关闭。
- 状态：已实现并完成 Codex 自审；待 root 合流，Claude/arch 后审位保留。

### B23-C2 普通 Workspace 首次同步与周期调度内核

- 派活方：root Codex（Contract/验收/整合）
- 日期：2026-08-26
- 分支：`codex/b23-c2-workspace-scheduler`，基线 `codex/integration-control@1950808`
- 实施计划：`docs/plans/2026-08-26-B23-C2普通Workspace同步调度内核-implementation.md`
- 边界：后端 service + one-shot CLI；不加浏览器/公开写 API，不改前端，不 push，不开放媒体写。
- 代码提交：`252425a`、`e7c407f`、`d225ba4`、`6302cc4`、`10b9e8b`、`eb3d4df`、
  `0ec9c99`、`02783a9`、P1 修复 `d1a184d`；计划提交 `23ec0ee`。
- 质量：Domain 455、DB 139、Worker 510 默认 tests passed，2 个既有外部凭证 opt-in skipped；
  三包 typecheck/lint/audit、coverage 与真实 PG 全绿。
- 证据：`docs/evidence/B23-C2-普通Workspace同步调度内核质量报告.md`、
  `docs/evidence/B23-C2-账户与工作项列表Gap矩阵.md`。
- 已实现：active 身份候选快照、确定性并发幂等、blocked_auth、不可变授权/credential owner、
  执行前复核、上海 03:00 业务日、one-shot CLI、首次 full ready 门及共享 readiness 查询。
- 未完成：外部 scheduler 配置、真实 workspace/奇航首次 full、内网部署、BFF；两个后续列表仍待
  root 冻结严格 DTO。所有媒体写继续关闭。
- 状态：`implemented + local_pg_verified + codex_self_checked`；待 root 独立验收合流，
  Claude/arch 后审位保留。

#### C2 P1 授权退回修复回执

- root 发现：首次 Full 在空 grant 时仍会无过滤枚举并落库奇航账户，违反 AUTH-001 空 grant=空范围。
- 修复 SHA：`d1a184d`。
- 三道门：调度 Full/Incr 空 scope 均 `blocked_auth/ACCOUNT_SCOPE_MISSING`；执行前空授权快照
  `BlockedAuthError`；Full 请求携带批准 `accountIds`，上游越界行在 metadata/Raw 持久化前拒绝。
- 反例：Service Auto/Full/Incr、真实 PG terminal blocked Job、执行前空快照、上游越界账户 0 落库。
- 门禁：Domain 455、DB 139、Worker 510 passed；2 opt-in skipped；三包 typecheck/lint/audit、
  coverage 全绿。未改 Contract、前端或公开 API，未 push。

### ACCOUNTS-LIST-001 账户池只读纵切片

- 派活方：root Codex（Contract/验收/整合）
- 日期：2026-08-26
- 分支：`codex/accounts-list-001-backend`，共同基线 `d4402e1`
- 冻结 Contract：`packages/contract/api.md` ACCOUNTS-LIST-001
- 代码提交：`3a7470f`
- 已实现：strict Domain/fixtures、RR/RO tuple-scope Repository、业务日 metrics/余额/多任务关系、
  Service 行级 fail-closed、后端 RatioValue、只读 `GET /api/v1/accounts`、requestId 与 exact-16MB。
- 已通过：Domain 464；Worker 非 PG 528（2 opt-in skipped）；DB 纯逻辑 19；三包
  typecheck/lint/audit；新文件覆盖率、前端 0 diff 和写路由关闭检查。
- **阻断**：Docker engine 在官方 restart 后仍 `EOF`，55432 no response；6 个真实 PG 用例已经写入
  `packages/db/test/account-list-repository.test.ts`，但本轮未通过。不得把旧 C2 PG 证据冒充本批证据。
- 证据：`docs/evidence/ACCOUNTS-LIST-001-后端质量报告.md`。
- 状态：`implemented + non_pg_verified + pg_blocked`；root 可先代码审查，恢复 PG 后必须补定向与 DB 全量，
  通过前不建议合流/通知前端按“后端已完成”接入。未 push、未改前端、未开放媒体写。
