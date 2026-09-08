import { AdminCalendarError } from "@ka/db";
import { adminCalendarResponseSchema, approvedWorkspaceAuthContextSchema } from "@ka/domain";
import type { AdminCalendarService } from "../admin/calendar-service.js";
import { resolveRequestId } from "../data/request-id.js";
import { byteLimit, R010HttpError } from "./http.js";
import type { R010Route } from "./routes.js";

export function createAdminCalendarRoute(service: Pick<AdminCalendarService, "list"> | undefined): R010Route {
  return { matches: pathname => pathname === "/api/v1/admin/calendar",
    async handle({ request, response, url, auth: rawAuth, requestId: suppliedId, maxResponseBytes }) {
      const requestId = resolveRequestId(suppliedId);
      let status = 200, body: unknown;
      try {
        const auth = approvedWorkspaceAuthContextSchema.safeParse(rawAuth);
        if (!auth.success || auth.data.role !== "admin") throw new R010HttpError(403, "FORBIDDEN");
        if (request.method !== "GET") throw new R010HttpError(405, "INVALID_REQUEST");
        if ([...url.searchParams].length) throw new R010HttpError(400, "INVALID_REQUEST");
        if (!service) throw new R010HttpError(503, "SOURCE_UNAVAILABLE");
        const parsed = adminCalendarResponseSchema.safeParse(await service.list(auth.data, requestId));
        if (!parsed.success || !parsed.data.ok || parsed.data.meta.requestId !== requestId || parsed.data.meta.workspaceKind !== auth.data.workspaceKind)
          throw new R010HttpError(502, "UPSTREAM_INVALID_RESPONSE");
        body = parsed.data;
        if (Buffer.byteLength(JSON.stringify(body)) >= byteLimit(maxResponseBytes, 16 * 1024 * 1024)) throw new R010HttpError(502, "SOURCE_TRUNCATED");
      } catch (error) {
        let code = "INTERNAL_ERROR"; status = 500;
        if (error instanceof R010HttpError) { status = error.status; code = error.code; }
        else if (error instanceof AdminCalendarError) {
          code = error.code; status = { FORBIDDEN: 403, SOURCE_TRUNCATED: 502, UPSTREAM_INVALID_RESPONSE: 502, SOURCE_UNAVAILABLE: 503, UPSTREAM_TIMEOUT: 504 }[error.code];
        }
        body = { ok: false, error: { code, message: "Calendar request could not be completed", requestId, retryable: false } };
      }
      const json = JSON.stringify(body);
      response.writeHead(status, { "content-type": "application/json; charset=utf-8", "content-length": Buffer.byteLength(json),
        "cache-control": "no-store", "x-content-type-options": "nosniff", "x-request-id": requestId, ...(status === 405 ? { allow: "GET" } : {}) });
      response.end(json);
    },
  };
}
