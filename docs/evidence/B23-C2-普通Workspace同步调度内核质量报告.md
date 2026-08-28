# B23-C2 普通 Workspace 同步调度内核质量报告

> 日期：2026-08-26
> 分支：`codex/b23-c2-workspace-scheduler`
> 基线：`codex/integration-control@1950808`
> 状态：`implemented + local_pg_verified + codex_self_checked`；未部署、未真实奇航联调

## 交付范围

- strict Domain Contract：one-shot tick、上海 03:00 业务日、不可变授权快照、blocked reason。
- migration 009：workspace 显式 active 状态；支持 up/down/up。
- DB snapshot：从 active workspace-local user、membership、identity、grant 解析候选；Job 不保存或输出
  `qihang_user_id`。
- 幂等调度：同 workspace/user/media/businessDate/jobType 使用确定性 Job ID，并发冲突只保留一条；
  不合法候选留下 terminal `blocked_auth` 审计 Job。
- 执行前复核：每次重试按 Job 固化的 credential owner 与授权快照重新核验，不 fallback 到 owner、
  service identity 或其他人的凭证。
- 内部 CLI：一次 tick 后退出；只接 workspace/media/mode，不接 user/qihang/secret，不内置 cron。
- 普通业务 ready 门：当前用户授权媒体尚无成功 full 时，任务列表固定 `partial`，并抽成共享 DB 查询。

## 独立提交

| SHA | 内容 |
|---|---|
| `23ec0ee` | 实施计划与边界 |
| `252425a` | Domain 调度 Contract |
| `e7c407f` | migration 009 与候选授权快照 |
| `d225ba4` | 幂等入队、执行前身份复核、tick service |
| `6302cc4` | 内部 one-shot CLI |
| `10b9e8b` | TASK-LIST 首次 full ready 门 |
| `eb3d4df` | migration/共享库测试收口 |
| `0ec9c99` | 抽取可复用 workspace sync readiness |
| `02783a9` | readiness 非法 actor、空响应、非法/重复 tuple 失败路径测试 |
| `d1a184d` | P1：空 grant 阻断、执行前空快照阻断、Full 越界账户落库阻断 |

## 验证结果

| 包 | tests | typecheck | lint | audit | coverage（S/B/F/L） |
|---|---:|---|---|---|---|
| Domain | 38 files / 455 passed | 通过 | 通过 | 0 vulnerabilities | 96.53 / 87.41 / 99.58 / 96.53 |
| DB | 25 files / 139 passed（其中 Repository/migration 为真实 PostgreSQL） | 通过 | 通过 | 0 vulnerabilities | 93.58 / 78.65 / 97.11 / 93.58 |
| Worker | 68 files / 510 passed，2 个既有外部凭证 opt-in skipped | 通过 | 通过 | 0 vulnerabilities | 92.49 / 82.35 / 96.36 / 92.49 |

真实 PG 覆盖：migration up/down/up、inactive workspace/user/identity/membership、无奇航身份、
跨 workspace、同号跨 media、空 grant、重复与并发 tick、首次 full 前 ready 门、重试 credential
owner 不漂移。测试使用本机临时数据库；不包含真实奇航网络调用。

P1 审查修复新增真实 PG 空 grant 反例，并补 Full/Auto/Incr Service 三态、执行前空授权快照、
上游忽略 `accountIds` 返回越界账户时 0 metadata/Raw 持久化和 0 downstream enqueue。普通
workspace 的 full/incr 不再存在“发现模式”；legacy 非调度 ETL 的既有行为未在本批扩大。

覆盖率首次并行执行时，Worker 的 PG 用例与 DB coverage 同时争抢 migration lock，出现一次
`Another migration is already running`；没有修改代码或断言，待 DB 任务结束后以同一命令串行
复跑，Worker 恢复全绿；P1 修复后最终为 68 files / 510 passed、2 opt-in skipped，覆盖率与上表一致。

## 安全与边界检查

- 相对 `1950808` 没有修改 `apps/web` 或 `apps/ui-layout-demo`。
- 没有新增浏览器/公开写 API；内部 CLI 只写产品自身 Job 队列，不执行媒体写。
- Job payload、CLI 输出、错误和日志不包含 qihang user ID、Secret、token 或凭证正文。
- cadence 仍由部署配置/外部 scheduler 决定；代码只执行一个确定性 tick。
- 复用现有 Job lease/fencing/retry，没有另造第二套队列。

## 未完成项

1. 未配置或验证内网 external scheduler，也未完成真实 workspace 首次 full。
2. 未做真实奇航凭证、网络、数据规模和业务日连续运行联调。
3. 未接浏览器 BFF、正式登录页面或部署健康监控。
4. ACCOUNTS-LIST-001 / WORK-ITEM-LIST-001 仍缺 root 冻结严格 DTO；仅完成只读 Gap Matrix。
5. 所有 Multica/OS/ChangeSet/媒体写执行继续关闭；Claude/arch 后审位保留。
