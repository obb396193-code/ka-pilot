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

- **媒体写业务码与 UNKNOWN（2026-09-05 OS 实证后定稿）**：kuaishou-cli 无本地错误码表，只透传 MAPI `{code, message, request_id}`（`code≠0` 抛错）；读超时为裸 `TimeoutError`（未包裹）、连接超时为 `KuaishouApiError`。契约：执行器把**任何非成功返回（含裸异常）一律记 `unknown`**；`request_id` 仅成功响应才有，**无客户端幂等键**，所以 UNKNOWN 不得盲目重试——必须先回读（`accounts/:media/:id/structure` 或 unit list）比对目标字段，回读显示未生效才允许重试一次并记 `attempt+1`，仍 unknown 转人工。业务码含义表由 R-012 从 ka-src-0007 MAPI 文档提案后追加此处。真写测试广告主：89059600（有 unit）。
- **8 维透视枚举（2026-09-05 定稿）**：`dimension ∈ task|biz|account|agent_type|resource_position|bid_tool|ubp|deduction_range`；`ubp` 永久 `DIMENSION_UNSUPPORTED`（无源）；`agent_type` 只支持账户级聚合（ad 级请求 → `DIMENSION_UNSUPPORTED`）；`bid_tool` 为派生枚举，映射表未提案前返回 `DIMENSION_UNSUPPORTED`。


## v1.4.1 补：`account.summary/v3` 行结构与 fixtures（2026-09-05 arch；fixture 即契约；**编号 v3**——v2 已由 Codex R-009 `bdc5273` 落地为"九指标三态"，本节是 v2 之上加窗口与考核块，strict schema 下加字段即破坏兼容，故升 v3，R-010a1 实现）

`packages/contract/fixtures/data-query/summary-window-v3-{green,yellow,cash-missing}.json`、`work-item-list/coverage-{complete,pending,undeterminable}.json`、`task-detail/overview{,-no-cap}.json`、`settings/{channel-coefficients,change-log}.json` 为**唯一权威样例**；后端 parity 测试直接读，前端 mock 直接用。

`account.summary/v3` 单行（= v2 三态 metrics + `assessment` 块 + `lineage.window/workspaceKind`）：
```jsonc
{
  "rowCount": 3, "accountCount": 3, "anomalyRows": 1,
  "metrics": {                        // 全部 MetricValue 三态；账面与现金两组并排，不混
    "cost": MV, "cashCost": MV, "exposure": MV, "click": MV, "conversion": MV, "realConversion": MV,
    "costSpace": MV,                  // = Σ考核价×真实转化 − Σ现金消耗（窗口内）
    "wakeUv": MV, "potentialUv": MV,
    "ratios": { "ctr": RV, "cvr": RV, "realCpa": RV /*账面，只展示*/, "cashCpa": RV /*考核用*/, "gap": RV, "potentialRate": RV, "biConversionRate": RV }
  },
  "assessment": {
    "price": {"value": 38.0, "effectiveDate": "2026-09-01"} | null,
    "onTarget": true | false | null,  // null = 现金或考核价缺
    "costStatus": "green" | "yellow" | "red" | null,
    "costStatusReason": "window_ok" | "day_over_window_ok" | "window_over" | "cash_missing" | "assessment_missing",
    "budgetUsageRate": RV             // 当日消耗 / 当日生效日预算卡；无卡 → undefined
  }
}
```
`lineage` 加 `workspaceKind` 与 `window:{from,to,preset}`；`preset ∈ today|yesterday|last_7d|month_to_date|last_month|task_period|custom`。`account.trend/v3` = `ds + 同构 metrics`（不含 assessment）。v2（R-009）→ v3（R-010a1）切换时 fixtures 整体升级，前端不做双版本兼容。

`GET /work-items` 的 `meta.coverage` 见「覆盖三态」；`GET /tasks/:id` overview 字段以 `task-detail/overview.json` 为准（`cost.projectedWindowCashCpa`/`affordableDailyCashCpa` 为 metrics.md 外推两式）。

## v1.5 端点与 DTO（2026-09-05 arch；13 条"有名无 DTO"冻结；Codex R-014 出 migration 015）

路径规范：账户级端点统一 `:media/:id` 三键形态；旧 `/accounts/:id` 形态作废。

### 4.2 账户小传 `GET /api/v1/accounts/:media/:id?window_from&window_to`
```jsonc
{ "account": {"workspaceId","media","accountId","accountName","agentType","lifecycleStage","claimedAt","owner":{"userId","name"},"tags":[],"starred":bool},
  "bio": { "openedAt": date|null, "openedBy": {"userId","name"}|null,
           "tasks": [{"taskId","taskName","validFrom","validTo","current":bool}],
           "assessment": {"price","effectiveDate"}|null, "onTarget": bool|null, "costStatus": "green|yellow|red"|null },
  "balance": { "asOf": ts|null, "balance": MV, "rechargeBalance": MV, "contractRebate": MV, "directRebate": MV, "extendedBalance": MV, "sharedWallet": MV },  // fund 七字段，缺=missing
  "velocity": { "costPerHour": MV, "asOf": ts|null },
  "cutoff": { "hours": MV, "at": ts|null, "state": "ok|warning|critical|unknown" },   // 断量倒计时 = balance/velocity；velocity=0 或缺 → unknown
  "summary": <account.summary/v2 单行，窗口=参数> }
```

### 4.3 操作史 `GET /api/v1/accounts/:media/:id/timeline?from&to&kinds&cursor` 与图上叠加层
- items：`{at, kind: "changeset"|"external_change"|"assessment_price"|"daily_budget_cap"|"dispatch"|"work_item"|"escalation"|"infra"|"transfer"|"mute", actor: {userId,name}|"system"|"external", summary, ref:{type,id}, detail?, t1Result?: {"observedAt","metricDeltas":{"cashCpa":RV,"cost":MV,"realConversion":MV},"note"}}`，倒序，`next_cursor`。
- `GET .../timeline/overlay?from&to` → `{points:[{at, kind, label, ref}]}`，供趋势图打点（只回 kind∈changeset|external_change|assessment_price|daily_budget_cap）。
- `external_change`（带外变更，11.7 检测语义一并冻）：结构同步每轮比对 `ad_entities` 的 bid/budget/status/schedule 快照，非本系统变更集产生的差异 → 写 `external_changes` 一行 + 关联工作项标「已在后台处理」。

### 4.10 交接
- `POST /api/v1/accounts/transfer` `{items:[{media,account_id}], to_user_id, include:{work_items:true, dispatches:true, starred:true}, note?}` → `{transfer_id, moved:{accounts, work_items, dispatches}, notified_user_ids[]}`。语义：personal 空间内 `account_access_grants` 从 from→to（原 grant 置 revoked_at，新建 grant）；相关 open 工作项 assignee 改 to；派发单 receiver 改 to；星标随账户；写 timeline `transfer`；双方各一条 outbound 通知。
- `POST /api/v1/users/:id/transfer-all` `{to_user_id, note?}`（admin；离职场景）= 该用户全部账户按上式打包。
- 冲突：目标用户非 active 或非同空间 → 403；账户有 running 变更集 → 409 `TRANSFER_BLOCKED_BY_CHANGESET`。

### 3.5 小时盯盘 `POST /api/v1/query {queryId:"account.hourly", params:{date, media, accountIds?, hhFrom?, hhTo?}}`
- 行 `(media, accountId, hh)`：`{cumulative:{cost:MV, cashCost:MV, conversion:MV, realConversion:MV}, delta:{同上四项}, ratios:{cashCpa:RV, realCpa:RV}, velocity:{costPerHour:MV}, projectedDayCost:MV, budgetUsage:RV, lastSyncAt}`；hh 0..23，24=全天。缺小时=missing 不补 0。
- 盯盘名单：`GET/PUT /api/v1/me/watchlist` `{items:[{media,account_id}]}`（个人视图的一种，表 `user_watchlists`）。

### 3.6 Gap 对账 `POST /api/v1/query {queryId:"account.gap", params:{date_from,date_to,media,accountIds?,groupBy:"account"|"task"|"biz"}}`
- 行：`{group, conversion:MV /*回传*/, realConversion:MV /*BI*/, gap:RV /*conv/real−1*/, preDeductionGap:RV, deductionRate:RV, gapStatus:"normal"|"high"|"missing"}`；`high` 阈值来自规则引擎 gap 规则当前版本（响应 `meta.ruleSetVersion`）。

