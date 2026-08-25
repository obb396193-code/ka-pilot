# 前端接管现场

- 接管日期：2026-08-25
- 原工作树：`/Users/aik/Desktop/投放agent`
- 原分支：`fe/f001`
- 原始业务现场基线：`6fa8021`
- 接管设计：`e11c5a8`
- 接管实施计划：`0e5da57`
- 首批接口登记：`cd40927`
- 接管工作树：`/private/tmp/ka-pilot-frontend-takeover`
- 接管分支：`codex/frontend-takeover`
- 唯一视觉母版：`apps/ui-layout-demo/sidebar.html`
- 旧前端页面：禁止作为视觉来源或整体合并

## 保护结论

接管分支从 `cd40927` 新建。原工作树的未提交文件没有复制、覆盖、reset 或提交；后续前端实施只在隔离工作树进行。

## 接管时原工作树状态

以下快照来自原工作树执行 `git -c core.quotePath=false status --short`。它只用于标记所有权和防止误覆盖，不表示这些改动已验收。

```text
 D apps/web/app/(main)/data/layout.tsx
 D apps/web/app/(main)/data/page.tsx
 M apps/web/app/(main)/layout.tsx
 D apps/web/app/(main)/materials/page.tsx
 M apps/web/app/(main)/page.tsx
 D apps/web/app/(main)/tasks/page.tsx
 D apps/web/app/dashboard/data.json
 D apps/web/app/dashboard/page.tsx
 M apps/web/components/app-sidebar.tsx
 M apps/web/components/nav-main.tsx
 M apps/web/components/nav-user.tsx
 M apps/web/components/section-cards.tsx
 M apps/web/components/site-header.tsx
 M docs/00-目标与愿景.md
 M docs/14-老板需求追踪总表.md
 M docs/23-开发协作规范.md
 M docs/frontend/ui-assets/README.md
 M docs/frontend/ui-assets/frontend-product-standard.md
 M docs/frontend/ui-assets/前端交付总清单与未落地说明.md
 M docs/frontend/ui-assets/前端视觉与体验审核清单.md
 M docs/plans/F001-状态.md
 M docs/plans/工作台账.md
 M docs/relay/inbox-arch.md
 M docs/relay/inbox-codex.md
 M docs/relay/inbox-fe.md
 M scripts/export-frontend-ui-asset-kit.mjs
 M scripts/export-frontend-ui-asset-kit.test.mjs
?? .firecrawl/
?? .playwright-cli/
?? INDEX.md
?? README.md
?? apps/ui-layout-demo/dist-kpi-component-demo/
?? apps/ui-layout-demo/dist-kpi-demo/
?? apps/ui-layout-demo/kpi-color-demo.html
?? apps/ui-layout-demo/kpi-component-demo.html
?? apps/ui-layout-demo/src/kpi-color-demo/
?? apps/ui-layout-demo/src/kpi-component-demo/
?? apps/ui-layout-demo/vite.kpi-component-demo.config.ts
?? apps/ui-layout-demo/vite.kpi-demo.config.ts
?? apps/web/README.md
?? apps/web/app/(main)/analytics/
?? apps/web/app/(main)/campaigns/
?? apps/web/app/(main)/dashboard/
?? apps/web/app/(main)/products/
?? apps/web/public/
?? docs/frontend/ui-assets/standards-demo/
?? docs/ks-create-ad-script-v1.0.8.zip
?? docs/ks-data-queryer-v1.0.2.zip
?? docs/kuaishou-cli-v1.0.2.zip
?? docs/plans/2026-08-20-素材拆片复用备忘.md
?? docs/plans/2026-08-21-KPI彩色方案独立Demo-design.md
?? docs/plans/2026-08-21-KPI彩色方案独立Demo-implementation.md
?? docs/plans/2026-08-21-KPI组件替换对比Demo-design.md
?? docs/plans/2026-08-21-KPI组件替换对比Demo-implementation.md
?? docs/prototypes/
?? docs/qihang-cli-v1.0.7.zip
?? docs/rta-data-queryer-v1.0.0 (1).zip
?? ka-platform-docs-v2.zip
?? output/
?? refs/
```

## 接管后的提交纪律

- 视觉改动：老板在真实页面明确通过后才 commit。
- 非视觉门禁/测试/文档：可路径限定提交。
- 提交前必须运行 `git diff --cached --name-only`，确认没有原工作树文件或其他任务产物。

## 母版基线验证

接管工作树使用与原 Demo 相同的锁定依赖，执行结果：

| 检查 | 结果 |
|---|---|
| `npm test -- src/sidebar/sidebar-shell.test.tsx` | 1/1 PASS |
| `npm run test:node` | 9/9 PASS |
| `npm run typecheck` | PASS |
| `npm run build` | PASS，生成 `dist/sidebar.html` |

构建仍有已知 P2：共享 `CartesianChart` chunk 为 586.92 kB，超过 Vite 500 kB 提示线；不影响本次母版冻结，正式迁入 `apps/web` 时单独做懒加载/拆包门禁。
