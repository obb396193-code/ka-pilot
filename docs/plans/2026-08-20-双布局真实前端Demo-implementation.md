# 双布局真实前端 Demo Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 构建两个入口完全隔离、可真实操作的投放 Agent 首页 Demo，并在每个入口中支持优化师、KA 负责人和综合首页三种业务角色模式。

**Architecture:** 在 `apps/ui-layout-demo` 建立独立 Vite + React 19 多页面应用，`sidebar.html` 与 `topbar.html` 使用独立 root 和 shell，不提供互相跳转；业务数据、角色状态、图表、表格和 Agent 抽屉放在 `src/shared` 复用。侧栏外壳优先直接复制 shadcn `dashboard-01` 的合法官方源码，顶栏外壳优先使用 coss Origin MIT Navigation Menu 的官方源码与 Tremor/shadcn 数据组件；所有第三方来源写入 provenance 清单。

**Tech Stack:** React 19、TypeScript、Vite、Tailwind CSS v4、shadcn/ui、coss Origin、Tremor Raw/Blocks、Apache ECharts、TanStack Table、Vitest、Playwright CLI。

---

### Task 1: 冻结隔离边界与官方源码清单

**Files:**
- Create: `apps/ui-layout-demo/README.md`
- Create: `apps/ui-layout-demo/THIRD_PARTY_SOURCES.md`
- Create: `apps/ui-layout-demo/src/provenance.json`
- Test: `apps/ui-layout-demo/scripts/provenance.test.mjs`

**Step 1: Write the failing test**

在 `provenance.test.mjs` 中断言：

```js
assert.ok(Array.isArray(manifest.sources))
assert.ok(manifest.sources.some((item) => item.source === 'shadcn' && item.asset === 'dashboard-01'))
assert.ok(manifest.sources.some((item) => item.source === 'coss-origin' && item.asset.includes('navigation')))
for (const item of manifest.sources) {
  assert.match(item.license, /MIT|Apache-2\.0/)
  assert.match(item.upstream_url, /^https:\/\//)
  assert.ok(item.upstream_ref)
}
```

**Step 2: Run test to verify it fails**

Run: `node --test apps/ui-layout-demo/scripts/provenance.test.mjs`  
Expected: FAIL because `provenance.json` does not exist.

**Step 3: Audit and record exact upstream sources**

- Read `docs/frontend/ui-assets/source-cache/manifest.json` and `catalogs/*.json` first.
- For shadcn, record the exact Registry URL/ref for `dashboard-01` and every copied primitive.
- For coss Origin, fetch only the public MIT Navigation Menu source from the official repository; if its current source is incompatible with React 19/Tailwind v4, record the failed reason and use official shadcn Navigation Menu as the fallback rather than hand-writing a replacement.
- For Tremor/ECharts/AI Elements, record only assets actually copied or installed.
- Do not use ReUI Pro/Ultimate, React Bits Pro, Animate UI compiled code, Aceternity source with unresolved terms, or any 401/paid payload.

**Step 4: Write README and provenance manifest**

README must state:

```text
This is a standalone visual prototype.
It does not modify or import Claude's unfinished apps/web pages.
sidebar.html and topbar.html are separate public entries with no cross-layout switch.
All business records are synthetic demo data.
```

**Step 5: Run test to verify it passes**

Run: `node --test apps/ui-layout-demo/scripts/provenance.test.mjs`  
Expected: PASS.

**Step 6: Commit**

```bash
git add apps/ui-layout-demo/README.md apps/ui-layout-demo/THIRD_PARTY_SOURCES.md apps/ui-layout-demo/src/provenance.json apps/ui-layout-demo/scripts/provenance.test.mjs
git commit -m "docs: 冻结双布局Demo来源边界"
```

### Task 2: 建立多页面 React 工程与入口隔离门禁

