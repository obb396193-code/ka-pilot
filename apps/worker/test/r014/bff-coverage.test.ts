import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * 后端每条 R-014 路由都必须在 BFF 有对应透传，否则**浏览器侧根本够不着**——
 * 端点看着接好了、联调也能用内部 token 打通，但前端页面接不上。
 * 这正是 Q-029 的缺口（kb 七条 / 交接 / 改密 / 日报全没透传），当时是我肉眼发现的；
 * 靠人看下次照样会漏，所以立成绊线。
 *
 * 比对方式：两边都把路径参数抹成 `:p`。后端 `([0-9a-fA-F-]{36})` 与
 * BFF `${encodeURIComponent(id)}` 抹平后必须逐条对上。
 */
const BACKEND = new URL("../../src/r014/", import.meta.url);
const HANDLERS = new URL("../../../../apps/web/lib/data/r014/handlers.ts", import.meta.url);

/** 有意只留后端、不给浏览器用的路径，必须写在这里并说明理由。 */
const BACKEND_ONLY: { path: string; why: string }[] = [];

/**
 * 由别的路由表（r010，Codex）服务、但透传写在 r014/handlers.ts 里的路径：本绊线只扫 r014 的
 * 路由文件，扫不到它们，反向检查会把它们误报成「后端不存在」。登记时写清由谁服务；
 * r010 侧的同类绊线是 P-190。
 */
const SERVED_ELSEWHERE: { path: string; by: string }[] = [
  { path: "/api/v1/admin/members", by: "r010 admin-members-routes（GET 已有；POST 开户 = Codex F-OS-004）" },
  { path: "/api/v1/admin/members/:p/reset-password", by: "r010 admin-members-routes（Codex F-OS-004）" },
  { path: "/api/v1/system/etl-runs", by: "r010 etl-run-list-route（Codex）；BFF 由 fe F8-15 ① 放在 r014/handlers.ts" },
  { path: "/api/v1/admin/data/reconcile", by: "r010 data/http-server reconcile（Codex）；BFF 由 fe F8-15 ② 放在 r014/handlers.ts" },
  { path: "/api/v1/system/etl-runs/:p/rerun", by: "r010 etl-run rerun（Codex P-196）；BFF 由 fe F8-15 ⑦ 放在 r014/handlers.ts" },
];

const normalize = (path: string): string => path
  .replace(/\$\{[^}]*\}/g, ":p")            // BFF 的模板插值
  // 先去掉零宽断言（如 `(?!batch-save$)`）：它不吃字符，不该变成一段路径。
  // 留着的话 `/tasks/(?!batch-save$)([^/]{1,128})` 会被抹成 `/tasks/:p:p`，
  // 于是这条路由看着像「BFF 没透传」——假红比漏报还费时间。
  .replace(/\(\?[!=][^)]*\)/g, "")
  .replace(/\([^)]*\)(\{[^}]*\})?/g, ":p")  // 后端正则里的捕获组
  .replace(/\\\//g, "/")
  .replace(/^\/?/, "/")
  .replace(/\$$/, "");

function backendPaths(): string[] {
  const found = new Set<string>();
  for (const name of readdirSync(BACKEND)) {
    if (!name.endsWith("-routes.ts")) continue;
    const source = readFileSync(new URL(name, BACKEND), "utf8");
    for (const literal of source.matchAll(/"(\/api\/v1\/[^"]*)"/g)) found.add(normalize(literal[1]!));
    for (const pattern of source.matchAll(/\/\^(\\\/api\\\/v1[^;]*?)\$\//g)) found.add(normalize(pattern[1]!));
  }
  return [...found].sort();
}

function bffPaths(): string[] {
  const source = readFileSync(HANDLERS, "utf8");
  return [...source.matchAll(/path: [`"]([^`"]*)[`"]/g)].map((match) => normalize(match[1]!)).sort();
}

describe("every backend R-014 route is reachable from the browser", () => {
  it("has a BFF passthrough for each backend path", () => {
    const backend = backendPaths();
    const bff = new Set(bffPaths());
    const exempt = new Set(BACKEND_ONLY.map((entry) => normalize(entry.path)));
    // 扫不到东西时这条测试会变成永远绿，所以先守住「确实扫到了」。
    expect(backend.length).toBeGreaterThan(15);
    const missing = backend.filter((path) => !bff.has(path) && !exempt.has(path));
    expect(missing, "这些后端路由浏览器侧够不着；补 BFF 透传或登记进 BACKEND_ONLY 并写明理由").toEqual([]);
  });

  it("has no BFF passthrough pointing at a path no backend route claims", () => {
    const backend = new Set(backendPaths());
    // 反向：BFF 指着一个后端不存在的路径，调用方会拿到 404 却以为是数据没有。
    const elsewhere = new Set(SERVED_ELSEWHERE.map((entry) => normalize(entry.path)));
    const orphan = bffPaths().filter((path) => !backend.has(path) && !elsewhere.has(path));
    expect(orphan, "这些透传指向的后端路径不存在").toEqual([]);
  });
});
