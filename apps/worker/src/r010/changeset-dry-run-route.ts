import { approvedWorkspaceAuthContextSchema } from "@ka/domain";
import { z } from "zod";
import type { ChangeSetDryRunService } from "../changesets/dry-run-service.js";
import { DryRunServiceError } from "../changesets/dry-run-contract.js";
import { byteLimit, readJson, R010HttpError, sendFailure } from "./http.js";
import type { R010Route } from "./routes.js";

const path = /^\/api\/v1\/changesets\/([^/]+)\/dry-run$/;
const statuses = { INVALID_REQUEST: 400, FORBIDDEN: 403, NOT_FOUND: 404, INVALID_STATE: 409,
  FROM_VALUE_CHANGED: 409, SOURCE_UNAVAILABLE: 503, UPSTREAM_TIMEOUT: 504,
  UPSTREAM_INVALID_RESPONSE: 502, INTERNAL_ERROR: 500 } as const;

/** Source-off pilot boundary, per arch 0d358d8. The production composition must
 * not inject preflight until the public observed-value contract is implemented.
 * No successful media read is synthesized from the saved draft.
 */
export function createChangeSetDryRunRoute(service: Pick<ChangeSetDryRunService, "run"> | undefined): R010Route {
  return {
    matches: pathname => path.test(pathname),
    async handle(ctx) {
      try {
        const auth = approvedWorkspaceAuthContextSchema.safeParse(ctx.auth);
        if (!auth.success || auth.data.workspaceKind !== "personal" || !auth.data.scope.accounts.some(a => a.accessLevel !== "read"))
          throw new R010HttpError(403, "FORBIDDEN");
        if (ctx.request.method !== "POST") throw new R010HttpError(405, "INVALID_REQUEST");
        const rawId = path.exec(ctx.url.pathname)?.[1];
        let id: string;
        try { id = decodeURIComponent(rawId ?? ""); } catch { throw new R010HttpError(400, "INVALID_REQUEST"); }
        if (!z.string().uuid().safeParse(id).success || [...ctx.url.searchParams].length !== 0)
          throw new R010HttpError(400, "INVALID_REQUEST");
        if (!z.object({}).strict().safeParse(await readJson(ctx.request, byteLimit(ctx.maxRequestBytes, 1024 * 1024))).success)
          throw new R010HttpError(400, "INVALID_REQUEST");
        if (service === undefined) throw new DryRunServiceError("SOURCE_UNAVAILABLE");
        await service.run(id, auth.data);
        // Internal P129 {executionRunId,hash,status} is NOT the D6 observed-value
        // response. Fail closed if this explicitly source-off route is miswired.
        throw new R010HttpError(502, "UPSTREAM_INVALID_RESPONSE");
      } catch (error) {
        if (error instanceof DryRunServiceError && Object.hasOwn(statuses, error.code)) {
          const unavailable = error.code === "SOURCE_UNAVAILABLE";
          const payload = { ok: false, error: { code: error.code,
            message: unavailable ? "媒体只读通道未接入，试运行无法读取现值" : new DryRunServiceError(error.code).message,
            retryable: unavailable || error.code === "UPSTREAM_TIMEOUT", requestId: ctx.requestId } };
          const body = JSON.stringify(payload);
          if (Buffer.byteLength(body) >= byteLimit(ctx.maxResponseBytes, 16 * 1024 * 1024)) {
            sendFailure(ctx.response, 502, "SOURCE_TRUNCATED", ctx.requestId); return;
          }
          ctx.response.writeHead(statuses[error.code], { "content-type": "application/json; charset=utf-8",
            "content-length": Buffer.byteLength(body), "cache-control": "no-store", "x-content-type-options": "nosniff", "x-request-id": ctx.requestId });
          ctx.response.end(body);
        } else if (error instanceof R010HttpError) sendFailure(ctx.response, error.status, error.code, ctx.requestId);
        else sendFailure(ctx.response, 500, "INTERNAL_ERROR", ctx.requestId);
      }
    },
  };
}
