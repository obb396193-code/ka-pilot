# Research / Knowledge 资料研究与知识资产 - 状态跟踪

> 角色：KA 投放经营平台“资料研究与知识资产 Agent”
> 分支：`codex/shared-source-library`
> worktree：`/private/tmp/codex-shared-source-library.j1l066`
> 基线：`ce1af69`（`fe/f001` 已提交 HEAD，不含 Claude 工作区未提交改动）

## 修改边界

- 允许：`.gitignore`、`private/knowledge-sources/`、`docs/knowledge/`、本状态/设计/计划、知识目录校验脚本、`docs/relay/{README.md,inbox-arch.md}`、工作台账留痕。
- 禁止：冻结 PRD、Contract、前端、后端生产代码、Claude 当前脏工作区。
- 私有原文允许保留真实业务标识与金额；所有凭证值绝对禁止。

## 任务清单

- [x] 1. 正式任务定义与三层边界冻结
- [x] 2. 独立 worktree / `codex/` 分支建立
- [x] 3. 设计文档与实施计划按正式定义修订
- [x] 4. `.gitignore` 增加私有原文区
- [ ] 5. catalog JSONL、Schema 与自动校验门
- [ ] 6. README、录入模板、Agent 检索指南、产品发布映射
- [ ] 7. `ka-src-0001` 白盒/黑盒原文私有留存
- [ ] 8. `ka-src-0001` catalog 与 20 项独立评估
- [ ] 9. hash、权限、生命周期、凭证和 Git 跟踪验证
- [ ] 10. research/knowledge 角色注册提议
- [ ] 11. `inbox-arch.md` 自包含审查事项
- [ ] 12. 最终提交、自查并停止等待审查

## 完成记录

- 2026-08-20：从用户正式任务定义确认，本资产不是私人笔记；仓库索引/评估是共享建设资产，产品知识库是批准后的发布目标。
- 2026-08-20：建立独立 worktree 和分支，未带入 Claude 工作区未提交文件。
- 2026-08-20：修正早期设计假设。内部原文允许完整保存到 Git 私有区；真实业务标识允许，凭证禁止。

## 当前状态

进行中：开始 Task 2，先写 catalog 校验失败测试。
