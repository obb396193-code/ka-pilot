# 前端唯一实现线与视觉门禁 Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 保护现有现场，以 `apps/ui-layout-demo/sidebar.html` 为唯一视觉母版，把正式工作台逐批迁入 `apps/web`，并建立自动质量、老板视觉和 root 功能三类门禁。

**Architecture:** 在独立 `codex/frontend-takeover` worktree 中工作；Vite Demo 继续作为视觉母版，Next.js `apps/web` 作为正式运行时。正式页面只接收已格式化的 view model；API Contract、权限和状态通过 adapter 注入，视觉组件不计算经营指标。旧前端页面不合并，旧非视觉代码只在 root 标记 canonical 后逐文件迁入。

**Tech Stack:** Next.js 15、React 19、TypeScript、Tailwind CSS 4、shadcn/ui New York v4、Vitest/Node test、Playwright、ESLint、Prettier。

---

## 执行约束

- 全部实施留在当前任务，不创建新的前端任务或子 Agent。
- 当前 `fe/f001` 工作树保持原样；禁止 reset、checkout、批量覆盖或合并旧前端分支。
- 视觉代码在老板明确说“通过/这版可以”前不 commit。
- 非视觉门禁、测试和文档可独立路径提交。
- root 未提供 Contract 的能力使用明确 demo/unavailable/read-only 状态，不猜字段。

### Task 1: 建立隔离接管工作树并冻结现场

**Files:**
- Create: `docs/frontend/takeover/2026-08-25-live-state.md`
- Create: `docs/frontend/takeover/README.md`
- Modify: `.gitignore`

**Step 1: 记录当前权威状态**

在现工作树只读执行：

```bash
git branch --show-current
git rev-parse HEAD
git status --short
git worktree list --porcelain
```

Expected: 分支包含 `fe/f001`，基线至少包含设计 commit `e11c5a8` 和本实施计划提交；状态显示现有未提交现场。

**Step 2: 创建隔离 worktree**

```bash
git worktree add /private/tmp/ka-pilot-frontend-takeover -b codex/frontend-takeover HEAD
```

Expected: 新 worktree 干净，分支为 `codex/frontend-takeover`；原工作树状态完全不变。

**Step 3: 写现场说明**

`docs/frontend/takeover/2026-08-25-live-state.md` 必须记录：

```markdown
# 前端接管现场

- 原工作树：/Users/aik/Desktop/投放agent
- 原分支：fe/f001
- 原基线：6fa8021
- 接管设计：e11c5a8
- 接管分支：codex/frontend-takeover
- 唯一视觉母版：apps/ui-layout-demo/sidebar.html
- 旧前端页面：禁止作为视觉来源或整体合并
- 当前未提交现场：以接管时 git status 附录为准
```

**Step 4: 验证母版可运行**

Run:

```bash
cd apps/ui-layout-demo
npm test -- src/sidebar/sidebar-shell.test.tsx
npm run test:node
npm run typecheck
npm run build
```

Expected: 全部 PASS；`dist/sidebar.html` 存在。

**Step 5: Commit 非视觉现场记录**

```bash
git add docs/frontend/takeover .gitignore
git commit -m "docs: 建立前端接管隔离现场"
```

### Task 2: 把唯一视觉线和九道门禁接入强制入口

**Files:**
- Modify: `apps/web/AGENTS.md`
- Modify: `docs/frontend/ui-assets/frontend-product-standard.md`
- Modify: `docs/frontend/ui-assets/前端视觉与体验审核清单.md`
- Modify: `docs/relay/F-004-前端UI资产与质量门禁.md`
- Create: `scripts/frontend-visual-gate-entry.test.mjs`

**Step 1: 写失败的入口测试**

测试读取上述四份文档并断言包含：

```js
const required = [
  "sidebar.html",
  "唯一视觉母版",
  "老板视觉签字",
  "root 功能签字",
  "旧前端页面不得作为视觉来源",
  "ContentRadar 真实源码",
]
```

