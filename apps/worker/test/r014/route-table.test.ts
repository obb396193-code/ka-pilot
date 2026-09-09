import { describe, expect, it } from "vitest";
import type { Pool } from "pg";

import { findR014Route, registerR014Routes } from "../../src/r014/routes.js";
import { createMeRoutes } from "../../src/r014/me-routes.js";
import { createAccountRoutes } from "../../src/r014/account-routes.js";
import { createTaskRoutes } from "../../src/r014/task-routes.js";
import { createWorkspaceRoutes } from "../../src/r014/workspace-routes.js";
import { createNamingRoutes } from "../../src/r014/naming-routes.js";
import { createTaskDetailRoutes } from "../../src/r014/task-detail-routes.js";
import { createDailyReportRoutes } from "../../src/r014/daily-report-routes.js";
import { createTransferRoutes } from "../../src/r014/transfer-routes.js";
import { createKbRoutes } from "../../src/r014/kb-routes.js";
import { createPasswordRoutes } from "../../src/r014/password-routes.js";

/**
 * `findR014Route` 是**首个匹配胜出**。两条路由都认同一个路径时，后注册的那条
 * 永远调不到 —— 端点看着接好了，实际是死的，而且单测各跑各的谁也发现不了。
 * 这里把整张表按 data-api.ts 的真实注册顺序装一遍，逐条路径断言「恰好一个认领」。
 */
const pool = null as unknown as Pool; // 只问 matches，不发查询。

const ALL_ROUTES = [
  ...createMeRoutes(pool), ...createAccountRoutes(pool), ...createTaskRoutes(pool),
  ...createWorkspaceRoutes(pool), ...createNamingRoutes(pool),
  ...createTaskDetailRoutes(pool), ...createDailyReportRoutes(pool),
  ...createTransferRoutes(pool), ...createKbRoutes(pool),
  ...createPasswordRoutes(pool, { envCredentialFor: () => null }),
];

const UUID = "00000000-0000-4000-8000-000000000001";

const PATHS = [
  "/api/v1/me/counts", "/api/v1/me/workload", "/api/v1/me/preferences",
  "/api/v1/me/watchlist", "/api/v1/me/views",
  "/api/v1/accounts/pipeline", "/api/v1/accounts/transfer",
  `/api/v1/users/${UUID}/transfer-all`,
  "/api/v1/reports/daily", "/api/v1/auth/password",
  "/api/v1/kb/documents", "/api/v1/kb/search",
  `/api/v1/kb/documents/${UUID}`, `/api/v1/kb/documents/${UUID}/backlinks`,
  "/api/v1/kb/by-object/task/1803240580",
  "/api/v1/admin/naming-rules", "/api/v1/admin/naming-rules/test",
  "/api/v1/admin/account-names", "/api/v1/admin/account-names/confirm",
  "/api/v1/tasks/1803240580",
];

describe("the R-014 route table has no shadowed endpoint", () => {
  it("gives every endpoint exactly one owner", () => {
    for (const path of PATHS) {
      const owners = ALL_ROUTES.filter((route) => route.matches(path));
      // 0 = 忘了注册（端点 404）；>1 = 被遮挡（后一条永远轮不到）。
      expect(owners.length, `${path} 的认领数`).toBe(1);
    }
  });

  it("resolves each endpoint through the real registry too", () => {
    registerR014Routes(ALL_ROUTES);
    for (const path of PATHS) expect(findR014Route(path), path).not.toBeNull();
    // 不属于任何人的路径必须落空，别被某条过宽的正则顺手吃掉。
    for (const stray of [
      "/api/v1/kb", "/api/v1/kb/documents/not-a-uuid", "/api/v1/users/not-a-uuid/transfer-all",
      "/api/v1/kb/by-object/task", "/api/v1/reports", "/api/v1/auth/passwordx",
    ]) {
      expect(findR014Route(stray), stray).toBeNull();
    }
  });
});
