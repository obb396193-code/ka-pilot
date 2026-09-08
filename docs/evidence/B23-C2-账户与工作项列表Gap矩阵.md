# B23-C2 账户与工作项列表 Gap Matrix

> 日期：2026-08-26
> 范围：只读审计 `ACCOUNTS-LIST-001`、`WORK-ITEM-LIST-001` 现有 Contract、Domain、DB、
> Worker composition；不在本文发明公开 DTO。
> 结论：两个列表都尚未形成可实现的严格纵切片；已有账户主表、Canonical 数据和工作项详情
> 是可复用底座，但不能等同于列表 API 已实现。

## 1. ACCOUNTS-LIST-001

| 层 | 现有事实 | 可复用 | 仍缺 / 不能外推 |
|---|---|---|---|
| Contract | `packages/contract/api.md:277-283` 只列出 `GET /api/v1/accounts?stage=&starred=&tags=&owner=`，没有 request/response Schema、分页、稳定排序、授权与错误 envelope | 路由意图和四个筛选方向 | root 需冻结浏览器 BFF、严格 query、返回字段、分页/排序、dataState/coverage、空态和稳定错误 |
| 对象表 | `packages/contract/schema.sql:86-106` 已有三键账户、名称、owner、lifecycle、star、tags、status 和 grant FK | 账户池经营字段与 `(workspace_id,media,account_id)` 身份 | 不能把 KA/platform 任务、商品、素材或广告组关系外推到账户对象 |
| 启航同步 | `packages/db/src/raw-metrics-repository.ts:145-166` 只幂等同步已实证的 `account_name/status`，并保留 owner/lifecycle/star/tags | 新账户首次同步、名称/状态更新 | 上游没有实证的经营字段不得由 Adapter 覆盖或伪造 |
| Semantic 查询 | `packages/db/src/semantic-query-repository.ts:27-84`、`:90-151` 返回“账户×日期指标行”；`apps/worker/src/data/query-registry.ts:278-288` 的 `account.table` 也是数据查询，不是账户池 | Canonical 指标、dataAsOf、tuple scope 的实现方式 | 不能拿 `account.table` 冒充 `/accounts`：它缺 lifecycle/star/tags/status，且对象/分页语义不同 |
| Repository | 当前没有 `AccountListRepository`；现有 Semantic `count` 与 page 是两次普通 pool query（`:93-145`），不是冻结的一致性快照 | TASK-LIST-001 的 RR/RO count+page 模式可作为工程参考 | 需新建账户池专用 Repository，并在同一 RR/RO snapshot 内完成 count/page/readiness |
| Ready 门 | `packages/db/src/workspace-sync-readiness.ts:6-95` 已有按当前 user + 授权媒体判断首次 full 的共享函数 | 可在账户列表事务内直接复用；空 scope 返回 false | 不能仅凭 accounts 有行就宣称普通启航数据 ready |
| Runtime/API | `apps/worker/src/data/http-server.ts:211-217` 仅允许 data-query、两个详情和 task list；`apps/worker/src/data-api.ts:26-34` 未组合账户列表服务 | 现有 server-side auth、requestId、16MB bounded response | `/api/v1/accounts` 与服务 composition 均未实现；未知路径当前 404 |

### Contract 冻结前必须由 root 决定

1. `media/q/stage/starred/tags/owner/status` 中哪些进入一期，以及 tags 的 AND/OR 语义。
2. 账户池一行的严格字段：经营字段、实时/离线摘要、余额、任务关系各自是否存在、缺源如何表达。
3. 默认稳定排序和唯一 tie-breaker；page/pageSize 上限；总数是否只统计批准 tuple。
4. `ready/empty/partial/stale` 的判定与首次 full、当日 Canonical、余额来源之间的关系。
5. 浏览器 BFF 路径及正式 session 注入方式；浏览器不得自报 workspace/user/account scope/source。

## 2. WORK-ITEM-LIST-001

| 层 | 现有事实 | 可复用 | 仍缺 / 不能外推 |
|---|---|---|---|
| Contract | `packages/contract/api.md:246-260` 仅给出四个筛选名及“其余 N 户在阈值内”，严格冻结的只有 `GET /work-items/:id` 详情 | 列表入口意图、详情授权原则 | 缺 query Schema、分页/排序、列表 item DTO、阈值内计数定义、dataState/coverage、错误 envelope |
| Domain | `packages/domain/src/work-items.ts:1-20` 有状态、动作和 severity；`:51-97` 只有流转、去重和优先级 | 状态机、severity 顺序、去重规则 | 没有 list request/response Schema、dataState 或分页 Contract |
| Repository | `packages/db/src/work-item-repository.ts:268-349` 只有 create/merge、按 ID find、transition | 持久化详情字段、workspace 约束 | 没有 list/search/count/page；没有按批准 `(media,account_id)` 过滤的列表查询 |
| Scope | 详情已要求账户 tuple 完全命中批准 scope（Contract `:254-260`） | 有 tuple 的工作项可复用相同 fail-closed 原则 | `media/account_id` 为 null 的 self/agent_question 是否可见尚未冻结，不能擅自放行或全部丢弃 |
| Ready 门 | `packages/db/src/workspace-sync-readiness.ts:6-95` 可复用 | 可阻止首次 full 前把依赖启航事实的列表误报 ready | 非账户型工作项与启航 readiness 的关系需 Contract 明确，不能一刀切 |
| Runtime/API | `apps/worker/src/data/http-server.ts:46-52` 仅匹配带 ID 详情，`:211-217` 无列表；`apps/worker/src/data-api.ts:28-34` 只组合详情和 task list | 同一 auth/requestId/bounded-response 基础 | `/api/v1/work-items` 列表服务、Repository、HTTP composition 和 fixtures 均未实现 |

### Contract 冻结前必须由 root 决定

1. `status/severity/assignee/type` 的合法枚举、多值语义、默认状态范围和搜索字段。
2. 默认排序：severity、SLA、createdAt 的优先级及唯一 ID tie-breaker。
3. 列表 item 是否包含 evidence/diagnosis 摘要、task/account 展示名、可执行动作与权限提示。
4. “其余 N 户在阈值内”的分母、阈值版本、账户范围、时间窗和无数据语义；没有冻结定义前不得计算。
5. null tuple 工作项的可见性、团队/个人 assignee 规则，以及首次 full 前哪些类型允许显示。

## 3. 推荐实施顺序（不等于公开 Contract）

1. root 分别冻结两个严格 DTO、BFF 路径、授权与状态语义。
2. Domain 先做 strict Schema/fixtures；DB 用同一 RR/RO snapshot 完成 count+page+readiness。
3. Service 对 Repository 输出再做 workspace/tuple guard；HTTP 复用 AUTH-001、requestId 与 16MB 边界。
4. 先只读 GET；账户经营字段写入、工作项流转和所有媒体操作继续拆批并保持确认门。
