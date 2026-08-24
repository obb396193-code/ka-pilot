# Claude 投放项目主会话索引

> 用途：为新 Codex 临时审查/前端任务提供可审计入口，不复制或伪造 Claude Code 会话。  
> 快照日期：2026-08-24

## 原件

- 路径：`/Users/aik/.claude/projects/-Users-aik/9960860c-e50b-4a3f-a47f-26fccbb7a236.jsonl`
- Claude Code session ID：`9960860c-e50b-4a3f-a47f-26fccbb7a236`
- 行数快照：2,785
- SHA-256：`63716acd17e018e864b728be08a74c5602472d41897da20e422bc60320bd1f51`
- 规则：只读检索；不得编辑、复制入 Git 或根据较早消息覆盖后续老板裁决。

## 关键入口

| 主题 | JSONL 行号/范围 | 当前应以什么为准 |
|---|---:|---|
| 八路产品审查派发与总汇 | 994、1020、1044、1152 | `docs/15-八路审查总汇.md` + 老板后续裁决 |
| 工作流画布冲突识别 | 1666 | 仅说明审查曾建议不暴露画布 |
| 老板裁决工作流画布必须做 | 1669 | 画布、官方模板、用户自建都要做 |
| Claude 确认同一 workflow 模型 | 1681 | 官方/团队/个人共用模型，模板可复制 |
| React Flow 与复用方案 | 1923 | React Flow 画布；可靠执行由我方实现 |
| 前端 F-001 原始交接 | 2770 附件 | 结合当前 `docs/relay/inbox-fe.md` 阅读 |
| 前端骨架被打回的 P0 项 | 2772 起 | 九项导航、首页业务骨架、口径、Agent 入口 |
| Claude 最后可见错误 | 2780 | 429 weekly limit；不代表任务已完成 |

## 新任务强制首读

1. `AGENTS.md`
2. `docs/00-目标与愿景.md`
3. `docs/14-老板需求追踪总表.md`
4. `docs/20-PRD-v1.md`
5. `docs/plans/工作台账.md`
6. 本角色信箱
7. `docs/plans/2026-08-24-KA双数据视图与Codex临时代行-design.md`
8. `docs/plans/2026-08-24-KA双数据视图与Codex临时代行-implementation.md`

## 迁移边界

- Claude Code JSONL 与 Codex 任务不是同一会话协议，不能原生直接导入。
- `copy-cloud-session` 只能给同类本地 Claude Code 会话更换 session ID，用于换号续聊；不能生成 Codex 原生任务。
- 新 Codex 任务以结构化上下文包启动，需要细节时再按本索引只读检索原件。
- 原件 hash 改变只代表 Claude 会话后来继续写入；新任务必须登记新的行数/hash，不能覆盖旧快照。
