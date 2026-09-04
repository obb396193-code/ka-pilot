# 数据服务 API 合同 v1.0（B1c 实现；fe mock 依此造）

> 通用：全部 `GET/POST /api/v1/...`；响应包 `{ok:boolean, data, meta:{data_as_of, coverage, sources}, error?}`；
> meta.data_as_of=数据截至时间（数据健康横幅数据源）；分页 `page/page_size/total`。
> **P-001#6 裁决（比率/无穷表示统一）**：所有比率/CPA 字段返回 `{value: number|null, state: "finite"|"infinite"|"undefined"}`；
> `state=infinite` 表示分母0且分子>0（UI 显 `∞`）；`state=undefined` 表示无意义（UI 显 `—`）；绝不用 `null`/`Infinity`/字符串。

## 服务端身份与多租户会话（AUTH-001）

前端业务页只消费服务端会话，不接受浏览器自报的 `workspaceId/userId/role/accountIds`。
一期内网可启用 `internal_test` provider；正式接入 BUC 时只替换身份 provider，下面的
session、membership 与账户授权响应保持不变。一期产品策略为**个人与团队双空间**：每个 identity
默认进入自己的 personal workspace，业务数据初始为空，只能看到本人显式获授账户及其派生对象；
也可切换到自己有 active membership 的 team workspace，只读查看该空间持久化的团队业务数据。
官方模板/规则/教学内容是独立公共只读资产，不得携带用户业务数据。

- `POST /api/internal/auth/login`：仅在显式启用 `internal_test` provider 时接受
  `{provider:"internal_test", username, password}`；用户名和密码校验材料来自 Secret/config，
  无默认账号、无 Git 明文、无 production fallback。成功后只设置高熵 `HttpOnly + Secure +
  SameSite=Lax` session cookie，不把 session token 返回 JSON。
- `GET /api/internal/auth/session`：返回当前身份、可进入 workspace 列表、active workspace
  与角色；不返回 credential reference、奇航 userId、BUC subject 或账户 scope 明细。
- `POST /api/internal/auth/workspace`：`{workspaceId}`；只允许切换到当前 identity 自己的 active
  personal workspace 或具有 active membership 的 team workspace。服务端重新解析 workspace kind
  与 scope，清除前一空间缓存；不存在或无权统一返回 403，不泄露 workspace 是否存在。
- `DELETE /api/internal/auth/session`：撤销服务端 session 并清 cookie；重复调用幂等。

`approvedAuthContext` 必须按每次请求重新从 `auth_sessions → auth_identities →
workspace_memberships → account_access_grants` 解析，至少得到：

```jsonc
{
  "workspaceId": "uuid",
  "userId": "workspace-local uuid",
  "role": "optimizer | operator | lead | admin",
  "workspaceKind": "personal | team",
  "scope": {"kind": "explicit_accounts", "accounts": [{"media": "KUAISHOU", "accountId": "...", "accessLevel": "read"}]}
}
```

team workspace 的 scope 固定为 `{"kind":"team_workspace_readonly"}`，不得携带 execute grant；
personal workspace 固定为 `explicit_accounts`。scope mode 只能由服务端 session/membership 解析，
浏览器不得通过 query/body/header 自报。

- session 过期/撤销、identity/member/user 任一 inactive、active workspace 不匹配时 401/403
  fail closed；不得回退到 dev fixture、环境变量 workspace 或全账户通配符。
- personal 的 accounts 只能来自 active workspace 的显式 grant；即使 account_id 文本相同，不同
  media 也是两份授权，无 grant 表示空范围。team read-only 范围来自独立 team workspace 的 active
  membership 与该 workspace 已持久化数据，不把团队全账户列表放进浏览器/header，也绝不跨到
  personal workspace。
- `auth_sessions` 只保存 token hash；日志、Trace、错误和响应均不得出现 cookie/token、登录
  密码、BUC subject、奇航 userId 或 Secret reference。
- 内测试点至少预置两个不同 identity 的独立脱敏 personal workspace 和一个共同 team workspace，
  覆盖同 account_id 跨 workspace、同 account_id 跨 media、未加入团队、撤销 membership/session、
  team scope 写请求五类反例。

成功 session 响应冻结为：

```jsonc
{
  "ok": true,
  "data": {
    "identity": {"displayName": "内测用户"},
    "activeWorkspace": {"id": "uuid", "name": "我的工作台", "kind": "personal", "role": "admin", "readOnly": false},
    "workspaces": [
      {"id": "uuid", "name": "我的工作台", "kind": "personal", "role": "admin", "readOnly": false},
      {"id": "uuid", "name": "团队数据", "kind": "team", "role": "optimizer", "readOnly": true}
    ]
  }
}
```