**Files:**
- Create: `apps/ui-layout-demo/package.json`
- Create: `apps/ui-layout-demo/package-lock.json`
- Create: `apps/ui-layout-demo/vite.config.ts`
- Create: `apps/ui-layout-demo/tsconfig.json`
- Create: `apps/ui-layout-demo/tsconfig.app.json`
- Create: `apps/ui-layout-demo/index.css`
- Create: `apps/ui-layout-demo/sidebar.html`
- Create: `apps/ui-layout-demo/topbar.html`
- Create: `apps/ui-layout-demo/src/sidebar/main.tsx`
- Create: `apps/ui-layout-demo/src/topbar/main.tsx`
- Test: `apps/ui-layout-demo/scripts/entry-isolation.test.mjs`

**Step 1: Write the failing isolation test**

The test must assert:

```js
assert.doesNotMatch(sidebarHtml, /topbar\.html|切换到顶栏|顶栏版/)
assert.doesNotMatch(topbarHtml, /sidebar\.html|切换到侧栏|侧栏版/)
assert.match(sidebarHtml, /src\/sidebar\/main\.tsx/)
assert.match(topbarHtml, /src\/topbar\/main\.tsx/)
```

Also scan source code so no visible layout-switch component or shared navigation link exists.

**Step 2: Run test to verify it fails**

Run: `node --test apps/ui-layout-demo/scripts/entry-isolation.test.mjs`  
Expected: FAIL because both entry files are missing.

**Step 3: Scaffold the app**

Use Vite multi-page Rollup input:

```ts
build: {
  rollupOptions: {
    input: {
      sidebar: resolve(__dirname, 'sidebar.html'),
      topbar: resolve(__dirname, 'topbar.html'),
    },
  },
}
```

Install only dependencies required by selected official components. Do not install the full 17-library catalog.

**Step 4: Add minimal independent roots**

Each `main.tsx` renders only its own shell placeholder and imports `../index.css`; do not import the other shell.

**Step 5: Run tests and build**

Run:

```bash
cd apps/ui-layout-demo
npm install
npm run build
node --test scripts/entry-isolation.test.mjs
```

Expected: build succeeds and isolation test passes.

**Step 6: Commit**

```bash
git add apps/ui-layout-demo
git commit -m "chore: 建立双入口React演示工程"
```

### Task 3: 建立共享业务数据、角色模式与格式化契约

**Files:**
- Create: `apps/ui-layout-demo/src/shared/types.ts`
- Create: `apps/ui-layout-demo/src/shared/demo-data.ts`
- Create: `apps/ui-layout-demo/src/shared/formatters.ts`
- Create: `apps/ui-layout-demo/src/shared/role-context.tsx`
- Test: `apps/ui-layout-demo/src/shared/formatters.test.ts`
- Test: `apps/ui-layout-demo/src/shared/demo-data.test.ts`

**Step 1: Write failing tests**

Cover:

- `Intl.NumberFormat('zh-CN')` currency, percent, integer and compact output;
- `Intl.DateTimeFormat` with `Asia/Shanghai`;
- zero, null, stale and no-permission as different states;
- optimizer/manager/hybrid modes reference the same underlying totals;
- every record is marked `synthetic: true` and contains no real account ID/name.

**Step 2: Run tests to verify they fail**

Run: `npm test -- src/shared/formatters.test.ts src/shared/demo-data.test.ts`  
Expected: FAIL because modules are missing.

**Step 3: Implement types and data**

Use a stable shared model:

```ts
type RoleMode = 'optimizer' | 'manager' | 'hybrid'
type MetricState = 'valid' | 'empty' | 'stale' | 'forbidden'
type RiskLevel = 'critical' | 'warning' | 'healthy'
```

Create synthetic tasks/accounts whose totals reconcile across KPI, chart and table.

**Step 4: Implement role context**

Keep role state in memory only; do not persist it across the two layout entries and do not use it to switch shells.

**Step 5: Run tests**