Run:

```bash
node --test scripts/frontend-visual-gate-entry.test.mjs
```

Expected: FAIL，指出强制入口尚未全部包含冻结规则。

**Step 2: 更新强制入口**

在 `apps/web/AGENTS.md` 最前加入“唯一实现线”章节，并链接：

```markdown
- [前端唯一实现线与视觉门禁设计](../../docs/plans/2026-08-25-前端唯一实现线与视觉门禁-design.md)
```

其余三份文档加入 V0–V8 门禁、老板/root 双签和旧视觉禁止规则，不复制另一套冲突流程。

**Step 3: 运行测试**

```bash
node --test scripts/frontend-visual-gate-entry.test.mjs
```

Expected: PASS。

**Step 4: Commit 门禁文档**

```bash
git add apps/web/AGENTS.md docs/frontend/ui-assets/frontend-product-standard.md docs/frontend/ui-assets/前端视觉与体验审核清单.md docs/relay/F-004-前端UI资产与质量门禁.md scripts/frontend-visual-gate-entry.test.mjs
git commit -m "docs: 接入前端唯一视觉门禁"
```

### Task 3: 建立功能承接矩阵，不合并旧页面

**Files:**
- Create: `docs/frontend/takeover/functional-capability-matrix.md`
- Create: `docs/frontend/takeover/functional-capability-matrix.schema.json`
- Create: `scripts/frontend-capability-matrix.test.mjs`

**Step 1: 写矩阵 schema**

每项必须包含：

```json
{
  "capability_id": "workbench.summary",
  "route": "/",
  "prd_status": "frozen|candidate|not-planned",
  "contract_status": "ready|blocked|missing",
  "root_evidence": "docs/relay/...",
  "states": ["normal", "loading", "empty", "error", "partial", "stale", "no-permission", "disabled"],
  "old_non_visual_code": [],
  "visual_source": "apps/ui-layout-demo/sidebar.html",
  "implementation_status": "not-started|in-progress|gated|approved",
  "boss_visual_signoff": null,
  "root_function_signoff": null
}
```

**Step 2: 写失败的矩阵测试**

断言：

- 所有正式能力有 `root_evidence`。
- `visual_source` 不得指向旧 FrontendAgent/F-001 页面。
- `approved` 必须同时存在老板和 root 签字。
- `contract_status=missing` 不得标 `approved`。

Run:

```bash
node --test scripts/frontend-capability-matrix.test.mjs
```

Expected: FAIL，矩阵尚未建立。

**Step 3: 只录入 root 已冻结的首批能力**

首批先录工作台壳、Sidebar、Header、KPI、图表容器、Tabs、DataTable；尚未收到 Contract 的业务模块标 `blocked`，不从旧页面自行推断。

接口冻结批次 `codex/integration-control@68da060` 只登记为待联调，不抢接后端：

- `GET /api/internal/auth/session`：页面支持 `loading / authenticated / unauthenticated / forbidden` 四态。
- `POST /api/internal/auth/login`：只接受冻结的登录 schema。
- `POST /api/internal/auth/workspace`：切换工作区后由服务端重建 session 上下文。
- `DELETE /api/internal/auth/session`：退出并清除服务端会话。
- 浏览器不得自报 `workspaceId/userId/role/accountIds`；权限上下文由服务端 session 解析。
- 普通业务页固定奇航主链，不展示 `ka_data/platform/reconcile` 数据源选择器。
- 在 B23-A SHA 与 R23-D 联调 fixtures 到齐前，以上均保持 `contract_status=blocked`。
- 不开放媒体 `preview/confirm/execute`；不在前端计算 CPA、Gap、达成率或环比。

**Step 4: 运行测试并提交**

```bash
node --test scripts/frontend-capability-matrix.test.mjs
git add docs/frontend/takeover scripts/frontend-capability-matrix.test.mjs
git commit -m "docs: 建立前端功能承接矩阵"
```

### Task 4: 冻结 sidebar 视觉母版的机器基线

