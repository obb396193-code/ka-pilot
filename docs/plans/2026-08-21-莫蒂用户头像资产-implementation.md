# 莫蒂用户头像资产 Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 为 shadcn 侧栏演示用户生成三张本地莫蒂头像，并默认接入耳机工作版。

**Architecture:** 头像作为 Vite `public/avatars` 静态资产供 `AvatarImage` 读取。保持官方 `NavUser` 不变，只修改 `AppSidebar` 的用户数据；现有 `grayscale` 类负责侧栏灰度，Dropdown 内同一图片保持彩色。

**Tech Stack:** built-in imagegen、React 19、Vite public assets、Vitest、Node test、Playwright CLI。

---

### Task 1: 锁定头像资产契约

**Files:**

- Modify: `apps/ui-layout-demo/scripts/entries.test.mjs`
- Test: `apps/ui-layout-demo/scripts/entries.test.mjs`

**Step 1: Write the failing test**

增加断言：

```js
const avatarNames = [
  "morty-account-headset.png",
  "morty-account-worried.png",
  "morty-account-smile.png",
];

for (const name of avatarNames) {
  assert.ok(existsSync(new URL(`../public/avatars/${name}`, import.meta.url)));
}

assert.match(appSidebar, /avatar: "\/avatars\/morty-account-headset\.png"/);
```

**Step 2: Run test to verify it fails**

Run: `npm run test:node`

Expected: FAIL，因为三张头像尚未存在。

### Task 2: 生成三张头像

**Files:**

- Create: `apps/ui-layout-demo/public/avatars/morty-account-headset.png`
- Create: `apps/ui-layout-demo/public/avatars/morty-account-worried.png`
- Create: `apps/ui-layout-demo/public/avatars/morty-account-smile.png`

**Step 1: Generate headset variant**

使用 built-in imagegen 生成方形大头近景，莫蒂戴工作耳机，鲜明简洁背景，无文字、无水印。

**Step 2: Generate worried variant**

使用相同构图生成莫蒂经典紧张表情，轮廓与色彩对比适合 32px。

**Step 3: Generate smiling variant**

使用相同构图生成莫蒂轻松微笑表情，不增加其他人物。

**Step 4: Inspect all outputs**

用 `view_image` 检查角色、方形构图、无文字/水印和小尺寸可识别性，再复制到项目目录。

### Task 3: 接入默认头像并终验

**Files:**

- Modify: `apps/ui-layout-demo/src/sidebar/shadcn-dashboard/app-sidebar.tsx`
- Modify: `apps/ui-layout-demo/scripts/entries.test.mjs`
- Modify: `docs/plans/工作台账.md`

**Step 1: Implement the minimal data change**

```ts
avatar: "/avatars/morty-account-headset.png",
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
- 点击账号后，Dropdown 内是彩色同款头像。
- Footer 和 Dropdown 几何尺寸不变。
- console error/warning 为 0，头像请求 200。

**Step 4: Commit**

```bash
git add apps/ui-layout-demo docs/plans/2026-08-21-莫蒂用户头像资产-implementation.md
git commit -m "前端Demo接入莫蒂用户头像"
```
