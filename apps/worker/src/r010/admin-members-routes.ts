import { AdminMembersError, AdminMemberProvisioningError } from "@ka/db";
import { adminMembersV195ResponseSchema, adminMemberCreatedResponseSchema, adminMemberResetPasswordResponseSchema,
  adminMemberResetPasswordRequestSchema, adminMemberCreateRequestSchema, adminMemberGrantsResponseSchema, approvedWorkspaceAuthContextSchema } from "@ka/domain";
import type { AdminMembersService } from "../admin/members-service.js";
import { resolveRequestId } from "../data/request-id.js";
import { byteLimit, readJson, R010HttpError } from "./http.js";
import type { R010Route } from "./routes.js";
const pattern = /^\/api\/v1\/admin\/members\/([^/]+)\/grants$/;
const resetPattern = /^\/api\/v1\/admin\/members\/([^/]+)\/reset-password$/;
export function createAdminMembersRoutes(service: Pick<AdminMembersService, "read" | "create" | "resetPassword"> | undefined): R010Route {
  return { matches: path => path === "/api/v1/admin/members" || pattern.test(path) || resetPattern.test(path),
    async handle({ request, response, url, auth: rawAuth, requestId: suppliedId, maxResponseBytes, maxRequestBytes }) {
      const requestId = resolveRequestId(suppliedId); let status = 200, body: unknown;
      const reset = resetPattern.test(url.pathname), grants = pattern.test(url.pathname), allow = reset ? "POST" : grants ? "GET" : "GET, POST";
      try {
        const auth = approvedWorkspaceAuthContextSchema.safeParse(rawAuth);
        if (!auth.success || auth.data.role === "viewer" || (grants && auth.data.role !== "admin")) throw new R010HttpError(403, "FORBIDDEN");
        if (!allow.split(", ").includes(request.method ?? "")) throw new R010HttpError(405, "INVALID_REQUEST");
        if ([...url.searchParams].length) throw new R010HttpError(400, "INVALID_REQUEST");
        const identityId = (reset ? resetPattern : pattern).exec(url.pathname)?.[1];
        if (identityId !== undefined && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(identityId)) throw new R010HttpError(400, "INVALID_REQUEST");
        if (!service) throw new R010HttpError(503, "SOURCE_UNAVAILABLE");
        let result: unknown;
        if (request.method === "POST") {
          const input = await readJson(request, byteLimit(maxRequestBytes, 16 * 1024 * 1024));
          const parsedInput = (reset ? adminMemberResetPasswordRequestSchema : adminMemberCreateRequestSchema).safeParse(input);
          if (!parsedInput.success) throw new R010HttpError(400, "INVALID_REQUEST");
          result = reset ? await service.resetPassword(auth.data, requestId, identityId!) : await service.create(auth.data, requestId, parsedInput.data);
          status = reset ? 200 : 201;
        } else result = await service.read(auth.data, requestId, identityId?.toLowerCase());
        const schema = reset ? adminMemberResetPasswordResponseSchema : grants ? adminMemberGrantsResponseSchema : request.method === "POST" ? adminMemberCreatedResponseSchema : adminMembersV195ResponseSchema;
        const parsed = schema.safeParse(result);
        if (!parsed.success || !parsed.data.ok || parsed.data.meta.requestId !== requestId || parsed.data.meta.workspaceKind !== auth.data.workspaceKind) throw new R010HttpError(502, "UPSTREAM_INVALID_RESPONSE");
        body = parsed.data;
        if (Buffer.byteLength(JSON.stringify(body)) >= byteLimit(maxResponseBytes, 16 * 1024 * 1024)) throw new R010HttpError(502, "SOURCE_TRUNCATED");
      } catch (e) {
        let code = "INTERNAL_ERROR"; status = 500;
        if (e instanceof R010HttpError) { status = e.status; code = e.code; }
        else if (e instanceof AdminMembersError || e instanceof AdminMemberProvisioningError) { code = e.code; status = { FORBIDDEN: 403, INVALID_REQUEST: 400, NOT_FOUND: 404, CONFLICT: 409, SOURCE_TRUNCATED: 502, UPSTREAM_INVALID_RESPONSE: 502, SOURCE_UNAVAILABLE: 503, UPSTREAM_TIMEOUT: 504 }[e.code]; }
        body = { ok: false, error: { code, message: "Member request could not be completed", requestId, retryable: false } };
      }
      const json = JSON.stringify(body);
      response.writeHead(status, { "content-type": "application/json; charset=utf-8", "content-length": Buffer.byteLength(json), "cache-control": "no-store", "x-content-type-options": "nosniff", "x-request-id": requestId, ...(status === 405 ? { allow } : {}), ...(status === 413 ? { connection: "close" } : {}) }); response.end(json);
    },
  };
}
