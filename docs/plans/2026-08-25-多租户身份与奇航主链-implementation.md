# 多租户身份与启航主链实施计划（2026-08-25）

> 状态：Contract 已冻结，等待后端按批实现。前端唯一实现线为「梳理前端组件与页面库」；
> 本计划不规定视觉，只规定页面可消费的接口、状态、权限与验收。

## 目标

首次内网联调先打通一条真实主链：内部试用身份登录 → 选择 workspace → 服务端解析
账户授权 → 启航主数据进入既有 Canonical/Semantic Query → 前端可调用。KA Data 仅作备用和
管理员诊断，不再阻断业务功能。

## 冻结边界

1. 一个 `auth_identity` 可加入多个 workspace；现有 `users` 保持 workspace-local actor，
   不做破坏性重构。
2. session 只存 token hash；浏览器只持 HttpOnly cookie，不持 workspace/account scope。
3. 每次请求从 session、membership、grant 解析 `approvedAuthContext`；三键授权固定为
   `(workspace_id, media, account_id)`。
4. 内测 provider 与 BUC provider 共享同一个 session 输出和授权内核；BUC 只替换登录入口。
5. 普通业务主源固定启航；KA Data/reconcile 默认隐藏、关闭或仅管理员可诊断。
6. 本批不开放任何媒体写操作；后续所有写能力仍必须 preview → confirm → execute。

## 交付批次与文件边界

### B23-A：数据库与授权内核

- 新增 migration：`auth_identities/workspace_memberships/account_access_grants/auth_sessions`。
- 兼容现有 users/FK；migration 必须真实 PG up/down/up。
- Repository + service 解析 approved auth context；inactive/expired/revoked 全部 fail closed。
- 真实 PG 反例：同 identity 两 workspace、跨 workspace 同号、跨 media 同号、撤销
  membership、撤销 session、无 grant 空范围。

### F23-B：前端服务层接 session API（唯一前端任务负责）

- 实现 `login/session/workspace/logout` 四个 `/api/internal/auth/*` 接口。
- `internal_test` provider 仅显式开关启用，校验材料只来自 Secret/config；无默认账号。
- cookie、CSRF/Origin、requestId、错误 envelope、日志脱敏和 session TTL 全部覆盖负向测试。
- 替换 `apps/web/lib/data/approved-auth-context.ts` 的 production `return null`，但开发 fixture
  仍只允许 literal development。
- 这一批属于前端仓库的服务端 BFF，不由后端任务修改；root 只验 Contract、scope 和错误态，
  视觉与登录页继续由老板在「梳理前端组件与页面库」任务中决定。

### B23-C：启航主源业务读链

- 普通工作台/账户/任务读接口默认调用现有 Qihang→Canonical→Semantic Query 能力。
- KA Data 只保留管理员诊断 flag；普通请求不能自选 data source。
- 返回 `selectedSource=qihang`、业务日、dataAsOf/coverage；来源缺失和数据未同步用稳定
  状态表达，不静默切换 KA Data、不伪造完整性。
- 跨 workspace/media/account scope 在查询前和响应后双重守卫。

### R23-D：root 交付给前端的联调包

- OpenAPI/Contract fixture：session 四态（loading/authenticated/unauthenticated/forbidden）、
  workspace 切换、空授权、数据未同步、正常 Qihang 数据、稳定错误。
- 每个页面只给 endpoint、request/response、状态、权限、错误码和 fixture；不规定视觉。
- 全量 Domain/DB/Worker/Web tests、typecheck/lint、真实 PG 隔离反例通过后分独立 SHA 回执。

## 首次内网前硬门

- 不带 approved server session 的 production 请求必为 401/403。
- 两个脱敏 workspace 的真实 PG 隔离反例通过。
- 浏览器无法伪造 workspace、role、account scope 或选择共享数据源。
- Git/响应/日志无密码、cookie/token、BUC subject、启航 userId、PAT/AK、真实账户标识。
- 所有媒体写 HTTP 路由继续为 0；KA Data 故障不影响普通业务主链。