### 3.10 个人视图 + 定时推
- 表 `saved_views`；`GET /api/v1/me/views?page=` / `POST` `{page, name, config:{filters, columns, sort, window}, is_shared?}` / `PATCH /:id` / `DELETE /:id`。`config.version="view/v1"`。
- 定时推 = `subscriptions.kind="report_schedule"`：`POST /api/v1/subscriptions` `{kind:"report_schedule", config:{view_id|report_config_id, cron, format:"png"|"xlsx", target:"group"|"dm", target_ref}}`；到点生成 `report_runs` 一行 → 渲染 → `outbound_messages`。

### 7.4 导出
- `POST /api/v1/export` `{kind:"query"|"view"|"report", ref:{queryId,params}|{view_id}|{report_config_id}, format:"xlsx"|"png"|"pdf"}` → `{export_id, status:"queued"}`；`GET /api/v1/exports/:id` → `{status:"queued"|"running"|"done"|"failed", file:{url /*临时签名，TTL 10 分钟*/, bytes, expires_at}|null, error|null}`。PNG/PDF 走网关 Chromium 渲染管线，必带口径戳 + 数据日期 + 空间/来源水印；xlsx 模板化（表头=中文指标名+口径徽章列）。表 `exports`。

### 9.1 接入管理
- `GET /api/v1/integrations/connections` → `[{id, provider, status:"connected"|"degraded"|"disconnected", health, lastCheckedAt, config:{clientIdMasked, robots:[{robot_id,name}], groups:[{conversation_id,name}]}}]`；`POST .../:id/check` → 主动探活写 `health/last_checked_at`。
- 身份映射：`GET/POST /api/v1/integrations/identity-mappings` `{external_user_id, provider, user_id}` → 落 `identity_mappings`（v1.4 已有表），`verified_at` 由首次回调实名命中写。secret 只存 ref。

### 9.6 消息记录
- `GET /api/v1/integrations/messages?direction=in|out&status=&kind=&cursor=` → `{items:[{id, direction, channel, target /*脱敏*/, kind, status:"queued"|"sent"|"failed"|"dead"|"received"|"processed", attempts, failReason, createdAt, sentAt|processedAt, ref}], next_cursor}`（`outbound_messages` ∪ `inbound_events`）。
- `POST .../messages/:id/retry`：出站 failed → 重排队；入站 dead → admin 重置 `attempts=0, last_error=NULL`（留原行，加一条 `retried_by`）。

### 5.7 操作工具箱（Capability Registry）
- 表 `capabilities`；`GET /api/v1/capabilities?category=` → `[{key, name, category:"query"|"write"|"infra"|"account"|"material", form_schema /*JSON Schema*/, permission, version, status:"documented_unverified"|"verified"|"disabled", executor:"product_direct"|"runtime"|"multica_run", media:[]}]`。
- `POST /api/v1/capabilities/:key/invoke` `{params, account:{media,account_id}}`：`category=query` → `{result_ref}`；`write` → **只生成变更集草稿** `{changeset_id}`（走 dry-run/confirm 链，永不直接执行）；`infra` → `infra_requests` 一行；`disabled/unverified` → 409 `CAPABILITY_UNAVAILABLE`。页面按钮与工作流节点同源调用。

### 10.11 分级决策
- 工作项详情加 `decision:{tier:"auto"|"card_confirm"|"proposal"|"investigate"|"escalate", gates:{confidence:RV, historicalSuccessRate:RV, recentManualOps:int, reversible:bool, withinCap:bool}, overriddenBy:"history"|null, reason}`。`auto` 只在规则处于自治度第 3 档且四门全过（PRD §3.9）；否则最高 `card_confirm`。
- 策略：`GET/PUT /api/v1/settings/decision-policy` → `decision_policies` 一行 JSONB（阈值：confidence≥0.9、historicalSuccessRate≥0.8、recentManualOpsWindowHours=24、dailyCapCny）。

### 1.8 早报 job
- `GET /api/v1/reports/daily-brief?date=` → `{date, status:"ready"|"pending_data"|"failed", generatedAt, dataAsOf, sections:[...日报 12 模块的 optimizer 子集], queueSummary:{p0,p1,opportunity,coverage:<meta.coverage>}, pushStatus:"not_sent"|"sent"|"failed"}`。
- job `daily_brief_generate`（每 workspace×user）：触发=业务日切 03:00 后且该 workspace 当日 `etl_full` done；数据未就绪 → `pending_data` 不生成假早报；推送走 `subscriptions.kind="daily_report"`；记录 `report_runs`。

### 3.8 报表 configs
- `report_configs.config` 冻结为 `report-config/v1`：`{version, dataset:{queryId, params}, groupBy:[dim], columns:[{metric, label?, format?}], sort:[{by,dir}], filters:[...], highlight:[{metric, op, value, style}], layout:{type:"table"|"chart", chart?:{kind, x, y[]}}}`；表加 `is_shared BOOLEAN, version TEXT, updated_at`。
- `POST /api/v1/reports/render {config|config_id, window?}` → `{rows:[canonical 行], columns:[...], highlights:[{rowIndex, metric, style}], lineage}`；Agent 帮做表（3.9）不在本版。

派活：以上 → **R-014**（migration 015 + HTTP + BFF），排 R-012 后；fixtures 由 arch 随 R-014 开工前补。

- **缺数期规则抑制（12.8，2026-09-05）**：语义在 `metrics.md`「缺数期规则抑制」；`POST /api/v1/rules/:id/explain` 响应 `leaves[].availability` + `not_triggered_reason ∈ CONDITION_FALSE | METRIC_MISSING | SOURCE_STALE | COLD_START_RELAXED | INITIAL_FULL_PENDING | MUTED | DEDUPED`；`GET /work-items` 的 `meta.coverage.pending/undeterminable` 由本规则产生；规则表加 `availability_policy/data_freshness_max_hours`。


## v1.5.1 端点与 DTO（2026-09-05 深夜 arch；全量偏差审计 A①-⑤，老板拍板；R-014 一并实现）

### ① 账户池（原型 P09；老板 9-5"看全量户各在哪个阶段、哪些没用、按产品、哪些备用"）
- `GET /api/v1/accounts` 筛选加 `poolStatus`（多值）、`product`、`groupBy=none|lifecycle|product|owner|task`；响应 item 加 `poolStatus, poolStatusSource, product:{name,ref}|null, balance 加 cutoff:{hours:MV,state}`、`dailyBudgetCap`（当前任务卡）、`capacityLoad`（RatioValue，=当日消耗/日预算卡）、`lastAction:{at,kind,summary}|null`、`nextSuggestion:{workItemId,title}|null`（来自 open 工作项，无则 null，**不生成假建议**）。
- `GET /api/v1/accounts/pipeline?media=` → `{stages:[{poolStatus, count, deltaVsYesterday:MV}] /*九态固定顺序*/, asOf}`；点卡即 `poolStatus=` 筛选。
- `PATCH /api/v1/accounts/:media/:id/pool-status` `{pool_status, note}` → 人工覆盖（`pool_status_source=manual`，写 timeline kind `pool_status`）；`DELETE` 同路径清除覆盖回系统推导。
- `PATCH /api/v1/accounts/:media/:id/product` `{product_name, product_ref?}`。
- **批量 → 变更集组**：`POST /api/v1/changesets/batch` `{accounts:[{media,account_id}], items:[{target_type,field,to_value}] /*对每户同样的改动*/ | per_account:[{media,account_id,items:[...]}], reason_code, title?}` → `{group_id, changesets:[{changeset_id, media, account_id, status}], skipped:[{media,account_id,reason}]}`；`POST /changesets/groups/:id/dry-run|confirm` 按组逐条调用单账户链，响应汇总 `{results:[{changeset_id,status,conflicts?}]}`；组状态 done=全部终态。执行仍逐账户，三键与单执行者不变。
- 主按钮「新建账户」= `POST /accounts/open-flow`（v1.4，开户向导，写 `pool_status=pending_open`）；「导入认领」= `POST /accounts/import`（v1.4）。
- 官方工作流模板清单加 **「新任务开户到基建」**（准备→开户→充值→基建→冷启动观察），与 PRD 3.9 四条并列为五条。

