# 临时 Agent 状态

> 日期：2026-08-24  
> 目的：Claude 暂不可用期间，既不停在候选版，也不把 Codex 预审冒充 Claude 终审。

## 状态词典（双轴）

```text
交付：draft → implemented → integrated → deployed_internal → runtime_verified
审查：codex_prechecked → claude_review_pending → claude_approved | changes_required
```

## 当前状态

| 工作项 | 负责人 | 分支/任务 | 当前状态 | 证据 |
|---|---|---|---|---|
| 双数据设计与实施计划 | root Codex | `codex/runtime-executor-docs` | 交付：implemented；审查：claude_review_pending | 设计 commit `4372596`；计划 commit `cf38766`；本轮状态门待新 commit 更新 |
| 双数据后端 Contract/Adapter/对账 | 待创建实现任务 | 待定 | draft | 尚未实现 |
| 临时只读审查 | Codex 任务 `01a032d0-0c9b-7820-a679-316d172df643` | Codex worktree `/Users/aik/.codex/worktrees/e59d/投放agent` | draft（运行中） | 2026-08-24 已创建；等待只读预审回传 |
| 前端纵向切片 | Codex 任务 `01a032d0-0c9b-7820-a679-3157f0384531` | Codex worktree `/Users/aik/.codex/worktrees/d61b/投放agent` | draft（运行中） | 2026-08-24 已创建；`fe/f001` 禁止触碰 |
| 内网部署与联调 | root Codex + 内网 OS | 待实现版本 | 交付：draft | 目标为 daily/FaaS 部署、真实通路联调和使用验收 |
| Claude 后续复审 | Claude/arch | 原 Claude 主会话或新恢复会话 | 审查：claude_review_pending | 当前账号未恢复；不阻塞内网交付 |

## 铁律

- `codex_prechecked` 不是 `claude_approved`，但 `claude_review_pending` 不阻塞受控内网部署。
- 任务口头说完成不算；必须检查文件、commit、测试、构建和截图。
- 前端实现要先做到可部署可使用，也允许 Claude 恢复后重做。
- 当前 `fe/f001` 脏工作树属于已有前端工作，不得被临时 Agent 清理、提交或覆盖。
