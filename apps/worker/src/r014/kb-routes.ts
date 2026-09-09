import { KbRepository } from "@ka/db";
import type { Pool } from "pg";

import { R014HttpError, guardedRoute, readJsonBody, requireMethod, sendData } from "./http.js";
import type { R014Route } from "./routes.js";

// v1.4 知识库 8.x。表在 migration 019。
// 七条端点齐（v1.9.3 裁决后补上软删与两个反查）。
const DOCUMENT = /^\/api\/v1\/kb\/documents\/([0-9a-fA-F-]{36})$/;
const BACKLINKS = /^\/api\/v1\/kb\/documents\/([0-9a-fA-F-]{36})\/backlinks$/;
const BY_OBJECT = /^\/api\/v1\/kb\/by-object\/([a-z_]{1,32})\/([^/]{1,128})$/;

/** `exactOptionalPropertyTypes` 下「不传」和「传 undefined」不是一回事，所以缺参直接不进对象。 */
function optional(key: string, value: string | null): Record<string, string> {
  return value === null ? {} : { [key]: value };
}

export function createKbRoutes(pool: Pool): R014Route[] {
  const repository = new KbRepository(pool);

  return [
    guardedRoute((pathname) => pathname === "/api/v1/kb/documents", async (context) => {
      const method = requireMethod(context.request, ["GET", "POST"]);
      if (method === "GET") {
        const parentParam = context.url.searchParams.get("parent_id") ?? context.url.searchParams.get("parentId");
        sendData(
          context.response,
          await repository.list(context.auth, {
            // `parent_id=root` 明确要顶层；不传该参数才是「整棵树」。
            ...(parentParam === null ? {} : { parentId: parentParam === "root" ? null : parentParam }),
            ...optional("kind", context.url.searchParams.get("kind")),
            ...optional("visibility", context.url.searchParams.get("visibility")),
            ...optional("q", context.url.searchParams.get("q")),
          }),
          context.requestId, context.maxResponseBytes,
        );
        return;
      }
      const body = await readJsonBody(context.request, 4_194_304) as Record<string, unknown> | undefined;
      if (body === undefined) throw new R014HttpError(400, "INVALID_REQUEST", "a document body is required");
      sendData(
        context.response,
        await repository.create(context.auth, {
          title: String(body.title ?? ""),
          parentId: (body.parentId ?? body.parent_id ?? null) as string | null,
          kind: body.kind as never,
          ...(body.contentJson === undefined && body.content_json === undefined
            ? {} : { contentJson: body.contentJson ?? body.content_json }),
          visibility: body.visibility as never,
        }),
        context.requestId, context.maxResponseBytes,
      );
    }),

    guardedRoute((pathname) => pathname === "/api/v1/kb/search", async (context) => {
      requireMethod(context.request, ["GET"]);
      const query = context.url.searchParams.get("q");
      if (query === null) throw new R014HttpError(400, "INVALID_REQUEST", "q is required");
      const found = await repository.search(
        context.auth, query, context.url.searchParams.get("kind") ?? undefined);
      sendData(
        context.response, { items: found.items }, context.requestId, context.maxResponseBytes,
        // v1.9.8：扩展缺失时如实标出来，别让「搜得不准」看起来像搜索本身不行。
        found.warnings.length === 0 ? {} : { warnings: found.warnings },
      );
    }),

    guardedRoute((pathname) => BACKLINKS.test(pathname), async (context) => {
      requireMethod(context.request, ["GET"]);
      const documentId = BACKLINKS.exec(context.url.pathname)![1]!;
      sendData(context.response, await repository.backlinks(context.auth, documentId),
        context.requestId, context.maxResponseBytes);
    }),

    guardedRoute((pathname) => BY_OBJECT.test(pathname), async (context) => {
      requireMethod(context.request, ["GET"]);
      const [, objectType, objectId] = BY_OBJECT.exec(context.url.pathname)!;
      sendData(
        context.response,
        await repository.byObject(context.auth, objectType!, decodeURIComponent(objectId!)),
        context.requestId, context.maxResponseBytes,
      );
    }),

    guardedRoute((pathname) => DOCUMENT.test(pathname), async (context) => {
      const method = requireMethod(context.request, ["GET", "PATCH", "DELETE"]);
      const documentId = DOCUMENT.exec(context.url.pathname)![1]!;
      if (method === "DELETE") {
        // 软删：置位不删行。返回 deletedAt 让前端能显示「已删除于…」而不是凭空消失。
        sendData(context.response, await repository.softDelete(context.auth, documentId),
          context.requestId, context.maxResponseBytes);
        return;
      }
      if (method === "GET") {
        sendData(context.response, await repository.get(context.auth, documentId),
          context.requestId, context.maxResponseBytes);
        return;
      }
      const body = await readJsonBody(context.request, 4_194_304) as Record<string, unknown> | undefined;
      if (body === undefined) throw new R014HttpError(400, "INVALID_REQUEST", "a patch body is required");
      const patch: Record<string, unknown> = {};
      if (body.title !== undefined) patch.title = body.title;
      if (body.contentJson !== undefined) patch.contentJson = body.contentJson;
      if (body.content_json !== undefined) patch.contentJson = body.content_json;
      if (body.parentId !== undefined) patch.parentId = body.parentId;
      if (body.parent_id !== undefined) patch.parentId = body.parent_id;
      if (body.position !== undefined) patch.position = body.position;
      if (body.tags !== undefined) patch.tags = body.tags;
      if (body.visibility !== undefined) patch.visibility = body.visibility;
      sendData(context.response, await repository.patch(context.auth, documentId, patch as never),
        context.requestId, context.maxResponseBytes);
    }),
  ];
}