**Files:**
- Create: `apps/ui-layout-demo/src/sidebar/visual-baseline.json`
- Create: `apps/ui-layout-demo/scripts/sidebar-visual-baseline.test.mjs`
- Create: `apps/ui-layout-demo/reviews/2026-08-25-sidebar-visual-baseline.md`

**Step 1: 写失败的基线测试**

测试必须验证：

- 产品名 `KA Pilot`。
- 九项业务导航和辅助区。
- `Geist`/`Geist Mono`、官方 Lab token、`antialiased`。
- Sidebar、Header、四 KPI、Chart、Tabs、DataTable 源码入口存在。
- 无旧 `PageShell`、`MetricGrid`、`DataViewSwitcher` 依赖。

Run:

```bash
cd apps/ui-layout-demo
node --test scripts/sidebar-visual-baseline.test.mjs
```

Expected: FAIL，因为 `visual-baseline.json` 尚不存在。

**Step 2: 录入批准的桌面几何**

`visual-baseline.json` 记录：

```json
{
  "route": "/sidebar.html",
  "viewports": [
    { "width": 1440, "height": 900 },
    { "width": 1366, "height": 768 }
  ],
  "font": "Geist",
  "sidebarExpandedWidth": 288,
  "headerHeight": 48,
  "kpiCount": 4,
  "requiredSections": ["sidebar", "header", "kpis", "chart", "tabs", "table"],
  "bossApproved": true,
  "approvedAt": "2026-08-25"
}
```

几何只冻结已经实测和老板认可的结构；内容驱动宽高不写伪精确值。

**Step 3: 运行基线测试**

```bash
npm test -- src/sidebar/sidebar-shell.test.tsx
node --test scripts/sidebar-visual-baseline.test.mjs
```

Expected: PASS。

**Step 4: Commit 机器基线**

```bash
git add apps/ui-layout-demo/src/sidebar/visual-baseline.json apps/ui-layout-demo/scripts/sidebar-visual-baseline.test.mjs apps/ui-layout-demo/reviews/2026-08-25-sidebar-visual-baseline.md
git commit -m "test: 冻结侧栏视觉母版"
```

### Task 5: 建立 ContentRadar/官方源码真实复制登记器

**Files:**
- Create: `docs/frontend/takeover/source-import-manifest.schema.json`
- Create: `docs/frontend/takeover/source-import-manifest.json`
- Create: `scripts/frontend-source-import.test.mjs`
- Modify: `apps/web/AGENTS.md`

**Step 1: 写 manifest schema**

每个复制件必须记录：

```json
{
  "id": "contentradar:<component>",
  "source_kind": "official|contentradar",
  "source_repo": "absolute path or official URL",
  "source_commit": "full sha",
  "source_files": [],
  "destination_files": [],
  "copied_dependencies": [],
  "license_or_internal_authority": "",
  "modifications": [],
  "boss_approved": false,
  "runtime_status": "candidate|isolated|adapted|approved"
}
```

**Step 2: 写失败测试**

断言：目标文件存在时 manifest 必须存在对应记录；`contentradar` 记录必须有原仓 commit、源文件和修改清单；禁止只填“参考截图”。

**Step 3: 建空 manifest 并通过测试**

第一阶段不擅自复制 ContentRadar 组件，manifest 初始为空。老板点名具体组件后，再新增记录和源码。

**Step 4: Commit 登记器**

```bash
node --test scripts/frontend-source-import.test.mjs
git add docs/frontend/takeover/source-import-manifest* scripts/frontend-source-import.test.mjs apps/web/AGENTS.md
git commit -m "test: 建立前端真实源码复制门禁"
```

### Task 6: 把母版逐文件迁入正式 Next.js 工作台

