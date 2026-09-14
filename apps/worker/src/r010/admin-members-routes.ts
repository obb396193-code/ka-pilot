import { AdminMembersError, AdminMemberProvisioningError } from "@ka/db";
import { adminMembersV195ResponseSchema, adminMemberCreatedResponseSchema, adminMemberResetPasswordResponseSchema,
  adminMemberResetPasswordRequestSchema, adminMemberCreateRequestSchema, adminMemberGrantsCommandResponseSchema,
  adminMemberPatchRequestSchema, adminMemberReplaceGrantsRequestSchema, adminMemberUpdatedResponseSchema,
  approvedWorkspaceAuthContextSchema } from "@ka/domain";
import type { AdminMembersService } from "../admin/members-service.js";
import { resolveRequestId } from "../data/request-id.js";
import { byteLimit, readJson, R010HttpError } from "./http.js";
import type { R010Route } from "./routes.js";
const grantsPattern = /^\/api\/v1\/admin\/members\/([^/]+)\/grants$/;
const resetPattern = /^\/api\/v1\/admin\/members\/([^/]+)\/reset-password$/;
const memberPattern = /^\/api\/v1\/admin\/members\/([^/]+)$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
type Kind = "list" | "member" | "grants" | "reset";
const ALLOW: Record<Kind, string> = { list: "GET, POST", member: "PATCH", grants: "GET, PUT", reset: "POST" };

/**
 * 成员治理：v1.9.21 列表/新建、v1.9.5 重置密码、v1.9.46 ① 按 identity 的改角色/停用与授权读写。
 * 治理权**不看本地会话角色**：来源是任一有效 team 空间的 admin，由仓储在同一事务里实时校验
 * （团队 admin 可能正以个人空间的 optimizer 身份登录）；这里只挡只读角色。
 */
export function createAdminMembersRoutes(
  service: Pick<AdminMembersService, "read" | "create" | "resetPassword" | "grants" | "patch" | "replaceGrants"> | undefined,
): R010Route {
  return { matches: path => path === "/api/v1/admin/members" || grantsPattern.test(path) || resetPattern.test(path) || memberPattern.test(path),
    async handle({ request, response, url, auth: rawAuth, requestId: suppliedId, maxResponseBytes, maxRequestBytes }) {
      const requestId = resolveRequestId(suppliedId); let status = 200, body: unknown;
      const kind: Kind = resetPattern.test(url.pathname) ? "reset" : grantsPattern.test(url.pathname) ? "grants"
        : memberPattern.test(url.pathname) ? "member" : "list";
      const allow = ALLOW[kind];
      try {
        const auth = approvedWorkspaceAuthContextSchema.safeParse(rawAuth);
        if (!auth.success || auth.data.role === "viewer") throw new R010HttpError(403, "FORBIDDEN");
        if (!allow.split(", ").includes(request.method ?? "")) throw new R010HttpError(405, "INVALID_REQUEST");
        if ([...url.searchParams].length) throw new R010HttpError(400, "INVALID_REQUEST");
        const pattern = kind === "reset" ? resetPattern : kind === "grants" ? grantsPattern : kind === "member" ? memberPattern : null;
        const identityId = pattern?.exec(url.pathname)?.[1];
        if (pattern !== null && (identityId === undefined || !UUID.test(identityId))) throw new R010HttpError(400, "INVALID_REQUEST");
        if (!service) throw new R010HttpError(503, "SOURCE_UNAVAILABLE");
        const input = request.method === "GET" ? undefined : await readJson(request, byteLimit(maxRequestBytes, 16 * 1024 * 1024));
        const requestSchema = kind === "reset" ? adminMemberResetPasswordRequestSchema : kind === "member" ? adminMemberPatchRequestSchema
          : kind === "grants" ? adminMemberReplaceGrantsRequestSchema : adminMemberCreateRequestSchema;
        if (input !== undefined && !requestSchema.safeParse(input).success) throw new R010HttpError(400, "INVALID_REQUEST");
        let result: unknown;
        if (kind === "reset") result = await service.resetPassword(auth.data, requestId, identityId!);
        else if (kind === "member") result = await service.patch(auth.data, requestId, identityId!, input);
        else if (kind === "grants") result = request.method === "PUT"
          ? await service.replaceGrants(auth.data, requestId, identityId!, input) : await service.grants(auth.data, requestId, identityId!);
        else if (request.method === "POST") { result = await service.create(auth.data, requestId, input); status = 201; }
        else result = await service.read(auth.data, requestId);
        const schema = kind === "reset" ? adminMemberResetPasswordResponseSchema : kind === "member" ? adminMemberUpdatedResponseSchema
          : kind === "grants" ? adminMemberGrantsCommandResponseSchema : request.method === "POST" ? adminMemberCreatedResponseSchema : adminMembersV195ResponseSchema;
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
