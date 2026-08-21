# shadcn 历史顶栏 Dashboard 整页替换 Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 用 shadcn 官方历史版完整顶栏 Dashboard 替换 `topbar.html` 当前自写 App Shell，同时保持中文投放业务适配与侧栏入口隔离。

**Architecture:** 把历史官方页面作为不可变上游快照，新增 `src/topbar/shadcn-dashboard/` 本地适配目录，并用独立 `topbar.css` 承接 shadcn globals。页面结构与 className 以官方快照为基线，只改 import、中文文案、脱敏数据和最小 Vite glue code；旧 `DashboardContent` 不再进入顶栏依赖图。

**Tech Stack:** React 19、TypeScript、Vite、Tailwind CSS 4、shadcn/ui、Radix UI、Recharts、Vitest、Node test、Playwright

---

## 执行约束

- 当前仓库存在 `apps/web` 和多份文档的其他脏改动；所有提交只能 stage 本计划列出的 `apps/ui-layout-demo` 与本批次文档。
- 不修改正式产品 `apps/web`。
- 使用 @frontend-design 仅做官方页面的忠实业务适配，不创造新视觉语言。
- 使用 @playwright 做 1440×768 与 1440×900 实浏览器验收。
- 每个任务完成后运行针对性测试并独立提交。

### Task 1: 固定历史官方源码与来源证据

**Files:**
- Create: `apps/ui-layout-demo/upstream/shadcn-dashboard-topbar/page.tsx`
- Create: `apps/ui-layout-demo/upstream/shadcn-dashboard-topbar/components/*.tsx`
- Create: `apps/ui-layout-demo/upstream/shadcn-dashboard-topbar/SOURCE.json`
- Create: `apps/ui-layout-demo/scripts/topbar-upstream.test.mjs`
- Modify: `apps/ui-layout-demo/src/provenance.json`
- Modify: `apps/ui-layout-demo/THIRD_PARTY_SOURCES.md`

**Step 1: 写失败测试**

`topbar-upstream.test.mjs` 必须断言：

```js
assert.ok(existsSync(new URL("../upstream/shadcn-dashboard-topbar/page.tsx", import.meta.url)));
assert.equal(source.source, "shadcn-ui/ui");
assert.match(source.upstream_ref, /^[0-9a-f]{40}$/);
assert.match(source.sha256, /^[0-9a-f]{64}$/);
assert.deepEqual(source.components.sort(), [
  "date-range-picker.tsx",
  "main-nav.tsx",
  "overview.tsx",
  "recent-sales.tsx",
  "search.tsx",
  "team-switcher.tsx",
  "user-nav.tsx",
]);
```

**Step 2: 验证测试失败**

Run: `cd apps/ui-layout-demo && node --test scripts/topbar-upstream.test.mjs`

Expected: FAIL，提示上游快照或 `SOURCE.json` 不存在。

**Step 3: 获取并固定官方历史版本**

1. 把 `shadcn-ui/ui` Git 历史过滤克隆到明确的临时目录。
2. 对 `apps/www/app/(app)/examples/dashboard/page.tsx` 运行路径历史查询。
3. 选择删除/重构前最后一个仍包含完整顶栏 Dashboard 的 commit。
4. 从该 commit 导出 page 与 7 个组件，不从博客二次转载代码。
5. 计算逐文件与合并 SHA-256，写 `SOURCE.json`。
6. 更新 provenance，顶栏主来源由 `coss-origin navigation-menu` 改为 `shadcn historical dashboard`。

**Step 4: 验证通过**

Run: `cd apps/ui-layout-demo && node --test scripts/topbar-upstream.test.mjs scripts/provenance.test.mjs`

Expected: PASS；source commit 与 SHA-256 字段完整。

**Step 5: 提交**

```bash
git add apps/ui-layout-demo/upstream/shadcn-dashboard-topbar apps/ui-layout-demo/scripts/topbar-upstream.test.mjs apps/ui-layout-demo/src/provenance.json apps/ui-layout-demo/THIRD_PARTY_SOURCES.md
git commit -m "固定shadcn历史顶栏Dashboard源码"
```

