# Task5 双空间业务读授权质量报告

> 日期：2026-09-04
> 基线：`codex/integration-control@1d2c926`
> 分支：`codex/personal-team-task5-business-reads-v2`
> 代码候选：`29748fa`
> 状态：`implemented + local_pg_verified + codex_self_checked`，未合流、未部署、未生产验证

## 1. 实现范围

- 业务 HTTP 只接受 internal bearer + 服务端签发的 `ka_session` cookie。
- 后端逐请求解析唯一 `ApprovedWorkspaceAuthContext`；旧 `x-ka-workspace-id`、
  `x-ka-user-id`、`x-ka-account-scope` 不参与授权。
- `data/query`、账户、任务、工作项列表和工作项/Changeset 详情统一使用判别式 scope：
  - personal：只读显式 `(media, accountId)` grants；
  - team：只读当前 active team workspace，不读取 `account_access_grants`。
- team 工作项列表/详情排除 media/account 双 null 的个人项；team Changeset 在 Repository 前拒绝。
- personal 任务元数据只在任务存在业务日有效的 `task_accounts ∩ approved tuple`
  时可见；空 grant 不返回 workspace 内任何任务名、业务名、预算或考核价。
- KA Data 直接查询拒绝 team scope；Platform 查询按 workspace 约束，输出再校验 workspace/tuple。
- `data/query` 的双数据诊断出口默认关闭；普通 Session 无论 role 都固定为
  `platform`。只有服务端诊断总开关 + 精确 `(workspaceId,userId)` entitlement 同时命中
  才保留 `ka_data/reconcile`；浏览器不能自报权限。
- 所有媒体写、transition 与 Changeset 写路由仍未挂载。

## 2. 真实门禁

| 门禁 | 结果 |
|---|---|
| Domain 全量 | 44 files / 491 tests passed |
| DB 全量（真实 PostgreSQL 16，127.0.0.1:55432） | 31 files / 176 tests passed |
| Worker 全量（含真实 PG、HTTP、FFmpeg、fake upstream gateway） | 78 files / 621 tests passed；2 个外部真实服务 opt-in skipped |
| Task5 专项真实 PG + HTTP | 1/1 passed |
| TypeScript / ESLint | Domain、DB、Worker 全绿 |
| 生产依赖审计 | Domain、DB、Worker `npm audit --omit=dev --offline` 均 0 vulnerabilities |
| diff / secret scan | `git diff --check` 通过；未发现真实 token、AK 或凭证值 |
| 前端冻结目录 | `apps/web`、`apps/ui-layout-demo` 0 diff |

## 3. 关键反例

- personal 即使伪造 team workspace/header，也只能看到显式授权账户。
- personal 仅关联未授权账户的任务不可见；同时关联已/未授权账户的任务可见但覆盖标记为 partial。
- team 即使历史 grant 存在，Repository 输入仍必须是空 grants，且只按 active workspace 查询。
- 同一 `accountId=team-one` 在两个 workspace 且 team 内同时存在 KUAISHOU/TENCENT；联合 HTTP
  断言只返回当前 workspace + KUAISHOU，不串数。
- team 不返回个人双-null工作项，访问 Changeset 在 Repository `find` 前 403。
- optimizer/operator/lead/admin 在无 entitlement 时均不能打开 KA Data；flag off、KA off、
  浏览器伪造 entitlement 均有稳定反例。
- switch 后旧 token 返回 401；logout 后新 token 访问 data/tasks/accounts/work-items/detail
  全部 401，且 Repository/数据源调用计数不变。
- requestId 继续透传；业务响应恰好达到 16MB 继续 fail closed。

## 4. 质量审查

- Critical / High：0。
- SQL：所有筛选参数化；workspace 来自服务端 Session，不信任上游 payload 或浏览器 header。
- 安全：internal bearer 只证明 BFF；cookie 只保存 opaque token；响应、错误和测试日志均不输出 token hash、凭证或 SQL body。
- 性能：列表保持 RR/RO 同快照 count/page；新增 team 分支没有逐行 N+1。
- 可维护性：公共授权投影集中在 `business-read-auth.ts`；各 Service 保留输出侧 fail-closed 守卫。

## 5. 未完成与后续

1. 前端 BFF 尚未改为转发 Session cookie；在前端纵切片完成前，浏览器真实 E2E 尚不可用。
2. Task6 team ingestion 未实施，team readiness 继续保守，不把未同步冒充 ready。
3. 未做真实奇航/KA Data 联调、内网部署或生产验证。
4. Task4 非阻断 P2：`createSessionForIdentity()` 的 active personal membership 查询仍全量
   materialize 后判断唯一性；后续独立硬化为稳定 `LIMIT 2`（第 2 行作为 ambiguous sentinel）并补真实 PG 反例。
5. Claude/审查 Agent 保留后审席位；本报告不等于 root 合流或 Claude 已批准。
