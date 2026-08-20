# Frontend Standards Lab Demo Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 创建一个无需安装依赖、可离线交互的前端规范实验室，直观展示文字、数字、布局、主题和动画规范的实际效果。

**Architecture:** 单文件 HTML 使用 CSS variables 和原生 JavaScript 控制主题、密度、字号和 motion；SVG 负责图表规范样张，现有 sandbox frames 展示 Motion Primitives/Animate UI 官方代表源码。Demo 与 `apps/web` 完全隔离。

**Tech Stack:** HTML、CSS、Vanilla JavaScript、Intl APIs、SVG、现有 offline iframe previews、Playwright CLI。

---

### Task 1: 建立失败门禁

**Files:**
- Create: `docs/frontend/ui-assets/standards-demo/standards-demo.test.mjs`

**Step 1: 写结构测试**

检查页面存在，且包含 theme/density/font/motion 控制、数字格式、文字动画、Storybook/ECharts/Showroom 区、reduced motion、focus-visible、tabular-nums、Intl APIs 和脱敏声明。

**Step 2: 运行测试确认失败**

Run: `node --test docs/frontend/ui-assets/standards-demo/standards-demo.test.mjs`

Expected: FAIL，`index.html` 尚不存在。

### Task 2: 实现离线规范实验室

**Files:**
- Create: `docs/frontend/ui-assets/standards-demo/index.html`
- Create: `docs/frontend/ui-assets/standards-demo/README.md`

**Step 1: 建立语义 HTML 和 token**

写 header、controls、main sections、aside audit；CSS variables 覆盖 theme、density、font scale、radius、motion。

**Step 2: 实现格式与交互**

用 `Intl.NumberFormat/DateTimeFormat` 生成金额、百分比、CPA、计数和日期；控制器更新 DOM、CSS variables 和当前审核状态。

**Step 3: 实现动画样张**

Typing/Morph/Roll/Scramble/Shimmer/Loop 及 Animated/Sliding/Counting Number；所有动画支持 replay、reduced 和 off。

**Step 4: 实现工具职责对比**

构造 Storybook 状态切换样张、ECharts 视觉规范 SVG 和第三方展厅说明；嵌入两个现有离线官方 frame。

**Step 5: 运行结构测试**

Expected: PASS。

### Task 3: 接入资料入口

**Files:**
- Modify: `docs/frontend/ui-assets/README.md`
- Modify: `docs/frontend/ui-assets/frontend-product-standard.md`
- Modify: `docs/frontend/ui-assets/前端视觉与体验审核清单.md`
- Modify: `docs/plans/工作台账.md`

**Step 1: 添加临时 Demo 链接与边界**

明确它是规范试验场，不是最终设计或产品组件来源。

**Step 2: 验证 Markdown 链接**

Expected: 本地链接缺失 0。

### Task 4: 浏览器验收

**Files:**
- Inspect: `docs/frontend/ui-assets/standards-demo/index.html`

**Step 1: 以 file URL 打开**

使用 Playwright CLI 在 1440×900、390×844 打开。

**Step 2: 验证交互**

切换主题、密度、字号、motion；重播动画；检查两个 iframe；执行键盘焦点。

**Step 3: 验证安全与响应式**

Expected: console error 0、HTTP(S) 请求 0、横向溢出 0、focus-visible 可见。

### Task 5: 提交与更新复用仓库

**Files:**
- Commit canonical Demo and docs.
- Regenerate: `output/frontend-ui-asset-kit`

**Step 1: 提交 canonical 文件**

```bash
git add docs/frontend/ui-assets/standards-demo docs/frontend/ui-assets/README.md docs/frontend/ui-assets/frontend-product-standard.md docs/frontend/ui-assets/前端视觉与体验审核清单.md docs/plans/工作台账.md
git commit -m "feat: 新增前端规范交互实验室"
```

**Step 2: 更新许可证安全复用包**

把 standards demo 加入导出 allowlist，重建、测试、提交并推送 private GitHub 仓库。

