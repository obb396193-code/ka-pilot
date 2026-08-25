# 前端接管区

本目录是 KA Pilot 前端唯一实现线的接管事实源。正式页面在 `apps/web`，唯一视觉母版是 `apps/ui-layout-demo/sidebar.html`。

## 固定规则

1. 旧 FrontendAgent、旧 F-001 页面和已撤销 ContentRadar 小样不作为视觉来源，也不整体合并。
2. 旧非视觉代码只有在 root 标记 canonical 后，才可逐文件审计并迁入。
3. 每批只迁一个页面或一个可见区域；先保持母版结构，再接已冻结 Contract。
4. 自动测试通过不等于页面通过。老板负责视觉签字，root 负责功能、状态、权限和口径签字。
5. 前端不计算 CPA、Gap、达成率或环比，不猜 API，不让浏览器自报权限范围。
6. 未完成联调的能力必须显示真实的 loading、empty、error、stale、forbidden、disabled 等状态，不冒充已完成。

## 权威文件

- 设计：`docs/plans/2026-08-25-前端唯一实现线与视觉门禁-design.md`
- 实施：`docs/plans/2026-08-25-前端唯一实现线与视觉门禁-implementation.md`
- 能力矩阵：`docs/frontend/takeover/functional-capability-matrix.md`
- 接管现场：`docs/frontend/takeover/2026-08-25-live-state.md`

## 当前阶段

第一阶段只做正式工作台桌面版：先把已经批准的 Sidebar、Header、KPI、Chart、Tabs、DataTable 母版迁入正式 Next.js 页面，再按 root 批次接入业务 Contract。其余页面不得提前扩写。
