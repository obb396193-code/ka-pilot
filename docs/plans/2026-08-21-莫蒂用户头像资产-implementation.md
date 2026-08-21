# 莫蒂用户头像资产 Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 把 shadcn 官方 `dashboard-01` 使用的莫蒂账号头像原图保存为本地资产，并接入侧栏演示用户。

**Architecture:** 头像作为 Vite `public/avatars` 静态资产供 `AvatarImage` 读取。保持官方 `NavUser` 不变，只修改 `AppSidebar` 的用户数据；现有 `grayscale` 类负责侧栏灰度，Dropdown 内同一图片保持彩色。

**Tech Stack:** macOS `sips`、React 19、Vite public assets、Vitest、Node test、Playwright CLI。

**Execution adjustment:** built-in imagegen 连续两次在输出阶段拒绝莫蒂本人图片。老板随后提供参考截图，但首轮截图裁切不准确；最终按老板指定，使用 Playwright 读取 `https://www.shadcn.com.cn/view/new-york-v4/dashboard-01` 中 `img[alt="shadcn"]` 的 `currentSrc`，得到 `https://www.shadcn.com.cn/avatars/shadcn.jpg`，直接保存 400×400 官方 JPEG，不再裁切截图。

---

### Task 1: 锁定头像资产契约

**Files:**

- Modify: `apps/ui-layout-demo/scripts/entry-isolation.test.mjs`
- Test: `apps/ui-layout-demo/scripts/entry-isolation.test.mjs`

**Step 1: Write the failing test**

增加断言：

```js
assert.ok(
  existsSync(
    new URL("../public/avatars/shadcn-morty-official.jpg", import.meta.url),
  ),
);
assert.match(appSidebar, /avatar: "\/avatars\/shadcn-morty-official\.jpg"/);
```

**Step 2: Run test to verify it fails**

Run: `npm run test:node`

Expected: FAIL，因为头像尚未存在，用户数据也尚未指向它。

### Task 2: 下载并核验官方头像原图

**Files:**

- Create: `apps/ui-layout-demo/public/avatars/shadcn-morty-official.jpg`

**Step 1: Inspect the official image element**

用 Playwright 读取官网 `img[alt="shadcn"]` 的 `src/currentSrc/naturalWidth/naturalHeight`。

**Step 2: Download the exact source**

直接下载 `https://www.shadcn.com.cn/avatars/shadcn.jpg`，不做裁切或重编码。

**Step 3: Inspect the output**

用 `view_image`、`sips` 和 SHA-256 检查 400×400 JPEG、小尺寸可识别性与文件稳定性。

### Task 3: 接入默认头像并终验

**Files:**

- Modify: `apps/ui-layout-demo/src/sidebar/shadcn-dashboard/app-sidebar.tsx`
- Modify: `apps/ui-layout-demo/scripts/entry-isolation.test.mjs`
- Modify: `docs/plans/工作台账.md`

**Step 1: Implement the minimal data change**

```ts
avatar: "/avatars/shadcn-morty-official.jpg",
```

**Step 2: Run automated tests**

Run:

```bash
npm run format:check
npm run typecheck
npm test -- --run
npm run test:node
npm run build
npm audit --audit-level=high
```

Expected: 全部通过，audit 为 0 vulnerabilities。

**Step 3: Run browser verification**

在 1440×900 下验证：

- 侧栏底部为 32px 灰度莫蒂头像。
- 点击账号后，Dropdown 内正常显示同一用户提供头像。
- Footer 和 Dropdown 几何尺寸不变。
- console error/warning 为 0，头像请求 200。

**Step 4: Commit**

```bash
git add apps/ui-layout-demo docs/plans/2026-08-21-莫蒂用户头像资产-implementation.md
git commit -m "前端Demo接入莫蒂用户头像"
```