未登录统一为 HTTP 401 + `UNAUTHORIZED`；已登录但 membership/scope 不足为 HTTP 403 +
`FORBIDDEN`。两者均使用现有稳定 error envelope 与 `x-request-id`。

## 一期主数据源路由（DATA-ROUTE-001）

- 普通业务读取默认走既有奇航 `get_data → Raw → Canonical → Semantic Query` 主链。
- KA Data 是同源的备用读取/管理员诊断路径，默认关闭且不得阻塞工作台、任务、账户、
  工作流或首次内网部署；普通用户响应和导航不暴露 `ka_data/platform/reconcile` 选择器。
- 是否切换备用源只能由服务端配置和管理员权限决定；禁止浏览器通过 query/body/header
  自选共享凭证出口。切换必须留审计字段 `selectedSource/reason/requestId`，但不记录 token、
  SQL 或上游正文。
- 现有 `POST /api/v1/data/query` 双数据能力保留为管理员诊断 API，不作为普通页面首屏依赖。
- 诊断权限不是 `role=admin` 的隐含能力。服务端必须同时开启诊断总开关，并让当前
  `(workspaceId,userId)` 命中受控 entitlement allowlist；普通 Session 的请求一律固定为
  `platform`，body 中的 `dataView` 不能开启 `ka_data/reconcile`。诊断已授权但 KA Data 总开关
  关闭时，`ka_data/reconcile` 必须在上游调用前返回稳定 `VIEW_UNSUPPORTED`。

## 受控双数据查询（BE-001）

`POST /api/v1/data/query`

浏览器不得直接调用本端点。浏览器只调用 Next BFF 的
`POST /api/internal/data-query`；BFF 使用服务端 `DATA_API_INTERNAL_TOKEN` 调用本端点，
并转发后端签发的 `HttpOnly` Session cookie。`Authorization` 只证明调用方是受信 BFF，
workspace/user/role/scope 必须由后端依据该 Session 重新解析。内部 token 与 Session
不得进入浏览器 bundle、页面日志或响应正文。

该端点的来源状态/全量计数使用 `MetricValue={value:number|null, availability}`；
Canonical Row 内的比率/CPA 固定使用
`RatioValue={value:number|null,state:"finite"|"infinite"|"undefined"}`，由后端计算，
前端不得用原始分子分母重算。普通可缺指标用 `number|null`，数值 0 与缺失 `null` 分开。

公开请求严格只接受三个顶层字段：

```jsonc
{
  "queryId": "account.summary",
  "params": {
    "date": "2026-08-24",
    "media": "KUAISHOU",
    "accountIds": ["fixture-account"]
  },
  "dataView": "ka_data | platform | reconcile"
}
```

- 禁止提交 `sql`、表名、列名、自由表达式、`workspaceId`、`userId`；未知字段按 `INVALID_REQUEST` 拒绝。
- 首批 Query Registry 仅开放：`account.summary`、`account.trend`、`account.table`、`account.anomalies`、`account.detail`、`reconcile.account_daily`。
- Registry 为每项冻结参数 Schema、支持视图、最长日期范围、最大行数、账户 scope、查询模板版本、指标版本和逐指标权威策略。
- `workspaceId/userId/allowedAccounts` 只能从服务端认证上下文注入。账户授权与双源直连键均为 `(workspace_id, media, account_id)`；同号跨媒体不能共享授权。
- KA Data 上游 SQL 仅由 Registry 生成。共享 reader token 只从服务端 Secret 读取；浏览器、响应、序列化对象和错误中均不得出现。
- KA Data mapped origin 在服务启动时从 `KA_DATA_BASE_URL` 读取并校验为纯 HTTPS origin，运行期间固定请求 `/api/query`；禁止 redirect。

### 成功响应

单来源响应包含 `mode + source`。每个 source 都必须返回：
`queryId/rowSchemaVersion/status/rows/returnedRowCount/wholeResultTotal/lineage/warnings`。
`queryId` 必须与 Registry 已解析请求一致；`rowSchemaVersion` 固定为对应
`<queryId>/v1`。lineage 至少包含：