Run: `npm test -- src/shared/formatters.test.ts src/shared/demo-data.test.ts`  
Expected: PASS.

**Step 6: Commit**

```bash
git add apps/ui-layout-demo/src/shared
git commit -m "feat: 增加Demo共享业务数据与角色模式"
```

### Task 4: 引入官方基础组件和设计 token

**Files:**
- Create: `apps/ui-layout-demo/src/lib/utils.ts`
- Create: `apps/ui-layout-demo/src/components/ui/*`
- Create: `apps/ui-layout-demo/src/shared/theme-provider.tsx`
- Modify: `apps/ui-layout-demo/index.css`
- Modify: `apps/ui-layout-demo/src/provenance.json`
- Test: `apps/ui-layout-demo/scripts/component-origin.test.mjs`

**Step 1: Write failing origin test**

Require every file under `src/components/ui` to be declared in provenance with source URL, ref and license. Reject copied files containing unresolved `@/` imports or missing dependencies.

**Step 2: Run test to verify it fails**

Run: `node --test apps/ui-layout-demo/scripts/component-origin.test.mjs`  
Expected: FAIL until component files and provenance are present.

**Step 3: Copy only selected official components**

Start with Button, Card, Badge, Tabs, Table, DropdownMenu, Sheet, Tooltip, Skeleton, Separator, Avatar, Select and NavigationMenu. Use official source unchanged where practical; keep adaptations in wrappers under `src/shared`.

**Step 4: Create semantic tokens**

Use Tailwind v4 CSS variables for background, surface, foreground, muted, border, primary, destructive, warning, success and chart series. Support light/dark. Do not hard-code library brand colors inside business components.

**Step 5: Run origin test, TypeScript and build**

Run:

```bash
node --test scripts/component-origin.test.mjs
npm run typecheck
npm run build
```

Expected: all pass.

**Step 6: Commit**

```bash
git add apps/ui-layout-demo/src/components apps/ui-layout-demo/src/lib apps/ui-layout-demo/index.css apps/ui-layout-demo/src/provenance.json
git commit -m "feat: 接入官方基础组件与语义主题"
```

### Task 5: 构建共享数据看板内容

**Files:**
- Create: `apps/ui-layout-demo/src/shared/components/role-switcher.tsx`
- Create: `apps/ui-layout-demo/src/shared/components/global-filters.tsx`
- Create: `apps/ui-layout-demo/src/shared/components/metric-grid.tsx`
- Create: `apps/ui-layout-demo/src/shared/components/performance-chart.tsx`
- Create: `apps/ui-layout-demo/src/shared/components/action-queue.tsx`
- Create: `apps/ui-layout-demo/src/shared/components/account-table.tsx`
- Create: `apps/ui-layout-demo/src/shared/components/agent-drawer.tsx`
- Create: `apps/ui-layout-demo/src/shared/dashboard-content.tsx`
- Test: `apps/ui-layout-demo/src/shared/dashboard-content.test.tsx`

**Step 1: Write failing component tests**

For each role mode assert visible module priorities:

- optimizer: “今日需要处理” and account actions appear before management ranking;
- manager: goal completion and team/task ranking appear before personal queue;
- hybrid: both executive summary and personal queue appear;
- switching role does not render “侧栏版” or “顶栏版” links.

**Step 2: Run tests to verify they fail**

Run: `npm test -- src/shared/dashboard-content.test.tsx`  
Expected: FAIL because components are missing.

**Step 3: Implement shared blocks from official patterns**

- Metric cards: adapt shadcn dashboard card and Tremor KPI composition.
- Chart: use Apache ECharts with named series, target CPA reference line, tooltip, legend, dataZoom only when needed and ARIA description.
- Table: use TanStack/shadcn table pattern with risk status, pinned primary identity and exact numeric columns.
- Agent: use shadcn Sheet plus only license-cleared AI Elements patterns needed for conversation/message display.
- Actions: write operations open a review/preview state only; no success toast that implies a real platform mutation.

