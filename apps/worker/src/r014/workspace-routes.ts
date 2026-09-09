import { CapabilityRepository, DecisionPolicyRepository, ExportRepository, SearchRepository } from "@ka/db";
import { orderSearchItems } from "@ka/domain";
import type { Pool } from "pg";

import { R014HttpError, guardedRoute, readJsonBody, requireMethod, sendData } from "./http.js";
import type { R014Route } from "./routes.js";

// v1.5 5.7 能力注册表 / 10.11 分级决策策略 / 7.4 导出 + v1.7.4 G6 搜索。
const EXPORT_ID = /^\/api\/v1\/exports\/([0-9a-fA-F-]{36})$/;

export function createWorkspaceRoutes(pool: Pool): R014Route[] {
  const capabilities = new CapabilityRepository(pool);
  const policies = new DecisionPolicyRepository(pool);
  const exports_ = new ExportRepository(pool);
  const search = new SearchRepository(pool);

  return [
    guardedRoute((pathname) => pathname === "/api/v1/capabilities", async (context) => {
      requireMethod(context.request, ["GET"]);
      const category = context.url.searchParams.get("category");
      sendData(
        context.response,
        { items: await capabilities.list(context.auth, category ?? undefined) },
        context.requestId, context.maxResponseBytes,
      );
    }),

    guardedRoute((pathname) => pathname === "/api/v1/settings/decision-policy", async (context) => {
      const method = requireMethod(context.request, ["GET", "PUT"]);
      if (method === "GET") {
        sendData(context.response, await policies.get(context.auth), context.requestId, context.maxResponseBytes);
        return;
      }
      const body = await readJsonBody(context.request, 16_384) as { policy?: unknown } | undefined;
      // PUT 的入参是 {policy:{...}}（fixture settings/decision-policy.json 即此形），不是裸阈值对象。
      if (body?.policy === undefined) throw new R014HttpError(400, "INVALID_REQUEST", "policy is required");
      sendData(
        context.response,
        await policies.put(context.auth, body.policy as never),
        context.requestId, context.maxResponseBytes,
      );
    }),

    guardedRoute((pathname) => pathname === "/api/v1/export", async (context) => {
      requireMethod(context.request, ["POST"]);
      const body = await readJsonBody(context.request, 262_144);
      sendData(context.response, await exports_.create(context.auth, body as never), context.requestId, context.maxResponseBytes);
    }),

    guardedRoute((pathname) => EXPORT_ID.test(pathname), async (context) => {
      requireMethod(context.request, ["GET"]);
      const id = EXPORT_ID.exec(context.url.pathname)![1]!;
      const record = await exports_.get(context.auth, id);
      // 签名过期不给死链接：文件字段清空，让前端知道要重新导出（api.md 7.4「过期 410」）。
      if (record.fileExpired) {
        throw new R014HttpError(410, "NOT_FOUND", "The exported file link has expired");
      }
      sendData(context.response, record, context.requestId, context.maxResponseBytes);
    }),

    guardedRoute((pathname) => pathname === "/api/v1/search", async (context) => {
      requireMethod(context.request, ["GET"]);
      const outcome = await search.search(
        context.auth,
        context.url.searchParams.get("q"),
        context.url.searchParams.get("type") ?? undefined,
      );
      sendData(
        context.response,
        { items: orderSearchItems(outcome.items) },
        context.requestId, context.maxResponseBytes,
        // 还没有表的类型如实报出来，前端才知道「材料没搜到」和「材料还搜不了」的区别。
        outcome.unavailable.length > 0 ? { unavailableTypes: outcome.unavailable } : {},
      );
    }),
  ];
}
