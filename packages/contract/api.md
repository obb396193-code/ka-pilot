# 数据服务 API 合同 v1.0（B1c 实现；fe mock 依此造）

> 通用：全部 `GET/POST /api/v1/...`；响应包 `{ok:boolean, data, meta:{data_as_of, coverage, sources}, error?}`；
> meta.data_as_of=数据截至时间（数据健康横幅数据源）；分页 `page/page_size/total`。
> **P-001#6 裁决（比率/无穷表示统一）**：所有比率/CPA 字段返回 `{value: number|null, state: "finite"|"infinite"|"undefined"}`；
> `state=infinite` 表示分母0且分子>0（UI 显 `∞`）；`state=undefined` 表示无意义（UI 显 `—`）；绝不用 `null`/`Infinity`/字符串。

## 受控双数据查询（BE-001）

`POST /api/v1/data/query`

浏览器不得直接调用本端点。浏览器只调用 Next BFF 的
`POST /api/internal/data-query`；BFF 使用服务端 `DATA_API_INTERNAL_TOKEN` 调用本端点，
并通过受信服务端 header 注入 workspace/user/account scope。内部 token 与账户 scope
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
- BFF 必须发送 `Authorization: Bearer <DATA_API_INTERNAL_TOKEN>`、
  `x-ka-workspace-id`、`x-ka-user-id` 与 base64url JSON 的 `x-ka-account-scope`。
- BFF 必须同时发送 `x-request-id`。后端仅接受 1–128 位的
  `[A-Za-z0-9][A-Za-z0-9._:-]*`；缺失、超长或含换行/控制字符时安全重新生成，
  绝不回显非法输入。所有 HTTP 响应通过 `x-request-id` 响应头返回最终相关 ID；
  错误 envelope 中的 `error.requestId` 必须与该响应头完全一致。
- `x-ka-account-scope` 只能由 BFF 的服务端登录态、已批准授权上下文生成；
  禁止接受页面、query/body、localStorage 或用户自报的 scope。
- 本机开发 scope 只允许使用明确的假 workspace/user/account fixture。
  production 不得使用默认账户、通配符、空 scope 绕过或 dev fallback；缺失、非法或
  无法从服务端会话证明的 scope 必须 fail closed（`401/403`）。
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

## 变更集与执行

- `POST /api/v1/changesets` `{work_item_id?, items:[{target_type,target_id,field,to_value}], reason_code}` → 服务端补 from_value/TTL/What-if
- `POST /api/v1/changesets/:id/dry-run` → item 级预检
- `POST /api/v1/changesets/:id/confirm` → 复核 from 值（变了 409）→ 入 jobs 队列
- `POST /api/v1/changesets/:id/rollback` → 反向变更集草稿
- `GET /api/v1/changesets/:id` 状态机全量

## 账户与结构

- `GET /api/v1/accounts?stage=&starred=&tags=&owner=` 池
- `GET /api/v1/accounts/:id` 详情（小传+余额+倒计时）
- `GET /api/v1/accounts/:id/structure` campaign→unit→creative 树
- `GET /api/v1/accounts/:id/timeline` 操作史（含 external 带外变更）
- `POST /api/v1/accounts/:id/star|tags|transfer`

## 任务

- `GET /api/v1/tasks` / `GET /api/v1/tasks/:id`（含 pacing 计算结果）
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
