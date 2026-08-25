# TASK-LIST-001 后端质量报告

> 日期：2026-08-25  
> 分支：`codex/task-list-001-backend`  
> 基线：`codex/integration-control@f2adad3`  
> 代码终态：`891372d`  
> 状态：implemented + local PostgreSQL verified + Codex self-checked；未合入 root、未部署、未联调真实奇航。

## 1. 本批实现

1. Domain 冻结 `TASK-LIST-001` strict request/success/error Schema，拒绝未知 query、伪造 scope/dataSource、非法真实日期、状态和 RatioValue；新增上海 03:00 业务日纯函数。
2. PostgreSQL Repository 在同一 `REPEATABLE READ READ ONLY` 事务内查询 total 与 page，默认排序固定为 `active → preparing → ended`、`period_end ASC NULLS LAST`、`task_id ASC`。
3. 考核价只选 `effective_date <= businessDate` 的最新版本，同日版本按自增 ID 取最后一条；未来版本不会进入响应。
4. linked account、Canonical 指标和 open work-item 全部在 SQL 内按批准 `(media, account_id)` tuple 过滤；workspace 固定来自认证上下文，返回后再做 workspace/coverage fail-closed 守卫。
5. pacing 唯一调用 Domain `computeTaskPacing`，只投影冻结字段；不重算、不四舍五入、不把 `recentDailyAverage` 暴露给前端。
6. 真实 HTTP composition 已挂载只读 `GET /api/v1/tasks`，复用 internal Bearer、workspace/user/account scope、requestId 和 16MB 响应边界；`POST/PATCH/DELETE` 均返回 405，不存在写执行分支。
7. 发布 ready/empty/partial/stale 与 401/403/400/502/503/504/500 canonical fixtures，全部由同一 Domain Schema 校验。

## 2. 权限与数据语义

- 普通任务 metadata 按 workspace 可见；账户数量、完成量、消耗、dataAsOf 和工作项摘要只来自批准 tuple。空 grant 仍可见任务 metadata，但账户派生事实为 null/0；存在未授权有效账户关联时 `coverage.complete=false`，`dataState=partial`。
- `workItemSummary` 只统计带账户 tuple 且状态为 `open|processing|escalated` 的已授权工作项；无 tuple 工作项不做授权外推。
- `dataState` 固定优先级 `partial > stale > empty > ready`。完整 coverage 下，返回页内存在已授权关联账户但业务日 Canonical 未到时为 stale；无筛选结果且 total=0 才为 empty。
- `dataAsOf` 只取已授权 Canonical 行的 `computed_at` 最大值；没有事实时为 null，不使用响应当前时间冒充新鲜度。
- `selectedSource` 固定 `qihang`；KA Data/reconcile 不进入本接口，也无法由浏览器 query 选择。

## 3. 真实 PostgreSQL 反例

- 稳定分页与同一快照：在 total 查询完成后用另一连接并发插入任务，本次 page 不看见新行，下一次查询看见，证明 total/items 没有跨快照。
- 同 workspace、两个 media 使用相同 account_id：只返回授权 media 的计数、转化、消耗、工作项和 dataAsOf。
- 其他 workspace 使用相同 task/account ID：不会进入结果或聚合。
- 空 grant：任务 metadata 保留，账户派生事实不泄露且 coverage 为 partial。
- 未来考核价、未授权 P0 工作项、无账户工作项、已完成工作项均不会污染当前响应。
- 重复/空 tuple、非法 ID/query/status 和 Repository 身份漂移均 fail closed。

## 4. 验证结果

| 门禁 | 原始摘要 |
|---|---|
| Domain 全量 | 37 files，451/451 tests passed |
| DB 全量 | 22 files，120/120 tests passed；包含真实 PostgreSQL migration/repository |
| Worker 全量 | 65 passed + 2 opt-in skipped files；492/492 默认 tests passed，2 个既有外部凭证集成测试 skipped |
| TypeScript / ESLint | Domain、DB、Worker 全部通过 |
| Coverage | Domain 96.49% statements / 87.38% branches；DB 93.77% / 78.52%；Worker 92.57% / 82.13% |
| 新模块 Coverage | Domain task-list 91.47%；DB task-list Repository 96.71%、SQL 100%；Worker tasks 98.13% statements / 90% branches |
| npm audit | 三包均 `found 0 vulnerabilities` |
| SQL | 所有搜索/筛选/scope/分页值参数化；仅静态 CTE 字符串组合；无 raw SQL 输入 |
| 凭证与错误 | 没有生产凭证；错误不回显 SQL、scope、上游正文或 Secret；测试中的 `secret` 字符串只用于验证脱敏 |
| 前端边界 | 相对基线 `apps/web`、`apps/ui-layout-demo` 为 0 diff |
| Git | `git diff --check` 通过；路径限定提交；未 push |

## 5. 提交链

| SHA | 内容 |
|---|---|
| `245b8ae` | 后端 TDD 细化计划与留痕 |
| `01080a0` | Domain strict Contract 与上海 03:00 业务日 |
| `796183e` | 真实 PG 权限化任务列表 Repository |
| `204b4c1` | Worker Service、pacing 与状态组合 |
| `d38f9ec` | 只读 HTTP composition、稳定错误与 fixtures |
| `891372d` | 将新 Repository 的静态 SQL 拆分，生产文件均压到 300 行以内 |

## 6. 仍未完成与 root 审查重点

1. 本批实现的是后端 `GET /api/v1/tasks`；浏览器 BFF `GET /api/internal/tasks` 与前端页面由唯一前端线/root 整合，本分支没有修改或验证。
2. 当前读取的是已同步到 PostgreSQL 的任务/账户/Canonical 数据；没有完成真实奇航任务 metadata 的内网网络/身份 trace，不能表述为真实奇航 E2E。
3. 尚未部署内网，也没有用正式 BUC session → BFF → internal headers 跑真实登录链；本地 HTTP 用受控 internal auth fixture 验证。
4. 请 root/Claude 复核“workspace 内任务 metadata 可见、账户派生事实按 grant 隐藏”的一期权限语义，以及无账户 tuple 工作项默认排除是否符合管理角色预期。
5. 任务创建、编辑、考核价写入、账户分配、改价和所有媒体执行继续关闭；没有 Runtime/Multica/ChangeSet 写路由。