### ② 投放任务阶段/就绪度/SOP/阻塞（REQ-028；原型 P03/P04）
- 列表 item 加 `stage`（七态）、`readiness:{accounts,recharge,products,materials,strategy,infra}`（每项 `{ratio:RV, ready:bool, source:"system"|"manual", missing:[string]}`）、`nextMilestone:{at,label}|null`。
- `GET /tasks/:id` overview 加 `stage:{value, source, changedAt}`、`readiness`（同上，含 `overall:RV`）、`sopProgress:{runId|null, steps:[{key:"prepare"|"open"|"recharge"|"build"|"cold_start"|"deliver_monitor", status:"done"|"running"|"pending"|"skipped", at}]}`（无绑定 run 时按 stage 推导 steps，`runId=null`）、`blockers:[{kind:"work_item"|"dispatch"|"escalation"|"readiness", ref, title, severity}]`、`nextActions:[{kind, ref, title}]`（只来自真实工作项/派发/就绪缺项，不生成）。
- `PATCH /tasks/:id/stage {stage, note}` 人工置阶段（`stage_source=manual`）；`PUT /tasks/:id/readiness/:dimension {ready, note}` 人工勾就绪。
- `POST /tasks/:id/sop-run {template:"official.open_to_build", params}` → 用官方模板起 run 并绑定 `sop_run_id`；run 节点完成写 `stage_source=workflow`。
- 页签定稿（替换 v1.4 六页签）：总览｜数据｜账户｜商品与素材（501 占位）｜**SOP 与自动化**（sopProgress + 绑定的规则）｜异常与工作项｜时间线｜报告与结算（501 占位）——共八页签；「投放策略」页签等策略中心定义后再加。

### ③ 工作流节点模型 `workflow-graph/v1`（原型 P12/P13；前端画布依此）
```jsonc
{
  "version": "workflow-graph/v1",
  "nodes": [{
    "id": "node_6", "type": "changeset",          // trigger|query|compute|condition|agent_analysis|changeset|human_confirm|execute|wait_reconcile|notify
    "label": "生成变更集", "params": {...},          // 按 type 的 params schema（Registry 冻结）
    "executor_identity": "system_automation",     // system_automation|initiator|credential_owner
    "side_effect": "write",                        // read|write|external   （write 必须经 changeset→human_confirm→execute）
    "idempotency": "key_required",                 // key_required|none   （write/external 必须 key_required）
    "retry": {"max": 3, "backoff": "exponential", "base_ms": 2000},
    "timeout_ms": 120000,
    "permission_scope": ["accounts:read","changesets:write"]
  }],
  "edges": [{"from": "node_5", "to": "node_6", "condition": null | {"expr": "..."}}]
}
```
- 校验：`POST /api/v1/workflows/:id/versions/:v/validate` → `{schema:[{check,pass,detail}], permissions:[...], links:[...], missing_params:[{node_id,param,required}]}`；四组全过才允许 publish。
- 模拟：`POST .../simulate {params}` → 无副作用 trace `{steps:[{node_id,status,preview}]}`（write 节点只出变更集草稿预览，不落库）。
- 发布：`POST .../publish` → status=published，不可变；运行固定版本。
- Agent 帮编（5.3，升 P1）：`POST /agent/sessions/:id/workflow-draft {goal}` → graph 草稿 + `missing_params[]`，用户应用后仍须 validate。
- 运行详情 `GET /api/v1/workflows/runs/:id` → `{run:{id,version,initiator,executor_identity,status}, stages:[{node_id,label,status,started_at,finished_at,input_excerpt,output_excerpt}], changeset_preview:{group_id|changeset_id, items[], hash, expires_at}|null, permission_checks[], account_locks:[{media,account_id,conflict:bool,locked_by}], trace:{correlation_id,trace_id,span_id}, audit:[{at,actor,action,detail}], retry_policy, reconcile_policy, unknown_explain}`。
- 工作台面板 `GET /api/v1/workflows/runs?status=running|waiting_confirmation&mine=true` → `[{run_id, name, step_index, step_total, status, eta}]`。

### ④ 管理看板 = 工作台负责人视图（REQ-018/022；原型 P02 简化；不加导航）
- `GET /api/v1/workbench/lead?window_from&window_to` （role ∈ lead|admin；personal 空间聚合本人负责任务，team 空间聚合团队只读）→
  `{cards:{targetAchievement:RV, cumulativeCost:MV, cashCpa:{value:RV, assessment}, conversions:MV, healthyTasks:{n,total}, budgetGap:{value:MV, basis:"pacing_projection"}},
    risks:[{taskId,taskName,kind:"cost_over"|"volume_short"|"budget_short"|"structure", impact:MV /*来自 cost_space 或 pacing 缺口，无则 missing*/, suggestion:{workItemId}|null}],
    opportunities:[...同构...],
    blockers:[{kind:"dispatch_overdue"|"escalation"|"approval_pending"|"readiness_missing", count, tasks:[...]}],
    approvalsPending:[{approvalId, title, requester, due}],
    brief:{status:"ready"|"pending_data", sections:[...]}}`。
- 六卡全部 MetricValue/RatioValue，缺数显 −；`impact` 只用 metrics.md 已冻公式，**不做"预估收益"类臆算**。差距树（3.7）与 AI 提效（7.5）仍 P2。

### ⑤ Agent Patch 建议 + 公共资产端点
- Agent 消息事件加 `suggestion` 帧：`{suggestion_id, kind:"view_patch"|"report_config_patch"|"workflow_draft", target_ref, before, after, diff:[{path,before,after}]}`；`POST /agent/sessions/:id/suggestions/:sid/accept {mode:"all"|"partial", paths?:[...]}` → 应用到 saved_views/report_configs（新版本），`reject` 记原因。
- 公共资产（`assets` 表已存在）：`GET /api/v1/assets?kind=&status=&owner=me|team|official`；`POST /assets/:id/transition {to}`：`draft→shared` 本人；`shared→verified` lead/admin 且 `verified_at` 写入；`verified→official` admin；任意→`deprecated` owner/admin 且须填 `superseded_by`。UI 起步只露 draft/shared 两态（老板裁），其余状态只在治理后台可见。

### 优先级重排（老板 2026-09-05 拍 B）
- 4.7 开户测试跟踪、4.8 优质户复制 → **P1**（老板 8-24 每日闭环：开户测试、优质户复制、关垃圾计划）。
- 3.9 Agent 帮做表、5.3 Agent 帮编 → **P1**（REQ-036/064 明确要求）。
- 3.11 策略中心：标「明确要求 · 待定义」，不写 P2；定义待老板。


## v1.6 端点与 DTO（2026-09-06 arch；老板 9-5"契约能动的全动，让前端全铺开"；Codex R-015 出 migration 016）

### 6.x 素材域（列/DTO 由 arch 从 B12-B18 domain 反推冻结；原型 P10；老板 8-24"占位 demo + 接内部 AIGC"——页面按示例态做，字段按此）
- `GET /api/v1/materials?media&task_id&product_id&type&sort&page&window_from&window_to` → items `{media, materialId, name, type:"video"|"image", source:"qihang_pool"|"upload"|"internal", thumbnailRef|null, durationMs|null, productId|null, tags[], lineageParentId|null, sourceStatus:"reachable"|"unreachable"|"unknown", metrics:{cost:MV, exposure:MV, click:MV, realConversion:MV, ratios:{ctr:RV, realCpa:RV}}, analysis:{latestVersion|null, status:"none"|"queued"|"running"|"done"|"failed"}}`；`meta` 同 v3。
- `GET /materials/:media/:id` → `{material, metrics, analysis:{latest 摘要}, lineage:{parent|null, children:[{materialId, method}]}, whereUsed:[{taskId, accountId, adCount}]}`。
- `POST /materials/:media/:id/analyze {prompt_version?}` → `{jobId, version}`；`sourceStatus!=reachable` → `409 MATERIAL_SOURCE_UNAVAILABLE`（视频源探针=联调硬门）。
- `GET /materials/:media/:id/analysis?version=` →
  `{version, promptVersion, schemaVersion, status, media:{durationMs,width,height,contentSha256}, transcript:{source:"platform_caption"|"cloud_asr", timingPrecision:"segment"|"whole_video", segments:[{id,startMs,endMs,text}]}, shots:[{id,startMs,endMs,frame:{status:"ready",artifactRef}|{status:"placeholder",reason}}], visualSummary:{hardCutCount,visualEventCount,averageShotLengthMs,hookVisualDensity}, result:{hook:{text,kind,evidenceIds[]}, sellingPoints:[{text,evidenceIds[]}], audiences:[string], rhythm:{...}, cta:{text,evidenceIds[]}, segments:[{role:"hook"|"problem"|"body"|"proof"|"selling_point"|"turn"|"cta"|"other", startMs,endMs}]}, fingerprint}`；`timingPrecision=whole_video` 时前端**不显示句级时间戳**（IdeaLab 实证无时间戳）。
