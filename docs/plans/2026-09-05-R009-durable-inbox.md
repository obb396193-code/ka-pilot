# R009 P0-12 Durable Inbox Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 钉钉接收先持久化再 ACK，后台 lease 领取、恢复、有限重试与 dead，不开放真实写。

**Architecture:** 沿用 011 inbound_events，不新增 Contract 列。attempts 在领取时递增，作为 fencing generation；processed=false + attempts>=max_attempts + lease 到期表示 dead。接收仅保存 AES-256-GCM 加密消息（含临时回复 webhook），处理器与 Stream ACK 分离；后台只执行当前允许的只读命令，未接通的写和 Agent 执行关闭。

**Tech Stack:** TypeScript、PostgreSQL、Vitest、dingtalk-stream、Node crypto。

执行说明：当前无 executing-plans 技能；按老板继续指令在已有 be/r009 隔离工作树逐项执行，不调用外部 Coze、不上传源码。

## Task 1 — Repository，先红后绿

- 修改 `packages/db/src/gateway-repository.ts`，新增 `inbound-event-repository.ts`。
- 测试 `packages/db/test/inbound-event-repository.test.ts`：重复接收、跨 workspace/provider 全局事件键冲突拒绝、并发领取只有一个、租约过期旧 attempt 不可更新、处理失败重试、最后一次进 dead、崩溃耗尽次数、完成不重领。
- `TEST_DATABASE_URL=... npm test -- --run test/inbound-event-repository.test.ts` 先验证缺实现失败；实现后真实 PG 通过。
- SQL 全参数化；错误只保存固定 code，禁止 raw exception/URL/token。处理 checkpoint 写 payload 内命名空间并受同一 lease 守卫。

## Task 2 — Receive/ACK 与恢复处理

- 修改 `apps/dingtalk-gateway/src/{types,message-handler,dingtalk-adapter,index,config}.ts`；新增 `inbox-codec.ts`、`inbox-worker.ts`。
- 新增 receiver/worker 单测：INSERT 未结束不得 ACK、DB 失败不得 ACK、INSERT 成功 ACK 失败后重投去重；重建 worker 可消费已落库消息；失败保留且有限重试；结果 checkpoint 后回复失败不再次执行业务查询。
- 加密 key 仅部署环境注入，nonce 随机，AAD 固定 workspace/provider/event；不持久化明文 webhook，不输出原始错误。未知旧 payload 有限失败至 dead，不伪造恢复成功。
- 生命周期：单实例顺序 tick，多实例通过 SKIP LOCKED 互斥；shutdown 停止领取并等待当前处理；lease 到期不继续发后续操作，外部发送不能保证 exactly-once。

## Task 3 — Quality 与回执

- 定向与全量 DB/Domain/Worker/Gateway/Web test、typecheck、lint（DB 与 Worker PG 串行）。
- code-quality-checker：核心 coverage >80%、SQL/凭证日志/重复操作/进程退出/依赖 audit 检查。
- 代码独立 `[be]` SHA，计划/状态/工作台账/inbox-arch P043 单独 SHA，不 push。
- 无真实钉钉/内网认证，本批不是 deployed；剩余网关 API 身份桥接与真实联调明确交还 arch，不宣称现有旧客户端已可正式查数。

## 执行回执

- 代码 `c6603d3`，P043 已写 inbox-arch；本计划三个任务已自测完成，等待arch独立审查，不等于R009全批结束。
- DB有效红灯→实现→最终205全量；网关首次因缺依赖不能跑不算业务红灯，安装后测试通过但首次PG测试typecheck暴露pg声明缺失，复用createPool修正后36全量与type/lint通过。
- Domain497、Worker641+2外部跳过、Web78、五包type/lint全通过；四后端包audit0。核心Repository行100%、网关核心98.98%；原始摘要、边界、剩余项见R009-状态P043。
- 新增Secret配置及迁移先于网关启动、死信派生规则、key轮换和非exactly-once限制写入唯一runbook§6。
