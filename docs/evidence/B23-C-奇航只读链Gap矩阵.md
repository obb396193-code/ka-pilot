# B23-C 奇航主链到普通业务 API 的只读 Gap Matrix

> 日期：2026-08-25  
> 性质：只读代码审计，不新增 DTO、不实现接口。  
> 基线：首次审计为 `codex/b23-auth-core@72228b4`；B23-C1 已在 `codex/b23-c1-account-sync@ec4934a` 关闭账户主表同步 P0。行号按首次审计工作树记录，后续合流可能漂移。

## 1. 已真实存在的主链部件

| 层 | 已实现事实 | 代码证据 |
|---|---|---|
| 奇航 Client | GET、身份缺失阻断、URL/行数/响应字节预算、超时和重试存在；`ad_realtime` 禁止无账户/广告 ID 全拉 | `apps/worker/src/qihang/client.ts:191-242`、`:248-254` |
| ETL 任务 Runtime | Worker 已注册 `etl_full/etl_incr/backfill/canonical_merge/data_quality_check` handler；只消费已有 job | `apps/worker/src/runtime.ts:35-91` |
| 账户发现与 Raw | full ETL/Backfill Coordinator 分页调用 `resource=account`；B23-C1 已在受信 workspace/media 下严格映射 metadata，原子先 upsert `accounts` 再写同页 Raw | `apps/worker/src/etl/account-metadata.ts`、`apps/worker/src/etl/full-handler.ts`、`apps/worker/src/backfill/coordinator-handler.ts` |
| Raw 持久化 | `syncAccountMetadataAndRaw` 以每页短事务校验 tuple、upsert 账户、插入 Raw 并回滚失败页；原有 Raw 读取与 canonical 合并保留 | `packages/db/src/raw-metrics-repository.ts`、`packages/db/test/raw-metrics-repository.test.ts` |
| Canonical | `canonical_merge` 校验 workspace，分块加载、计算并 upsert canonical，再派质量检查 | `apps/worker/src/etl/canonical-handler.ts:212-260` |
| Semantic Query 引擎 | DB 已有 `queryTable/summary/trend/dimension/health/lineage`，三字段 JOIN 与账户 scope filter 在 SQL 层执行 | `packages/db/src/semantic-query-repository.ts:87-188` |
| 已启动 HTTP 面 | 独立 data-api 只组合双数据诊断和 work-item/change-set 详情；不是普通业务 API | `apps/worker/src/data-api.ts:16-50` |

## 2. 共性 P0 缺口

1. **账户主表同步 P0 已关闭。** B23-C1 代码终态 `ec4934a`；真实 PostgreSQL 已验证未预置目标账户可经 fake Qihang 建户后进入 Raw→Canonical 纵切片，重放不重复建户，同号跨 workspace/media 不污染，经营字段不被覆盖。详见 `docs/evidence/B23-C1-奇航账户主表同步质量报告.md`。
2. **没有普通业务调度入口。** Worker Runtime 只注册并消费 job；现有源码没有定时器/API 把普通
   workspace 的 `etl_full/etl_incr` 首次或周期任务可靠入队。证据：
   `apps/worker/src/runtime.ts:35-112`、`apps/worker/src/index.ts:15-60`。
3. **B23-A 授权内核尚未挂到 HTTP。** 新 Service 只完成 token→hash→approved context；现有 data-api
   仍要求固定内部 Bearer 与 `x-ka-workspace/user/account-scope`。证据：
   `apps/worker/src/auth/session-auth-service.ts:30-45`、`apps/worker/src/data/http-server.ts:71-95`、
   `apps/worker/src/data-api.ts:16-33`。

## 3. 端点逐项矩阵

| 目标 | 已有可复用内核 | Runtime/API 缺口 | Contract/DTO 现状 | 结论 |
|---|---|---|---|---|
| `POST /api/v1/query` | `SemanticQueryRepository` 已有 summary/trend/dimension/health/table/lineage | 无 `/api/v1/query` service/route；无普通业务奇航主源路由、session scope composition 和 `selectedSource/reason/requestId` 审计 | `packages/contract/api.md:229-244` 只有请求示例和文字响应原则；Domain 没有对应严格 request/response schema | **P0 未实现**；先由 root 冻结版本化 DTO，再接 Semantic Repo，不复用管理员 `/api/v1/data/query` 的三态选择器 |
| `GET /api/v1/tasks` | `TaskRepository.getTask`、考核价历史、任务日指标存在 | Repository 无 task list；无 filters/page/account-scope/pacing 聚合 service 和 HTTP route | Contract 只冻结端点清单与“含 pacing”：`packages/contract/api.md:285-291`；未见严格 list DTO | **P0 未实现**；已有 detail 内核不能冒充任务列表 |
| `GET /api/v1/accounts` | `accounts` 表、B23-C1 奇航 metadata 主表同步和 Semantic `queryTable` 存在；后者是“一户一日指标行” | 没有 AccountRepository/list service/route；没有 lifecycle/star/tags/owner/balance 的 pool 查询 | Contract 只列 stage/starred/tags/owner filters：`packages/contract/api.md:277-283`；无严格 list DTO | **主表同步阻塞已解除，列表 API 仍 P0 未实现**；Semantic table 不能冒充账户池对象 |
| `GET /api/v1/work-items` | `WorkItemRepository` 有 create/merge、detail `find`、transition；详情 GET 已挂载 | 无 list repository/filter/pagination/“其余 N 户”计数，无列表 route；当前正则只识别 `/work-items/:id` | Contract 已列 status/severity/assignee/type 与计数要求：`packages/contract/api.md:246-260`，详情 DTO 已有，列表 DTO 未冻结 | **P0 列表未实现**；仅 `GET /:id` 已实现，证据 `packages/db/src/work-item-repository.ts:271-301`、`apps/worker/src/data/http-server.ts:37-43` |

## 4. 推荐实现顺序（不替 root 发明 DTO）

1. B23-C1 已补 `account` metadata→`accounts`→同页 Raw，并通过幂等、三字段隔离、失败回滚和真实 PG 新账户反例。
2. 下一步由 root 冻结普通 `/api/v1/query` 版本化 request/response schema、source audit 字段和 AUTH-001
   HTTP composition；再复用现有 Semantic Query，不让浏览器选择共享源。
3. 账户池 Repository/API；它是任务账户关联、工作项列表 scope 和普通数据页的共同对象底座。
4. work-item list 与 task list 分别冻结分页/筛选 DTO；复用既有 detail/metrics 内核，不混用
   管理员双数据 canonical row DTO。
5. 最后补首次/周期 ETL scheduler、健康检查和内网 smoke；在此之前只能称“内部组件已实现”。

## 5. 不属于本矩阵的事项

- KA Data 保留管理员诊断/备用路径；普通页面不暴露 `ka_data/platform/reconcile`。
- 本矩阵不开放 reconcile engine、媒体写、Multica Runtime、ChangeSet 写端点或前端实现。
- 本矩阵不宣称真实奇航、正式 session/BUC、内网网络、部署或业务账户已联通。
