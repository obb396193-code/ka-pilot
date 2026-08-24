# 项目控制与临时 Agent 状态

> 日期：2026-08-24  
> 目的：由 root Codex 接管项目控制、Contract、进度、验收和部署门；Claude 保留后续复审席位，但不阻塞实现、联调或内网部署。

## 状态词典（双轴）

```text
交付：draft → implemented → integrated → deployed_internal → runtime_verified
审查：codex_prechecked → claude_review_pending → claude_approved | changes_required
```

## 当前状态

| 工作项 | 负责人 | 分支/任务 | 当前状态 | 证据 |
|---|---|---|---|---|
| 项目控制与首轮集成计划 | root Codex | `codex/integration-control` | 交付：implemented；审查：codex_prechecked | 基线 `7a69a13`；首轮只读集成计划与前后端信箱已建立 |
| 双数据后端 Contract/Adapter/对账 | be-codex | 待从 `codex/b22-idealab-asr-provider@a5de536` 建 `codex/dual-data-backend` | draft（已派活） | `docs/relay/inbox-be-codex.md` BE-001/BE-002 |
| 临时只读审查 | root Codex 已接管结论 | `codex/integration-control` | 审查：codex_prechecked | 2026-08-24 已在老板对话交付 A/B/C 与 P0/P1/P2 审查结论 |
| 前端纵向切片 | fe-codex | `codex/fe-vertical-slice@235d31e` | implemented candidate；changes_required | FC-002 已下发：双 lineage、指标状态、凭证出口、mock mode、筛选保留六项修改；`fe/f001` 禁止触碰 |
| 内网部署与联调 | root Codex + 内网 OS | 待实现版本 | 交付：draft | 目标为 daily/FaaS 部署、真实通路联调和使用验收 |
| Claude 后续复审 | Claude/arch | 原 Claude 主会话或新恢复会话 | 审查：claude_review_pending | 后续复审；不阻塞当前实现和内网交付 |

## 铁律

- root Codex 当前负责 Contract 冻结和交付门；`codex_prechecked` 不冒充 `claude_approved`，但 `claude_review_pending` 不阻塞受控内网部署。
- 任务口头说完成不算；必须检查文件、commit、测试、构建和截图。
- 后端先冻结可执行 Contract，前端按同一 Contract 收口；两边分别验收通过后才进入集成。
- 首次部署只读；reconcile 未通过映射验收前关闭，所有真实写入口在 Runtime/确认门验收前关闭。
- 前端实现要先做到可部署可使用，也允许 Claude 后续复审或重做视觉。
- 当前 `fe/f001` 脏工作树属于已有前端工作，不得被临时 Agent 清理、提交或覆盖。