- `GET /materials/:media/:id/similar?top=` → `[{materialId, status:"scored"|"insufficient_evidence", score|null, components:[{kind:"structure"|"hook"|"selling_points"|"audience"|"rhythm"|"cta", status:"compared"|"unavailable", score|null, reasonCode}], missingComponents[]}]`。
- 复刻谱系：`POST /materials/:media/:id/lineage {derived_material_id, method:"script_rewrite"|"structure_adaptation"|"visual_remake"|"mixed", note?}`；`GET .../lineage` → 树。
- 设计 brief：`POST /materials/:media/:id/brief {product_id, objective, global_constraints[], variants:[{variantKey, changeDimension:"hook"|"selling_point"|"audience"|"rhythm"|"cta", hypothesis, instruction, keepDimensions[]}]}` → brief（含 fingerprint，status draft）；`POST /briefs/:id/send {designer_ref}`；`POST /briefs/:id/deliveries {variantKey, derived_material_id, method, note?}`；`GET /briefs/:id/backtest` → `{status:"awaiting_delivery"|"awaiting_sample"|"ready", missingVariantKeys[], insufficientMaterialVersionIds[], experiment|null}`。
- 商品：`GET /products?status&q` → `{productId, name, status, attrs, materialCount, metrics}`；`GET /products/:id`；商品主数据来源=ka-data `dim_product`（团队）/人工（个人），**快手侧无商品 API（OS 第五轮实证）**。
- 测品矩阵：`GET /experiments?product_id&policy_version&window_from&window_to` → `{policy, products:[{productVersionId, cells:[{materialVersionId, accountCount, activeDayCount, exposure:MV, click:MV, realConversion:MV, cost:MV, ctr:RV, inferenceRate:RV, realCpa:RV, inferenceRateInterval95:{lower,upper}|null, sampleStatus:"sufficient"|"insufficient", exclusionReasons[]}], conclusion:{status:"insufficient_sample"|"insufficient_candidates"|"effect_too_small"|"intervals_overlap"|"separated_observation", directionalLeaderMaterialVersionId|null, observedLeaderMaterialVersionId|null, cpaImprovementRate|null}}]}`；`GET/PUT /experiments/policy`。样本不足**不出结论**。
- AIGC 下单（6.4）：iframe 内嵌内部 material-order-platform，本产品只做入口与回链，不冻 DTO。

### 7.3 结算对账（DTO/公式由 arch 从 B19 domain 反推冻结；原型 P14 四步向导）
- 模板 `GET/POST /api/v1/settlement-templates` → `{templateId, templateVersion, name, currencyCode, unitNote, fields:[{fieldKey,label,order,valueType:"text"|"date"|"number"|"money"|"rate", aggregation:"none"|"sum", source:{kind:"fact",factKey}|{kind:"formula",expression:<field|constant|add|subtract|multiply|divide 树>}, required, allowCorrection}], checks:[{checkKey,label,order,leftFieldKey,rightFieldKey,tolerance:{mode:"absolute",amount}|{mode:"relative",rate}|{mode:"either",amount,rate}, severity:"block"|"warn"}], fingerprint}`；新版本=新行，**旧结算单绑旧版本不覆盖**。
- 事实来源（factKey 白名单，Registry 冻）：`cost`（账面）、`cash_cost`、`income`（赔付）、`contract_rebate`、`direct_rebate`（fund 七字段）、`real_conversion`、`assessment_price`、`account_count`、`task_id/media/account_id` 维度；周期内按 `(media,account_id,task_id)` 一行。
- 预览 `POST /settlements/preview {period:"YYYY-MM", template_version?, scope_id?}` → `{runId, templateFingerprint, period, dataBasis:"offline_settlement", dataCutoffAt, rows:[{rowKey, sourceFactId, fields:[{fieldKey, value, source:"fact"|"formula"|"correction", correctionId?}], checks:[{checkKey, status:"matched"|"mismatch"|"undefined", difference|null, relativeDifference|null, severity}]}], totals:[{fieldKey,value|null}], issues:[{code:"missing_required"|"invalid_field_value"|"undefined_formula"|"check_mismatch"|"check_undefined", severity, rowKey, fieldKey|null, checkKey|null}], status:"blocked"|"ready_to_freeze"}`（月中试算同此，不落 frozen）。
- 校正 `POST /settlements/:id/corrections {rowKey, fieldKey, fromValue, toValue, reason, evidenceRef?}`（仅 `allowCorrection` 字段；留痕不覆盖事实）。
- 冻结 `POST /settlements/:id/freeze` → 需 `status=ready_to_freeze`，否则 `409 SETTLEMENT_BLOCKED {issues}`；写 `confirmed_by/at` + 快照 fingerprint；`GET /settlements/:id` 返回冻结快照（不再随数据变）。
- 差异转工作项 `POST /settlements/:id/lines/:line_id/to-work-item` → `work_items(type=self)` 带 checks 证据。
- 分发：`POST /export {kind:"report", ref:{settlement_id}, format:"xlsx"|"png"}` + `subscriptions.kind="settlement"` 推群。

### 14.5/14.6/14.3a/12.10 治理后台最小（admin）
- 成员：`GET /api/v1/admin/members` → `[{identityId, displayName, provider, userId, role, isActive, joinedAt, grantsCount, lastSeenAt}]`；`POST /admin/members {display_name, provider:"internal_test"|"buc", provider_subject, role}` → 建 identity+user+personal workspace+membership（凭证由部署配置提供，不在此设密码）；`PATCH /admin/members/:identityId {role?, is_active?}`（停用=membership 失活 + 撤销全部 session，行不删）；`POST /admin/members/:identityId/transfer-all {to_user_id}`（= v1.5 users/:id/transfer-all）。
- 授权档案（14.3a）：`GET /admin/members/:identityId/grants` → `[{media, accountId, accessLevel:"read"|"preview"|"execute", grantedAt}]`；`PUT` 整体替换（差集写 timeline）；team 空间无 grants。
- 业务日历（12.10）：`GET/POST/DELETE /admin/calendar` → `{id, eventDate, eventType:"holiday"|"promo"|"coefficient_change"|"metric_change", label, affectsBaseline, thresholdProfile}`。
- 灰度开关：`GET/PUT /admin/flags` → `workspace_flags.flags`：`write_enabled`（默认 false；老板一人 true = 灰度）、`agent_enabled`、`team_source_enabled`、`materials_enabled`、`dingtalk_enabled`；`write_enabled=false` 时所有 confirm 返回 `403 WRITE_DISABLED`。
- 已有：`admin/data/reconcile`、`system/etl-runs` + rerun、`settings/channel-coefficients`、`settings/change-log`、`settings/decision-policy`、`integrations/*`。治理后台页 = 以上聚合，头像菜单入口，仅 admin。

### 3.11 策略中心（最小：分析视图；老板 8-24"不同版位不同任务不同出价的账户数据分析"；"可保存方案"仍待定义）
- `POST /api/v1/query {queryId:"account.pivot2", params:{dimA, dimB, window_from, window_to, media, taskIds?, filters?}}`，`dimA/dimB ∈ 8 维枚举`（`ubp` UNSUPPORTED）→ rows `{a:{key,label}, b:{key,label}, metrics:<v3 三态>, assessment:<v3>}` + `meta.cellCoverage:{cells, withData, undeterminable}`；预设三张：版位×任务、出价工具×任务、业务×版位（第三维用 filters）。
- 页面 `/data/strategy`：预设 tab + 自定义两维 + 异常单元格着色 + 勾选 → 「分析这 N 个」唤 Agent。不做"最优投法"推荐、不做策略对象。

### 4.7 开户测试跟踪（P1）
- `GET /api/v1/account-tests?status&task_id` → `[{id, media, accountId, taskId, purpose, hypothesis, startedAt, endAt, status:"planned"|"running"|"passed"|"failed"|"stopped", verdictNote, result:{window, metrics:<v3>, assessment:<v3>}|null}]`；`POST /account-tests {media, account_id, task_id?, purpose, hypothesis?, started_at, end_at?}`；`PATCH /account-tests/:id {status, verdict_note}`；系统每日刷新 `result`（只算不判），结论由人填。账户池 `pool_status` 不因测试改变；测试户加 tag `testing`。

