# UI 资产高频源码缓存与可视化展厅 Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 缓存跨 6+ 非 shadcn 来源的高频公开源码，为付费能力生成合法免费替代，并交付一个可离线浏览 5,996 项目录的 HTML 展厅。

**Architecture:** 以现有 12 份 catalog JSON 为唯一目录输入；starter spec 只保存经人工选择的根资产，下载器校验访问层级后抓官方 payload、递归公开依赖并写 hash manifest。展示生成器从 catalog、免费替代、source-cache manifest 和截图生成紧凑 JS 数据，HTML 只负责离线筛选与呈现，完全隔离 `apps/web` 运行时代码。

**Tech Stack:** Node.js ESM、原生 `fetch`/`node:test`、JSON、HTML/CSS/Vanilla JS、Playwright CLI。

---

### Task 1: 冻结高频根资产规格

**Files:**
- Create: `docs/frontend/ui-assets/starter-pack.json`
- Create: `apps/web/scripts/ui-catalog/starter-pack.test.mjs`
- Modify: `docs/plans/工作台账.md`

**Step 1: Write the failing test**

测试 starter spec：至少覆盖 coss、ReUI、Tremor、Aceternity、Magic UI、React Bits、tweakcn；所有根资产必须在现有 catalog 中存在、为 `public-source`、有官方 URL、用途和选择理由；不得含 shadcn 运行时覆盖项或任何 paid item。

**Step 2: Run test to verify it fails**

Run: `node --test apps/web/scripts/ui-catalog/starter-pack.test.mjs`

Expected: FAIL，提示 starter spec 尚不存在。

**Step 3: Write minimal specification**

按投放 Agent 高频能力选择约 40–60 个根资产：筛选/表格/反馈/指标与报告布局/少量动效/主题。旧 coss Origin 只放 1–3 个 current 无等价实现的候选，不把 legacy 当首选。

**Step 4: Run test to verify it passes**

Run: `node --test apps/web/scripts/ui-catalog/starter-pack.test.mjs`

Expected: PASS。

**Step 5: Commit**

```bash
git add docs/frontend/ui-assets/starter-pack.json apps/web/scripts/ui-catalog/starter-pack.test.mjs docs/plans/工作台账.md
git commit -m "docs: 冻结UI高频源码启动包"
```

### Task 2: 实现官方源码缓存器

**Files:**
- Create: `apps/web/scripts/ui-catalog/cache-starter-sources.mjs`
- Create: `apps/web/scripts/ui-catalog/cache-starter-sources.test.mjs`
- Create: `docs/frontend/ui-assets/source-cache/README.md`
- Generate: `docs/frontend/ui-assets/source-cache/manifest.json`
- Generate: `docs/frontend/ui-assets/source-cache/<source>/**`

**Step 1: Write the failing tests**

覆盖：

- 只允许 `public-source`；
- Registry JSON 保留完整 payload；
- GitHub blob/tree URL 转为固定 raw URL 或使用官方 API；
- SHA-256 与落盘内容一致；
- 同源公开 registry dependency 递归、去重、循环保护；
- 401/403 标 paid-blocked 并不写伪源码；
- `--check` 检查 manifest、文件存在与 hash，不联网改写。

**Step 2: Run test to verify it fails**

Run: `node --test apps/web/scripts/ui-catalog/cache-starter-sources.test.mjs`

Expected: FAIL，模块不存在。

**Step 3: Implement downloader**

提供 `--write`、`--check`、`--fixture-dir`。所有写入先到临时文件再 rename；manifest 项包含 `asset_id/source/upstream_name/root_or_dependency/source_url/resolved_url/license/license_scope/fetched_at/http_status/sha256/local_path/files_in_payload/cache_status`。

**Step 4: Run fixture tests**

Run: `node --test apps/web/scripts/ui-catalog/cache-starter-sources.test.mjs`

Expected: PASS。

**Step 5: Run live download**

Run: `node apps/web/scripts/ui-catalog/cache-starter-sources.mjs --write`

Expected: 至少 6 个非 shadcn 来源落盘；无 paid item；所有 cached hash 可复核。

**Step 6: Verify cache**

Run: `node apps/web/scripts/ui-catalog/cache-starter-sources.mjs --check`

Expected: PASS。

**Step 7: Commit**

```bash
git add apps/web/scripts/ui-catalog/cache-starter-sources.mjs apps/web/scripts/ui-catalog/cache-starter-sources.test.mjs docs/frontend/ui-assets/source-cache docs/frontend/ui-assets/starter-pack.json
git commit -m "feat: 缓存高频公开UI源码"
```

### Task 3: 建立付费能力免费替代与新库发现

**Files:**
- Create: `apps/web/scripts/ui-catalog/build-free-alternatives.mjs`
- Create: `apps/web/scripts/ui-catalog/free-alternatives.test.mjs`
- Create: `docs/frontend/ui-assets/free-alternatives.json`
- Create: `docs/frontend/ui-assets/free-alternatives.md`
- Create: `docs/frontend/ui-assets/discovery.json`
- Create: `docs/frontend/ui-assets/discovery.md`

**Step 1: Research official sources**

只看官方站、官方仓库和 LICENSE，查找适合 React/Next.js、视觉完成度高且许可清楚的新增候选。记录 Registry/安装方式、底层、许可证、维护状态、React 19/Tailwind v4 风险，不因“好看”自动纳入正式 5,996 目录。

**Step 2: Write the failing tests**

要求四条付费产品线都有映射；每个 mapping 有 capability、paid source、free candidate、match level、license、evidence、tradeoff；free candidate 必须来自 public-source 或明确的独立组合说明。

**Step 3: Implement builder and curated overrides**