```jsonc
{
  "source": "ka_data",
  "datasetVersion": null,
  "queryTemplateVersion": "v1",
  "metricVersion": "...",
  "dataAsOf": null,
  "timezone": null,
  "dayCut": null,
  "metadataAvailability": "unknown",
  "authority": {
    "policyVersion": "2026-08-24",
    "useCase": "cross_media_operations",
    "role": "default_authoritative"
  },
  "objectIdentity": {
    "objectType": "account",
    "joinKeys": ["workspace_id", "media", "account_id"]
  },
  "coverage": { "complete": true },
  "truncated": false,
  "partial": false
}
```

六个 Query ID 都有独立 strict row schema：

- `account.summary`：`rowCount/accountCount/anomalyRows/metrics`；
- `account.trend`：`ds + account.summary` 同构 metrics；
- `account.table`、`account.detail`、`reconcile.account_daily`：统一账户日行，包含
  `(workspaceId,media,accountId)`、日期、指标、比率状态、任务关系与异常事实；
- `account.anomalies`：同一账户日行，但 `dataAnomaly` 必须为 `true`；它不是
  work-item、finding 或 change-set，前端不得从该行猜测这些对象。

KA Data 的 `snake_case` 与 Platform 的 repository DTO 均只能留在 Adapter 内；响应只允许
Canonical camelCase。缺必填字段、夹带 source-specific 字段或版本不匹配，整次来源响应按
`UPSTREAM_INVALID_RESPONSE` fail closed。
仅字段缺席或显式 `null` 可映射为 Canonical 缺失值；字段已存在但类型/值非法
（如非数字成本、非数组 tasks、字符串布尔值或不存在的日历日）必须整个请求 fail closed。
`ka_data` 与 `platform` 的 Canonical 契约损坏都回顶层 HTTP 502 +
`UPSTREAM_INVALID_RESPONSE`；不得包装成 HTTP 200 的 `source.unavailable`，`reconcile` 也不例外。

`datasetVersion/dataAsOf/timezone/dayCut` 只允许来自上游响应或 canonical 持久化/查询
元数据。尤其 Platform 的 `timezone/dayCut` 不得由代码常量或部署默认值推断。来源未提供时必须返回 `null`，并以
`metadataAvailability=unknown|partial` 表达，不得用接口响应时间或固定占位字符串冒充。

### 内部 HTTP composition

- 可启动入口：`npm run start:data-api`（Worker 包中的独立 API 进程，不与后台消费循环混跑）。
- 默认仅监听 `127.0.0.1:3101`；跨主机部署必须由内网服务发现/网络策略显式开放。
- BFF 必须发送 `Authorization: Bearer <DATA_API_INTERNAL_TOKEN>` 并转发后端签发的
  `HttpOnly` Session cookie。后端对每次业务请求重新解析 `ApprovedWorkspaceAuthContext`。
- BFF 必须同时发送 `x-request-id`。后端仅接受 1–128 位的
  `[A-Za-z0-9][A-Za-z0-9._:-]*`；缺失、超长或含换行/控制字符时安全重新生成，
  绝不回显非法输入。所有 HTTP 响应通过 `x-request-id` 响应头返回最终相关 ID；
  错误 envelope 中的 `error.requestId` 必须与该响应头完全一致。
- 旧 `x-ka-workspace-id/x-ka-user-id/x-ka-account-scope` 不再参与生产业务授权；即使请求
  携带也必须被忽略，不得改变 Session 解析出的 workspace、user、role 或 scope。
  禁止接受页面、query/body/header/localStorage 或用户自报的 scope。
- 本机开发 scope 只允许使用明确的假 workspace/user/account fixture。
  production 不得使用默认账户、通配符、空 scope 绕过或 dev fallback；缺失、非法或
  无法从服务端 Session 证明的 scope 必须 fail closed（`401/403`）。
- 服务输出侧再次按 `(workspace_id, media, account_id)` 校验所有账户明细行；合法 schema
  中的越权 tuple 以 `FORBIDDEN` 失败；缺联合键或 row schema 不完整以
  `UPSTREAM_INVALID_RESPONSE` 失败。两者响应都不回显上游对象。
- `GET /healthz` 仅返回进程存活；不返回 Secret、上游 URL、SQL 或数据源正文。

`reconcile` 固定并列返回 `kaData` 与 `platform` 两个独立 source object；禁止 `primary`、混合 `value` 或第三个统一主数。BE-001 在对账内核接入前返回 `comparison.status=unavailable` 与 `reconciliation_engine_pending`；双方查询成功但同一范围仅一侧有行时返回 `source_missing`，整源请求失败返回 `source_unavailable`，二者都不是账户 ID 待映射。

