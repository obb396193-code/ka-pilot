# PERSONAL-TEAM-WORKSPACE-001 Task 1-3 质量报告

> 权威冻结点：`codex/integration-control@445d2d9`
> Task 1：`ae5f620`（root 已独立验收并合入 `4bca364`）
> Task 2：`d970822`（root 结论：`codex_prechecked + static_verified + pg_blocked`）
> Task 3：`d88048c`（待 root 复验）

## Task 1：Domain workspace kind 与 scope Contract

- 新增 `workspaceKind=personal|team`。
- 新增判别式 scope：`explicit_accounts` 与 `team_workspace_readonly`。
- personal 只能携带 explicit accounts；team 只能使用无账户清单的 workspace read-only scope。
- strict schema 拒绝 personal/team scope 混配、team 携带账户或 execute grant、缺 workspace kind、未知字段。
- Task 1 提交时保持 additive Contract；Task 3 已将 `AuthResolution` 切到唯一的判别式 context，不保留第二套 `allowedAccounts` 会话返回形状。

门禁：RED 4 项失败后 GREEN；focused 19/19；Domain 38 files / 459 tests；typecheck/lint；
98.95% statements / 87.75% branches；静态安全与前端边界通过。root 已对 exact `ae5f620` 独立复验。

## Task 2：migration 010

- `workspaces.kind` 新增为 `TEXT NOT NULL DEFAULT 'personal'`，CHECK 只允许 `personal|team`。
- 所有 migration 010 之前的 legacy workspace 确定性回填为 `personal`；新 team workspace 必须显式写 `team`。
- down 删除 CHECK 与 kind；再次 up 会把 down 期间所有 legacy 行重新确定性回填为 personal，测试明确记录该可逆结构/不可逆语义边界。
- 真实 PG 测试覆盖：legacy backfill、invalid kind `23514`、up/down/up、同一 `media/account_id` 在两个 personal 与一个 team workspace 共存。
- 已同步主 migration 回放计数，以及受最新 migration 位置影响的 auth/workspace-sync down/up 测试。

已通过：migration callback smoke；DB 纯逻辑 3 files / 17 tests；DB typecheck/lint；production audit 0 vulnerabilities；`git diff --check`、凭证/动态执行扫描、前端 0 diff。

未通过：`docker ps` 返回 `EOF`；直接连接 `127.0.0.1:55432` 返回 `EPERM`。因此 migration 010 的真实 PG 用例已写但未执行，Task 2 状态只能是 `codex_prechecked + static_verified + pg_blocked`，不能表述为 implemented、已合流、已部署或已完成真实 PG。

## Task 3：Auth Repository 与 Session scope

- `AuthSessionSnapshot` 从数据库读取真实 `workspaces.kind`、当前 workspace 活跃成员数以及 identity 的活跃 personal workspace 集合，不默认 personal。
- personal session 只输出 `explicit_accounts`，账户权限仅来自当前 workspace 显式 grant；无 grant 是空范围。
- team session 只输出 `team_workspace_readonly`，即使 team workspace 底表误存 execute grant 也不投影到 context。
- identity 缺 personal、多个活跃 personal、personal 被多 identity 共享、当前 personal 与唯一 personal 不一致均 fail closed。
- 新 session 只能绑定唯一 active personal workspace；切换只接收目标 workspace ID，校验 active identity/membership/user 后在同一事务内更新 active workspace 并轮换 token hash。旧 token 立即失效，重放不会破坏新 session。
- 仅存 token hash；Repository/Service 不查询、返回或日志输出 provider subject、奇航 userId、Secret ref 或原始 token。

门禁：Domain 38 files / 463 tests；Worker 非 PG 65 files / 505 tests（2 个既有外部 opt-in skipped）；DB 纯逻辑 3 files / 17 tests；三包 typecheck/lint/audit 0 vulnerabilities。Domain 全量覆盖率 96.53% statements / 87.43% branches，Worker 非 PG 全量 89.25% / 82.30%；`auth-context.ts` 98.19% statements，`session-auth-service.ts` 95.23%。

真实 PG 仍被 Docker `EOF` 阻断；`auth-repository.test.ts` 在 `beforeAll` 连接超时，12 个用例未执行。Task 3 当前只能标记 `codex_self_checked + non_pg_verified + pg_blocked`。

安全接线边界：现有 Data API HTTP 仍是旧的内部 header 身份通路，没有可信 session resolver。Task 3 没有让它从请求头自报 `workspaceKind/role/scopeKind`，也没有把 team context 接入业务读链。因此 team 当前看不到双 null 私人工作项；Task 4 先建服务端 session HTTP composition，Task 5 再显式接业务 read Service。

## 仍未实现

- Task 4：session GET/workspace switch HTTP。
- Task 5：所有业务 read Service 消费 scope mode；尤其 team 必须排除双 null 私人工作项。
- Task 6 及以后：team ingestion、BFF 和端到端验收。
- 未改前端、未开放 team/media 写、未 push。
