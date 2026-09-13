import { SettingsChangeLogError } from "@ka/db";
import { approvedWorkspaceAuthContextSchema, parseSettingsChangeLogSearch, settingsChangeLogResponseSchema } from "@ka/domain";
import type { SettingsChangeLogService } from "../admin/settings-change-log-service.js";
import { resolveRequestId } from "../data/request-id.js";
import { byteLimit, R010HttpError } from "./http.js";
import type { R010Route } from "./routes.js";

export function createSettingsChangeLogRoute(service: Pick<SettingsChangeLogService, "read"> | undefined): R010Route {
  return { matches: path => path === "/api/v1/settings/change-log",
    async handle({ request, response, url, auth: rawAuth, requestId: supplied, maxResponseBytes }) {
      const requestId = resolveRequestId(supplied);
      let status = 200, body: unknown;
      try {
        const auth = approvedWorkspaceAuthContextSchema.safeParse(rawAuth);
        if (!auth.success) throw new R010HttpError(403, "FORBIDDEN");
        if (request.method !== "GET") throw new R010HttpError(405, "INVALID_REQUEST");
        let query;
        try { query = parseSettingsChangeLogSearch(url.searchParams); }
        catch { throw new R010HttpError(400, "INVALID_REQUEST"); }
        if (!service) throw new R010HttpError(503, "SOURCE_UNAVAILABLE");
        const parsed = settingsChangeLogResponseSchema.safeParse(await service.read(auth.data, query, requestId));
        if (!parsed.success || parsed.data.meta.requestId !== requestId) throw new R010HttpError(502, "UPSTREAM_INVALID_RESPONSE");
        body = parsed.data;
        if (Buffer.byteLength(JSON.stringify(body)) >= byteLimit(maxResponseBytes, 16 * 1024 * 1024)) throw new R010HttpError(502, "SOURCE_TRUNCATED");
      } catch (error) {
        let code = "INTERNAL_ERROR"; status = 500;
        if (error instanceof R010HttpError) { status = error.status; code = error.code; }
        else if (error instanceof SettingsChangeLogError) {
          code = error.code;
          status = { INVALID_REQUEST: 400, FORBIDDEN: 403, SOURCE_UNAVAILABLE: 503, UPSTREAM_INVALID_RESPONSE: 502, UPSTREAM_TIMEOUT: 504 }[error.code];
        }
        body = { ok: false, error: { code, message: "Change log request could not be completed", requestId, retryable: false } };
      }
      const json = JSON.stringify(body);
      response.writeHead(status, { "content-type": "application/json; charset=utf-8", "content-length": Buffer.byteLength(json),
        "cache-control": "no-store", "x-content-type-options": "nosniff", "x-request-id": requestId, ...(status === 405 ? { allow: "GET" } : {}) });
      response.end(json);
    },
  };
}