### Task 2: 建立顶栏独占的 shadcn primitive 与样式入口

**Files:**
- Create: `apps/ui-layout-demo/src/topbar/shadcn-dashboard/ui/avatar.tsx`
- Create: `apps/ui-layout-demo/src/topbar/shadcn-dashboard/ui/button.tsx`
- Create: `apps/ui-layout-demo/src/topbar/shadcn-dashboard/ui/calendar.tsx`
- Create: `apps/ui-layout-demo/src/topbar/shadcn-dashboard/ui/card.tsx`
- Create: `apps/ui-layout-demo/src/topbar/shadcn-dashboard/ui/dropdown-menu.tsx`
- Create: `apps/ui-layout-demo/src/topbar/shadcn-dashboard/ui/input.tsx`
- Create: `apps/ui-layout-demo/src/topbar/shadcn-dashboard/ui/popover.tsx`
- Create: `apps/ui-layout-demo/src/topbar/shadcn-dashboard/ui/tabs.tsx`
- Create: `apps/ui-layout-demo/src/topbar/shadcn-dashboard/ui/sheet.tsx`
- Create: `apps/ui-layout-demo/src/topbar/topbar.css`
- Modify: `apps/ui-layout-demo/src/topbar/main.tsx`
- Modify: `apps/ui-layout-demo/package.json`
- Modify: `apps/ui-layout-demo/package-lock.json`

**Step 1: 写失败测试**

在 `topbar-shell.test.tsx` 增加样式隔离断言：

```tsx
expect(document.body.dataset.entry).toBe("topbar");
expect(container.querySelector("[data-slot='card']")).toBeInTheDocument();
expect(container.querySelector(".topbar-primary")).toBeNull();
```

**Step 2: 验证测试失败**

Run: `cd apps/ui-layout-demo && npm test -- --run src/topbar/topbar-shell.test.tsx`

Expected: FAIL，旧 `.topbar-primary` 仍存在且新官方卡片尚未接入。

**Step 3: 最小实现**

- 从当前 shadcn Registry/已固定官方实现复制所需 primitives。
- 安装日期组件真正需要的 `date-fns` 与 `react-day-picker`；不引入另一套 UI 库。
- `main.tsx` 只加载 `topbar.css`；不得加载旧 `index.css`。
- `topbar.css` 复制当前 shadcn 默认 root token、Geist/Geist Mono 与 antialiasing，并只添加业务适配所需局部规则。

**Step 4: 验证通过**

Run: `cd apps/ui-layout-demo && npm run typecheck && npm test -- --run src/topbar/topbar-shell.test.tsx`

Expected: TypeScript PASS；测试进入新官方结构。

**Step 5: 提交**

```bash
git add apps/ui-layout-demo/src/topbar apps/ui-layout-demo/package.json apps/ui-layout-demo/package-lock.json
git commit -m "建立顶栏shadcn独占样式与组件"
```

### Task 3: 复制完整官方顶栏与账号交互

**Files:**
- Create: `apps/ui-layout-demo/src/topbar/shadcn-dashboard/main-nav.tsx`
- Create: `apps/ui-layout-demo/src/topbar/shadcn-dashboard/team-switcher.tsx`
- Create: `apps/ui-layout-demo/src/topbar/shadcn-dashboard/search.tsx`
- Create: `apps/ui-layout-demo/src/topbar/shadcn-dashboard/user-nav.tsx`
- Create: `apps/ui-layout-demo/src/topbar/shadcn-dashboard/date-range-picker.tsx`
- Modify: `apps/ui-layout-demo/src/topbar/topbar-shell.tsx`
- Modify: `apps/ui-layout-demo/src/topbar/topbar-shell.test.tsx`

**Step 1: 写失败测试**

```tsx
expect(screen.getByText("KA Pilot")).toBeInTheDocument();
expect(screen.getByRole("navigation", { name: "产品主导航" })).toBeInTheDocument();
expect(screen.getByText("工作台")).toBeInTheDocument();
expect(screen.getByText("更多")).toBeInTheDocument();
expect(screen.getByText("快手优化师")).toBeInTheDocument();
expect(screen.getByAltText("快手优化师")).toHaveAttribute(
  "src",
  "/avatars/shadcn-morty-official.jpg",
);
```