先用 canonical capability 自动找同品牌 Free 和跨库候选，再用人工规则处理 icon、template、landing section、advanced motion、data grid 等高价值类别。

**Step 4: Run tests and stale check**

Run: `node --test apps/web/scripts/ui-catalog/free-alternatives.test.mjs`

Run: `node apps/web/scripts/ui-catalog/build-free-alternatives.mjs --check`

Expected: PASS。

**Step 5: Commit**

```bash
git add apps/web/scripts/ui-catalog/build-free-alternatives.mjs apps/web/scripts/ui-catalog/free-alternatives.test.mjs docs/frontend/ui-assets/free-alternatives.* docs/frontend/ui-assets/discovery.*
git commit -m "docs: 建立付费UI免费替代图谱"
```

### Task 4: 生成 HTML 展厅数据

**Files:**
- Create: `apps/web/scripts/ui-catalog/build-showcase-data.mjs`
- Create: `apps/web/scripts/ui-catalog/showcase-data.test.mjs`
- Generate: `docs/frontend/ui-assets/showcase/showcase-data.js`

**Step 1: Write the failing tests**

断言 12 个来源、5,996 个逻辑资产、付费替代、starter cache、截图和 discovery 均进入展示数据；只保留必要字段；链接协议只允许 `https:` 与安全相对路径。

**Step 2: Implement generator**

输出 `window.UI_ASSET_SHOWCASE = {...}`，保证 `file://` 下不依赖 `fetch`。

**Step 3: Run tests and write data**

Run: `node --test apps/web/scripts/ui-catalog/showcase-data.test.mjs`

Run: `node apps/web/scripts/ui-catalog/build-showcase-data.mjs --write`

Expected: PASS，数据包含完整资产数量但不复制大型 `upstream_meta`。

### Task 5: 实现离线 HTML 展厅

**Files:**
- Create: `docs/frontend/ui-assets/showcase/index.html`
- Create: `docs/frontend/ui-assets/showcase/styles.css`
- Create: `docs/frontend/ui-assets/showcase/app.js`
- Copy: `docs/frontend/ui-assets/showcase/screenshots/*`
- Modify: `docs/frontend/ui-assets/README.md`

**Step 1: Build semantic shell**

实现总览、产品线地图、资产浏览器、能力对比、付费替代、Starter Pack、新发现七个区块；使用 button/tab/input/table/details 等原生可访问结构。

**Step 2: Implement interactions**

提供关键词、来源、访问层级、类型筛选；URL hash 保留当前区块；资产列表分页；点击可打开官方预览/源码；不使用 `innerHTML` 渲染不可信字段。

**Step 3: Style with the approved visual direction**

编辑部式组件情报图鉴：纸张米白、墨黑、信号橙、状态绿、非对称信息网格、清晰的数字层级；支持 320px、1440px、dark mode、focus-visible、prefers-reduced-motion。

**Step 4: Commit**

```bash
git add apps/web/scripts/ui-catalog/build-showcase-data.mjs apps/web/scripts/ui-catalog/showcase-data.test.mjs docs/frontend/ui-assets/showcase docs/frontend/ui-assets/README.md
git commit -m "feat: 新增离线UI资产可视化展厅"
```

### Task 6: 浏览器与代码质量验收

**Files:**
- Create: `docs/frontend/ui-assets/reviews/2026-08-19-starter-showcase-quality.md`
- Generate: `output/playwright/ui-asset-showcase/desktop.png`
- Generate: `output/playwright/ui-asset-showcase/mobile.png`

**Step 1: Run all automated checks**

Run: `node --test apps/web/scripts/ui-catalog/*.test.mjs`

Run: `npx eslint apps/web/scripts/ui-catalog/*.mjs`

Run: `node apps/web/scripts/ui-catalog/cache-starter-sources.mjs --check`

Run: `node apps/web/scripts/ui-catalog/build-free-alternatives.mjs --check`

Run: `node apps/web/scripts/ui-catalog/build-showcase-data.mjs --check`

Expected: 全部通过。

**Step 2: Validate in a real browser**

检查 `npx`；用 Playwright CLI 打开 `file://.../showcase/index.html`，snapshot 后逐项操作导航、搜索、筛选、清空、外链；截取 1440px 与 390px 页面。

**Step 3: Perform quality review**

按 code-quality-checker 检查安全、XSS、离线性能、数据体积、键盘、reduced motion、移动端和许可证。Critical/High 必须清零。

**Step 4: Commit**

```bash
git add docs/frontend/ui-assets/reviews/2026-08-19-starter-showcase-quality.md
git commit -m "test: 验收UI源码缓存与展厅"
```

### Task 7: 更新工作台账与 Obsidian

**Files:**
- Modify: `docs/frontend/ui-assets/obsidian/投放Agent-前端UI资产库.md`
- Modify: `docs/plans/工作台账.md`
- Update external: `/Users/aik/Documents/Obsidian Vault/raw/创作/vibemotion/投放Agent-前端UI资产库.md`

**Step 1: Update canonical note**

补 current/Origin 区别、实际缓存数、按来源统计、免费替代、新 discovery、HTML 路径、使用命令、质量报告和最新 commit。

**Step 2: Sync exact Obsidian note**

复制 canonical note 到既有目标，不碰同目录其他笔记；回读并比较 SHA-256。

**Step 3: Final repository audit**

确认 staged 文件只属于本任务，F-001 页面和 relay 文件未进入提交；运行 `git diff --cached --check`。

**Step 4: Commit and self-check**

```bash
git add docs/frontend/ui-assets/obsidian/投放Agent-前端UI资产库.md docs/plans/工作台账.md
git commit -m "docs: 更新UI资产展厅续作入口"
git show --stat HEAD
```
