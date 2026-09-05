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

## 一期主数据源路由（DATA-ROUTE-001，v1.2 定稿；2026-09-05 合并旧表述为唯一规则）

规则只有这一套（取代 root 2026-08-25「KA Data 备用/诊断、普通 Session 一律 platform」旧文；老板 9-4「数据源绑空间」裁决覆盖 8-25 裁决，历史见台账 #320/#139）：

- **源由服务端按 `workspaceKind` 固定**：`personal` → `platform`（奇航，本人授权账户）；`team` → `ka_data`（全渠道，只读）。切空间即切源。
- **浏览器不能选源**：普通请求只接受 `{queryId, params}`；出现 `dataView`/`data_view` → `400 INVALID_REQUEST`；导航与响应不暴露 `ka_data/platform/reconcile` 选择器。
- **每个数据响应必带来源标识**（BE-001 lineage 已有 `source/metricVersion/dataAsOf/timezone/dayCut`；R-010a 补齐 `workspaceKind`）；前端页头**常显**「空间 · 来源 · 数据日期 · 更新时间 · 口径 ⓘ」，不只在首次说明——切空间后金额不同是换源不是算错，要让用户一眼看出。
- **team 空间只读**：变更集/任务编辑/授权变更在 Repository 前拒绝 → `403 FORBIDDEN`（已由 Task5 实现）；团队数据只用于观察，**不驱动个人账户写操作**。
- **reconcile 不是业务视图**：只在治理后台 `POST /api/v1/admin/data/reconcile`；需 `DATA_DIAGNOSTIC_ENABLED=true` 且 `(workspaceId,userId)` 命中 `DATA_DIAGNOSTIC_ENTITLEMENTS_JSON`；KA Data 总开关关闭时在上游调用前返回 `422 VIEW_UNSUPPORTED`。诊断不是 `role=admin` 的隐含能力。
- **配置含义**：`KA_DATA_ENABLED=false` 时 personal 空间不受影响；team 空间此时返回 `503 SOURCE_UNAVAILABLE` 并显示「团队数据源未配置」，**不得回退到 platform 伪装团队数据**。
- **切源审计**：服务端记录 `selectedSource/reason/requestId`；不记录 token、SQL、上游正文。共享 reader token 只从服务端 Secret 读取。

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
前端不得用原始分子分母重算。**普通可缺指标一律 `MetricValue={value:number|null, availability:"available"|"missing"|"error"}`（P0-04 三态，与 metrics.md 一致；R-009 裁决 2026-09-05 取代旧"number|null"写法）**；只有 `availability=available` 的 0 才是真 0。

普通 Session 请求**严格只接受两个顶层字段**（R-009 裁决 2026-09-05：`dataView` 从必填改为**不接受**，收到即 `400 INVALID_REQUEST`；数据源由服务端按 `workspaceKind` 固定 personal→platform / team→ka_data）：

```jsonc
{
  "queryId": "account.summary",
  "params": {
    "date": "2026-08-24",
    "media": "KUAISHOU",
    "accountIds": ["fixture-account"]
  }
}
```

`reconcile.account_daily` 不在普通 Query Registry 白名单内；仅治理后台的诊断路由（`DATA_DIAGNOSTIC_ENTITLEMENTS_JSON` 命中）以独立端点 `POST /api/v1/admin/data/reconcile` 进入，请求体同上两字段。

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
`<queryId>/v2`（v2=指标三态化；v1 fixtures 作废由 R-009 同步升级）。lineage 至少包含：

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

- `GET /api/v1/work-items?status=&severity=&assignee=&type=` 队列；响应 `meta.coverage` 见下（取代旧"其余 N 户在阈值内"计数）
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
- 列表不返回完整 `evidenceSnapshot/diagnosis/t1Result`，点击后走已冻结详情接口。
- **覆盖三态（2026-09-05 冻结，取代"其余 N 户在阈值内"）**：响应 `meta.coverage = {accountsInScope, checked, pending, undeterminable, ruleSetVersion, window:{from,to}, checkedAt}`，全部由服务端算：`accountsInScope`=本空间本媒体授权账户数；`checked`=规则已在本窗口跑完且数据完整的账户；`pending`=规则未跑/取数未完成；`undeterminable`=缺数三态非 available 的账户。**前端只有在 `pending=0 && undeterminable=0` 时才允许显示"其余 N 户在阈值内"**（N=checked−有工作项的账户数）；否则显示「已检查 checked · 待检查 pending · 缺数无法判断 undeterminable」。前端不得自行算。
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

---