**Step 2: 验证测试失败**

Run: `cd apps/ui-layout-demo && npm test -- --run src/topbar/topbar-shell.test.tsx`

Expected: FAIL，官方 TeamSwitcher/MainNav/UserNav 尚未接入。

**Step 3: 最小实现**

- 保持官方顶栏 `border-b > flex h-16 items-center px-4` 层级和 className。
- 高频导航为工作台/投放任务/数据分析/账户池/自动化/商品素材。
- `更多` Dropdown 承接报告/知识库/集成与通知。
- 官方 Search 适配为中文全局搜索；UserNav 使用既有官网头像与账号名。
- Agent 入口用官方 Button + Sheet，放在右侧操作区，不增加第二条自写状态栏。

**Step 4: 验证通过**

Run: `cd apps/ui-layout-demo && npm test -- --run src/topbar/topbar-shell.test.tsx && npm run typecheck`

Expected: PASS；顶栏结构、九项导航、账号头像与独立入口均正确。

**Step 5: 提交**

```bash
git add apps/ui-layout-demo/src/topbar
git commit -m "接入shadcn完整顶栏与账号交互"
```

### Task 4: 复制官方 Dashboard 正文并映射投放业务

**Files:**
- Create: `apps/ui-layout-demo/src/topbar/shadcn-dashboard/overview.tsx`
- Create: `apps/ui-layout-demo/src/topbar/shadcn-dashboard/recent-activity.tsx`
- Create: `apps/ui-layout-demo/src/topbar/shadcn-dashboard/demo-data.ts`
- Create: `apps/ui-layout-demo/src/topbar/shadcn-dashboard/dashboard-page.tsx`
- Modify: `apps/ui-layout-demo/src/topbar/topbar-shell.tsx`
- Modify: `apps/ui-layout-demo/src/topbar/topbar-shell.test.tsx`
- Modify: `apps/ui-layout-demo/scripts/entry-isolation.test.mjs`

**Step 1: 写失败测试**

```tsx
expect(screen.getByText("投放经营总览")).toBeInTheDocument();
expect(screen.getByText("今日消耗")).toBeInTheDocument();
expect(screen.getByText("支付 ROI")).toBeInTheDocument();
expect(screen.getByText("转化成本")).toBeInTheDocument();
expect(screen.getByText("计划达成率")).toBeInTheDocument();
expect(screen.getByText("消耗与支付趋势")).toBeInTheDocument();
expect(screen.getByText("近期投放任务")).toBeInTheDocument();
```

并在 Node 测试中加入：

```js
assert.doesNotMatch(topbarShell, /DashboardContent|shared\/dashboard-content/);
```

**Step 2: 验证测试失败**

Run: `cd apps/ui-layout-demo && npm test -- --run src/topbar/topbar-shell.test.tsx && npm run test:node`

Expected: FAIL，顶栏仍依赖自写 `DashboardContent`。

**Step 3: 最小实现**

- 复制官方 page、Cards、Tabs、Overview、RecentSales 的 DOM/className。
- 只把指标和列表改为脱敏投放数据。
- 图表继续使用官方 Recharts 组件，不在 A 版混用旧 ECharts 皮肤。
- 保留“演示数据”说明，金额/比例使用现有 Intl formatter。

**Step 4: 验证通过**

Run: `cd apps/ui-layout-demo && npm test && npm run test:node && npm run typecheck`

Expected: 全部 PASS；顶栏依赖图无 `DashboardContent`。

**Step 5: 提交**

```bash
git add apps/ui-layout-demo/src/topbar apps/ui-layout-demo/scripts/entry-isolation.test.mjs
git commit -m "整页接入shadcn投放经营Dashboard"
```

### Task 5: 删除旧顶栏外壳并完成构建门禁

