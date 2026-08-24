# fe-codex（临时前端纵向切片任务）信箱

### FC-001 双数据可复用纵向切片

- 派活方：root Codex
- 日期：2026-08-24
- 背景：老板批准方案 2；Claude 前端暂不可用，先做可复用业务切片，后续允许 Claude 重审或重做视觉。
- 前置阅读：`AGENTS.md` → `apps/web/AGENTS.md` → `docs/context/claude-main-session-index.md` → `docs/14-老板需求追踪总表.md` → `docs/20-PRD-v1.md` → 双数据 design/implementation → `docs/frontend/ui-assets/` 前端入口。
- 分支：独立 `codex/fe-vertical-slice` worktree；禁止触碰当前 `/Users/aik/Desktop/投放agent` 的 `fe/f001` 脏工作树。
- 要求：实现工作台→数据分析（三态切换/对账）→账户详情→异常诊断→变更预览确认；业务逻辑、数据 Contract 和视觉组件分层；覆盖 loading/empty/error/no-access/partial/stale/success；复用正式 UI 资产来源。
- 验收：TypeScript/ESLint/test/build/E2E 通过；1440/1366/390 截图；来源、时效、口径和截断可见；前端不算 CPA/差异率；确认页不真实执行媒体写操作。
- 边界：不是完整九页；不得把 mock 写成真实已上线；不得标 Claude 已审；视觉可被 Claude 后续重做。
- 状态：交付 `implemented` 进行中；审查 `codex_prechecked` 进行中
- 最新覆盖指令：Claude 只保留事后审核席位，不阻塞实现、内网联调和部署。双轴状态及外部阻塞见 `docs/plans/2026-08-24-fe-vertical-slice-status.md`。
- 2026-08-24 阶段 1：独立分支与基线已核验；候选 Contract、严格脱敏 mock、Query Registry、内网 API Adapter 已建立。后端正式 Schema、端点、凭证和 daily ACCESS_URL 尚未提供，继续实施不暂停。