## v1.3 DTO 与状态机（2026-09-04 arch 裁决 P-005～P-008；R-010 接 Web API 依此）

### 工作项（P-005）

- 状态机：`open →process→ processing`｜`open/processing →dispatch→ dispatched`（改 assignee + timeline 派发记录）｜`任意活动态 →escalate→ escalated`（assignee=值班表上级）｜`processing →reject→ rejected`（`reject_reason` 必填）｜`done` 由 T+1 回收或人工完成写入｜`ignored/expired` 终态。
- 去重：同 `dedupe_key` 活动态只一条，再触发 `occurrence_count+1`；严重度升级则关旧建新（`superseded_by`）。
- 户级静音：`POST /api/v1/accounts/:media/:id/mute {days, reason_chip}` → `account_mutes`；**P0 突破静音**。
- 详情 DTO：`{id, type, severity, status, title, account{media,account_id,name}, task_id, rule{id,name}, evidence_snapshot, diagnosis(diagnosis/v1), occurrence_count, last_triggered_at, assignee, sla_due, t1_result, timeline[]}`；四个动作端点均返回此 DTO。
- `POST /rules/:id/explain {media, account_id, ds}` → `{rule_id, ds, triggered:boolean, tree:[{node, passed, actual, threshold, reason:"data_stale|insufficient_sample|cooldown|daily_cap|conflict|no_permission|awaiting_confirm|ok"}]}`（PRD 5.6「为什么没触发」七种原因）。

### 变更集（P-006）

- `changeset_items.from_value/to_value` = `{type:"number"|"boolean"|"string"|"json"|"schedule168", value, media_default?:true}`。
- 状态机：`draft →dry-run→ draft(dry_run_hash 写入)` → `confirm`（**必须存在成功 dry-run 且 hash 匹配**，否则 409 `DRY_RUN_REQUIRED`；from 值变了 409 `FROM_VALUE_CHANGED {changed_items:[{target_id,field,expected_from,actual_from}]}`）→ `confirmed →jobs→ executing → success|partial|failed|unknown`；`failed` 可 `POST /retry`（新 execution_run attempt+1）；`unknown` 自动只读 reconcile 一次，仍 unknown 转人工；`rollback` 只对 success 项生成反向草稿，原 changeset 在反向 success 后置 `rolled_back`。
- confirm 幂等：同 `confirm_hash` 重复 confirm 返回既有 execution_run（200 非 201）。
- execution_run DTO：`{id, changeset_id, attempt, status, dry_run, started_at, finished_at, items:[{target_type,target_id,field,item_status,applied_value,media_code,media_message,applied_at,fail_reason}]}`。

### 任务与日报（P-007）

- pacing：业务日（上海 03:00 日切）；`as_of`=最近完整结算日；`remaining_days` 不含 as_of；7 日均速剔除零量日并返回 `excluded_zero_days`；任务 `ended` 后返回 `final_achievement_rate` 不再外推。
- `POST /tasks/:id/assessment-price` 响应 `{task_id, old_price, new_price, effective_date, recomputed_days, notified_user_ids[]}`；已读确认走 `work_items(type=agent_question)`。
- 日报 `GET /reports/daily?date=&role=optimizer|lead|exec` 响应 `{schema:"daily-report/v1", date, role, modules:[{key, title, status:"available"|"missing"|"error", data}]}`；12 模块 key/字段表由 R-010 从 `docs/18-KA日报规范借鉴.md` 抄入本节附录。

### Agent（P-008）

- `POST /agent/sessions/:id/messages {client_message_id, content, context_object_ids?}` → SSE。帧 `{type:"session"|"run"|"delta"|"tool"|"evidence"|"done"|"error", run_id, seq, ts, data}`；structured output 只在 `done.data`；`error.data={code,message}`。
- 续传 `GET /agent/runs/:id/events?after_seq=N`；取消 `POST /agent/runs/:id/cancel`；`client_message_id` 幂等（重复返回同 run）。
- `POST/DELETE /agent/sessions/:id/context {object_type:"account"|"task"|"work_item"|"changeset"|"report", object_id}`；无权限 403 不加入；对象已删 410。
- run DTO：`{id, session_id, status:"queued"|"running"|"succeeded"|"failed"|"cancelled"|"timeout", provider_id, model, attempt, error_code, first_token_at, started_at, finished_at, summary}`；usage 只作诊断字段不进结算。
- 诊断 `diagnosis/v1`：`{reason_code, action:"reduce_bid"|"increase_budget"|"pause"|"replace_material"|"observe", evidence_refs[], confidence(0-1), expected_effect{metric, delta_range:[lo,hi]}, constraint_check{passed, violations[]}, fallback_reason?}`；`reason_code` 枚举=PRD 归因子类。
- OS 工具（B7 联调前只冻形状）：`dispatch_os_task {capability, params, account_scope:[{media,account_id}], idempotency_key}` → `{os_run_ref, status, result_ref}`；写能力必须携带 confirmed `changeset_id`。

