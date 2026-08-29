# PERSONAL-TEAM-WORKSPACE-001 Task 1-2 质量报告

> 权威冻结点：`codex/integration-control@445d2d9`
> Task 1：`ae5f620`（root 已独立验收并合入 `4bca364`）
> Task 2：`d970822`（待 root 复验）

## Task 1：Domain workspace kind 与 scope Contract

- 新增 `workspaceKind=personal|team`。
- 新增判别式 scope：`explicit_accounts` 与 `team_workspace_readonly`。
- personal 只能携带 explicit accounts；team 只能使用无账户清单的 workspace read-only scope。
- strict schema 拒绝 personal/team scope 混配、team 携带账户或 execute grant、缺 workspace kind、未知字段。
- 采用 additive Contract；旧 `AuthResolution` 运行时尚未切换，留给计划 Task 3，避免当前 session resolver 在无 DB kind 来源时被静默默认成 personal。

门禁：RED 4 项失败后 GREEN；focused 19/19；Domain 38 files / 459 tests；typecheck/lint；
98.95% statements / 87.75% branches；静态安全与前端边界通过。root 已对 exact `ae5f620` 独立复验。

## Task 2：migration 010

- `workspaces.kind` 新增为 `TEXT NOT NULL DEFAULT 'personal'`，CHECK 只允许 `personal|team`。
- 所有 migration 010 之前的 legacy workspace 确定性回填为 `personal`；新 team workspace 必须显式写 `team`。
- down 删除 CHECK 与 kind；再次 up 会把 down 期间所有 legacy 行重新确定性回填为 personal，测试明确记录该可逆结构/不可逆语义边界。
- 真实 PG 测试覆盖：legacy backfill、invalid kind `23514`、up/down/up、同一 `media/account_id` 在两个 personal 与一个 team workspace 共存。
- 已同步主 migration 回放计数，以及受最新 migration 位置影响的 auth/workspace-sync down/up 测试。

已通过：migration callback smoke；DB 纯逻辑 3 files / 17 tests；DB typecheck/lint；production audit 0 vulnerabilities；`git diff --check`、凭证/动态执行扫描、前端 0 diff。

未通过：`docker ps` 返回 `EOF`；直接连接 `127.0.0.1:55432` 返回 `EPERM`。因此 migration 010 的真实 PG 用例已写但未执行，Task 2 状态只能是 `implemented + static_verified + pg_blocked`，不能表述为已合流、已部署或已完成真实 PG。

## 仍未实现

- Task 3：Auth Repository/Session resolver 实际读取 workspace kind、默认 personal、切 team membership，并输出新版判别式 context。
- Task 4：session GET/workspace switch HTTP。
- Task 5：所有业务 read Service 消费 scope mode；尤其 team 必须排除双 null 私人工作项。
- Task 6 及以后：team ingestion、BFF 和端到端验收。
- 未改前端、未开放 team/media 写、未 push。
