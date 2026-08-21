import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const sidebarHtml = readFileSync(
  new URL("../sidebar.html", import.meta.url),
  "utf8",
);
const topbarHtml = readFileSync(
  new URL("../topbar.html", import.meta.url),
  "utf8",
);
const appSidebar = readFileSync(
  new URL("../src/sidebar/shadcn-dashboard/app-sidebar.tsx", import.meta.url),
  "utf8",
);
const topbarShell = readFileSync(
  new URL("../src/topbar/topbar-shell.tsx", import.meta.url),
  "utf8",
);
const topbarMainNav = readFileSync(
  new URL("../src/topbar/shadcn-dashboard/main-nav.tsx", import.meta.url),
  "utf8",
);
const topbarUserNav = readFileSync(
  new URL("../src/topbar/shadcn-dashboard/user-nav.tsx", import.meta.url),
  "utf8",
);

test("layout entries are separate and expose no cross-layout switch", () => {
  assert.doesNotMatch(sidebarHtml, /topbar\.html|切换到顶栏|顶栏版/);
  assert.doesNotMatch(topbarHtml, /sidebar\.html|切换到侧栏|侧栏版/);
  assert.match(sidebarHtml, /src\/sidebar\/main\.tsx/);
  assert.match(topbarHtml, /src\/topbar\/main\.tsx/);
});

test("uses the exact local shadcn official account avatar", () => {
  const avatar = new URL(
    "../public/avatars/shadcn-morty-official.jpg",
    import.meta.url,
  );

  assert.ok(existsSync(avatar));
  assert.match(appSidebar, /avatar: "\/avatars\/shadcn-morty-official\.jpg"/);
});

test("keeps the latest account display name across both layout demos", () => {
  assert.match(appSidebar, /title: "账户池"/);
  assert.match(topbarMainNav, /"账户池"/);
  assert.match(topbarUserNav, /avatar(s)?\/shadcn-morty-official\.jpg/);
  assert.doesNotMatch(appSidebar, /账户资源|团队协作/);
});

test("topbar uses the complete shadcn page instead of the old shared shell", () => {
  assert.doesNotMatch(
    topbarShell,
    /DashboardContent|shared\/dashboard-content/,
  );
  assert.doesNotMatch(
    topbarShell,
    /DesktopProductNav|MobileProductNav|topbar-primary|topbar-secondary/,
  );
});