### 错误码追加

`TASK_ACCOUNT_OVERLAP | DRY_RUN_REQUIRED | OBJECT_GONE(410) | MUTED_BY_ACCOUNT`

---

## v1.4 端点与 DTO（2026-09-04 arch 裁决缺口地图 12 条；R-012 依此）

### 警报流与值守（1.6 / 9.5）

- `GET /api/v1/alerts/stream?since=<iso>` → `{items:[{work_item_id, severity, title, account{media,account_id,name}, created_at, acked_at, escalation?:{id, level, to_user, paused_until, deadline}}], duty:{date, primary:{user_id,name}, backup}, counts:{p0_unacked, p1_open, escalating}}`；只返回活动态 P0/P1。
- `POST /work-items/:id/ack` → 停止升级倒计时；`POST /escalations/:id/pause {minutes}` → 标"处理中"暂停。
- `GET /duty/roster?week=YYYY-Www` / `PUT /duty/roster {entries:[{date, primary_user, backup_user}]}`；交接班未关闭 P0 自动转移。
- `GET /escalation-policies` / `PUT /escalation-policies {severity, ack_timeout_min, remind_after_h, escalate_to, breaks_quiet_hours, batch_hourly}`（admin）。默认 seed：P0 30/—/duty_backup/true/false；P1 —/24→48/lead/false/false；P2 —/—/lead/false/true。

### 协作：派发与提审（1.9 / 3.10）

- `POST /work-items/:id/dispatch {to_user, acceptance_criteria?, acceptance_rule?:{metric,operator,threshold,window_days}, note?}` → dispatches 行 + 接收方工作台出现（来源标"派发"）+ 钉钉通知。
- `POST /dispatches/:id/receipt {outcome:"done"|"ignored"|"disagreed", reason?}` → 回执自动带变更集与 T+1；`disagreed` 是合法结局，派发方建议同样被回收打分。
- `GET /dispatches?role=sent|received&status=` 列表；超 SLA 24h 提醒/48h 自动 escalate。
- `POST /changesets/:id/submit-for-approval {approver, comment?}` → approvals；变更集进入 `awaiting_approval`（**不阻断 dry-run，阻断 confirm**）。
- `POST /approvals/:id/approve|reject {comment?}`；批/驳可在钉钉 L2 卡片完成；SLA 30min 催办。
- `GET /approvals?role=requested|pending&status=`。
- 免审：同 approver 同 `reason_code` 批过 ≥3 次 → `approval_auto_pass_rules.auto_pass=true`，后续同类 `status=auto_passed`；approver 可关。
- **充值协作**（REQ-046）：`POST /accounts/:media/:id/recharge-request {amount, note}` → 只发 outbound 消息给上级，**不入 approvals、不阻断**。

### 任务详情六页签（2.2 / 2.8 / 2.9）

- `GET /tasks/:id` → `{task, overview:{target_volume, achieved, achievement_rate, time_progress, pacing(v1.3), on_target, anomaly_summary:{p0,p1,opportunity}, assessment_price:{current, effective_date, history_count}}}`。
- `GET /tasks/:id/metrics?date_from&date_to&compare=dod|wow` → `{summary, trend[]}`（=query summary/trend 以任务为 scope）。
- `GET /tasks/:id/accounts`（已冻）+ 每户 `capacity:{budget, budget_usage_rate, headroom}`。
- `GET /tasks/:id/funnel?date_from&date_to` → `{online:{exposure, click, conversion, real_conversion}, offline:{wake_uv, potential_uv, real_conversion}, rates:{ctr, cvr, gap, potential_rate, bi_cvr}}`；值全用 MetricValue/RatioValue；离线链路来源 `account_offline`，缺则 `missing`。
- `GET /tasks/:id/timeline?cursor=&kinds=` → `{items:[{at, kind:"changeset"|"assessment_price"|"dispatch"|"external_change"|"work_item"|"escalation", actor:{user_id,name}|"system"|"external", summary, ref:{type,id}, detail?}], next_cursor}` 倒序；五源 UNION：changesets(success/partial/failed)、assessment_price_history、dispatches、work_items(created/resolved)、audit_log(action='external_change')。
- `GET /tasks/:id/materials`、`GET /tasks/:id/review` → 一期 `501 NOT_IMPLEMENTED`（P2/P1 占位，前端显空态不显假数据）。

