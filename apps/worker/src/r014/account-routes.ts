import { AccountPipelineRepository } from "@ka/db";
import type { Pool } from "pg";

import { R014HttpError, guardedRoute, readJsonBody, requireMethod, sendData } from "./http.js";
import type { R014Route } from "./routes.js";

// v1.5.1 ① 账户池：管道分布 + 人工置态 / 清除覆盖。
// 三键形态固定 `:media/:id`（v1.5「旧 /accounts/:id 形态作废」）。
const POOL_STATUS = /^\/api\/v1\/accounts\/([A-Z0-9_]{1,32})\/([A-Za-z0-9_-]{1,128})\/pool-status$/;

export function createAccountRoutes(pool: Pool): R014Route[] {
  const pipelines = new AccountPipelineRepository(pool);

  return [
    guardedRoute((pathname) => pathname === "/api/v1/accounts/pipeline", async (context) => {
      requireMethod(context.request, ["GET"]);
      const media = context.url.searchParams.get("media");
      sendData(
        context.response,
        await pipelines.pipeline(context.auth, media ?? undefined),
        context.requestId, context.maxResponseBytes,
      );
    }),

    guardedRoute((pathname) => POOL_STATUS.test(pathname), async (context) => {
      const method = requireMethod(context.request, ["PATCH", "DELETE"]);
      const [, media, accountId] = POOL_STATUS.exec(context.url.pathname)!;
      if (method === "DELETE") {
        sendData(
          context.response,
          await pipelines.clearPoolStatusOverride(context.auth, media!, accountId!),
          context.requestId, context.maxResponseBytes,
        );
        return;
      }
      const body = await readJsonBody(context.request, 16_384) as { pool_status?: unknown } | undefined;
      const poolStatus = body?.pool_status;
      if (typeof poolStatus !== "string") {
        throw new R014HttpError(400, "INVALID_REQUEST", "pool_status must be a string");
      }
      sendData(
        context.response,
        await pipelines.overridePoolStatus(context.auth, media!, accountId!, poolStatus),
        context.requestId, context.maxResponseBytes,
      );
    }),
  ];
}
