import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { Pool } from "pg";

import { findR014Route, registerR014Routes } from "../../src/r014/routes.js";
import { createMeRoutes } from "../../src/r014/me-routes.js";
import { createAccountRoutes } from "../../src/r014/account-routes.js";
import { createTaskRoutes } from "../../src/r014/task-routes.js";
import { createWorkspaceRoutes } from "../../src/r014/workspace-routes.js";
import { createNamingRoutes } from "../../src/r014/naming-routes.js";
import { createTaskDetailRoutes } from "../../src/r014/task-detail-routes.js";
import { createTaskTabRoutes } from "../../src/r014/task-tab-routes.js";
import { createDailyReportRoutes } from "../../src/r014/daily-report-routes.js";
import { createTransferRoutes } from "../../src/r014/transfer-routes.js";
import { createKbRoutes } from "../../src/r014/kb-routes.js";
import { createPasswordRoutes } from "../../src/r014/password-routes.js";
import { callRoute } from "./fake-http.js";

/**
 * v1.9.17（老板拍板）：**前端不再藏写入口**——访客界面与正常用户完全一样，
 * 所有写按钮照常可点。于是后端的 `READ_ONLY_ROLE` 成了唯一的闸：
 * viewer 打任何一条写路由都必须 403，漏一条就是访客能改真数据。
 *
 * 清单**从路由源码扫出来**，不手写。手写清单的问题是新加端点时没人记得回来补，
 * 而这条闸恰恰是「漏一条就出事」的那种。
 */
const pool = null as unknown as Pool; // 只验拦截，请求进不到仓储。

const ALL_ROUTES = [
  ...createMeRoutes(pool), ...createAccountRoutes(pool), ...createTaskRoutes(pool),
  ...createWorkspaceRoutes(pool), ...createNamingRoutes(pool),
  ...createTaskDetailRoutes(pool), ...createTaskTabRoutes(pool), ...createDailyReportRoutes(pool),
  ...createTransferRoutes(pool), ...createKbRoutes(pool),
  ...createPasswordRoutes(pool, { envCredentialFor: () => null }),
];

const UUID = "00000000-0000-4000-8000-000000000001";
const SOURCE = new URL("../../src/r014/", import.meta.url);

/** 从路由源码里扫出所有声明过写方法的路径样本。 */
function writePathSamples(): { path: string; method: string }[] {
  const samples = new Map<string, Set<string>>();
  const record = (path: string, methods: string[]): void => {
    const usable = methods.filter((method) => !["GET", "HEAD", "OPTIONS"].includes(method));
    if (usable.length === 0) return;
    const existing = samples.get(path) ?? new Set<string>();
    for (const method of usable) existing.add(method);
    samples.set(path, existing);
  };

  for (const name of readdirSync(SOURCE)) {
    if (!name.endsWith("-routes.ts")) continue;
    const source = readFileSync(new URL(name, SOURCE), "utf8");
    // 每个 guardedRoute 块：取它匹配的路径（字面量或正则）与它 requireMethod 允许的方法。
    for (const block of source.split("guardedRoute(").slice(1)) {
      const methods = [...block.matchAll(/requireMethod\(context\.request, \[([^\]]*)\]\)/g)]
        .flatMap((match) => [...match[1]!.matchAll(/"([A-Z]+)"/g)].map((verb) => verb[1]!));
      if (methods.length === 0) continue;
      const literal = block.match(/pathname === "([^"]+)"/);
      if (literal !== null) { record(literal[1]!, methods); continue; }
      const named = block.match(/\(pathname\) => ([A-Z_]+)\.test\(pathname\)/);
      if (named === null) continue;
      const pattern = source.match(new RegExp(`const ${named[1]!} = /\\^([^;]+)\\$/`));
      if (pattern === null) continue;
      // 正则 → 一个能匹配的具体路径样本。
      const path = pattern[1]!
        // 零宽断言不吃字符（`(?!batch-save$)`）：先去掉，再按捕获组造样本路径。
        .replace(/\(\?[!=][^)]*\)/g, "")
        .replace(/\\\//g, "/")
        .replace(/\(\[0-9a-fA-F-\]\{36\}\)/g, UUID)
        .replace(/\(\[A-Z0-9_\]\{1,32\}\)/g, "KUAISHOU")
        .replace(/\(\[A-Za-z0-9_-\]\{1,128\}\)/g, "account-1")
        .replace(/\(\[a-z_\]\{1,32\}\)/g, "task")
        .replace(/\(\[\^\/\]\{1,128\}\)/g, "task-1")
        .replace(/\(\[a-z_\]\{1,32\}\)/g, "accounts")
        .replace(/\((materials\|review)\)/g, "materials");
      // ★这里**不能**「抹不净就跳过」——漏报一条就是访客能写那一条。抹不净直接抛，
      //   逼着加路由的人把样本规则补上。
      if (path.includes("(") || path.includes("[") || path.includes("\\")) {
        throw new Error(`路由样本没抹净，补一条替换规则再跑：${pattern[1]!}`);
      }
      record(path, methods);
    }
  }
  return [...samples].flatMap(([path, methods]) => [...methods].map((method) => ({ path, method })));
}