### 8 维度透视补全（3.3）

- `dimension_type` 枚举全开：`task|biz|account|agent_type|resource_position|bid_tool|is_ubp|deduction_range`。
- `agent_type` 两级：行=`{agent_type:"agency"|"self", agency_name?}`（agency_name 取 accounts.tags 内 `agency:*`）。
- `deduction_range` 桶：`[0,10)|[10,30)|[30,+)`（domain 按 `deduction_rate` 分，单位 %）。
- `resource_position/bid_tool` 数据源=`ad_realtime` payload 字段（**字段名待 OS agent 联调确认**）；确认前返回 `DIMENSION_UNSUPPORTED`，不返回空表冒充。

### 加/关账户（4.5）

- `POST /accounts/import {media, account_ids[], owner_user_id?}` → 认领：写 accounts（若无）+ `account_access_grants`（personal 空间发起人 read/preview）+ 触发首次 ETL；返回 `{imported, already_exists, forbidden}`。
- `POST /accounts/:media/:id/close {reason}` → **不直接关**，返回清理向导 `{open_work_items[], open_dispatches[], subscriptions[], scheduled_infra[], starred_by[]}`。
- `POST /accounts/:media/:id/close/confirm {work_items:"close"|"transfer:<user>", dispatches:"close"|"transfer:<user>", unsubscribe:true, stop_infra:true}` → 逐项执行后 `status=closed, lifecycle_stage=closed, closed_at`；写 audit。
- 开户流程（无 API 段）：`POST /accounts/open-flow {task_id, media, note}` → infra_requests(status=manual_pending) + 工作项；人工标记完成后走 import。

### 素材域（6.x；**DTO 由 Codex R-012 从 B12-B18 domain 类型提案，arch 审后补入**）

端点名冻结：`GET /materials?media&task_id&sort&page`、`GET /materials/:media/:id`、`POST /materials/:media/:id/analyze` → job、`GET /materials/:media/:id/analysis?version=`、`GET /materials/:media/:id/similar?top=`、`POST /materials/:media/:id/brief`、`GET /materials/:media/:id/where-used`（素材反查）、`GET /products?status=`、`GET /experiments?product_id=`。视频文件来源探针=联调硬门（用户上传/内部素材库/媒体可访问地址至少通一种）。

### 结算对账（7.3；**DTO/公式由 Codex R-012 从 B19 提案**）

端点名冻结：`GET /settlements?period=`、`POST /settlements/preview {period, template_version?}`（月中试算，不落 frozen）、`POST /settlements/:id/freeze`、`GET /settlements/:id`、`POST /settlements/:id/lines/:line_id/to-work-item`、`GET/POST /settlement-templates`。

### 知识库（8.x；对齐 CR）

- `GET /kb/documents?parent_id&kind&visibility&q&page` 树/列表；`POST /kb/documents {title, parent_id?, kind, content_json?, visibility}`；`GET /kb/documents/:id`；`PATCH /kb/documents/:id {title?, content_json?, parent_id?, position?, tags?, visibility?}` → 写 `kb_revisions` + 重算 `content_text/fingerprint` + 解析 `[[…]]` 重建 `kb_links`；`DELETE` 软删。
- `GET /kb/documents/:id/backlinks`；`GET /kb/search?q=&kind=`（FTS，非 LLM）；`GET /kb/by-object/:type/:id`（8.4 反查）。
- 自动归档 job `kb_archive`：日报/周报/复盘/诊断 → `kind=ai_report`，目录按 任务/日期；案例卡 job `kb_case`：变更集 success + T+1 + 忽略原因 → `kind=case`（错题本 `visibility=private`）。
- 权限：`visibility` + workspaceKind；team 空间只读；Agent citation 走 B8 权限裁剪。

### 卡片中心（9.4）

- `GET/POST /cards/templates {kind, level, schema}`；`POST /cards/instances {template_id, target:{type,id}, changeset_id?}` → 生成 outbound 消息（L2 写 `changeset_hash`）。
- `POST /cards/callback {card_instance_id, action, actor_external_id, idempotency_key, changeset_hash?}`（网关→产品，内部 bearer）：
  - L0：只读直跑，返回结果；L1：低风险动作执行后回卡；L2：校验 `changeset_hash`=当前 `dry_run_hash` 否则 `409 CARD_HASH_MISMATCH`，通过则等价 confirm；L3：返回 web deep link。
  - `actor_external_id` → `identity_mappings` → `actor_user_id`，无映射拒绝（四身份对账 14.3b）；`idempotency_key` 重复返回既有结果。
