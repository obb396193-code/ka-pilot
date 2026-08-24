# 数据服务 API 合同 v1.0（B1c 实现；fe mock 依此造）

> 通用：全部 `GET/POST /api/v1/...`；响应包 `{ok:boolean, data, meta:{data_as_of, coverage, sources}, error?}`；
> meta.data_as_of=数据截至时间（数据健康横幅数据源）；分页 `page/page_size/total`。
> **P-001#6 裁决（比率/无穷表示统一）**：所有比率/CPA 字段返回 `{value: number|null, state: "finite"|"infinite"|"undefined"}`；
> `state=infinite` 表示分母0且分子>0（UI 显 `∞`）；`state=undefined` 表示无意义（UI 显 `—`）；绝不用 `null`/`Infinity`/字符串。

## 受控双数据查询（BE-001）

`POST /api/v1/data/query`

该端点的数值字段使用 `MetricValue={value:number|null, availability}`；`denominator_zero`、`missing`、`partial`、`stale`、`error` 均与真实数值 0 分开表达。旧 `/api/v1/query` 的 `RatioValue.state` 约定不跨端点静默复用。

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

单来源响应包含 `mode + source`。每个 source 都必须返回：`status/rows/returnedRowCount/wholeResultTotal/lineage/warnings`。lineage 至少包含：

```jsonc
{
  "source": "ka_data",
  "datasetVersion": "...",
  "queryTemplateVersion": "v1",
  "metricVersion": "...",
  "dataAsOf": "2026-08-24T08:00:00.000Z",
  "timezone": "Asia/Shanghai",
  "dayCut": "calendar_day",
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

`reconcile` 固定并列返回 `kaData` 与 `platform` 两个独立 source object；禁止 `primary`、混合 `value` 或第三个统一主数。BE-001 在对账内核接入前返回 `comparison.status=unavailable` 与 `reconciliation_engine_pending`；双方查询成功但同一范围仅一侧有行时返回 `source_missing`，整源请求失败返回 `source_unavailable`，二者都不是账户 ID 待映射。

### 截断与全量结论

- 任一响应恰好命中 2,000 行、10,000 行或 16MB，均按疑似截断处理；上游 `truncated=true`、`limit_clamped=true`、行数不一致或超过 Registry budget 同样标 `partial/truncated`。
- `partial/truncated/coverage.complete=false` 时，`wholeResultTotal` 不得为 `available`，不得输出全量汇总。
- 账户单侧缺行用 `source_missing`；不得仅按账户名称 join，不得把任务/商品/素材/广告组的 ID 同源性从账户事实外推。

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