describe("v1.9.17 a viewer cannot write anywhere in R-014", () => {
  const viewer = {
    workspaceId: UUID, userId: UUID, role: "viewer", workspaceKind: "team",
    scope: { kind: "team_workspace_readonly" },
  };

  it("scans real write routes rather than trusting a hand-written list", () => {
    const samples = writePathSamples();
    // 扫不到东西时这条闸会变成永远绿——先守住「确实扫到了」。
    expect(samples.length).toBeGreaterThan(10);
    expect(samples.some((sample) => sample.path.includes("/kb/documents"))).toBe(true);
    expect(samples.some((sample) => sample.path.includes("/accounts/transfer"))).toBe(true);
    expect(samples.some((sample) => sample.path.includes("/auth/password"))).toBe(true);
    // readiness 是双参数路径，最容易在样本抹净时漏掉——它漏了就等于访客能改就绪度。
    expect(samples.some((sample) => sample.path.includes("/readiness/"))).toBe(true);
  });

  it("answers 403 READ_ONLY_ROLE on every write route it found", async () => {
    registerR014Routes(ALL_ROUTES);
    const leaked: string[] = [];
    for (const { path, method } of writePathSamples()) {
      expect(findR014Route(path), `${method} ${path} 没有路由认领，样本抽错了`).not.toBeNull();
      const result = await callRoute(viewer, path, method, {});
      if (result.status !== 403
        || (result.body as { error?: { code?: string } }).error?.code !== "READ_ONLY_ROLE") {
        leaked.push(`${method} ${path} → ${result.status} ${
          JSON.stringify((result.body as { error?: { code?: string } }).error?.code)}`);
      }
    }
    // 前端不再藏写入口，这里漏一条就是访客能改真数据。
    expect(leaked, "这些写路由没被 READ_ONLY_ROLE 拦住").toEqual([]);
  });

  it("★documents that the shell guard runs first and which POSTs it deliberately lets through", () => {
    // 我这条闸只扫 `src/r014/*-routes.ts`，而 v1.9.17 之后**壳层还有一道更靠前的拦截**
    // （`data/http-server.ts`，在 body 解析和所有业务 handler 之前就拦掉 viewer 的写方法）。
    // 壳层那道有三个「POST 其实是读」的例外——data-query / semantic-query / admin-reconcile：
    // 它们用 POST 只是为了传复杂查询参数，不是写。
    //
    // 把这层关系钉在这里的理由：那三条例外**不在我的扫描范围内**，
    // 万一有人往例外名单里加一条真正的写端点，我这边扫不到、壳层又放行，
    // 就是访客能写。下面断言例外名单恰好是那三条已知的读查询。
    const shell = readFileSync(new URL("../../src/data/http-server.ts", import.meta.url), "utf8");
    const exception = shell.match(/const isReadQueryPost = [^;]*;/s);
    expect(exception, "壳层的 viewer 例外判断不见了，先确认拦截是否还在").not.toBeNull();
    const names = [...exception![0].matchAll(/([A-Z_]+_HTTP_PATH)/g)].map((match) => match[1]!);
    expect(new Set(names)).toEqual(new Set([
      "DATA_QUERY_HTTP_PATH", "SEMANTIC_QUERY_HTTP_PATH", "ADMIN_RECONCILE_HTTP_PATH",
    ]));
    // 壳层拦截本身也得在：它没了的话，我这条闸只覆盖 r014，r010 的写端点就裸奔。
    expect(shell).toContain('role === "viewer"');
    expect(shell).toContain("READ_ONLY_ROLE");
  });
});