**Step 4: Run component tests**

Run: `npm test -- src/shared/dashboard-content.test.tsx`  
Expected: PASS.

**Step 5: Commit**

```bash
git add apps/ui-layout-demo/src/shared
git commit -m "feat: 构建投放Agent共享首页看板"
```

### Task 6: 实现 shadcn dashboard-01 侧栏入口

**Files:**
- Create: `apps/ui-layout-demo/src/sidebar/sidebar-shell.tsx`
- Create: `apps/ui-layout-demo/src/sidebar/sidebar-nav.tsx`
- Create: `apps/ui-layout-demo/src/sidebar/sidebar-header.tsx`
- Modify: `apps/ui-layout-demo/src/sidebar/main.tsx`
- Modify: `apps/ui-layout-demo/src/provenance.json`
- Test: `apps/ui-layout-demo/src/sidebar/sidebar-shell.test.tsx`

**Step 1: Write failing shell test**

Assert sidebar shell contains the official Sidebar slots, nine business entries, active page heading, user/footer area and mobile trigger; assert it does not contain a topbar layout switch.

**Step 2: Run test to verify it fails**

Run: `npm test -- src/sidebar/sidebar-shell.test.tsx`  
Expected: FAIL.

**Step 3: Adapt official dashboard-01 shell**

Preserve the official SidebarProvider/SidebarInset/collapsible behavior. Replace demo navigation with the frozen business labels and place low-frequency settings/help in the footer or secondary group. Keep the global header compact so it does not become a second primary navigation.

**Step 4: Connect shared dashboard**

Render the same `DashboardContent` and shared role/filter state used by the topbar entry.

**Step 5: Run tests and build**

Run:

```bash
npm test -- src/sidebar/sidebar-shell.test.tsx
npm run build
```

Expected: PASS and `dist/sidebar.html` exists.

**Step 6: Commit**

```bash
git add apps/ui-layout-demo/src/sidebar apps/ui-layout-demo/src/provenance.json
git commit -m "feat: 完成shadcn侧栏首页Demo"
```

### Task 7: 实现成熟顶栏入口

**Files:**
- Create: `apps/ui-layout-demo/src/topbar/topbar-shell.tsx`
- Create: `apps/ui-layout-demo/src/topbar/primary-navigation.tsx`
- Create: `apps/ui-layout-demo/src/topbar/secondary-navigation.tsx`
- Create: `apps/ui-layout-demo/src/topbar/mobile-navigation.tsx`
- Modify: `apps/ui-layout-demo/src/topbar/main.tsx`
- Modify: `apps/ui-layout-demo/src/provenance.json`
- Test: `apps/ui-layout-demo/src/topbar/topbar-shell.test.tsx`

**Step 1: Write failing shell test**

Assert topbar shell includes primary/secondary navigation, global search, freshness, notifications and user menu; assert no `aside`, SidebarProvider, left rail or link to `sidebar.html` is rendered.

**Step 2: Run test to verify it fails**

Run: `npm test -- src/topbar/topbar-shell.test.tsx`  
Expected: FAIL.

**Step 3: Implement from the chosen official Navigation Menu source**

Use coss Origin MIT source when its exact upstream code passes the origin/dependency checks. Keep the navigation component semantics and keyboard behavior; adapt only item data and visual tokens. If fallback is required, document the reason in `THIRD_PARTY_SOURCES.md` and use official shadcn NavigationMenu without inventing a custom menu primitive.

**Step 4: Implement mobile behavior**

Use a Sheet/Drawer menu triggered from the topbar. Do not display a permanent sidebar at any viewport.

**Step 5: Connect shared dashboard and run tests**

Run:

```bash
npm test -- src/topbar/topbar-shell.test.tsx
npm run build
```

Expected: PASS and `dist/topbar.html` exists.

