# 莫蒂用户头像资产 Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 把老板提供的莫蒂头像裁为本地资产，并接入 shadcn 侧栏演示用户。

**Architecture:** 头像作为 Vite `public/avatars` 静态资产供 `AvatarImage` 读取。保持官方 `NavUser` 不变，只修改 `AppSidebar` 的用户数据；现有 `grayscale` 类负责侧栏灰度，Dropdown 内同一图片保持彩色。

**Tech Stack:** macOS `sips`、React 19、Vite public assets、Vitest、Node test、Playwright CLI。

**Execution adjustment:** built-in imagegen 连续两次在输出阶段拒绝莫蒂本人图片。老板随后直接提供头像图，因此改为裁切该用户输入，不绕过生成安全系统。

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
    new URL(
      "../public/avatars/morty-account-user-provided.png",
      import.meta.url,
    ),
  ),
);
assert.match(
  appSidebar,
  /avatar: "\/avatars\/morty-account-user-provided\.png"/,
);
```

**Step 2: Run test to verify it fails**

Run: `npm run test:node`

Expected: FAIL，因为头像尚未存在，用户数据也尚未指向它。

### Task 2: 裁切用户提供头像

**Files:**

- Create: `apps/ui-layout-demo/public/avatars/morty-account-user-provided.png`

**Step 1: Inspect source image**

用 `view_image` 和 `sips -g pixelWidth -g pixelHeight` 确认头像在用户提供图中的边界。

**Step 2: Crop the avatar**

用 `sips --cropToHeightWidth 64 64 --cropOffset 16 16` 裁出 64×64 PNG，不修改内容。

**Step 3: Inspect the output**

用 `view_image` 和 `sips` 检查 64×64、PNG 格式和小尺寸可识别性。

### Task 3: 接入默认头像并终验

**Files:**

- Modify: `apps/ui-layout-demo/src/sidebar/shadcn-dashboard/app-sidebar.tsx`
- Modify: `apps/ui-layout-demo/scripts/entry-isolation.test.mjs`
- Modify: `docs/plans/工作台账.md`

**Step 1: Implement the minimal data change**

```ts
avatar: "/avatars/morty-account-user-provided.png",
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
