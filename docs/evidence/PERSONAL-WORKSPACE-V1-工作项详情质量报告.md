# PERSONAL-WORKSPACE-V1 工作项详情质量报告

> 权威冻结点：`codex/integration-control@445d2d9`（覆盖早先 personal-only 决策，但本批个人无账户工作项语义保持不变）
> 代码 SHA：`8502129`
> 当前结论：`implemented + non_pg_verified + pg_blocked`

## 本批实现

- `work_item` 详情只允许两种 strict scope：完整 `media/accountId`，或二者同时为 `null`；半空 tuple fail closed。
- 账户型工作项继续按当前 workspace 的批准 `(media,accountId)` scope 授权。
- 无账户工作项仅在记录 workspace/path identity 正确，且当前用户等于 `assignee` 或 `creator` 时返回；响应保留这两个 actor 字段。
- changeset 仍强制完整账户 tuple；未放宽任何写操作。
- HTTP 继续复用现有 Authorization、UUID user/workspace、requestId 与 exact-16MB 共同边界。

## 实测门禁

| 门禁 | 结果 |
|---|---|
| RED | Domain 双 null 1 项失败；Worker 个人详情 4 项失败，均命中旧 Contract/403 逻辑 |
| Domain 全量 | 41 files / 467 tests passed |
| Worker 非 PG 全量 | 65 files passed + 1 opt-in skipped / 534 tests passed + 1 skipped |
| DB 纯逻辑 | 4 files / 20 tests passed |
| 定向详情/HTTP | Domain 3；Worker 44，全部通过 |
| typecheck / lint | Domain、DB、Worker 全绿 |
| production dependency audit | 三包均 `found 0 vulnerabilities` |
| 定向覆盖率 | Domain 100%；Worker 86.14% statements / 87.11% branches；`read-detail-service.ts` 96.8% statements |
| 静态边界 | `git diff --check` 通过；前端 0 diff；无新增动态执行/媒体写路由/明文凭证 |

## PostgreSQL 状态

- `docker ps` 真实返回 `EOF`。
- Worker 默认全量唯一失败为真实 PG benchmark 5 秒超时；DB migration 测试因数据库不可用 skipped。
- 本批无 DB schema/repository 改动，不能据此省略原 WORK-ITEM-LIST-001 的真实 PG 门禁；状态继续是 `pg_blocked`，未宣称真实 PG、合流、部署或内网联调完成。

## AUTH/session 只读审计

### 已有能力

- 数据模型允许同一 identity 加入多个 workspace：`workspace_memberships` 主键是 `(workspace_id,identity_id)`，并有 identity 维度索引（`packages/db/migrations/008_multi_tenant_auth.cjs:23-44,93-94`）。
- session 只保存 token hash，并用 `(active_workspace_id,identity_id)` 外键约束当前 membership（同文件 `46-68`）。
- `SessionAuthService` 会先校验 opaque token，再只把 SHA-256 hash 交给 Repository（`apps/worker/src/auth/session-auth-service.ts:6-45`）。
- Repository 目前能解析一个 active workspace 的 identity→membership→workspace-local user→grants 链（`packages/db/src/auth-repository.ts:53-124`）。

### 当前缺口

- 当前 `ApprovedAuthContext` 仍只有 `workspaceId/userId/role/allowedAccounts`，没有 `workspaceKind` 或判别式 `scope`（`packages/domain/src/auth-context.ts:15-20`）；这正是新版计划 Task 1。
- Auth Repository 只查 session 的 active workspace，不枚举可切换 memberships、不读取 workspace kind，也没有 session workspace switch/update 方法。
- Worker 没有 `/api/internal/auth/login`、`/auth/session`、`/auth/workspace`、logout 的 HTTP composition；现有 `SessionAuthService` 也没有签发、撤销或切换 session。
- 没有“首次登录创建/绑定唯一 personal workspace”的 Repository/Service/路由；当前 workspaces 只在测试/benchmark 中直接插入。
- `apps/worker/src/data-api.ts:20-43` 仍把 Data API 组装为受信 internal headers 模式，没有挂 `SessionAuthService`；因此已有 auth 内核不能表述成用户登录或 workspace 切换已实现。

## 未完成与后续边界

- 新版 `PERSONAL-TEAM-WORKSPACE-001` 后续按 `445d2d9` 计划继续：Task 1 Domain workspaceKind/scope；Task 2 migration 010。
- team workspace 的 session 解析、HTTP 切换、业务 GET enforcement 和 ingestion 均不在本 SHA。
- team 写、个人工作项跨 team 可见、前端修改和任何媒体写继续关闭。