**Step 6: Commit**

```bash
git add apps/ui-layout-demo/src/topbar apps/ui-layout-demo/src/provenance.json apps/ui-layout-demo/THIRD_PARTY_SOURCES.md
git commit -m "feat: 完成独立顶栏首页Demo"
```

### Task 8: 完成状态矩阵、响应式、动效与无障碍

**Files:**
- Modify: `apps/ui-layout-demo/src/shared/dashboard-content.tsx`
- Modify: `apps/ui-layout-demo/src/shared/components/*`
- Modify: `apps/ui-layout-demo/index.css`
- Test: `apps/ui-layout-demo/scripts/quality-gates.test.mjs`

**Step 1: Write failing quality-gate test**

Reject:

- `transition: all`;
- hidden/disabled zoom;
- missing `:focus-visible`;
- missing `prefers-reduced-motion`;
- hard-coded live account IDs or real names;
- missing loading/empty/error/stale/forbidden markers;
- any visible cross-layout link or switch.

**Step 2: Run test to verify it fails**

Run: `node --test apps/ui-layout-demo/scripts/quality-gates.test.mjs`  
Expected: FAIL until all states are present.

**Step 3: Implement complete state matrix**

Add a development-only state selector for the current page's components if needed, but do not expose a layout selector. Ensure errors and permissions never depend on color alone.

**Step 4: Implement responsive and reduced motion rules**

- desktop reference: 1440×900;
- tablet reference: 1024×768;
- mobile reference: 390×844;
- table uses contained horizontal scrolling only when columns cannot collapse;
- system reduced motion always overrides decorative animation.

**Step 5: Run static gates and build**

Run:

```bash
node --test scripts/*.test.mjs
npm test
npm run typecheck
npm run build
```

Expected: all pass.

**Step 6: Commit**

```bash
git add apps/ui-layout-demo
git commit -m "test: 补齐双布局Demo质量状态门禁"
```

### Task 9: 真实浏览器终验和交付说明

**Files:**
- Modify: `apps/ui-layout-demo/README.md`
- Create: `docs/frontend/ui-assets/reviews/2026-08-20-双布局Demo-QA.md`
- Modify: `docs/plans/工作台账.md`

**Step 1: Start the isolated preview**

Run: `npm run dev -- --host 127.0.0.1` from `apps/ui-layout-demo`.

**Step 2: Use @playwright for desktop and mobile QA**

Open `sidebar.html` and `topbar.html` separately. For each entry:

- verify optimizer/manager/hybrid switching;
- change filters;
- open and close Agent drawer;
- verify light/dark;
- keyboard through primary controls;
- test 1440×900 and 390×844;
- inspect console and requests;
- verify `scrollWidth === clientWidth` for the page;
- verify no link/button/text exposes the other layout.

**Step 3: Run offline/network boundary check**

After initial load, switch the browser offline and repeat role/filter interactions. External runtime requests must be zero; local fonts/icons must be bundled or system-provided.

**Step 4: Review with @web-design-guidelines and @vercel-react-best-practices**

Record P0/P1/P2 findings. Fix P0/P1 before sign-off. Use the existing `docs/frontend/ui-assets/前端视觉与体验审核清单.md` for content, numeric, layout, motion and accessibility review.

**Step 5: Write QA evidence and instructions**

README must provide two separate URLs and explicitly state there is no layout switch. QA report records viewport, console, request, overflow, keyboard, state and provenance results.

**Step 6: Run final gates**

Run:

```bash
node --test scripts/*.test.mjs
npm test
npm run typecheck
npm run build
git diff --check
```

Expected: all pass with no P0/P1.

**Step 7: Commit**

```bash
git add apps/ui-layout-demo/README.md docs/frontend/ui-assets/reviews/2026-08-20-双布局Demo-QA.md docs/plans/工作台账.md
git commit -m "docs: 完成双布局Demo浏览器验收"
```