- `GET /cards/callbacks?card_instance_id=`。

### 推送订阅（9.3）

- `GET /subscriptions/mine` / `PUT /subscriptions/mine {items:[{kind:"daily_report"|"alert"|"settlement"|"run_result"|"report_schedule", target:"group"|"dm", config, quiet_hours:{start,end}, task_ids[]}]}`；quiet_hours 只压 P1/P2。

### 错误码追加

`NOT_IMPLEMENTED(501) | DIMENSION_UNSUPPORTED | CARD_HASH_MISMATCH | APPROVAL_REQUIRED | ACCOUNT_HAS_OPEN_ITEMS`


## v1.4.1 追加（2026-09-05 arch；窗口化口径 + 日预算卡）

- **语义查询窗口**：`summary/trend/table/dimension` 的 `params` 统一接受 `date_from/date_to`（`date` 单日 = 两者相等的糖）；Registry 冻结每个 queryId 的最长范围。窗口内指标按 `metrics.md`「窗口化口径」**先聚合再相除**，响应 `lineage` 加 `window:{from,to,preset?}`。前端不得用日值自己累加。（R-010a1）
- **日预算卡**（任务级、版本化，`task_budget_history`）：
  - `POST /api/v1/tasks/:id/daily-budget-cap` `{daily_budget_cap, effective_date, evidence_url?}` → `{task_id, old_cap, new_cap, effective_date}`；不触发重算（预算不影响历史指标），写 timeline。
  - `GET /tasks/:id` overview 加 `daily_budget_cap:{current, effective_date, history_count}`（无卡 → null）与 `budget_usage_rate`（`RatioValue`，当日）。
  - timeline `kind` 枚举加 `daily_budget_cap`。
  - 工作台六 KPI 的 `summary` 加 `budget_usage_rate`（个人空间：本人任务加权；无卡任务不计）。（R-012）
- **考核口径=现金**（2026-09-05 老板纠正）：`on_target/cost_space/cost_status/外推` 全部按 `cash_cost`；`summary` 同时返回 `cost`（账面）与 `cash_cost` 两组，前端并排展示不混用。
- **色标规则**（前端只按后端给的 `status` 上色，不自算）：`summary`/任务 overview 返回 `cost_status: "green"|"yellow"|"red"` + `cost_status_reason`（`"day_over_window_ok"` 等），按 metrics.md 容忍带规则由后端算；容忍百分比来自个人视图设置（默认 0）。

- **口径设置与变更记录**（老板 2026-09-05："系数不常变但要有地方改；考核价这类常变的都要留变更记录"）：
  - 三张版本表都已是"只增不改"：`assessment_price_history`（考核价）、`task_budget_history`（日预算卡）、`channel_coefficients`（返点折算，含 `op`）——每行 `effective_date + changed_by + evidence_url + created_at`，改一次落一行，旧行永不覆盖。
  - 编辑入口：考核价/日预算卡在**任务详情·总览**（已有 `POST /tasks/:id/assessment-price`、`/daily-budget-cap`）；返点折算在**设置 · 口径**：
    - `GET /api/v1/settings/channel-coefficients` → `{items:[{media, op, coefficient, effective_date, changed_by, evidence_url, history_count}]}`（每媒体当前生效行）
    - `GET /api/v1/settings/channel-coefficients/:media/history` → 全部版本倒序
    - `POST /api/v1/settings/channel-coefficients` `{media, op, coefficient, effective_date, evidence_url?}` → 追加新版本；权限 personal 空间 admin；team 空间 403（团队数据用 ka-data 已算好的 `cash_yuan`，不在本系统改系数）；`effective_date` 早于已有最新生效日 → 允许（回溯改口径）但响应带 `recomputed_days`，与考核价改价同一重算链。
  - **统一变更记录** `GET /api/v1/settings/change-log?kinds=assessment_price|daily_budget_cap|channel_coefficient&task_id=&media=&cursor=` → `{items:[{at, kind, scope:{task_id?|media?}, old_value, new_value, effective_date, changed_by:{user_id,name}, evidence_url}], next_cursor}`，三表 UNION 倒序；任务详情 timeline 里的 `assessment_price/daily_budget_cap` 是它的子集。
  - 落点：R-012（端点）；前端 设置页「口径」tab + 任务详情总览（F-006 后续页）。
