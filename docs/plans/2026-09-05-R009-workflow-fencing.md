# R009 Workflow Fencing Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. 当前该技能不可用，按用户已授权的本会话 TDD 执行，不另开工程。

**Goal:** 两个 Worker 不能同时推进一个 run；写节点发生中断后不盲重放。

**Architecture:** 复用 011 executor_token/lease 与 workflow_effects。每次 advance/confirm/control 领取新 token；所有 event/status/effect 状态写入先在短事务内锁 run 校验 token+数据库时钟租约。外部调用不放进数据库长事务。副作用先记 pending，再调用并存结果；冲突 done 读回，pending/unknown 保守转未知，不重发。

**Tech Stack:** TypeScript / PostgreSQL / Vitest，既有 Capability Registry 与 workflow replay。

## 子步骤

1. 新增 `packages/db/test/workflow-execution-repository.test.ts` 红灯：并发领取唯一、过期接管换 token、旧 token event/status/effect/renew 拒绝、跨 workspace、effect 唯一与 pending/done 回读。
2. 新增 `packages/db/src/workflow-execution-repository.ts`（租约与 effect），修改 `workflow-repository.ts` append/CAS 必传 token；旧测试补显式 claim，不保留生产无 token 兜底。
3. 修改 Worker `workflows/types.ts`、`run-handler.ts`：命令局部 lease 不共享实例状态；每轮续租、外调前按 timeout 覆盖租约；confirm/control 同门；写阶段 preview/execute effect 插入先于副作用。完成落库后事件缺失可重放结果，pending 不再调用。
4. 新增 `workflows/postgres-run-store.ts` 真实 DB→已发布固定版本编译适配；不开放任何 HTTP 写或媒体 adapter。新增 `test/workflows/run-handler-pg.integration.test.ts` 两 Runner 竞争、跨 workspace、租约接管与失效 Worker、crash pending / done 后缺事件。
5. 定向 TDD→Domain/DB/Worker/Web 全量 test/typecheck/lint→核心覆盖率/后端 audit。DB 和 Worker PG 串行使用 ka_r009_test；所有业务响应为合成数据，媒体仅 spy。
6. 独立 `[be]` 代码 SHA 和 P-042 信箱/台账；main@d3466c7 最新派活已只读核对，窗口化口径/settings 属后批不做。批末再 merge main 并折011。

## 风险与边界

- UNIQUE pending 只证明“可能发出”，不能当 done，也不能偷换新 attempt 重放；需要后续 reconciliation 接线，不声明 exactly-once 远程执行。
- 网络中断/超时返回 unknown；旧 executor 不能提交新结果；新 executor 不重发 pending effect。
- 所有流程 mutation 必须 token（含暂停/确认），持有有效租约时另一个命令报 busy，不偷偷抢占。
- 用户验收句：重复点击或两台 Worker 同时接到同一流程，不会重复建变更集或重复发出投放动作；结果不确定时明确停在未知态。
