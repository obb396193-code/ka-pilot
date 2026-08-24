# fe-codex（临时前端纵向切片任务）信箱

### FC-001 双数据可复用纵向切片

- 派活方：root Codex
- 日期：2026-08-24
- 背景：老板批准方案 2；Claude 前端暂不可用，先做可复用业务切片并继续做到内网部署可用，后续允许 Claude 重审或重做视觉。
- 前置阅读：`AGENTS.md` → `apps/web/AGENTS.md` → `docs/context/claude-main-session-index.md` → `docs/14-老板需求追踪总表.md` → `docs/20-PRD-v1.md` → 双数据 design/implementation → `docs/frontend/ui-assets/` 前端入口。
- 分支：独立 `codex/fe-vertical-slice` worktree；禁止触碰当前 `/Users/aik/Desktop/投放agent` 的 `fe/f001` 脏工作树。
- 要求：实现工作台→数据分析（三态切换/对账）→账户详情→异常诊断→变更预览确认；业务逻辑、数据 Contract 和视觉组件分层；覆盖 loading/empty/error/no-access/partial/stale/success；复用正式 UI 资产来源。
- 验收：TypeScript/ESLint/test/build/E2E 通过；1440/1366/390 截图；来源、时效、口径和截断可见；前端不算 CPA/差异率；确认页不真实执行媒体写操作；与内网 API 联调并产出可部署包，完成 daily/FaaS 页面访问验收。
- 边界：不是完整九页；不得把 mock 写成真实已上线；不得标 Claude 已审；视觉可被 Claude 后续重做。
- Codex 任务：`01a032d0-0c9b-7820-a679-3157f0384531`
- Worktree：`/Users/aik/.codex/worktrees/d61b/投放agent`
- 状态：进行中
