# review-codex（临时只读审查任务）信箱

### RC-001 双数据与现有后端全量预审

- 派活方：root Codex
- 日期：2026-08-24
- 背景：Claude/arch 暂不可用，老板批准用 Codex 先做预审；最终仍由 Claude 终审。
- 前置阅读：`AGENTS.md` → `docs/context/claude-main-session-index.md` → `docs/14-老板需求追踪总表.md` → `docs/20-PRD-v1.md` 附录 A/B → 双数据 design/implementation。
- 要求：只读审查现有后端分支与未来双数据候选，覆盖口径、来源、截断、SQL/凭证出口、租户隔离、对象映射、可靠执行、确认门、错误降级和测试缺口；输出 P0/P1/P2、文件行号、复现步骤和建议。
- 边界：不改共享文件、不提交代码、不宣称 Claude/arch 已批准；只向根任务回传文本，根任务逐项核验后写审查文件。
- 状态：待创建 Codex 任务
