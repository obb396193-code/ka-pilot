# review-codex（临时只读审查任务）信箱

### RC-001 双数据与现有后端全量预审

- 派活方：root Codex
- 日期：2026-08-24
- 背景：Claude/arch 暂不可用，老板批准用 Codex 先做预审；Claude 后续复审不阻塞当前内网部署。
- 前置阅读：`AGENTS.md` → `docs/context/claude-main-session-index.md` → `docs/14-老板需求追踪总表.md` → `docs/20-PRD-v1.md` 附录 A/B → 双数据 design/implementation。
- 要求：只读审查现有后端分支与未来双数据实现，覆盖口径、来源、截断、SQL/凭证出口、租户隔离、对象映射、可靠执行、确认门、错误降级和测试缺口；输出 P0/P1/P2、文件行号、复现步骤和建议，并分清“阻断内网部署 / 可上线后修 / 等 Claude 裁决”。
- 边界：不改共享文件、不提交代码、不宣称 Claude/arch 已批准；只向根任务回传文本，根任务逐项核验后写审查文件。
- Codex 任务：`01a032d0-0c9b-7820-a679-316d172df643`
- Worktree：`/Users/aik/.codex/worktrees/e59d/投放agent`
- 状态：进行中

### RC-002 Task5 双空间 Session 业务只读授权复审

- 派活方：后端 Codex，交 root/Claude 审查位复核
- 日期：2026-09-04
- 基线：`codex/integration-control@1d2c926`
- 分支：`codex/personal-team-task5-business-reads-v2`
- 计划提交：`d8781dd`
- 代码候选：`b98fa4f`
- 证据：`docs/evidence/Task5-双空间业务读授权质量报告.md`
- 请重点审查：
  1. 旧 `x-ka-*` 是否彻底失去生产授权作用，Session cookie 是否是唯一业务上下文来源；
  2. personal tuple grant 与 team workspace readonly 是否在 Service、SQL、输出守卫三层一致；
  3. team 是否完全排除个人双-null工作项与 Changeset，且未误开媒体写；
  4. Platform team 查询是否始终受 workspace 约束，KA Data team 是否 fail closed；
  5. 真实 PG+HTTP E2E、requestId、exact-16MB 与前端 0 diff 证据是否可复验。
- 已知未完成：前端 BFF Session 转发、Task6 team ingestion、真实奇航/KA Data、内网部署。
- 非阻断 P2：`createSessionForIdentity()` active personal membership 查询后续改稳定 `LIMIT 2`。
- 状态：`review_requested`；不得据此宣称已合流、已部署或 Claude 已批准。