**Files:**
- Modify: `apps/ui-layout-demo/index.css`
- Modify: `apps/ui-layout-demo/README.md`
- Modify: `apps/ui-layout-demo/vite.config.ts`
- Test: `apps/ui-layout-demo/src/topbar/topbar-shell.test.tsx`
- Test: `apps/ui-layout-demo/scripts/*.test.mjs`

**Step 1: 写失败检查**

在 Node 测试中扫描顶栏入口与构建产物源代码：

```js
assert.doesNotMatch(topbarCss, /\.topbar-primary|\.topbar-secondary|\.nav-menu-grid/);
assert.doesNotMatch(topbarShell, /DesktopProductNav|MobileProductNav|ThemeToggle/);
```

**Step 2: 验证测试失败**

Run: `cd apps/ui-layout-demo && npm run test:node`

Expected: FAIL，旧 CSS/组件仍存在。

**Step 3: 清理**

- 删除只服务旧顶栏的 CSS 与组件分支。
- 保留侧栏仍使用的共享数据/工具，不做无关重构。
- README 更新为“shadcn 官方历史顶栏 Dashboard 整页复用”。
- 确认 Rollup 仍只生成 `sidebar.html` 与 `topbar.html` 两个入口；COSS 版后续单独增加。

**Step 4: 全量验证**

Run:

```bash
cd apps/ui-layout-demo
npm test
npm run test:node
npm run typecheck
npm run format:check
npm run build
npm audit
```

Expected: 全部 PASS；audit 0 vulnerabilities。

**Step 5: 提交**

```bash
git add apps/ui-layout-demo
git commit -m "清理旧顶栏外壳并补齐构建门禁"
```

### Task 6: 真实浏览器像素复审与交接

**Files:**
- Create: `apps/ui-layout-demo/reviews/2026-08-21-shadcn-topbar-dashboard-qa.md`
- Modify: `docs/plans/工作台账.md`

**Step 1: 启动/复用 Demo 服务**

Run: `cd apps/ui-layout-demo && npm run dev -- --host 127.0.0.1`

Expected: `http://127.0.0.1:5173/topbar.html` 可访问。

**Step 2: Playwright 桌面端验收**

在 1440×768 与 1440×900 分别验证：

```js
const result = await page.evaluate(() => ({
  viewport: document.documentElement.clientWidth,
  scrollWidth: document.documentElement.scrollWidth,
  headerHeight: document.querySelector("header")?.getBoundingClientRect().height,
  navRows: new Set(
    [...document.querySelectorAll("header nav a")].map(
      (node) => Math.round(node.getBoundingClientRect().top),
    ),
  ).size,
}));
```

Expected: `scrollWidth === viewport`、`navRows === 1`、console error/warning 0。

**Step 3: 交互验收**

- 打开“更多”并看到报告/知识库/集成与通知；
- 打开日期范围；
- 切换 Tabs；
- 打开头像菜单；
- 打开/关闭 Agent Sheet；
- 确认侧栏页未被顶栏 CSS 污染。

**Step 4: 视觉复审**

- 同视口对照选定官方历史页面：顶栏高、内容 padding、四卡列宽、图表/列表比例。
- 按 @web-design-guidelines 复查焦点、reduced motion、文字数字格式、空/错/加载状态边界。
- 记录与上游差异；只允许中文文案自然宽度、业务数据与 Vite glue 差异。

**Step 5: 写验收与台账并提交**

```bash
git add apps/ui-layout-demo/reviews/2026-08-21-shadcn-topbar-dashboard-qa.md
git commit -m "验收shadcn历史顶栏Dashboard"
```

工作台账属于共享脏文件，只更新记录，不与无关修改一起 stage；如需提交必须先逐段审计并只纳入本批次 hunk。

## 完成定义

- `topbar.html` 真实运行完整 shadcn 历史顶栏 Dashboard；
- 页面不再使用自写 `DashboardContent` 和旧顶栏 CSS；
- 九项业务导航完整且“更多”保留；
- 1440×768/900 无溢出、console 0/0；
- 全部自动门禁通过；
- 来源 commit/hash、业务适配边界、浏览器证据可追溯；
- A 版完成后才能进入独立 `topbar-coss.html` 的下一份设计。
