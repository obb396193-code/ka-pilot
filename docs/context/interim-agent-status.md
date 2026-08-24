# 临时 Agent 状态

> 日期：2026-08-24  
> 目的：Claude 暂不可用期间，防止 Codex 候选交付被误写成正式终审。

## 状态词典

```text
draft
→ codex_prechecked
→ candidate_integrated
→ awaiting_claude_review
→ claude_approved | redo_required
```

## 当前状态

| 工作项 | 负责人 | 分支/任务 | 当前状态 | 证据 |
|---|---|---|---|---|
| 双数据设计与实施计划 | root Codex | `codex/runtime-executor-docs` | candidate_integrated | 设计 commit `4372596`；计划 commit `cf38766` |
| 双数据后端 Contract/Adapter/对账 | 待创建实现任务 | 待定 | draft | 尚未实现 |
| 临时只读审查 | 待创建 Codex 任务 | 待定 | draft | 尚未创建 |
| 前端纵向切片 | 待创建 Codex 任务 | `codex/fe-vertical-slice`（计划） | draft | 尚未创建；`fe/f001` 禁止触碰 |
| Claude 终审 | Claude/arch | 原 Claude 主会话或新恢复会话 | awaiting_claude_review | 当前账号未恢复 |

## 铁律

- `codex_prechecked` 不是 `claude_approved`。
- 任务口头说完成不算；必须检查文件、commit、测试、构建和截图。
- 前端候选允许 Claude 恢复后重做。
- 当前 `fe/f001` 脏工作树属于已有前端工作，不得被临时 Agent 清理、提交或覆盖。
