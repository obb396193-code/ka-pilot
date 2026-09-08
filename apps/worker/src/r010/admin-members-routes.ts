import { AdminMembersError } from "@ka/db";
import { adminMembersResponseSchema, adminMemberGrantsResponseSchema, approvedWorkspaceAuthContextSchema } from "@ka/domain";
import type { AdminMembersService } from "../admin/members-service.js";
import { resolveRequestId } from "../data/request-id.js";
import { byteLimit, R010HttpError } from "./http.js";
import type { R010Route } from "./routes.js";
const pattern = /^\/api\/v1\/admin\/members\/([^/]+)\/grants$/;
export function createAdminMembersRoutes(service: Pick<AdminMembersService, "read"> | undefined): R010Route {
  return { matches: path => path === "/api/v1/admin/members" || pattern.test(path),
    async handle({ request, response, url, auth: rawAuth, requestId: suppliedId, maxResponseBytes }) {
      const requestId = resolveRequestId(suppliedId); let status = 200, body: unknown;
      try {
        const auth = approvedWorkspaceAuthContextSchema.safeParse(rawAuth);
        if (!auth.success || auth.data.role !== "admin") throw new R010HttpError(403, "FORBIDDEN");
        if (request.method !== "GET") throw new R010HttpError(405, "INVALID_REQUEST");
        if ([...url.searchParams].length) throw new R010HttpError(400, "INVALID_REQUEST");
        const identityId = pattern.exec(url.pathname)?.[1];
        if (identityId !== undefined && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(identityId)) throw new R010HttpError(400, "INVALID_REQUEST");
        if (!service) throw new R010HttpError(503, "SOURCE_UNAVAILABLE");
        const schema = identityId === undefined ? adminMembersResponseSchema : adminMemberGrantsResponseSchema;
        const parsed = schema.safeParse(await service.read(auth.data, requestId, identityId?.toLowerCase()));
        if (!parsed.success || !parsed.data.ok || parsed.data.meta.requestId !== requestId || parsed.data.meta.workspaceKind !== auth.data.workspaceKind) throw new R010HttpError(502, "UPSTREAM_INVALID_RESPONSE");
        body = parsed.data;
        if (Buffer.byteLength(JSON.stringify(body)) >= byteLimit(maxResponseBytes, 16 * 1024 * 1024)) throw new R010HttpError(502, "SOURCE_TRUNCATED");
      } catch (e) {
        let code = "INTERNAL_ERROR"; status = 500;
        if (e instanceof R010HttpError) { status = e.status; code = e.code; }
        else if (e instanceof AdminMembersError) { code = e.code; status = { FORBIDDEN: 403, INVALID_REQUEST: 400, NOT_FOUND: 404, SOURCE_TRUNCATED: 502, UPSTREAM_INVALID_RESPONSE: 502, SOURCE_UNAVAILABLE: 503, UPSTREAM_TIMEOUT: 504 }[e.code]; }
        body = { ok: false, error: { code, message: "Member request could not be completed", requestId, retryable: false } };
      }
      const json = JSON.stringify(body);
      response.writeHead(status, { "content-type": "application/json; charset=utf-8", "content-length": Buffer.byteLength(json), "cache-control": "no-store", "x-content-type-options": "nosniff", "x-request-id": requestId, ...(status === 405 ? { allow: "GET" } : {}) }); response.end(json);
    },
  };
}