**Files:**
- Modify: `apps/web/app/globals.css`
- Modify: `apps/web/app/(main)/layout.tsx`
- Modify: `apps/web/app/(main)/page.tsx`
- Modify: `apps/web/components/app-sidebar.tsx`
- Modify: `apps/web/components/site-header.tsx`
- Modify: `apps/web/components/section-cards.tsx`
- Modify: `apps/web/components/chart-area-interactive.tsx`
- Modify: `apps/web/components/data-table.tsx`
- Modify: `apps/web/components/nav-main.tsx`
- Modify: `apps/web/components/nav-documents.tsx`
- Modify: `apps/web/components/nav-secondary.tsx`
- Modify: `apps/web/components/nav-user.tsx`
- Modify: `apps/web/components/ui/*.tsx`
- Create: `apps/web/lib/presentation/workbench-view-model.ts`
- Create: `apps/web/lib/presentation/workbench-demo.fixture.ts`
- Create: `apps/web/lib/presentation/workbench-view-model.test.ts`
- Copy: `apps/ui-layout-demo/public/avatars/shadcn-morty-official.jpg` → `apps/web/public/avatars/shadcn-morty-official.jpg`

**Step 1: 写失败的 presentation 测试**

断言 view model 仅包含后端值的展示形式：

```ts
type MetricDisplay = {
  label: string
  value: string
  change: string | null
  state: "positive" | "negative" | "neutral" | "unknown"
  description: string
}
```

测试禁止 adapter 中出现 `realCpa = cost / conversion`、百分比乘法或 `toFixed()` 业务计算。

**Step 2: 先复制母版源码，后改 import**

- 以 Demo 对应文件为源逐文件复制。
- 第一轮只调整 Next.js/import 边界，不改 JSX 层级和 className。
- 复制官方 Lab token、Geist 字体和 antialiasing；删除会污染母版的裸全局选择器。

**Step 3: 接入明确 demo view model**

- 使用已经格式化的脱敏字符串。
- 页面显示“演示数据”状态，不冒充 API 已接。
- 不把旧纵向切片的 PageShell/MetricGrid/三数据视图合入页面。

**Step 4: 跑工程检查**

```bash
cd apps/web
npm run lint
npx tsc --noEmit
npm run build
```

Expected: PASS；首页可打开，console 无编译错误。

**Step 5: 不提交，先进入老板视觉验收**

此时保持工作树可回退；执行 Task 7。老板未签字不得 commit。

### Task 7: 建立并执行工作台桌面视觉/交互门禁

**Files:**
- Modify: `apps/web/package.json`
- Modify: `apps/web/package-lock.json`
- Create: `apps/web/playwright.config.ts`
- Create: `apps/web/e2e/workbench.visual.spec.ts`
- Create: `apps/web/e2e/workbench.accessibility.spec.ts`
- Create after approval: `apps/web/e2e/__screenshots__/workbench-1440.png`
- Create after approval: `apps/web/e2e/__screenshots__/workbench-1366.png`
- Create: `docs/frontend/reviews/2026-08-25-workbench-visual-gate.md`

**Step 1: 安装并配置 Playwright**

```bash
cd apps/web
npm install -D @playwright/test
```

配置仅启动当前 `apps/web`，不连接旧前端 worktree。

**Step 2: 写失败的视觉/交互测试**

覆盖：

- 1440×900、1366×768。
- `scrollWidth === clientWidth`。
- Sidebar 展开/收起、头像菜单、Tabs、表格分页/交互。
- 键盘 Tab、可见焦点、Escape、焦点回收。
- console error 0；warning 收集并在报告解释。
- `prefers-reduced-motion: reduce` 下功能不丢失。

**Step 3: 启动真实页面并交老板 1V1 验收**

```bash
npm run dev
```

前端主动打开正式工作台。老板逐项提出修改；每批只改一个区域并重跑目标测试。

**Step 4: 老板签字后生成截图基线**

只有收到“通过/这版可以”后更新 snapshots，并在审核报告记录原话、日期、视口和 commit candidate。

**Step 5: Commit 批准的正式视觉**

```bash
git add apps/web docs/frontend/reviews/2026-08-25-workbench-visual-gate.md docs/frontend/takeover/source-import-manifest.json
git commit -m "feat: 以唯一母版落地正式工作台"
```