### 4.8 优质户复制（P1；PRD 复制流程 A）
- `POST /api/v1/accounts/:media/:id/replicate {target:{media,account_id}, include:{structure:true, bids:true, schedule:true}}`（素材不复制，人工选）→ 读母户 `structure` → 生成目标户变更集组 `{replication_id, changeset_group_id, plan:{campaigns:n, units:n, fields:[...]}}`；走组 dry-run/confirm；applied 后目标户 `tags += replicated_from:<media>:<account_id>` 并进 `lifecycle_stage=cold_start`。
- `GET /accounts/:media/:id/replication-compare?days=7` → `{source:<v3 trend 7 日>, target:<v3 trend 7 日>}` 母子并排；`GET /account-replications?source=|target=`。
- 前置：目标户 `pool_status ∈ available|assigned|pending_build`；母户需 `structure` 同步成功（4.4 结构同步=联调）。

派活：R-015（migration 016 + 以上 HTTP/BFF），排 R-014 后。前端页面全部先按 fixtures 与示例态铺开，不等 R-015。


## v1.7 端点与 DTO（2026-09-06 arch；P2 大件 + 策略方案对象，老板拍；Codex R-016 出 migration 017；前端按 fixtures 先做）

### 3.11b 策略方案（可保存；原型 P07/P08）
- `GET /api/v1/strategies?status=official|team_verified|mine|draft&stage&biz&placement` → items `{id, name, version, status /*来自 assets*/, owner, applicable, playbook, evidence:{sampleTasks, window, metrics:<v3>, pivot2SnapshotRef}, validations:{count, improved, noChange, worse, insufficient}, boundTasks:[{taskId,taskName}], updatedAt}`。**不返回"置信度"**；只返回样本数与验证计数。
- `GET /strategies/:id` → 详情 + `playbookMap`（策略地图七步：placement/delivery_mode/bid/rta/budget_rhythm/account_matrix/stages）+ `conditions` + `validations[]` + `versions[]`。
- `POST /strategies {name, applicable, playbook, conditions?, evidence?:{pivot2_snapshot_ref}}` → draft；`POST /strategies/:id/copy` → 新草稿 copied_from；`PATCH /strategies/:id` 只改 draft；发布/验证/官方走 `assets/:id/transition`。
- `POST /strategies/:id/bind {task_id}` / `DELETE .../bind/:task_id`；任务详情第九页签「投放策略」显示已绑方案 + playbook + 与实际配置的差异（`diff:[{field, playbook, actual}]`，actual 来自 structure 同步）。
- `POST /strategies/:id/validations {task_id, window_from, window_to}` → 系统算 before/after（绑定前后各窗口的 cash_cpa/volume/on_target）→ status（`insufficient_sample` 按 metrics.md 样本护栏）；页面文案"操作后观察结果"。
- Agent 对比方案：suggestion 帧 `kind="strategy_variant"`：`{base_strategy_id, variant:{playbook 差异}, rationale:[evidence refs]}` → 接受=新草稿。
- `GET /strategies/:id/compare?with=<id>` → 逐字段并排。

### 3.7 归因树（原型 P02；只算有公式的节点）
- `GET /api/v1/tasks/:id/attribution?window_from&window_to&mode=volume|cost` →
```jsonc
{ "root": {"key":"target_gap","label":"目标差距","gap": MV /*量：target−projected；成本：Σ(cash_cpa−price)×conv over-target*/, "gapRate": RV},
  "children": [
    {"key":"cost_gap","label":"成本差距","gap":MV,"share":RV,"children":[
       {"key":"cpa_over","label":"CPA 偏高","gap":MV,"share":RV,"evidence":{"accounts":[{"media","accountId","cashCpa":RV,"price"}]},
        "children":[{"key":"bid_targeting","label":"出价/定向效率","gap":MV,"availability":"available|undeterminable"}, {"key":"cost_volatility","label":"成本波动影响","gap":MV,"availability":"undeterminable"}]}]},
    {"key":"volume_gap","label":"量级差距","gap":MV,"share":RV,"children":[{"key":"conversion_short","label":"转化量不足","gap":MV,"children":[{"key":"traffic_opportunity","label":"流量机会缺口","gap":MV,"availability":"undeterminable"},{"key":"cvr_room","label":"转化率优化空间","gap":MV}]}]},
    {"key":"structure_gap","label":"结构差距","gap":MV,"share":RV,"children":[{"key":"account_contribution","label":"账户贡献不足","gap":MV,"evidence":{"accounts":[...]}},{"key":"material_efficiency","label":"素材效率偏低","gap":MV,"availability":"undeterminable /*无素材级数据时*/"}]}
  ],
  "lineage": {"window":..., "adLevelSource":"platform.ad_realtime|ka_data.dwd_adgroup_daily|none"} }
```
- 节点 `availability=undeterminable` 时 `gap=missing`，前端灰显"数据不足"，**不显示"可优化空间"金额**。负责人视图 `workbench/lead` 加 `gapTree`（任务聚合版，同 DTO）。

### 3.12 竞情（AppGrowing；接入方式=OS 联调项，未定前示例态）
- `GET /api/v1/intel/materials?industry&competitor&placement&window&linked=` → `{items:[{id, source, ingestMode, competitor, industry, materialRef, thumbnailRef, firstSeen, lastSeen, activeDays, placements[], estCostTier, linked:{taskId?, materialId?}}], sourceStatus:{mode, lastIngestAt|null, note}}`。
- `POST /intel/import`（csv_import，multipart）→ `{imported, skipped}`；`POST /intel/materials {link}`（link 模式手工登记）；`POST /intel/materials/:id/link {task_id?|material_id?}`。
- 一期不做"竞品消耗估算"数值展示，只有 `estCostTier` 档位；接入 API 后再加。

### 5.9 Shadow Mode（自动化 tab「Shadow」；举证引擎，用词"操作后观察结果"）
- `GET /api/v1/shadow/decisions?window_from&window_to&rule_id&adopted=` → `{items:[{id, workItemId, rule:{id,name}, account:{media,accountId}, aiAction:{kind,target,delta,expected}, humanAction:{kind,source,ref,at}|null, adopted:bool|null, t1Result:{cashCpaDelta:RV,costDelta:MV,realConversionDelta:MV,matured}|null, t7Result:...|null, status, decidedAt}], summary:{n, adoptedRate:RV, t1ImprovedRate:{adopted:RV, notAdopted:RV}, t7ImprovedRate:{...}, matured:{t1:n,t7:n}}}`；`summary` 附固定 `caveat:"操作后观察结果，非因果；受流量/素材/预算/回补/他人操作影响"`。
- `GET /rules/:id/shadow-exam` → `{days, sample, observedImprovedRate:RV, gates:{observation:{pass,value}, executionReliability:{pass,successRate:RV,unknownRate:RV}, scope:{pass}, lossBound:{pass,netLoss30d:MV}}, eligibleForAutonomy3:bool}`（v1.4.1 四门）。
- 记录规则：工作项带 `diagnosis.suggestions` 即生成 shadow_decision；24h 内同账户同字段同向变更集或带外变更 → `adopted=true` 并记 human_action；无动作 → `adopted=false, human_action=null`。

### 7.5 AI 提效看板 `/reports?tab=ai-impact`
- `GET /api/v1/reports/ai-impact?window_from&window_to` → `{quadrants:{automatedRules:{executed:MV, succeeded:MV, unknown:MV}, anomaliesIntercepted:{count:MV, p0:MV, avgAckMinutes:RV}, hoursSaved:{value:MV, basis:"action_minutes_table", detail:[{action, count, minutes}]}, observedCostDiff:{adoptedVsNot:{cashCpaDelta:RV, sample:{adopted:n, notAdopted:n}}, caveat:"操作后观察结果，非因果"}}, trend:[{ds, executed, intercepted, hoursSaved}], byUser:[{userId, name, executed, hoursSaved}] /*仅本人与 lead 可见，不进导出*/}`；`GET/PUT /reports/ai-impact/config` → `action_minutes`。

