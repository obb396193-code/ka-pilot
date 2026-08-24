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