提交前运行 `git diff --cached --name-only`，确认没有旧页面/其他工作树文件。

### Task 8: 接入 root 首批 Contract，不改变视觉母版

**Files:**
- Create or Modify only after root handoff: `apps/web/lib/contracts/*`
- Create or Modify only after root handoff: `apps/web/lib/data/*`
- Modify: `apps/web/lib/presentation/workbench-view-model.ts`
- Test: `apps/web/lib/presentation/workbench-view-model.test.ts`
- Test: `apps/web/e2e/workbench.states.spec.ts`
- Modify: `docs/frontend/takeover/functional-capability-matrix.md`

**Step 1: 等待 root 批次文件**

必须取得：功能 ID、Contract schema/version、权限边界、八态、mock/fixture、验收条件。缺一项标 `blocked`，不读取旧页面猜测。

当前已收到的 `codex/integration-control@68da060` 只是 AUTH-001、DATA-ROUTE-001 的 Contract 冻结证据；它不等于后端可联调。只有 B23-A 实现 SHA 与 R23-D fixtures 同时到齐，才允许开始本 Task。

**Step 2: 为 Contract 写失败测试**

覆盖 schema 漂移、null/0、partial/stale/no-permission、workspace mismatch 和错误 request ID。

**Step 3: 实现最小 adapter**

adapter 只映射/格式化：

- 使用统一 `Intl.NumberFormat`/`Intl.DateTimeFormat`。
- 不计算 CPA、Gap、达成率和环比。
- 未知值输出 `—` 和明确状态。

**Step 4: 运行八态回归**

```bash
cd apps/web
npm run lint
npx tsc --noEmit
npm run build
npx playwright test e2e/workbench.states.spec.ts
```

Expected: PASS；视觉基线未发生未批准变化。

**Step 5: root 功能验收与提交**

root 签字后更新矩阵 `root_function_signoff`；本批单独 commit，不与视觉修改混合。

```bash
git add apps/web/lib apps/web/e2e/workbench.states.spec.ts docs/frontend/takeover/functional-capability-matrix.md
git commit -m "feat: 接入工作台冻结契约与页面状态"
```

### Task 9: 总门禁与下一页准入

**Files:**
- Create: `scripts/frontend-gate.mjs`
- Create: `scripts/frontend-gate.test.mjs`
- Modify: `docs/frontend/takeover/functional-capability-matrix.md`
- Modify: `docs/plans/工作台账.md`

**Step 1: 建统一只读门禁命令**

门禁按顺序执行：来源 manifest → 功能矩阵 → Demo 母版 → apps/web lint/type/build → Playwright desktop → console/overflow/keyboard/reduced-motion。

**Step 2: 写门禁测试**

断言任一子门失败时进程非 0；输出必须区分自动门、老板视觉签字和 root 功能签字，不能把后两项伪造成自动 PASS。

**Step 3: 运行总门禁**

```bash
node --test scripts/frontend-gate.test.mjs
node scripts/frontend-gate.mjs --scope workbench
```

Expected: 自动项 PASS，签字项显示真实日期/evidence。

**Step 4: 关闭工作台批次**

只有矩阵同时存在：

```json
{
  "boss_visual_signoff": "<date/evidence>",
  "root_function_signoff": "<date/evidence>",
  "implementation_status": "approved"
}
```

才允许把下一页设为 `in-progress`。

**Step 5: Commit 总门禁**

```bash
git add scripts/frontend-gate* docs/frontend/takeover/functional-capability-matrix.md docs/plans/工作台账.md
git commit -m "test: 完成正式前端双签门禁"
```

---

## 计划完成后的执行方式

按老板已经冻结的职责，实施固定在当前任务逐批执行，不另开前端任务、不派子 Agent。第一批只执行 Task 1–7；Task 8 等 root 首批 Contract，Task 9 在工作台老板/root 双签后收口。