### 7.2 周报 / 任务复盘 + Deep Research
- `GET /api/v1/reports/weekly?week=2026-W36&role=optimizer|lead` → `{schema:"weekly-report/v1", week, sections:[{key:"overview",cards:<v3 汇总>},{key:"tasks",rows:[{taskId, achievementRate:RV, costStatus, stage}]},{key:"anomalies",items:[...处理与回收]},{key:"operations",items:[...变更集+观察结果]},{key:"nextWeek",items:[...仅来自 pacing/就绪缺项/阻塞]}], generatedAt, dataAsOf, pushStatus}`；`report_runs kind=weekly`。
- `POST /tasks/:id/review {window_from?, window_to?}` → `{runId, status:"queued"}`（Agent Deep Research，异步 5–10 分钟）；`GET /tasks/:id/review/latest` → `{schema:"task-review/v1", status:"queued|running|ready|failed", sections:[{key:"goal",...},{key:"cost_trend",...},{key:"key_operations",timeline:[...]},{key:"attribution",tree:<归因树摘要>},{key:"why",findings:[{text, evidenceRefs[]}]},{key:"next",suggestions:[{text, evidenceRefs[], reversible}]}], citations:[{ref, type, label}], kbDocumentId /*生成即归档知识库*/, humanConfirmed:false}`；`why/next` 标"待人确认"。
- 任务详情第八页签「报告与结算」= 复盘 + 该任务相关报告/结算行。

### 7.6 知悉流 + 月度推送
- `GET /api/v1/workbench/lead/fyi?cursor=` → `{items:[{at, kind:"approval_decided"|"escalation_closed"|"major_change"|"milestone"|"member_change", summary, ref}]}`（负责人视图右栏；不需处理）。
- 月度推送：`report_runs kind=monthly_exec`，`GET /reports/monthly-exec?month=` → `{triples:[{goal, status, needDecision:bool}], decisions:[{approvalId, title, options:["同意","拒绝","再议"]}], diffSinceLast:[...]}`；推送走 `subscriptions.kind="monthly_exec"` 生成 L2 卡（拍板三键）+ PNG。

### 页面落点（F-007 清单追加）
数据分析 tab 加「归因树」「竞情」；策略分析 tab 分「分析视图 / 方案库」；任务详情第九页签「投放策略」；自动化 tab 加「Shadow」；报告 tab 周报/复盘/AI 提效改为真实规格；负责人视图加差距树卡 + 知悉流。


## v1.7.1 追加（2026-09-06 arch；回应 fe F-006-Q1～Q3；R-010a1/R-010b/R-014 分别实现）

- **BFF 同源路径补齐**（浏览器只打 `/api/internal/*`，BFF 转发 Session cookie + bearer，与 data-query 同规则）：`GET /api/internal/system/health`（镜像 `GET /system/health`，DTO 同 `fixtures/system/health.json`；R-010a1）；`GET /api/internal/me/counts`（新，见下；R-010a2）；`GET/PATCH /api/internal/me/preferences`（新；R-014）；Agent：`GET /api/internal/agent/models`、`POST /api/internal/agent/sessions`、`POST .../:id/messages`（SSE 透传七帧 + suggestion 帧）、`GET .../:id/events?after_seq=`、`POST/DELETE .../:id/context`（R-010b）。
- **`account.summary/v3` 环比块**：`params.compare ∈ dod|wow` 时响应行加 `compare:{mode, deltas:{cost:RV /*rate*/, cashCost:RV, realConversion:RV, cashCpa:RV /*百分点差，metrics.md 环比约定*/, onTargetRate:RV}}`；缺一侧 → `undefined`；`昨0今>0` → `{value:null,state:"infinite"}` 前端显 NEW。`assessment.price` 已在 v3。
- **`GET /api/v1/me/counts`** → `{workItems:{open,p0,p1,opportunity}, approvalsToApprove, dispatchesReceived, runsWaitingConfirmation, notificationsUnread, changesetsDraft}`（侧栏 badge/铃铛唯一计数源，同 REPEATABLE READ 快照）。
- **用户偏好**：表 `identity_preferences(identity_id PK, preferences JSONB, updated_at)`；`GET/PATCH /api/v1/me/preferences {theme:{mode:"bw"|"bwc"|"full", hue:"#rrggbb"}, locale?}`；identity 级跨空间；不改 AUTH-001 session 响应（冻结）。
- **Agent 模型清单**：`GET /api/v1/agent/models` → `[{id,label,provider,default,status:"verified"|"documented_unverified"|"disabled"}]` 来自 `provider_model_capabilities`；消息体 `context:{page, accounts?:[{media,accountId}], objects?:[{type,id}]}`——`workspaceId` **不由浏览器给**（Session 决定），accounts 必须落在 approved scope 否则 403。
- **账户池字段**（回应 F-006-Q4）：不用 fe 提议的 `lifecycle.stage` 八态，统一按 v1.5.1：`poolStatus`（九态库存）+ `lifecycleStage`（投放六态）+ `product:{name,ref}` + `tags[]` + `balance.cutoff`；fixture `accounts/list-v151.json`；fe 的 `account-lifecycle.mock.json` 改映射到此。

## v1.7.2 追加（2026-09-06 arch；回应 Codex P-053 三问；R-010a1 实现）

- **考核价多版本（窗口内多任务/多版本）**：`assessment.price` 只在窗口内所有账户日**同一价同一生效版本**时给 `{value,effectiveDate}`；否则 `price = null` 且加 **`priceVersions: N`**（N≥2，可选字段，只在混合时出现）。达标不看展示价：`onTarget = Σ_W cash_cost ≤ Σ_W price(d)×real_conv(d)`（逐日各用各的生效价，等价于 `cash_cpa(W) ≤ 转化加权考核价`），`costSpace` 同式；因此 `price=null` 时 `costStatusReason` **不是** `assessment_missing`（那只留给"窗口内任一账户日无考核价"）。前端 price=null 且 priceVersions≥2 显「多版本(N)」并可点开 `assessment_price_history`。跨天有效价**禁止**用窗口末价乘全窗口。
- **compare 对齐**：`dod` = 窗口两端各平移 1 天、`wow` = 各平移 7 天（等长平移，与"上周同日"一致；不是"前一等长窗口"）。`preset=today` 的 compare 需要昨日**同时段**快照，canonical 只有日累计 → 未具备前 `compare.deltas.*` 全部 `undefined`，**不得**拿昨日全天冒充；小时快照走 `account.hourly`，另议。
- **lineage.authority**：`sourceLineageSchema` 必填，后端不得删；arch 已给 17 个 v3/gap/pivot2/hourly fixture 补 `{policyVersion:"2026-08-24", useCase:"cross_media_operations", role:"default_authoritative"}`。`window.preset` 可选，未指定 → `custom`。公开 `POST /api/v1/query` 旧 `query_type` 与 `data/query queryId` 共用一套 Registry 与权限路径，不生成第二套。
- **costStatus/reason 映射冻结**（Codex 2790fc1 的 superRefine 即契约）：`window_ok→(true,green)`、`day_over_window_ok→(true,yellow)`、`window_over→(false,red)`、`cash_missing/assessment_missing→(null,null)`；cashCost 非 available 时 onTarget 必 null。fixtures 已全部按此校验（arch 自己造的 8 处违例已修）。

## v1.7.3 追加（2026-09-06 arch；回应 fe F-007 前五页 TODO-fixture；R-014 实现）

- **`GET /api/v1/tasks/:id/bindings`** → `{taskId, rules:[{ruleId,name,type,enabled,autonomyLevel,scope:"task"|"account",boundAt}], workflows:[{workflowId,name,version,status,scope,lastRun:{runId,status,at}|null}], sop:{sopRunId,template,progress:RV}|null}`；无绑定 → 空数组/null，**不用全局规则冒充**。fixture `rules/bindings-fixture-task-ready.json`。
- `account.trend/v3` 单账户：`params.accountIds=[id]`，lineage 加 `accountScope:{media,accountIds}`；fixture `accounts/trend-account-1.json`。
- 小传/时间线/结构树按账户各一份 fixture 是样例不是契约：`accounts/{detail,timeline,structure}-<id>.json` 由 `GET /accounts/:media/:id/{bio|timeline|structure}` 同一 DTO 返回；无数据的账户显诚实空态。

## v1.7.4 追加（2026-09-06 arch；回应 fe F-007 契约缺口 G1–G9 + Codex P-058/P-061；R-014/R-015/R-010a1 分别实现）

