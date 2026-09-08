import { TaskBindingsRepository, TaskReadinessRepository } from "@ka/db";
import type { Pool } from "pg";

import { R014HttpError, guardedRoute, readJsonBody, requireMethod, sendData } from "./http.js";
import type { R014Route } from "./routes.js";

// v1.7.3 绑定 + v1.5.1 ② 就绪度人工勾。
const BINDINGS = /^\/api\/v1\/tasks\/([^/]{1,128})\/bindings$/;
const READINESS = /^\/api\/v1\/tasks\/([^/]{1,128})\/readiness\/([a-z_]{1,32})$/;

export function createTaskRoutes(pool: Pool): R014Route[] {
  const bindings = new TaskBindingsRepository(pool);
  const readiness = new TaskReadinessRepository(pool);

  return [
    guardedRoute((pathname) => BINDINGS.test(pathname), async (context) => {
      requireMethod(context.request, ["GET"]);
      const taskId = decodeURIComponent(BINDINGS.exec(context.url.pathname)![1]!);
      sendData(context.response, await bindings.bindings(context.auth, taskId), context.requestId, context.maxResponseBytes);
    }),

    guardedRoute((pathname) => READINESS.test(pathname), async (context) => {
      requireMethod(context.request, ["PUT"]);
      const [, rawTaskId, dimension] = READINESS.exec(context.url.pathname)!;
      const body = await readJsonBody(context.request, 16_384) as { ready?: unknown; note?: unknown } | undefined;
      if (typeof body?.ready !== "boolean") {
        throw new R014HttpError(400, "INVALID_REQUEST", "ready must be a boolean");
      }
      const note = body.note === undefined || body.note === null ? null : body.note;
      if (note !== null && typeof note !== "string") {
        throw new R014HttpError(400, "INVALID_REQUEST", "note must be a string when present");
      }
      sendData(
        context.response,
        await readiness.put(context.auth, decodeURIComponent(rawTaskId!), dimension!, body.ready, note),
        context.requestId, context.maxResponseBytes,
      );
    }),
  ];
}