### 截断与全量结论

- KA Data 等无可信全量 `total` 的上游，恰好命中 2,000/10,000 行或
  客户端 16MB 边界时保守按疑似截断处理。若 repository 返回可信全量
  `total`，且 `returned == total == limit`，则可判定完整；`total > returned`
  才标 `partial/truncated`。上游 `truncated=true`、`limit_clamped=true`、行数不一致
  或超过 Registry budget 始终标 `partial/truncated`。
- `partial/truncated/coverage.complete=false` 时，`wholeResultTotal` 不得为 `available`，不得输出全量汇总。
- 授权账户 scope 非空、但聚合行报告 `accountCount=0` 或返回对象数少于请求对象数时，
  `coverage.complete` 必须为 `false`，并明确 requested/returned objects；只有认证 scope
  本身为空时，空响应才可声明“对该空范围完整”。聚合结果行数不得冒充账户对象数。
- 账户单侧缺行用 `source_missing`；不得仅按账户名称 join，不得把任务/商品/素材/广告组的 ID 同源性从账户事实外推。
- `coverage.partial` 与 `truncated` 是两个独立事实：账户缺失只标
  `partial=true,truncated=false`；只有输送/行数/字节边界证据才能标 `truncated=true`。
- aggregate/trend 只有能证明跨日账户对象集合时才返回 `returnedObjects`。不能证明时省略该字段并标 coverage 不完整；任何 `returnedObjects > requestedObjects` 都 fail closed。

### 稳定错误 envelope

```json
{
  "ok": false,
  "error": {
    "code": "QUERY_NOT_ALLOWED",
    "message": "The requested query is not available",
    "retryable": false,
    "requestId": "..."
  }
}
```

错误码：`INVALID_REQUEST | UNAUTHORIZED | FORBIDDEN | QUERY_NOT_ALLOWED | VIEW_UNSUPPORTED | SOURCE_UNAVAILABLE | SOURCE_TRUNCATED | UPSTREAM_INVALID_RESPONSE | UPSTREAM_TIMEOUT | INTERNAL_ERROR`。错误 message 不透传上游响应正文、SQL、token 或内部堆栈。

### Canonical response fixtures

前后端 parity 测试必须直接读取 `packages/contract/fixtures/data-query/`，
不得手抄另一套 envelope。当前冻结样例：

- `ready-lineage.json`：真实来源 metadata 全部可得的 ready lineage。
- `unknown-lineage.json`：`metadataAvailability=unknown`，且
  `datasetVersion/dataAsOf/timezone/dayCut` 全部为 `null`。
- `reconcile-pending.json`：双源并列，对账内核尚未实现的
  `reconciliation_engine_pending`。
- `stable-error.json`：稳定错误 envelope 与可关联 `requestId`。

这些 fixture 由 Domain 的 `dataQueryResponseSchema` 自动验证；修改 Contract 时
必须同步修改 fixture 并通过 contract test。

## 语义层查询（核心，query_type 五类）

`POST /api/v1/query`
```jsonc
{
  "date": "2026-08-17",            // 或 date_from/date_to
  "query_type": "summary | dimension | health | tier | trend | table",
  "dimension_type": "task|biz|account|agent_type|resource_position|bid_tool|is_ubp|deduction_range",  // dimension 时必填
  "compare": "dod | wow",          // 环比口径切换（日环比/周同比）
  "filters": { "task_id": "...", "account_id": "...", "owner": "...", "media": "KUAISHOU" },
  "page": 1, "page_size": 50
}
```
- summary：一行全量指标+环比；dimension：每维度值一行同构；trend：7/30 日时序
- **table**（完整数据总表）：明细行不聚合，支持列选择 `columns[]`、排序、导出游标
- 返回行结构 summary 与 dimension 完全同构（四角色同源保证）

## 工作项

- `GET /api/v1/work-items?status=&severity=&assignee=&type=` 队列（含"其余 N 户在阈值内"计数）
- `POST /api/v1/work-items/:id/ignore` `{reason_chip?, mute_days?}`
- `POST /api/v1/work-items/:id/process|reject|escalate|dispatch` `{note?, to_user?, acceptance_criteria?}`
- `POST /api/v1/work-items/:id/reply` `{target: "dingtalk_group"|"dingtalk_dm"|"web_session", target_id, content}` → 异步回复（**P-002#3 裁决：agent 处理完工作项异步回复至群/单聊/会话**）
- `GET /api/v1/work-items/:id` 详情（证据快照+诊断+T+1）

