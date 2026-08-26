# ACCOUNTS-LIST-001 后端 TDD 实施记录

> 日期：2026-08-26  
> 分支：`codex/accounts-list-001-backend`  
> 共同基线：`d4402e1`（同时包含 `22467ae` 冻结 Contract 与 `d1a184d` C2 授权修复）  
> 代码提交：`3a7470f`

## 范围

- strict Domain request/response Schema 与 `ready/empty/partial/stale`、7 类稳定错误 fixture；
- `(workspace_id,media,account_id)` tuple scope 下的账户池 count/page/readiness；
- 同一 `REPEATABLE READ READ ONLY` 快照读取经营字段、业务日 canonical、余额和有效任务关系；
- Service 二次行级 scope guard、后端 `RatioValue`、上海 03:00 业务日与 dataState；
- 只读 `GET /api/v1/accounts`、requestId、共享 exact-16MB fail-closed 边界；
- 所有账户/媒体 POST、PATCH、DELETE 继续关闭。

## TDD 顺序

1. Domain Contract/fixtures 先红后绿；
2. 真实 PG Repository 6 组反例先写入；Docker engine 在执行期持续 `EOF`，测试未删除、未 skip；
3. 增加不依赖 PG 的 transaction/mapping 边界测试，不能替代真实 PG；
4. Service 授权、RatioValue、dataState、恶意 Repository 测试先红后绿；
5. HTTP query、401/403、写路由 405、502/503/504/500、exact body limit 回归；
6. 三包 typecheck/lint/audit、前端 0 diff、凭证/动态执行扫描。

## 冻结语义的实现

- 普通账户池固定 `selectedSource=qihang`，只接受 KUAISHOU；KA Data/reconcile 不可由 query 选择。
- `allowedAccounts` 只来自认证上下文；Repository 只携带本媒体批准 tuple，空 scope 不可能 ready。
- `linkedTasks` 只取业务日有效关系并按 taskId 稳定排序；同一账户可返回多个任务。
- `metrics=null`、`balance=null`、`linkedTasks=[]` 明确表达缺源，不以 0 或账户 ID 猜事实。
- `realCpa` 由 Worker 使用 `safeDivide` 生成；分母为 0 时保留 `infinite/undefined` 状态。
- dataState 优先级：`partial > stale > empty > ready`；余额缺失不强制整页 partial。

## 未完成外部门禁

- Docker Desktop 官方 restart 后 Docker API 仍 `EOF`，`127.0.0.1:55432` 无 PostgreSQL 响应；
- `packages/db/test/account-list-repository.test.ts` 的 6 个真实 PG 用例因此尚未通过；
- 恢复后必须先跑该文件，再跑 DB 全量真实 PG，才能升级为 `local_pg_verified` 或交 root 合流。
