# Frontend Visual Standard, Review, and Reuse Repository Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 补齐可调整的前端视觉规范与审核模板，并安全导出、验证、上传可跨项目复用的 UI 资产私有仓库。

**Architecture:** Canonical 内容继续保存在 `docs/frontend/ui-assets/`；一个白名单导出器把项目无关文档、机器目录和许可证允许再分发的源码复制到临时独立仓库。受限来源只保留元数据和官网链接，导出后运行敏感词、绝对路径、许可证、链接和 hash 检查，再创建 GitHub private repository。

**Tech Stack:** Markdown、Node.js、JSON、Git、GitHub CLI、现有 UI catalog/source-cache/showroom 构建产物。

---

### Task 1: 补齐文字、数字、布局与动画规范

**Files:**
- Modify: `docs/frontend/ui-assets/frontend-product-standard.md`

**Step 1: 写规范缺口检查**

检查文档是否包含 `Storybook 与 ECharts`、`文字层级`、`数字格式`、`布局与密度`、`动画使用边界`、`可调整 token` 六个标题或关键词。

**Step 2: 运行检查并确认当前缺失**

Run: `rg -n "Storybook 与 ECharts|文字层级|数字格式|布局与密度|动画使用边界|可调整" docs/frontend/ui-assets/frontend-product-standard.md`

Expected: 只能命中零散原则，不能命中完整六部分。

**Step 3: 写最小完整规范**

加入推荐字号/行高范围、中文排版、`Intl.NumberFormat/DateTimeFormat`、单位与精度、tabular numbers、栅格/间距/密度、Motion/Animate 适用与禁用场景、reduced motion 和 token 调整回写机制。

**Step 4: 复跑关键词检查**

Expected: 六部分都有明确章节。

**Step 5: Commit**

```bash
git add docs/frontend/ui-assets/frontend-product-standard.md
git commit -m "docs: 补齐前端排版数字布局与动效规范"
```

### Task 2: 建立前端视觉与体验审核模板

**Files:**
- Create: `docs/frontend/ui-assets/前端视觉与体验审核清单.md`

**Step 1: 写审核结构检查**

要求文档包含证据清单、P0/P1/P2、数据与内容、文字数字、布局密度、组件、动画、响应式、无障碍、性能、许可证、问题表、结论和复审。

**Step 2: 写审核模板**

提供可复制的页面审核头、硬门禁、分项评分、问题记录表和最终签字模板；明确视觉评分不能抵消硬门禁。

**Step 3: 验证结构**

Run: `rg -n "P0|P1|P2|数字|布局|动画|证据|复审|通过|不通过" docs/frontend/ui-assets/前端视觉与体验审核清单.md`

Expected: 所有审核维度均有命中。

**Step 4: Commit**

```bash
git add docs/frontend/ui-assets/前端视觉与体验审核清单.md
git commit -m "docs: 新增前端视觉与体验审核清单"
```

### Task 3: 把新规范挂到前端强制入口

**Files:**
- Modify: `docs/frontend/ui-assets/README.md`
- Modify: `docs/frontend/ui-assets/前端交付总清单与未落地说明.md`
- Modify: `apps/web/AGENTS.md`
- Modify: `docs/relay/F-004-前端UI资产与质量门禁.md`
- Modify: `docs/plans/工作台账.md`

**Step 1: 添加链接与交付要求**

新审核清单进入所有前端必读入口；F-004 要求交付页面审核报告。

**Step 2: 验证本地链接**

使用 Node 解析 Markdown 相对链接并检查存在性。

**Step 3: Commit**

```bash
git add apps/web/AGENTS.md docs/frontend/ui-assets docs/relay/F-004-前端UI资产与质量门禁.md docs/plans/工作台账.md
git commit -m "docs: 接入前端视觉审核门禁"
```

### Task 4: 编写许可证白名单导出器

**Files:**
- Create: `scripts/export-frontend-ui-asset-kit.mjs`
- Create: `docs/frontend/ui-assets/github-export.md`
- Create: `scripts/export-frontend-ui-asset-kit.test.mjs`

**Step 1: 写失败测试**

测试导出结果：不存在投放 PRD/relay；不存在 paid/Pro 源码；Commons Clause、Aceternity 和待核许可证源码为 0；只允许安全来源的 source-cache 文件；Markdown/JSON/HTML 介绍和目录存在；无 `/Users/aik/`、token、真实账户关键词。

**Step 2: 运行测试确认失败**

Run: `node --test scripts/export-frontend-ui-asset-kit.test.mjs`

Expected: FAIL，导出器或 staging 尚不存在。

**Step 3: 实现导出器**

脚本使用固定 allowlist 读取 canonical 文件；根据 `source-cache/manifest.json` 的 source + license 双条件复制源码；重写导出 manifest；生成 `README.md`、`THIRD_PARTY_LICENSES.md`、`EXCLUDED_ASSETS.md` 和 `export-manifest.json`。

**Step 4: 生成本地导出包**

Run: `node scripts/export-frontend-ui-asset-kit.mjs --output output/frontend-ui-asset-kit`

Expected: 成功显示文档数、目录数、合法源码数、排除数，失败 0。

**Step 5: 运行测试**

Run: `node --test scripts/export-frontend-ui-asset-kit.test.mjs`

Expected: PASS。

**Step 6: Commit**

```bash
git add scripts/export-frontend-ui-asset-kit.mjs scripts/export-frontend-ui-asset-kit.test.mjs docs/frontend/ui-assets/github-export.md
git commit -m "feat: 增加UI资产安全导出器"
```

### Task 5: 审核独立复用仓库

**Files:**
- Inspect: `output/frontend-ui-asset-kit/**`

**Step 1: 校验绝对路径与敏感词**

Run: `rg -n "/Users/aik|账户 ID|考核价|内部人名|api[_-]?key|secret|token" output/frontend-ui-asset-kit`

Expected: 只有解释“不得包含”的安全文案；没有真实值和本机路径。

**Step 2: 校验受限源码**

确认 `source-cache/` 下无 `aceternity`、`animate-ui`、`react-bits`、`magic-ui-pro`、任何 Pro/Ultimate 路径。

**Step 3: 校验链接、JSON 与 hash**

解析所有 JSON；检查 Markdown 本地链接；逐文件比对 export manifest SHA-256。

**Step 4: 初始化独立 Git 仓库**

在输出目录 `git init`，只提交导出内容。

### Task 6: 创建并上传 GitHub 私有仓库

**Files:**
- External: GitHub repository `frontend-ui-asset-kit`

**Step 1: 检查 GitHub 登录**

Run: `gh auth status`

Expected: 已登录目标账号；若 token 失效，执行交互式 `gh auth login -h github.com`，由老板在 GitHub 完成授权。

**Step 2: 创建 private 仓库并推送**

Run: `gh repo create frontend-ui-asset-kit --private --source output/frontend-ui-asset-kit --remote origin --push`

Expected: 返回 GitHub repository URL，默认分支包含已审核导出 commit。

**Step 3: 远端复核**

Run: `gh repo view frontend-ui-asset-kit --json nameWithOwner,visibility,url,defaultBranchRef`

Expected: `visibility=PRIVATE`，默认分支与本地 HEAD 一致。

**Step 4: 回写台账**

记录远端 URL、commit SHA、导出统计、许可证排除项和下一次更新命令。

