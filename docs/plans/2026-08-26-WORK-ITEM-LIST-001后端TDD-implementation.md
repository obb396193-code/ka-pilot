# WORK-ITEM-LIST-001 后端 TDD 实施记录

> 日期：2026-08-26
> 分支：`codex/work-item-list-001-backend`
> 共同基线：`d4402e1`
> 代码提交：`5b5c58c`，R1 分页修复：`3ad6e3e`

## 范围

- strict Domain request/response Schema 与 `ready/empty/partial/stale`、稳定错误 fixtures；
- `(workspace_id,media,account_id)` tuple scope 和本人 assignee/creator 无账户工作项可见性；
- 同一 `REPEATABLE READ READ ONLY` 快照内的 count/page/readiness 与稳定排序；
- Service 行级 fail-closed、真实 lineage、上海 03:00 业务日与 dataState；
- 只读 `GET /api/v1/work-items`，与既有 `GET /api/v1/work-items/:id` 详情路由共存；
- requestId、exact-16MB fail-closed，所有工作项写方法继续关闭。

## TDD 顺序

1. 先冻结 Domain Contract 与 canonical fixtures；
2. 再写真实 PG Repository 反例和不依赖 PG 的 transaction/mapping 单元边界；
3. 实现 Service 授权、个人无账户工作项、dataState、lineage 与恶意 Repository 反例；
4. 挂载只读 HTTP，覆盖 strict query、401/403/400/502/503/504/500、405 和 exact body limit；
5. 跑三包全量非 PG、typecheck/lint/audit、定向覆盖率和越界扫描；
6. Docker daemon 持续 `EOF`，真实 PG 测试不删除、不 skip、不用旧证据替代。

## 冻结语义的实现

- 默认 status 只查 `open|processing|escalated`，显式 status 才可查询终态。
- 账户型行必须完整命中批准 tuple；Repository 越权时 Service 整页 403，不静默删行。
- media/account_id 同为 null 时，只允许 assignee 或 creator 是当前 workspace-local user。
- `accountItemCount>0 && initialFullComplete=false` 为 stale；本人无账户工作项不依赖首次 Full，可 ready。
- coverage 不完整优先 partial；total=0 且 lineage=null 才是 empty。
- dataAsOf 来自筛选集合真实 `created_at/resolved_at` 最大值，不使用响应当前时间。
- 列表不返回 creator、evidenceSnapshot、diagnosis、t1Result；点击详情继续走冻结详情接口。

## R1 分页边界修复

- root 复现：`page=2,pageSize=20,total=1,rows=[]` 是合法超末页，却被旧守卫误报 502。
- 新语义：空页仅在 `offset<total` 时视为来源自相矛盾；`offset>=total` 返回 200 和空 items。
- 非空页继续要求 `offset+rows.length<=total`，同时保留 rows 不超过 pageSize/total 等守卫。
- 新增超末页空结果 happy path、第一页/中间页空缺和非空页越界反例。
- R1 门禁：Domain 464、Worker 非 PG 532、DB 纯逻辑 20；定向回归 62，三包 typecheck/lint/audit 全绿。

## 未完成外部门禁

- Docker API 仍返回 `EOF`，`packages/db/test/work-item-list-repository.test.ts` 的 4 组真实 PG 测试未执行；
- 因此状态只能是 `implemented + non_pg_verified + pg_blocked`，不可宣称合流、部署或 PG 通过；
- 当前详情 Contract 只支持账户型工作项；列表允许本人无账户工作项，但点击该类详情仍会 403。
  这是既有详情 Contract 与新列表 Contract 的后续冻结缺口，本批不擅自扩展详情响应；
- BFF/前端、正式 session HTTP 接线、内网部署与真实业务数据 smoke 均不在本批完成状态内。