**fe G1–G9**
- G1 `GET /materials` items 加 `ratios.cvr: RV`（分母按 `material_experiment_policies.conversionRateDenominator`，默认 click；无策略 → 默认口径并在 `lineage.warnings` 注明）。→ R-015。
- G2 关注任务：`me/watchlist.items[]` 升为 `{type:"account"|"task", media?, accountId?, taskId?}`（无 `type` 视为 account，老数据兼容；JSONB 不动表）；`GET /tasks?starred=true` 按当前用户 watchlist 过滤。→ R-014。
- G3 已冻 v1.7.3 `GET /tasks/:id/bindings`。
- G4 `GET /workflows/runs` 与工作台面板 items 加 `taskId: uuid|null`（源 `workflow_runs.task_id`）。→ R-010b。
- G5 不加端点：v1.7.1 已定消息体带 `context:{page, accounts?}`，抽屉「+账户」chip = 下一条消息的 context；会话级 context 只在创建时给。
- G6 `GET /api/v1/search?q=&type?` 冻结：`type ∈ account|task|work_item|material|document`，items `{type, id, title, subtitle, href, workspaceKind}`，每类 ≤5，无 LLM。→ R-014。
- G7 确认设计：知识库无独立文件夹实体，`parent_id` 有子节点的文档即"文件夹"（对齐 CR `knowledge_items` 自引用），不加 `kind:folder`。
- G8 日报 `daily-v1` 加 `delivery:{status:"not_sent"|"queued"|"sent"|"failed", at, target}`（源 `outbound_messages` 中 ref 指向该 report_run 的最新一条；无 → not_sent）；`actions.pushDingtalk/exportPdf` 布尔保留表示"可用"。→ R-014。
- G9 `GET /api/v1/me/workload` → `{tasks:{owned, participating}, accounts:{owned, watching}, pending:{workItems, approvals, dispatches, runsWaitingConfirmation}, oncall:{today:boolean, next:{at, role}|null}, loadScore:{value:RV, source:"not_configured"|"formula"|"manual", formula:string|null}}`；全部从现有表计数，**负载分公式老板未定 → `loadScore.value` undefined + `source:"not_configured"`，不造分**。→ R-014。

**Codex P-058**
1. `costStatusReason` 加 **`conversion_missing`**（现金与考核价可得、真实转化缺）→ `(onTarget null, costStatus null)`；`cash_missing` 只指现金缺。映射表相应加一行；fixtures 现无此例，arch 后补一份。
2. `compare.deltas.onTargetRate` 分母冻结 = **窗口内可判定账户数**（onTarget 非 null），分子 = 其中 onTarget=true；delta 为百分点差（同 cashCpa 约定）。
3. `budgetUsageRate` 依赖 `task_budget_history`（migration 014 / R-012）；014 未落前 R-010a1 返回 `undefined` 并在 `lineage.warnings` 加 `BUDGET_SOURCE_NOT_READY`；**不前移迁移编号，不拿 `tasks.budget` 或媒体账户 budget 代替**。

**Codex P-061（团队源考核版本）**
- 团队空间 price(d) = `dwd_account_daily.cash_assessment(d)`（现金口径考核价，ka-src-0011 §考核价）；达标/costSpace 仍按逐日 Σ 式，不需要版本。
- 展示价：`assessment.price.effectiveDate` 改为 `calendarDate | null`——**null 只允许团队源**（源无版本信息），并加 `assessment.priceSource: "history"|"ka_daily"`；窗口内 `cash_assessment` 唯一值 → `{value, effectiveDate:null}`；多个不同值 → `price=null` + `priceVersions = 不同值个数`（不是天数）+ `lineage.warnings: ASSESSMENT_VERSION_UNKNOWN`。个人空间仍走 `assessment_price_history` 真版本。
- KA `conv` = fact_conv BI 转化 → 只映射 `realConversion`；媒体回传无源 → `conversion` missing、cvr/gap undefined（P-063 已实现，冻结）。

## v1.7.5 追加（2026-09-06 arch；回应 Codex P-077/082/083/092/093/096/098/100；migration 013 = R-011 + 本节全部 DDL）

**P-077 只读契约对齐**
- `account.dimension/v3` 当 `dimension=account`：行带三键 `{key:"<media>:<accountId>", label, media, accountId, metrics, assessment, anomaly}`；其余维度 key 不变。跨媒体同号不合并。fixture `dimension-v3-account.json`。
- 所有 v3 `assessment` 必带 `priceSource:"history"|"ka_daily"`；团队源 `price.effectiveDate=null`。三份 summary-window-v3、ready/unknown-lineage（升 v3，加 `lineage.window`）、dimension/pivot2/小传 fixtures 已同步；data-query fixture 的 `mode/meta.workspaceKind/selectedSource/lineage.source` 已一致（版位与 pivot2 = 团队源 ka_data，其余个人 platform），lineage 补齐 known 元数据。
- `GET /system/etl-runs` 一行 = 一次 **attempt**：`{runId:string(BIGSERIAL), jobId, attempt, jobType, status, businessDate, startedAt, finishedAt, rows:{raw, canonical}|阶段未到 null, warnings[]}`；不做 job 聚合。
- `GET /system/health` 加 `scope:"workspace"|"global"`；`connectors/executors/agent` 各 `{total, ok, unknown}`，缺源 → 数值 `null`，**不默认健康**；`healthScore` 任一分项未知 → `null`；`overall` 只按已知分项算并在 `note` 说明。
- §4.2 账户小传 `summary` 改 `account.summary/v3` 单行（含 assessment/priceSource）；`poolStatus/product` 随 015。

**P-082 R-011 团队 KA 快照接入 → 方案 A（采纳 Codex 提案）**
- 存储：canonical 保持当前投影；`team_sync_runs / team_sync_pages / team_metric_staging / team_snapshot_heads / team_sync_state` 五表 + `account_metrics_daily` 加 `source_kind`（platform|ka_data）、`snapshot_run_id`、`published_at`（个人为 NULL）。DDL 见 schema.sql v1.7.5。发布事务：staging 全页校验通过 → 同事务替换声明日期的 canonical 行 + 写 heads + 推进 publication_revision；任一步失败整体回滚、旧 head 不动。
- 读侧同批必接：普通 team query 走 `TeamSnapshotDataSource` 读已发布投影，**live KA 不做自动 fallback**（只留同步 adapter 与管理员诊断路径）；RR/RO 同快照；每行 source/run 与该日 head 一致，缺 head → partial 不读 staging；历史日期读各自 completed run；`dataAsOf` = 覆盖日中最旧的源刷新时间（保守），`published_at` 单独给；`lineage` 加 `snapshot:{runId, publishedAt, publicationRevision}`。
- readiness：team 只看 completed heads/coverage/真实 freshness；首次无完整快照不 ready；下一 run 失败仍可读旧快照并标 stale。accounts/tasks `selectedSource` 枚举加 `ka_data`；工作项对象源保持 platform。KA 开关关闭 → 拒新团队查询与同步，不借缓存绕过。
- 源不可变版本：OS 需补证（已列入老板给 OS 清单）；未证前 run 记 `source_snapshot_evidence:"unverified"`，允许发布但 lineage `warnings: SOURCE_VERSION_UNVERIFIED`；空源须有完整空 manifest 才发布 empty，无证明 → unknown 不替换 completed。

**P-083 R-010a2 三处**
1. `work_items.status` 加 `dispatched`；活动态集合 = `open|processing|dispatched|escalated`（列表默认/计数/partial unique 统一用此集合）。
2. `work_items` 加 `superseded_by UUID NULL`（同 workspace FK）；跨级重弹 = 新建高级项 + 旧项 `status='expired'` 且 `superseded_by` 指向新项；不原地升级。
3. `POST /work-items/:id/actions`：`reject` 的入参统一为 `{action:"reject", reason}`，`reason` 非空必填（`note` 只给其他动作，可选）。

**P-092** 同 hash confirm 幂等只覆盖 `confirmed`（回放返回同一 run/job）；`executing` 与终态一律 `409 INVALID_STATE` 并带当前 status，不做幂等成功。

