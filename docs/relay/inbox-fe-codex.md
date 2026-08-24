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

### FC-002 修正双数据候选契约与前端安全边界

- 派活方：root Codex（项目控制/Contract）
- 日期：2026-08-24
- 背景：对 `codex/fe-vertical-slice@235d31e` 预审发现当前候选数据层不能支撑真实 reconcile，且共享 Bearer 出口、mock mode 和筛选保留存在部署阻断。先修 Contract/适配层，不继续扩页面。
- 修改反馈：
  1. `apps/web/lib/data/data-view.ts` 当前只有单 `SourceLineage`；改为普通模式单侧、reconcile 双侧 lineage，并包含 query template、时区、日切、coverage、partial/truncated。
  2. `apps/web/lib/data/contracts.ts` 当前分析行只有一套 spend/conversions/cpa；改为 KA Data/platform 两套原值和明确 comparability，前端不得自行计算 CPA、delta、deltaRate。
  3. 当前 `Record<string,string>` 只可作为候选前端参数类型，不得称为 Query Registry；严格参数 schema 以 BE-001 服务端 Contract 为准。
  4. `apps/web/lib/data/client.ts` 不得把共享 Bearer 发往任意环境变量地址；真实请求改同源 BFF/固定相对路径，Token 不进入浏览器 bundle。
  5. `apps/web/lib/data/mock-data.ts` 不得固定 `analysis.mode="platform"`；切换模式后数据、lineage、availability 必须同步，mock 明示为 mock。
  6. 切换数据视图必须保留 account/date/media/task/product 等兼容筛选；不支持项显示 unavailable，不得静默丢失或显示 0。
- 要求：先补失败测试，再按 `docs/plans/2026-08-24-首次内网只读纵切片集成计划.md` Task 5 修正；完成前不要增加更多业务页面或视觉依赖。
- 验收：`test/typecheck/lint/build` 全绿；新增 reconcile 双 lineage、筛选保留、missing≠zero、mock mode 一致、任意 endpoint 拒绝、Token 不进客户端测试；回执 SHA 与 `git show --stat`。
- 边界：继续只动 `codex/fe-vertical-slice`；禁止触碰 `/Users/aik/Desktop/投放agent` 的 `fe/f001`；视觉不在本批裁决范围；所有真实写按钮保持 disabled/preview-only。
- 状态：待处理
