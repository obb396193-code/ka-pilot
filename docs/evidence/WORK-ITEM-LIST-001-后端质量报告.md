# WORK-ITEM-LIST-001 后端质量报告

> 代码 SHA：`5b5c58c`，R1 分页修复：`3ad6e3e`
> 当前结论：`implemented + non_pg_verified + pg_blocked`
> 禁止表述为：已合流、已部署、已通过真实 PG、已完成前端接入。

## 已通过

| 门禁 | 结果 |
|---|---|
| Domain 全量 | 40 files / 464 tests passed |
| Worker 非 PG 全量 | 67 files / 532 tests passed；2 个既有外部凭证 opt-in skipped |
| DB 纯逻辑 | 4 files / 20 tests passed；WorkItemListRepository 3 tests passed |
| 定向 Service/HTTP 与回归 | 4 files / 62 tests passed |
| typecheck / lint | Domain、DB、Worker 全绿 |
| 生产依赖 audit | Domain、DB、Worker 均 0 vulnerabilities |
| 新代码覆盖率 | Domain 100%；Worker 97.13% statements / 91.09% branches；DB 97.03% / 71.87% |
| 边界扫描 | `git diff --check`、凭证/动态执行扫描、前端 0 diff、生产文件均少于 300 行 |

## 尚未通过

| 门禁 | 当前证据 | 必须动作 |
|---|---|---|
| 工作项列表真实 PG | Docker daemon `docker ps` 返回 `EOF` | 恢复后运行 `packages/db/test/work-item-list-repository.test.ts` 4 项 |
| DB 全量真实 PG | 当前无法连接测试数据库 | 定向通过后运行 DB 全量 tests/typecheck/lint |
| 本人无账户工作项详情 | 既有详情 Contract 仍要求账户 tuple | root 冻结详情新语义前维持 403，不擅自扩响应 |
| BFF/内网部署 | 本批未执行 | root 验收合流后另做只读纵切片 smoke |

## 已覆盖风险

- 账户型工作项按批准 `(workspace_id,media,account_id)` 限权；跨媒体同号、跨租户和未授权行不进入 total/page；
- 无账户工作项只向 assignee/creator 本人可见，其他 workspace 成员不可见；
- Service 对恶意 Repository 做 workspace、tuple、个人可见性、重复 ID、分页、accountItemCount 和 lineage 二次守卫；
- 超末页空结果（offset>=total）合法返回 200；offset<total 却空页、或非空页最后一行越过 total 仍 502；
- count/page/readiness 同一 RR/RO 快照；默认严重度、SLA、创建时间、ID 稳定排序；
- default active statuses 与显式终态筛选、q/assignee/task 等参数均为参数化 SQL；
- present-invalid Repository count 是 typed contract error→502，连接/事务故障仍为 500；
- 只读列表与既有详情路由不冲突，POST/PATCH/DELETE 返回 405；
- exact response limit 返回 502 `SOURCE_TRUNCATED`，requestId header/body 一致；
- 响应和错误不回传 token、SQL、上游 body、creator 或大证据字段。
