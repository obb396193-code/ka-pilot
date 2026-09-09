# R013b Worker HTTP 单轮触发 Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.
> 本机无 executing-plans，按已批准信箱由本会话执行，不派子角色、不等新选项。

**Goal:** 实现 v1.7.7 `POST /internal/worker/once`，以服务端配置触发现有受限 ETL 单轮，正确返回 completed/budget/blocked_auth 与真实任务计数。

**Architecture:** 父进程拥有硬截止，子进程只运行既有六类只读 ETL job。HTTP 仅凭服务端专用 token，拒绝参数覆盖；进程内单飞并加 PG advisory lock，跨实例同 workspace 不并发触发。仅在子进程实际 close 后释放锁与回复；连接失效取消子进程，旧 job 依赖既有 lease/fencing 恢复。

**Tech Stack:** Node HTTP/child_process/crypto、Zod、现有 PG pool、Vitest、真实隔离 PostgreSQL。

---

## 基线与边界

- `main@58ddd4f` 已快进；P111 被 P113 验收合流，冻结解除。本轮不改 Contract/React/样式。
- 图片两任务按老板裁决关闭，output 原件保留，不再产图。
- 接口成功形状按 api.md；requestId 走 header，错误沿稳定 `{ok:false,error:{code,message,retryable,requestId}}`。
- jobs 计数为本轮 consumer 的 leased/done/终态 failed 事件次数，重试重领是新一次 lease；tick 回放的旧 done 不计数，blocked_auth 不假装一般 failed，budget 不假装剩余 job 全失败。
- HTTP trigger 不接受 workspace/media/credential/body 指令。部署配置依旧 active personal + 显式 grants；不借 OS 服务身份突破原授权。Team ingestion 仍属 R011。
- 当前拓扑 A 为单个 sandbox；PG advisory lock 额外保护同库同 workspace 的第二 HTTP 实例，不代替 job fencing。锁等待与连接限时，不新增队列。
- f.yml 的 OS §4 是结构说明，非完整经执行 YAML；本批先交付实际 HTTP 启动与联测，不编造 FaaS 发布结果。PG 启动脚本/OSS 备份由已派 OS 门禁管理，未拿真实文件前不执行猜测命令。

## Task 1：有类型的 IPC 与终态

Files: `apps/worker/src/scheduling/worker-once-protocol.ts`（新）、`worker-once-supervisor.ts`、`worker-once-child.ts`、`worker-once-cli.ts`；测试 `test/worker-once-supervisor.test.ts`、`test/fixtures/worker-once-process.mjs`、`test/fixtures/worker-once-lease.ts`、`test/worker-once-pg.integration.test.ts`。

1. RED：正常退出必须先发 terminal，blocked_auth 独立返回，tick 旧终态不影响 jobs，坏/重复/终态后 IPC 拒绝，budget 等 close。
2. `npm --prefix apps/worker test -- --run test/worker-once-supervisor.test.ts`，先记录失败。
3. protocol strict union 区分 tick/consumer 事件与 terminal；父进程计数，子进程 flush terminal 后断 IPC；父连接意外失效则 child 退出，杜绝孤儿继续消费。
4. CLI 保留 blocked_auth 非零退出和最小事件日志；实测原 CLI PG 反例与真实进程截止回归。
5. 独立路径限定代码提交，不先交审；HTTP 完成后一起交审冻结。

## Task 2：HTTP/锁/启动接线

Files: 新 `apps/worker/src/scheduling/worker-once-http.ts`、`worker-once-http-cli.ts`、`worker-once-lock.ts`；`apps/worker/package.json`、`.env.example`；测试 `test/worker-once-http.test.ts`、`test/worker-once-http-pg.integration.test.ts`。

1. RED：token 缺/错/重复 401；只许 POST 空体或 {}，未知字段/查询参数拒绝，405 不触发；并发 409；requestId 合法透传非法重建；不泄露私有错误；exact body 上限拒绝。
2. 实现 Node createServer + bounded body + 常量时间 token 比较；独立 `start:worker-http`，无 KA 配置也可健康启动、不自动入队。
3. PG try advisory lock 持续至 child close，finally 解锁；不同 workspace 独立，同 workspace 两实例只有一个有效轮次。
4. 真实 PG：HTTP 实际 child 缺 grant blocked_auth（无上游请求）、异 workspace job 保持 queued；两连接锁反例；真实进程启动 health/token/退出。
5. 补本人的 runbook 操作节，明确外部 scheduler HTTP 超时需覆盖最大轮次、重试先遇 busy，不能把触发成功当 ETL 全部成功。

## Task 4：P116 审后守卫与部署说明（2026-09-07）

- 依据：arch P116 已通过；F-P116-1 要求所有角色测试库共用 `ka_[a-z0-9_]*_test`，共享库 `ka` 必须拒绝。
- 实读发现 benchmark 守卫仍放行 `/ka` 且 CLI 缺环境变量会默认它；不能直接复用这个例外。先新增角色库正例、共享库/未配置负例，确认 RED；再收紧 benchmark 并供 Worker HTTP PG 用例复用，移除共享库默认值。
- 仅修改 Worker benchmark/两份测试，以及本计划、自己的 runbook §2.7/状态/交接。无公开契约、前端、媒体写变化。
- 实测只连接既有 `ka_be_r010_20260907_test`；arch/be2 名称只验证解析，不访问对方数据库。跑定向真实 PG、Worker typecheck/lint；全量前确认磁盘至少 8 GiB。
- runbook 记录沙箱后台 HTTP 循环（完成一轮再 sleep 600），不是 autopilot 直接 HTTP，也不是固定十分钟完成承诺；本轮不启动循环、不部署。

## Task 3：门禁 / 交审

- 固定 `ka_be_r010_20260907_test`，Domain→DB→Worker→Gateway 串行全量，四包 typecheck/lint；Web 非视觉 tests，既有依赖缺口如实报告。
- 新核心模块覆盖率 >80%；依赖 production audit（离线缓存与 fresh 分开）；git diff --check、安全/权限/性能自审。
- 代码 SHA 与质量报告 / P114（编号以 live 信箱为准）/ R010 状态留痕。交审后停止提交，等待 arch ✅/❌；不 push、不部署、不用真实凭证/媒体写。