`GET /api/v1/work-items/:id` 为一期只读纵切片：

- 使用与双数据查询相同的 internal Authorization + 服务端 Session cookie 和 `x-request-id`；
- 返回持久化的 `(workspaceId,media,accountId)`、`evidenceSnapshot`、`diagnosis`、
  `t1Result`、状态、SLA 与时间字段；
- 账户 tuple 与批准 scope 不完全一致返回 403；无账户 tuple 的个人工作项仅在记录属于当前
  personal workspace，且当前 `userId` 等于记录 `assignee` 或 `creator` 时允许读取；其他历史
  无 scope 对象仍 fail closed；
- 不存在返回 404 + `NOT_FOUND`，非 UUID 返回 400 + `INVALID_REQUEST`。

### WORK-ITEM-LIST-001 工作项队列（一期只读）

浏览器只调用 `GET /api/internal/work-items`；BFF 转发服务端 Session cookie，再调用
`GET /api/v1/work-items`，后端按 AUTH-001 解析批准 scope。允许的 query 参数仅为：`page`（默认 1）、`pageSize`（默认 20，
最大 100）、`q`（最大 100 字符，仅匹配 title）、`status`、`severity`、`type`、
`assigneeUserId`（UUID）、`taskId`（opaque ID，最大 128 字符）。每个参数只允许出现一次；
未知或非法参数返回 400 `INVALID_REQUEST`。未传 status 时只返回
`open|processing|escalated`；显式 status 可取冻结 WorkItemStatus 的任一值。

成功响应固定为：

```jsonc
{
  "ok": true,
  "data": {
    "items": [{
      "workItemId": "uuid",
      "type": "diagnosis | dispatch | self | agent_question | external_handled",
      "status": "open | processing | done | ignored | expired | external_handled | rejected | escalated",
      "severity": "P0 | P1 | P2 | opportunity | null",
      "title": "工作项标题",
      "account": {"workspaceId": "uuid", "media": "KUAISHOU", "accountId": "opaque-id", "accountName": null},
      "task": {"taskId": "opaque-id", "taskName": null},
      "assignee": {"userId": "uuid", "displayName": "脱敏姓名"},
      "slaDue": "2026-08-26T12:00:00.000Z",
      "createdAt": "2026-08-25T12:00:00.000Z",
      "resolvedAt": null
    }],
    "page": 1,
    "pageSize": 20,
    "total": 1
  },
  "meta": {
    "dataState": "ready | empty | partial | stale",
    "businessDate": "2026-08-25",
    "dataAsOf": "2026-08-25T12:00:00.000Z",
    "coverage": {"complete": true},
    "selectedSource": "platform",
    "requestId": "..."
  }
}
```

- 账户型工作项的 `account` 必须完整包含批准的 `(workspaceId,media,accountId)`；不在 scope
  的行一律不得计入 `total`。Service 逐行守卫，发现 Repository 越界必须整页 fail closed。
- `media/account_id` 同为 null 的非账户型工作项，只有 `assignee=current user` 或
  `creator=current user` 时可见；不得把 workspace 内无账户对象当成全员可见。此类 item 的
  `account=null`。`task/assignee` 缺源时为 null，不伪造展示名。
- 默认排序：严重度 `P0 → P1 → P2 → opportunity → null`，随后
  `slaDue ASC NULLS LAST, createdAt ASC, workItemId ASC`；最后 ID 是唯一 tie-breaker。
- 列表不返回完整 `evidenceSnapshot/diagnosis/t1Result`，点击后走已冻结详情接口。所谓
  “其余 N 户在阈值内”在阈值版本、分母和时间窗 Contract 冻结前不进入响应，前端不得自行算。
- `dataState` 只描述工作项持久化查询本身：事务快照完整且筛选后 total=0 为 empty；分页或
  来源覆盖不完整为 partial；依赖奇航事实生成的账户型工作项在首次 full 未完成时为 stale，
  但已持久化的本人非账户型工作项仍可返回。count/page/readiness 同一 RR/RO 快照。
- 401/403/400/502/503/504/500 使用稳定 error envelope；所有成功/错误响应的
  `x-request-id` 必须与正文 `meta.requestId`/`error.requestId` 完全一致。响应正文大于或恰好
  16MB 返回 502 `SOURCE_TRUNCATED`，不返回部分页。