**P-093 rollback**（采纳独立表）
- `changeset_reversals(workspace_id, original_id, reverse_id, source_execution_run_id, created_at)` + `changeset_reversal_items(workspace_id, reverse_id, reverse_item_id, original_item_id)`；`execution_run_items(workspace_id, execution_run_id, item_id, attempt, status, media_code, media_message, applied_value JSONB, applied_at)` 作逐 attempt 历史，不拿可变 `changeset_items` 冒充历史。
- ①同一 original 同时只允许一份未终态反向草稿；expired/failed 后可再建，旧 reversal 行保留；②仅反向**完整 success** 才置原 `rolled_back`，partial/unknown 原状态不变；③见上表；④`applied_value` 无实证 → 反向草稿 from 取最近观测 current，且必须重新 dry-run，不得声称已知媒体真实应用值。

**P-096 账户静音**
- `days ∈ {1,3,7}`；`muted_until` = 上海时间第 (today+days) 个业务日 03:00（dayCut）瞬时，含尾；②静音期内：**压通知 + 压 P1/P2/机会工作项的创建**（occurrence 仍计入 explain 的 `suppressedByMute` 计数），P0 突破；③`ignore+mute` 同一事务，失败整体回滚；响应 `{mutedUntil, scope:"notifications_and_p1p2"}`。

**P-098 复合规则六项**
1. 同节点多组 AND；`all`=AND、`any`=OR、`not`=NOT(OR(...))（每项都不成立）；允许嵌套，深度 ≤8、叶子 ≤128；空组/无叶子 → 拒绝。
2. `window_hours` 只是叶子取数窗；"连续 N 日"用叶子新属性 `consecutive_days:N`（每个业务日各自成立）；canonical 只有日累计 → `window_hours` 必为 24 的倍数，小时级只允许来自 `account.hourly` 的指标。fixture 规则 3 已改。
3. `threshold:"assessment_price"` = 同窗、逐日转化加权现金考核价（metrics.md）；字面字符串不解释为表达式。
4. 规则指标不用账面 `cost`；fixture 规则 7 改 `cash_cost`；无"账面上限"例外。
5. explain DTO 以 `rules/explain.json`（camelCase `ruleId/leaves/pass/notTriggeredReason`）为权威，api.md 旧 snake 描述作废；无限 CPA `{value:null,state:"infinite"}`、阈值缺 `{value:null,state:"undefined"}`、叶子 `pass:null` = undeterminable。
6. SLA 暂停：`work_items` 加 `sla_paused_at TIMESTAMPTZ NULL, sla_paused_total_ms BIGINT NOT NULL DEFAULT 0`；`work_item_sla_events(id, workspace_id, work_item_id, kind pause|resume, at, reason)`；恢复用持久化区间，不猜。
- 实现方式：受限 AST 解释，不 eval、不生成 SQL、不由 LLM 判真值；阈值引用纳入 requiredMetrics，按 (metric, window) 识别。

**P-100 bid_tool → 方案 A**
- `bid_tool` 只承载出价机制族：`cpm|cpc|ocpm|ocpc|max_conversion|unknown`；优化目标（`ocpx_action_type`）、创意制作（`unit_type`）、智能投放（`auto_manage`）各自保留原字段作证据列，不并入 bid_tool。个人源保持 `DIMENSION_UNSUPPORTED` 直到 ad_entities 存原值且 OS 探针（6 次只读）证实字段存在；团队直接读 `dwd_adgroup_daily.bid_tool` 源枚举，不用 MAPI 推导覆盖。未知/缺字段 → `unknown` 并保留 raw enum 与来源版本。

## v1.7.6 追加（2026-09-07 arch；前端页面齐全性审计补漏；R-014 实现）

- **账号安全（内测账密期）**：`POST /api/v1/auth/password {currentPassword, newPassword}` → 204；只对 `provider=internal_test` 身份开放，BUC 身份 → `409 PROVIDER_NOT_SUPPORTED`；新密码 ≥12 位、不得等于当前；成功后**吊销该身份其他 session**（当前保留）；错误统一「当前密码不正确」不泄露存在性；限速 5 次/15 分钟。设置页「三凭证」tab 内加「账号安全」块。
- **错误页**：全局 `not-found`（404：回工作台 / ⌘K 搜）、`error`（500：requestId + 重试 + 反馈到 inbox）、`403`（非成员/无权限：显示当前空间与申请入口）三页壳，不带业务数据。
- **移动端值班最小路径（PRD P1）**：仅三处保证手机可用——工作项详情、变更集确认弹层、数据健康横幅；其余页面在 `<md` 视口顶部显「请到桌面处理」条并禁用写动作，不做全站响应式。
- 工作项详情路由正名 `/work-items/[id]`，`/diagnostics/[findingId]` 保留 301。
- 上线前删除 `/login/candidates`、`/login/directions` 演示路由（老板拍板登录壳后）。

## v1.7.7 追加（2026-09-07 arch；OS 八条回收后；R-011 / R-012 / R-013b 实现）

- **R-011 源版本策略（ka-data 无版本号，OS 实证）**：每 ds 单条 SQL 一次拉完（≤10000 行；超过 → 该 ds fail closed，不分页拼接）；`team_sync_runs.source_snapshot_evidence` 记该 ds `MAX(updated_at)` 批次戳，同 run 两次读不一致 → 丢弃重拉；**ds ≥ D-3 标 `provisional`（每日重同步覆盖），≤ D-4 标 `stable`（不再重拉）**；team 行 `lineage` 加 `sourceBatch`（updated_at 批次）与 `stability:"stable"|"provisional"`；`SOURCE_VERSION_UNVERIFIED` warning 改为只在批次戳缺失时出。
- **R-012 bid_tool 码表**：Codex 从 ka-src-0007 官方文档冻 `unit.bid_type` 码表进 `metrics.md`（候选 1/2/6/10/12/20 → `cpm|cpc|ocpc|ocpm|max_conversion|…`，未知码 → `unknown` 并保留 raw 码）；`ocpx_action_type / deep_conversion_type / unit_type / campaign.bid_type / auto_manage` 六字段作证据列存 raw int（`ad_entities` 六列，migration 014）；**个人源 `DIMENSION_UNSUPPORTED` 解除条件** = 六列已入库且首次 sync 后非空率 > 0。OS 样本：120 unit 全 bid_type=10，无 12。
- **R-013b worker 触发**：轻量 FaaS 无 timer → worker 暴露 `POST /internal/worker/once`（Header `X-Worker-Trigger-Token` = `WORKER_TRIGGER_TOKEN`，无/错 → 401；硬截止 `WORKER_ONCE_MAX_MS`；单飞：上一轮未结束 → `409 WORKER_BUSY`）；由 autopilot cron 每 10 分钟 POST。响应 `{status:"completed"|"budget"|"blocked_auth", jobs:{leased,done,failed}}`。
- **部署拓扑（内测）= 方案 A**：整套跑沙箱（web / data-api / worker 三进程 + 沙箱 PG localhost:5432）；正式化前必须实测 FaaS→内网 RDS:5432。

## v1.7.8 追加（2026-09-07 arch；回应 fe G10–G13；R-014 实现）

- **G10 统一通知流**：`GET /api/v1/me/notifications?cursor&limit&unread_only` → `{items:[{id, kind:"alert"|"approval"|"dispatch"|"run"|"system", severity:"p0"|"p1"|"p2"|"info"|"warning", title, body, at, read, ref:{type,id}|null, href}], unread, nextCursor}`；`POST /api/v1/me/notifications/read {ids?:[id]}`（不传 ids = 全部已读）→ `{unread}`。**不新建表**：由 work_items（alert/dispatch）、approvals、workflow_runs、system 事件在读时投影；已读态存 `identity_preferences.preferences.notificationsReadAt` + 单条已读集合；`unread` 与 `me/counts.notificationsUnread` 同源同值。fixture `me/notifications.json`、`me/notifications-empty.json`。
- **G11 改密码**：即 v1.7.6 `POST /api/v1/auth/password`，成功响应补 `{changedAt, otherSessionsRevoked}`。设置「个人资料」的「找管理员重置」文案在端点上线后替换为自助表单。fixture `auth/password-changed.json`、`auth/password-error.json`。
- **G12 403 落点**：确认 `/403`；BFF 收到 `FORBIDDEN`/`NOT_A_MEMBER` 跳 `/403?from=<path>`，页面显当前空间与切换入口；`/admin` 非 admin 仍就地锁页不跳转。
- **G13 watchlist**：v1.7.4 已定 `items[].type`；fixture 已在 main 更新（含 `{type:"task"}` 项），fe 合 main 即可。
