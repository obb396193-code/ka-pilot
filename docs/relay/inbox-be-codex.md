# be-codex（双数据后端与 Contract）信箱

> 所有实现从 `codex/b22-idealab-asr-provider` 建独立分支；不得修改 `fe/f001` 或前端候选分支。完成回执必须包含 SHA、文件清单、测试命令与结果。

### BE-001 双数据 Contract、Query Registry 与安全读取边界

- 派活方：root Codex（项目控制/Contract）
- 日期：2026-08-24
- 背景：现有后端是累计领域内核，双数据公开 Contract、服务端 Query Registry、KA Data Adapter、认证作用域和共享读取凭证出口尚未实现。首次内网版本只读，Claude 后审不阻塞。
- 基线：从 `codex/b22-idealab-asr-provider@a5de536` 建 `codex/dual-data-backend`；不要直接 merge 治理线，所需最新文档以 `codex/integration-control` 为准。
- Codex 任务：`01a03314-5e8a-7b91-94de-17c9ac5daf7c`
- Worktree：`/Users/aik/.codex/worktrees/fffe/投放agent`
- 必读：`docs/plans/2026-08-24-首次内网只读纵切片集成计划.md` Task 2-3、双数据 design/implementation、`packages/contract/api.md`、`packages/contract/metrics.md`。
- 要求：
  1. 在 Domain 建可执行 Zod Contract，冻结 `DataViewMode`、`MetricValue`、单/双 lineage、稳定错误 envelope；同步 `packages/contract` 文档。
  2. 新建 `POST /api/v1/data/query`，只接受 `queryId + params + dataView`；禁止 raw SQL、表列名和自由表达式。
  3. Query Registry 首批只开放 `account.summary/trend/table/anomalies/detail` 与 `reconcile.account_daily`，逐项声明参数、视图、日期范围、行数和账户 scope。
  4. workspace/user/account scope 从服务端认证上下文注入；请求体伪造 workspace/account 必须拒绝。
  5. KA Data 共享 reader 仅服务端使用：固定 HTTPS origin/path、禁止 redirect、timeout/body 上限、日志与错误脱敏、Token 不可序列化。
  6. 识别 2,000、10,000 行和 16MB 边界；恰好命中上限也标疑似截断；partial/truncated 不得返回全量总计。
- 验收：Domain/Worker 定向测试先红后绿；全量 test/typecheck/lint 通过；增加凭证扫描；返回 SHA、`git show --stat`、测试原始摘要和未完成项。
- 边界：本批不开放媒体写操作，不实现 Runtime/Multica 执行，不接前端页面，不把 mock/HTTP 单测称为真实 KA Data 联调。
- 状态：待处理

### BE-002 租户级账户映射与对账引擎

- 派活方：root Codex（项目控制/Contract）
- 日期：2026-08-24
- 前置：BE-001 Contract 通过 root Codex 审计。
- 要求：
  1. 新增 tenant-scoped、时效化账户命名空间映射表与 Repository，保留 match status、证据和人工确认信息。
  2. 对账纯函数并列保留 KA Data/platform 原值、双方 lineage、差值、差异率和 comparability；不产生混合权威值。
  3. unmatched 双边保留；分母为零返回明确状态；日切/时区/口径不一致时标不可比；任一侧 partial 时阻断全量结论。
  4. 覆盖跨租户、一对多、失效映射、未匹配、分母零、截断和来源超时测试。
- 验收：DB migration 可重放；DB/Domain 全量 test/typecheck/lint 通过；回执 SHA 与测试证据。
- 边界：未取得真实映射样本时只用脱敏 fixture，不猜账户 ID；未通过本任务前不得在内网打开 reconcile。
- 状态：待处理（受 BE-001 阻塞）