- 本批只读：ignore/process/reject/escalate/dispatch/reply 均不随列表开放。

## 变更集与执行

- `POST /api/v1/changesets` `{work_item_id?, items:[{target_type,target_id,field,to_value}], reason_code}` → 服务端补 from_value/TTL/What-if
- `POST /api/v1/changesets/:id/dry-run` → item 级预检
- `POST /api/v1/changesets/:id/confirm` → 复核 from 值（变了 409）→ 入 jobs 队列
- `POST /api/v1/changesets/:id/rollback` → 反向变更集草稿
- `GET /api/v1/changesets/:id` 状态机全量

`GET /api/v1/changesets/:id` 的一期只读响应包含：账户 tuple、状态、item 级
from/to/status/failReason、`simulation` 风险与 dry-run 快照、TTL、原因码和执行时间。
它使用与工作项详情相同的 tuple 授权和稳定错误 envelope。
本批未挂载 `POST create/dry-run/confirm/execute/rollback`，任何对详情路由的非 GET 请求返回 405。
工作项与变更集详情和 data query 共用后端响应体上限；序列化正文大于或恰好命中
16MB 边界时均 fail closed，返回 502 + `SOURCE_TRUNCATED`，不发送部分详情。

## 账户与结构

- `GET /api/v1/accounts?stage=&starred=&tags=&owner=` 池
- `GET /api/v1/accounts/:id` 详情（小传+余额+倒计时）
- `GET /api/v1/accounts/:id/structure` campaign→unit→creative 树
- `GET /api/v1/accounts/:id/timeline` 操作史（含 external 带外变更）
- `POST /api/v1/accounts/:id/star|tags|transfer`

### ACCOUNTS-LIST-001 账户池（一期只读）

浏览器只调用 `GET /api/internal/accounts`；BFF 转发 AUTH-001 服务端 Session cookie，
后端解析批准的 workspace/user/account scope，再调用 `GET /api/v1/accounts`。浏览器不得提交或覆盖
`workspaceId/userId/role/accountIds/dataSource`。

允许的 query 参数仅为：`page`（默认 1）、`pageSize`（默认 20，最大 100）、`q`（最大
100 字符，仅匹配 account_name/account_id）、`media`（一期仅 `KUAISHOU`）、
`stage=cold_start|ramping|stable|declining|paused|closed|unknown`、
`starred=true|false`、`tags`（逗号分隔、去重后最多 10 个；AND 语义，账户必须同时拥有全部
标签）、`ownerUserId`（UUID）、`status`（非空、最大 64 字符）。未知、重复或非法参数返回
400 `INVALID_REQUEST`。

成功响应固定为：

```jsonc
{
  "ok": true,
  "data": {
    "items": [{
      "workspaceId": "uuid",
      "media": "KUAISHOU",
      "accountId": "opaque-id",
      "accountName": null,
      "status": "active",
      "lifecycleStage": "cold_start | ramping | stable | declining | paused | closed | unknown",
      "starred": false,
      "tags": ["人工标签"],
      "owner": {"userId": "uuid", "displayName": "脱敏姓名"},
      "linkedTasks": [{"taskId": "opaque-id", "taskName": "任务名称"}],
      "metrics": {
        "businessDate": "2026-08-25",
        "cost": 120.5,
        "realConversion": 8,
        "realCpa": {"value": 15.0625, "state": "finite"},
        "assessmentPrice": 38
      },
      "balance": {"value": 1000, "syncedAt": "2026-08-25T12:00:00.000Z"}
    }],
    "page": 1,
    "pageSize": 20,
    "total": 1
  },
  "meta": {
    "dataState": "ready | empty | partial | stale",
    "businessDate": "2026-08-25",
    "dataAsOf": "2026-08-25T12:00:00.000Z",
    "coverage": {"complete": true},
    "selectedSource": "qihang",
    "requestId": "..."
  }
}
```

- 每个 item 必须完整携带 `(workspaceId,media,accountId)`，并且恰好命中批准 scope；列表
  `total` 只统计批准 tuple。Service 必须逐行再次守卫，Repository 漏过滤时 fail closed，
  不得静默删行后仍返回 `coverage.complete=true`。
- `accountName/status/owner/metrics/balance` 的类型分别为 `string|null`、`string|null`、
  `object|null`、`object|null`、`object|null`；`linkedTasks` 始终为数组。metrics 对象存在时，
  `cost/realConversion/assessmentPrice` 均为 `number|null`，`realCpa` 始终使用 RatioValue。
  缺源时按上述 null/空数组表达；不得
  从账户 ID 猜名称，不得用 0 代替缺失金额或指标。`realCpa` 必须由后端生成 `RatioValue`。
