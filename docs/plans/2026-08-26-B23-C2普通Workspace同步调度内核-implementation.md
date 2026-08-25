# B23-C2 普通 Workspace 同步调度内核实施计划

> 日期：2026-08-26  
> 基线：`codex/integration-control@1950808`  
> 分支：`codex/b23-c2-workspace-scheduler`  
> 状态：实施中；不代表已部署或真实奇航联调

## 目标

在不增加浏览器或公开写 API 的前提下，为指定 active workspace 提供一次性、可测试的
内部 tick（调度触发）入口：首次同步选择 `etl_full`，首次 full 成功后允许按部署配置选择
`etl_full` 或 `etl_incr`。每个 Job 固化 workspace、业务用户、凭证 owner、上海 03:00
业务日和账户授权快照；缺少合法身份、奇航取数身份或账户授权时 fail closed。

## 已确认复用点

- `jobs` 表、`JobRepository` 与 `JobConsumer` 已提供确定性 UUID、`FOR UPDATE SKIP LOCKED`、
  lease token fencing、heartbeat、有限重试和 `blocked_auth`。
- `etl_full`、`etl_incr`、Canonical fan-out 与奇航身份注入已经接入真实 Worker runtime。
- B23-A 已有 identity / membership / workspace-local user / account grant 四段身份链；C1 已保证
  full 账户页先安全 upsert `accounts` 再落 Raw。
- `shanghaiTaskBusinessDate()` 已冻结上海 03:00 日切，可直接复用，不再造第二套算法。

## 设计边界

- tick 只接收部署侧 workspace、media、mode 和当前时刻；不接收浏览器 session、userId、
  qihangUserId、账户 scope 或 Secret。
- 一个 tick 从数据库枚举 workspace-local users，并核对 active membership、active identity、
  active user。可执行 Job 的 initiator 与 credential owner 固定为同一 workspace-local user。
- `qihang_user_id` 只在 Worker 执行前由 DB 解析并注入内存，不写 Job payload、不输出 CLI、
  不写日志。重试继续使用原 Job 的 credential owner 和授权快照。
- 首次 full 可以借上游奇航 userId 自身权限发现账户；后续 incr 必须使用冻结的显式
  `(media, account_id)` grant，不允许空 scope 退化成全量查询。
- 同 `(workspace,user,media,businessDate,jobType)` 生成确定性 Job ID；并发 tick 只保留一条。
- cadence（频率）由外部 scheduler/config 决定；CLI 每次只执行一个确定性 tick 后退出。
- 真实媒体写、Multica/OS/ChangeSet 执行仍关闭；不修改 `apps/web`、`apps/ui-layout-demo`。

## TDD 子批

### C2-1：领域 Contract 与业务日

- 新增 strict tick request、授权快照、调度结果与 blocked reason Schema。
- 覆盖 02:59/03:00、非法输入、重复账户 tuple、结果不泄露 qihang identity。

### C2-2：数据库调度与 active workspace

- 新 migration 为 workspace 增加显式 active 状态，并同步 Contract schema。
- 新 Repository 在一个事务快照中解析 user/membership/identity/grants、判断首次 full 状态并
  幂等插入 queued 或 blocked_auth Job。
- 真实 PG 覆盖 up/down/up、inactive identity/member/user、无 membership、无 qihang identity、
  跨 workspace、空 grant、重复/并发 tick、同号跨媒体和授权快照不可变。

### C2-3：Worker 身份复核与 runtime/CLI

- C2 Job 在每次执行前按冻结 identity + credential owner 重新核 active 身份链；不允许
  service identity fallback。
- 提供内部 one-shot CLI；支持 `auto/full/incr`，不内置 cron/cadence。
- 覆盖失败重试仍绑定原 owner、CLI 输出脱敏、无首次 full 时 incr fail closed。

### C2-4：普通业务 ready 门

- 任务列表同一只读快照读取当前用户首次 full 成功状态；未成功时强制 `partial` 且
  `coverage.complete=false`，禁止已有任务数据误报 ready。
- 把 readiness 设计成后续 accounts/work-items 列表可复用的 DB 查询，不发明其公开 DTO。

### C2-5：质量、留痕与后续 Gap Matrix

- Domain/DB/Worker 全量 test、typecheck、lint、audit、coverage 与真实 PG 通过。
- 做凭证、任意执行、前端越界 diff 扫描；每个子批独立路径限定 commit，不 push。
- 只读审计 ACCOUNTS-LIST-001 / WORK-ITEM-LIST-001 的现有 Contract、Repository、runtime/API
  缺口，输出带真实行号矩阵；不自行冻结公开 DTO。

## 完成判定

- `implemented + local_pg_verified + codex_self_checked` 才可描述为本批完成。
- 未部署、未真实奇航调用、未接外部 scheduler 时必须继续明确标注；Claude/arch 后审位保留。
