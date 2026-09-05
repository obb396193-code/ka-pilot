# R009 连续收口 Implementation Plan

> **For Codex:** 按已冻结任务逐项 TDD；当前没有可用的 superpowers:executing-plans 技能，按本计划直接执行，不新开会话或外部工程。

**Goal:** 继续 Claude 已派 R-009 的剩余后端修复，每个子批独立代码 SHA、真实 PG 与审查回执。

**Architecture:** 复用现有 Repository/Worker/HTTP，不增产品范围、不改 Contract。先完成小而独立的业务不变量，再处理工作流/消息可靠性，最后升级指标 DTO 和按空间固定来源。

**Tech Stack:** TypeScript、Zod、PostgreSQL 16、node-pg-migrate、Vitest、Next BFF。

## 基线与约束

- `be/r009@48c79a7` 已同步 arch main@8b155a1；保留 P-039 全部代码与双方追加文档。
- 用户已要求直接连续实施，不再询问执行模式。仅本地工作树，不 push、不接真实凭证、不开放媒体写。
- 真实 PG 使用 `TEST_DATABASE_URL=postgres://ka:ka@127.0.0.1:55432/ka_r009_test`；旧 benchmark 的独立 synthetic workspace 例外按既有白名单运行。

## Task A — P0-05 唯一任务归属

**Files:** `packages/db/src/task-repository.ts`、`packages/db/src/metrics-repository.ts`、`packages/db/test/task-repository.test.ts`、`packages/db/test/metrics-repository.test.ts`；按需新增 DB unit 反例文件。`semantic-query-dimension.ts` 实读已拒重叠、不分摊，保留证据，不重写。

1. 红灯：同账户不同任务重叠返回 `TaskAccountOverlapError`，含 `code='TASK_ACCOUNT_OVERLAP'`、`statusCode=409`；并发只有一个成功；同号跨媒体/跨 workspace 不互锁业务身份。
2. 跑 `npm --prefix packages/db test -- --run test/task-repository.test.ts`，确认失败位置。
3. 实现：advisory key 改为 `(media,accountId)`，不含 task；重叠预检跨任务；只捕获 `23P01` + `task_accounts_account_validity_excl` 映射 typed 409，其余数据库异常保留。错误消息不含 DB detail/SQL。
4. 考核价 SQL：唯一 relation 直接 LEFT JOIN；版本在该 task 内 `ORDER BY effective_date DESC,id DESC LIMIT 1`，保留“最新生效版本”排序，删除“先在多个任务任取一个”逻辑。新增到期换任务/同日版本/未来版本/无价任务不借前任价反例。
5. 定向 → DB 全量/PG/typecheck/lint → Worker 旧路由回归。只提交上述代码和测试；不因 409 增加未派开的 HTTP 写路由，R-010 接公开任务动作时复用 typed error。

## Task B — P0-13 双主体与 items 三键

1. 先读 `packages/db/src/changeset-repository.ts`、`apps/worker/src/changesets/` 和现有测试，对照 schema.sql P0-13；列出 create/confirm/start/execute 的事务边界。
2. 红灯：跨 workspace、inactive initiator/credential owner、父子 item tuple 不一致；执行前撤销 actor 必须在媒体调用之前拒绝。
3. 最小实现：事务内锁定并检查同 workspace active users；items 三键必须从已验证父 scope 派生/匹配，拒绝跨 workspace/media/account 混入；未授权真实写保持关闭。
4. 真 PG + Worker mock media 未调用反例 → 全量门禁 → 独立 SHA 与 P 回执。

## 后续有序子批（本计划不擅自冻结新 DTO）

> 续工核对：main@677e4b2 的新指令在 A/B 已收口时到达。A=`010e4bb`、B=`5228b44`；接下来按 arch 顺序 Workflow→inbox→MetricValue/v2→空间绑源。追加迁移批末折回 011，不接受同号两文件；未改写已完成 SHA。main@7b418cb 的窗口化成本口径未冻，不得自行修改公式。

- P0-07：按现有 workflow repository/run-handler 补 executor fencing 与 effects，先写两 Worker 竞争、崩溃重放反例。
- P0-12：按现有 gateway repository/adapter/message-handler 补 durable inbox，先落库后 ACK、claim retry/dead 反例。
- P0-04 + 来源：按 api.md/metrics.md 冻结 MetricValue/row v2 和普通请求只 `{queryId,params}`；personal→platform、team→ka_data；reconcile 独立受控路由。两 Adapter/BFF 同步 fixtures，禁止公开另一套 DTO。
- 最终：四包全量 test/typecheck/lint、真 PG+HTTP 双空间回归、代码质量/依赖审计，写未完成外部联调；R-009 完成后才进入 R-013。

## 用户验收句

同一个账户在同一天不能误绑两个任务；考核价不会从错误任务借用；撤销操作人或凭证所有人的权限后，变更集不能继续借旧身份执行。此批尚不代表页面/内网正式可用。