- `linkedTasks` 只返回业务日位于 `task_accounts` 有效期的任务，按 `taskId` 稳定排序；同一
  账户可关联多个任务，不能压成单值。
- 默认稳定排序：`starred DESC`，随后生命周期风险顺序
  `declining → cold_start → ramping → stable → paused → closed → unknown`，再按
  `accountName ASC NULLS LAST, media ASC, accountId ASC`；最后两个字段是唯一 tie-breaker。
- count/page/readiness 必须在同一 `REPEATABLE READ READ ONLY` 快照内读取。首次 full 未成功
  或批准 scope 为空时不得宣称 ready；完整但业务日 Canonical 尚未到为 stale；完整且筛选后
  `total=0` 才为 empty；任何授权范围/来源覆盖不完整为 partial。
- 普通账户池固定 `selectedSource=qihang`；KA Data/reconcile 不进入本接口，也不得由 query
  参数选择。余额来自独立低频源，`balance=null` 不强制把整页判 partial，但必须保留
  `syncedAt`，前端据此展示“余额未同步/已过期”。
- 401/403/400/502/503/504/500 使用稳定 error envelope；所有成功/错误响应的
  `x-request-id` 必须与正文 `meta.requestId`/`error.requestId` 完全一致。响应正文大于或恰好
  16MB 返回 502 `SOURCE_TRUNCATED`，不返回部分页。
- 本批只读：星标、标签、转移负责人、加/关账户和任何媒体动作继续关闭。

## 任务

- `GET /api/v1/tasks` / `GET /api/v1/tasks/:id`（含 pacing 计算结果）

### TASK-LIST-001 任务列表（一期只读）

浏览器只调用 `GET /api/internal/tasks`；BFF 转发 AUTH-001 服务端 Session cookie，
后端解析批准的 workspace/user/account scope，再调用 `GET /api/v1/tasks`。浏览器不得提交或覆盖
`workspaceId/userId/role/accountIds/dataSource`。

允许的 query 参数仅为：`page`（默认 1）、`pageSize`（默认 20，最大 100）、`q`（最大
100 字符，仅匹配 task_name/biz_name）、`status=preparing|active|ended`、`ownerUserId`
（UUID）、`periodFrom/periodTo`（有效 YYYY-MM-DD，筛选任务周期相交）、
`hasOpenWorkItems=true|false`。未知参数、非法日期或 `periodFrom > periodTo` 返回 400
`INVALID_REQUEST`。

成功响应固定为：

```jsonc
{
  "ok": true,
  "data": {
    "items": [{
      "taskId": "opaque-id",
      "taskName": "任务名称",
      "bizName": null,
      "status": "preparing | active | ended",
      "period": {"start": "2026-08-01", "end": "2026-08-31"},
      "owner": {"userId": "uuid", "displayName": "脱敏姓名"},
      "assessmentPrice": {"value": 38, "effectiveDate": "2026-08-01"},
      "volume": {"target": 1000, "completed": 420},
      "pacing": {
        "asOf": "2026-08-25",
        "elapsedDays": 25,
        "totalDays": 31,
        "remainingDays": 6,
        "targetProgress": {"value": 0.42, "state": "finite"},
        "timeProgress": {"value": 0.806, "state": "finite"},
        "projectedVolume": 610,
        "projectedCompletion": {"value": 0.61, "state": "finite"},
        "projectedGap": 390,
        "requiredDailyVolume": {"value": 96.667, "state": "finite"},
        "budgetProgress": {"value": null, "state": "undefined"}
      },
      "linkedAccountCount": 8,
      "workItemSummary": {
        "openCount": 2,
        "highestSeverity": "P1",
        "counts": {"P0": 0, "P1": 1, "P2": 1, "opportunity": 0}
      }
    }],
    "page": 1,
    "pageSize": 20,
    "total": 1
  },
  "meta": {
    "dataState": "ready | empty | partial | stale",
    "businessDate": "2026-08-25",
    "dataAsOf": "2026-08-25T12:00:00.000Z",
    "coverage": {"complete": true},
    "selectedSource": "qihang",
    "requestId": "..."
  }
}
```

- `taskId` 是 opaque ID，只允许非空、最大 128 字符；前端不得解析或拼接业务含义。
- `taskName/period/owner/assessmentPrice/volume` 缺源时用显式 `null`，不得编造；`period`
  仅在 start/end 都有效时返回，否则为 `null`。
- `pacing` 必须由后端复用冻结的 `computeTaskPacing` 生成；所有比率沿用
  `RatioValue`，前端不得重算 pacing、CPA、Gap、达成率或预测。
- `assessmentPrice` 必须取业务日生效的最新版本；不得取未来版本或任务表占位值。
- `linkedAccountCount` 只统计业务日落在 task_accounts 有效期内且位于批准账户 scope 的
  `(media,account_id)`；不得泄露 workspace 内其他用户无权账户数量。
- `workItemSummary` 只统计当前批准范围内 `open|processing|escalated` 工作项；不存在时返回
  0 与 `highestSeverity=null`，不得返回标题、诊断或无权账户信息。
- 默认稳定排序：`active → preparing → ended`，随后 `period.end ASC NULLS LAST`，最后
  `taskId ASC` 作为唯一 tie-breaker；分页期间禁止不稳定排序。
- `dataState` 优先级固定为 `partial > stale > empty > ready`：coverage 不完整即 partial；
  完整但业务日数据未到即 stale；完整且筛选后 total=0 才是 empty。状态不能由前端猜测。
- 普通任务列表固定 `selectedSource=qihang`；KA Data/reconcile 不进入本接口，也不得由 query
  参数选择。
- 401/403/400/502/503/504/500 使用稳定 error envelope，必须携带相同的响应头与正文
  `requestId`；错误不回显 SQL、上游正文、账户 scope 或 Secret。
- 本批只读：创建、编辑、改考核价、账户分配和媒体执行端点继续关闭。
- `POST /api/v1/tasks` `{idempotency_key, draft: {task_name, biz_name, period_start, period_end, target_volume, budget, ...}}` → 创建任务草稿（**P-002#2 裁决：群内创建任务用，幂等键必填**）
- `PATCH /api/v1/tasks/:id` `{...}` → 更新草稿或已发布任务
- `POST /api/v1/tasks/:id/assessment-price` `{price, effective_date, evidence_url}` → 触发重算+通知
- `GET /api/v1/tasks/:id/timeline|accounts|funnel`

## 规则

- `GET/POST/PATCH /api/v1/rules`（fork：POST `{fork_from}`）
- `POST /api/v1/rules/:id/explain` `{account_id, ds}` → 真值表（为什么没触发）

## 报表与报告

- `GET/POST /api/v1/reports/configs`；`POST /api/v1/reports/render` `{config|config_id}` → 数据集
- `GET /api/v1/reports/daily?date=&role=` 日报数据（12 模块结构）
- `POST /api/v1/export` `{query, format:"xlsx|png|pdf"}` → 任务化导出

## Agent

- `POST /api/v1/agent/sessions` `{page_context?}` → session（**新建默认空上下文**）
- `POST /api/v1/agent/sessions/:id/messages`（SSE 流式）；`POST .../context` 增删对象
- `POST /api/v1/agent/sessions/:id/query` `{natural_language}` → 结构化 query JSON（**P-002#1 裁决：群内自然语言→结构化查询端点，agent 先转结构再调 /api/v1/query**）
- `GET /api/v1/agent/runs?initiator=me` 运行监控

## 系统

- `GET /api/v1/system/health` 数据健康聚合（各源 data_as_of/coverage/etl 状态）
- `GET /api/v1/system/etl-runs`；`POST /api/v1/system/etl-runs/:id/rerun`（admin）
- `GET/PUT /api/v1/me/credentials`（返回绑定状态，不返回值）
- `GET /api/v1/search?q=` 对象直达（账户/任务，⌘K 用，非 LLM）

## 错误码

`UNAUTHORIZED | FORBIDDEN | STALE_DATA_WRITE_BLOCKED | CHANGESET_EXPIRED | FROM_VALUE_CHANGED | BLOCKED_AUTH | RATE_LIMITED | NO_CREDENTIAL`

**P-001#5 裁决（鉴权失败判定）**：
- HTTP 401/403 → 直接 `BLOCKED_AUTH`，不重试
- HTTP 200 但业务错误码 → **待 B7 内网实证后补充映射表**（Qihang get_data 可能返 HTTP 200 + 业务错误）
- B1a 阶段：后端只实现 HTTP 401/403 不重试；其余 4xx/5xx 按通用策略（502/503/504 重试 3 次指数退避，其余不重试进 failed）
